#!/bin/bash
# Monthly GTFS-static refresh for the Knowledge Map's `transit-stops` index.
# Re-ingests all matched feeds (routes + destinations + schedule) and rebuilds the
# live index. Scheduled by launchd (com.a11ybob.transit-refresh) on the 1st of each
# month, because agencies re-issue schedules seasonally. Safe to run by hand too.
#
# Deliberately NOT set -e: we want to log a failure and keep last month's index live
# rather than half-apply a broken run.
set -uo pipefail
cd "$(dirname "$0")"            # .../Tiled City Map/transit
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export HOME="${HOME:-/Users/bob3}"   # ssh needs it to find ~/.ssh (config, keys, known_hosts)

STATE=state
mkdir -p "$STATE"
LOG="$STATE/refresh.log"
NDJSON="$STATE/all-transit.ndjson"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
say() { echo "[$STAMP] $*" | tee -a "$LOG"; }

say "===== transit refresh starting ====="

# 1) Ingest -> NDJSON.
if ! python3 gtfs-ingest.py --out "$NDJSON" >> "$LOG" 2>&1; then
  say "ingest FAILED (exit $?) — keeping existing index, no deploy"
  exit 1
fi

# 2) Sanity gate. A healthy national run is hundreds of thousands of stops. If the
#    fresh file is implausibly small (broken catalog / mass feed outage), do NOT
#    rebuild — leaving last month's index live beats wiping it with garbage.
LINES=$(wc -l < "$NDJSON" | tr -d ' ')
if [ "${LINES:-0}" -lt 100000 ]; then
  say "only ${LINES:-0} stops — implausible; skipping deploy, index left as-is"
  exit 1
fi

# 3) Regression guard. A network-degraded ingest (DNS storm / feed outages) can clear the
#    floor above yet be missing whole agencies. Compare to the LIVE index; if the fresh set
#    is <85% of it, keep last month's index rather than shrink it. Uses the shared
#    ControlMaster socket the deploy reuses, so this stays a SINGLE SSH session.
SSHOPT=(-o ControlMaster=auto -o ControlPath="$HOME/.ssh/cm-transit-deploy" -o ControlPersist=600 -o ConnectTimeout=25)
LIVE=$(ssh "${SSHOPT[@]}" a11ybob-vps "curl -s localhost:9200/transit-stops/_count" 2>/dev/null | sed -E 's/.*"count":([0-9]+).*/\1/')
if printf '%s' "${LIVE:-}" | grep -qE '^[0-9]+$' && [ "$LIVE" -gt 0 ]; then
  MIN=$(( LIVE * 85 / 100 ))
  if [ "$LINES" -lt "$MIN" ]; then
    say "fresh set $LINES stops < 85% of live $LIVE — likely a degraded ingest; skipping deploy, index left as-is"
    exit 1
  fi
  say "guard OK: $LINES fresh vs $LIVE live"
else
  say "no live count to compare (first run / index absent) — proceeding"
fi

# 4) Clean rebuild (also drops stops that feeds have since removed).
if ./deploy-transit.sh --rebuild "$NDJSON" >> "$LOG" 2>&1; then
  say "DONE — $LINES stops deployed"
else
  say "deploy FAILED (exit $?)"
  exit 1
fi
