#!/bin/bash
# Deploy a SEARCH-ONLY region's NDJSON (built by search-region.py) to the live
# OpenSearch map-features index for the Context Map. Pipeline:
#   zstd-compress -> rsync (resumable) -> decompress on the VPS -> upsert
#   (append by osm_id, no drop) -> the durable copy stays in /home/ubuntu/map-data/
#   so it survives a from-scratch reindex.
#
# Usage:  tile-generation/deploy-search-region.sh <region-id>
# Needs:  the region built (search-region.py --region <id>); SSH details in
#         tile-studio/config.json; zstd on both ends.
#
# NOTE (one-time, already done): OpenSearch heap was raised 1g -> 3g via
# /etc/opensearch/jvm.options.d/heap.options. For all-of-Canada-scale growth,
# revisit heap / VPS size (the index is on DISK; heap is for working memory — keep
# heap <= ~50% of RAM so the OS file cache can serve the segments).
set -euo pipefail
REGION="${1:?usage: deploy-search-region.sh <region-id>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

LOCALDIR="$(python3 -c "import json;print({r['id']:r for r in json.load(open('$ROOT/regions.json'))['regions']}['$REGION']['localDir'])")"
NDJSON="$LOCALDIR/search/map-features.ndjson"
[ -f "$NDJSON" ] || { echo "not built: $NDJSON  (run: search-region.py --region $REGION)"; exit 1; }

read -r HOST USER PORT KEY < <(python3 -c "import json;c=json.load(open('$ROOT/tile-studio/config.json'))['ssh'];print(c['host'],c['user'],c.get('port',22),c['sshKey'])")
KEY="${KEY/#\~/$HOME}"
VPS="$USER@$HOST"
SSH="ssh -i $KEY -p $PORT -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"
MAPDATA="/home/ubuntu/map-data/${REGION}.ndjson"
SITE="/home/ubuntu/a11ybob-website"
ZST="/tmp/${REGION}.ndjson.zst"

echo "[1/5] compress $NDJSON ($(wc -l < "$NDJSON" | tr -d ' ') docs)..."
zstd -19 -T0 -q -f "$NDJSON" -o "$ZST"
ls -la "$ZST" | awk '{printf "  -> %.0f MB\n", $5/1048576}'

echo "[2/5] rsync to VPS (resumable)..."
rsync --partial --inplace -e "$SSH" "$ZST" "$VPS:${MAPDATA}.zst"

echo "[3/5] decompress on VPS into the durable map-data dir..."
$SSH "$VPS" "zstd -d -q -f ${MAPDATA}.zst -o $MAPDATA && rm -f ${MAPDATA}.zst && echo \"  \$(wc -l < $MAPDATA) docs landed\""

echo "[4/5] upsert into OpenSearch (append by osm_id, no drop)..."
$SSH "$VPS" "cd $SITE && OPENSEARCH_URL=http://localhost:9200 node_modules/.bin/tsx scripts/upsert-map.ts $MAPDATA"

echo "[5/5] verify — index doc count now:"
$SSH "$VPS" "curl -s localhost:9200/map-features/_count"; echo
rm -f "$ZST"
echo "DONE — '$REGION' is live in the Context Map + search."
