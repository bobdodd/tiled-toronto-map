#!/bin/bash
# Deploy the transit-stops NDJSON (built by gtfs-ingest.py) to the live `transit-stops`
# OpenSearch index on the VPS. Mirrors deploy-search-region.sh: zstd-compress -> rsync
# (resumable) -> STREAM-decompress straight into the upserter (zstd -dc | upsert-transit.ts -),
# so the decompressed NDJSON never lands on the server disk -> DELETE the .zst.
#
# Usage:
#   deploy-transit.sh <transit-stops.ndjson>            # append/refresh (upsert by stop_id)
#   deploy-transit.sh --rebuild <transit-stops.ndjson>  # drop the index first (clean full refresh)
#
# The upsert is idempotent (keyed by stop_id), so a plain run refreshes every stop it
# carries; --rebuild also clears stops that a feed has since removed. Uses the a11ybob-vps
# SSH alias.
set -euo pipefail
REBUILD=0
if [ "${1:-}" = "--rebuild" ]; then REBUILD=1; shift; fi
NDJSON="${1:?usage: deploy-transit.sh [--rebuild] <transit-stops.ndjson>}"
[ -f "$NDJSON" ] || { echo "no such file: $NDJSON"; exit 1; }

VPS=a11ybob-vps
SITE=/home/ubuntu/a11ybob-website
CP="$HOME/.ssh/cm-transit-deploy"
SSHOPT=(-o ControlMaster=auto -o ControlPath="$CP" -o ControlPersist=600 -o ConnectTimeout=25)
ZST=/tmp/transit-stops.ndjson.zst
REMOTE_ZST=/home/ubuntu/transit-stops.ndjson.zst

echo "[1/4] compress ($(wc -l < "$NDJSON" | tr -d ' ') stops)..."
zstd -19 -T0 -q -f "$NDJSON" -o "$ZST"
ls -la "$ZST" | awk '{printf "  -> %.1f MB\n", $5/1048576}'

echo "[2/4] rsync to VPS (resumable)..."
rsync --partial --inplace -e "ssh ${SSHOPT[*]}" "$ZST" "$VPS:$REMOTE_ZST"

if [ "$REBUILD" = "1" ]; then
  echo "[2b] --rebuild: dropping transit-stops index (clean full refresh)..."
  ssh "${SSHOPT[@]}" "$VPS" "curl -s -X DELETE localhost:9200/transit-stops >/dev/null; echo '  dropped'"
fi

echo "[3/4] STREAM-upsert on the VPS (decompress -> upsert-transit.ts; never lands on disk)..."
ssh "${SSHOPT[@]}" "$VPS" "set -o pipefail; cd $SITE && zstd -dc $REMOTE_ZST | OPENSEARCH_URL=http://localhost:9200 node_modules/.bin/tsx scripts/upsert-transit.ts -"

echo "[4/4] remove the compressed NDJSON from the server; verify count:"
ssh "${SSHOPT[@]}" "$VPS" "rm -f $REMOTE_ZST; curl -s localhost:9200/transit-stops/_count"; echo
rm -f "$ZST"
echo "DONE — transit-stops is live."
