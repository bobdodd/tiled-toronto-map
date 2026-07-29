#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# DEM + ownership national SEARCH reindex driver (rebuild items #4, #6, #7).
#
# Re-parses each region's .pbf with --dem: pedestrian ways with no mapped
# incline get a computed street grade (NRCan HRDEM→MRDEM ladder; estimates are
# marked access.incline_source=dem so the chat can say "estimated"), and every
# region's docs gain the ownership relations (on_road / at_intersection) and
# on_street positioning. The WHOLE region NDJSON is upserted (append by
# osm_id, no drop) — search-side only; tiled regions' TILE re-render with DEM
# terrain overlays is a separate, later pass.
#
# Region order is BOB'S PRIORITY (2026-07-16), not size: Ontario province
# first, then the Ontario tiled cities, then the rest of Canada, then the
# non-Canadian regions LAST — they gain ownership now and skip DEM gracefully
# (no Canadian raster covers them) until 3DEP/swissALTI3D ladder entries land.
# pei runs FIRST: a 20-minute end-to-end smoke of the runner before the
# Ontario monster — and its hand-run 2026-07-16 deploy predates the
# access.incline_source provenance field, so its grades re-land marked.
#
# Designed to run UNATTENDED under launchd (mirrors anon-reindex):
#   • PACED — one region at a time, builds niced + capped to PARALLEL slices.
#   • RESUMABLE — done regions in state/done.txt; slice-level resume inside
#     search-region.py --resume. Survives restarts (RunAtLoad + KeepAlive).
#   • TRACKED — cat state/status.txt any time.
#
# Manual:  bash run.sh        Status:  cat state/status.txt
# ──────────────────────────────────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
set -o pipefail

PROJECT="/Users/bob3/Documents/Bob/Claude/Tiled City Map"
VENV_PY="$PROJECT/venv/bin/python"
REGIONS="$PROJECT/regions.json"
SEARCH_REGION="$PROJECT/tile-generation/search-region.py"
BUILD="$PROJECT/tile-generation/build-tiles.py"
WORK="$PROJECT/dem-reindex"
STATE="$WORK/state"
DONE="$STATE/done.txt"
FAILED="$STATE/failed.txt"
STATUS="$STATE/status.txt"
LOG="$STATE/run.log"
PIDFILE="$STATE/run.pid"
ATT="$STATE/attempts"
mkdir -p "$STATE" "$ATT"
touch "$DONE" "$FAILED"

KEY="$HOME/.ssh/a11ybob_vps_ed25519"
VPS="ubuntu@66.70.189.24"
CTL="$HOME/.ssh/dem-reindex.ctl"
SSH_OPTS=(-i "$KEY" -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=180 \
          -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20)
RSYNC_E="ssh -i $KEY -o ControlPath=$CTL -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"

PARALLEL=2
NICE=10
ZSTD_T=2
MAX_ATTEMPTS=5
SMALL_PBF=100000000   # <100 MB: single-process build, no slicing overhead

# Bob's order. Canada is COMPLETE (all 21 regions done, nunavut last on
# 2026-07-29). The old rule here — "non-Canada last, ownership only until
# their DEM providers exist" — is retired: every region now has a DEM
# provider. See tile-generation/dem_sources.py for which serves where
# (3DEP for the US, swissALTI3D, the EA WCS for England, FABDEM elsewhere).
#
# ireland runs FIRST by Bob's call 2026-07-29: he needs Dublin grades ahead
# of everything else, and it would otherwise sit sixth behind london, whose
# 1 m WCS fetch over a 60x47 km bbox is slow on a metered mobile link.
#
# austin/silicon-valley/zurich/south-shields were stripped from done.txt the
# same day: they completed on 2026-07-28 with DEM skipped (no provider then),
# so their markers would have hidden them from this pass. Backup of the
# pre-strip list is state/done.txt.bak-before-dem-strip.
ORDER=(
  ireland
  pei
  ontario
  toronto trent-lakes peterborough burlington kitchener-waterloo niagara barrie
  quebec nova-scotia new-brunswick newfoundland-and-labrador
  manitoba saskatchewan alberta calgary british-columbia
  yukon northwest-territories nunavut
  austin silicon-valley zurich south-shields london
  new-york boston new-haven new-jersey redmond philadelphia providence
  hanover washington-dc maryland virginia delaware rhode-island north-carolina
)

log()  { echo "$(date '+%F %T')  $*" >> "$LOG"; }
ts()   { date '+%F %T'; }
nlines() { local n; n=$(wc -l < "$1" 2>/dev/null | tr -d ' '); echo "${n:-0}"; }
is_done()   { grep -qxF "$1" "$DONE"   2>/dev/null; }
is_failed() { grep -qxF "$1" "$FAILED" 2>/dev/null; }

if [ -f "$PIDFILE" ]; then
  oldpid=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then exit 0; fi
fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

field() { "$VENV_PY" -c "import json;r={x['id']:x for x in json.load(open('$REGIONS'))['regions']}['$1'];print(r.get('$2') or '')"; }

TOTAL=${#ORDER[@]}
REMAINING_STR=""
recompute_remaining() {
  REMAINING_STR=""
  local r
  for r in "${ORDER[@]}"; do
    if ! is_done "$r" && ! is_failed "$r"; then REMAINING_STR="$REMAINING_STR$r "; fi
  done
}

write_status() {
  local phase="$1"
  { echo "DEM + OWNERSHIP NATIONAL REINDEX"
    echo "updated:   $(ts)"
    echo "phase:     $phase"
    echo "done:      $(nlines "$DONE") / $TOTAL"
    echo "failed:    $(nlines "$FAILED")  [ $(tr '\n' ' ' < "$FAILED" 2>/dev/null)]"
    echo "remaining: $REMAINING_STR"
    echo
    echo "completed: $(tr '\n' ' ' < "$DONE" 2>/dev/null)"
  } > "$STATUS.tmp" 2>/dev/null && mv "$STATUS.tmp" "$STATUS"
}

process_region() {
  local rid="$1"
  local src localdir nd zst rmt ndocs pbfsz waited try
  src=$(field "$rid" source)
  localdir=$(field "$rid" localDir)
  nd="$localdir/search/map-features.ndjson"
  zst="$WORK/$rid.ndjson.zst"
  rmt="/home/ubuntu/map-data/$rid-dem.ndjson.zst"

  waited=0
  while [ ! -f "$src" ]; do
    write_status "waiting for source .pbf for $rid"
    log "source missing for $rid ($src); waiting"
    sleep 60; waited=$((waited+60))
    [ "$waited" -ge 3600 ] && { log "source missing >1h for $rid; deferring"; return 1; }
  done

  # 1) BUILD (paced, resumable). Small pbf: one process, no slices. Big:
  # search-region slices with --resume, extract batched on the giants.
  write_status "building $rid (re-parse + DEM)"
  log "build start $rid"
  pbfsz=$(stat -f%z "$src" 2>/dev/null || echo 0)
  if [ "$pbfsz" -lt "$SMALL_PBF" ]; then
    if ! nice -n "$NICE" "$VENV_PY" "$BUILD" --region "$rid" --search-only --dem >> "$LOG" 2>&1; then
      log "BUILD FAILED $rid"; return 1
    fi
  else
    local args=(--region "$rid" --parallel "$PARALLEL" --resume --dem)
    [ "$pbfsz" -gt 500000000 ] && args+=(--extract-batch 4)
    if ! nice -n "$NICE" "$VENV_PY" "$SEARCH_REGION" "${args[@]}" >> "$LOG" 2>&1; then
      log "BUILD FAILED $rid"; return 1
    fi
  fi
  [ -f "$nd" ] || { log "no ndjson after build $rid"; return 1; }
  ndocs=$(nlines "$nd")

  # 2) COMPRESS + UPLOAD + STREAM-UPSERT the whole region, retry with backoff.
  write_status "compressing $rid ($ndocs docs)"
  zstd -19 "-T$ZSTD_T" -q -f "$nd" -o "$zst" || { log "ZSTD FAILED $rid"; return 1; }
  for try in 1 2 3; do
    write_status "uploading $rid (try $try, $ndocs docs)"
    if rsync --partial --inplace --timeout=180 -e "$RSYNC_E" "$zst" "$VPS:$rmt" \
       && ssh "${SSH_OPTS[@]}" "$VPS" "set -o pipefail; cd /home/ubuntu/a11ybob-website && zstd -dc '$rmt' | OPENSEARCH_URL=http://localhost:9200 node_modules/.bin/tsx scripts/upsert-map.ts -" >> "$LOG" 2>&1 \
       && ssh "${SSH_OPTS[@]}" "$VPS" "rm -f '$rmt'"; then
      rm -f "$zst"
      # The NDJSON is an intermediate build file; the index is the live copy,
      # the .pbf is source of truth. Keep the small drive clear.
      rm -f "$nd"
      log "UPSERTED $rid ($ndocs docs)"
      return 0
    fi
    log "upload try $try failed for $rid; backoff"
    sleep $((try*60))
  done
  rm -f "$zst"
  log "UPLOAD FAILED $rid after retries"
  return 1
}

log "==== driver start (pid $$, $TOTAL regions) ===="
while :; do
  recompute_remaining
  if [ -z "$REMAINING_STR" ]; then write_status "ALL DONE"; log "ALL DONE"; exit 0; fi

  progressed=0
  for rid in "${ORDER[@]}"; do
    is_done "$rid"   && continue
    is_failed "$rid" && continue
    if process_region "$rid"; then
      echo "$rid" >> "$DONE"; log "DONE $rid"; progressed=1
    else
      af="$ATT/$rid"; c=$(cat "$af" 2>/dev/null || echo 0); c=$((c+1)); echo "$c" > "$af"
      if [ "$c" -ge "$MAX_ATTEMPTS" ]; then echo "$rid" >> "$FAILED"; log "PARKED (failed) $rid after $c tries"; fi
    fi
    recompute_remaining
    write_status "between regions"
  done

  recompute_remaining
  [ -z "$REMAINING_STR" ] && { write_status "ALL DONE"; log "ALL DONE"; exit 0; }
  [ "$progressed" -eq 0 ] && sleep 120 || sleep 10
done
