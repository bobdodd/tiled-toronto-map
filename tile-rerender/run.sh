#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Tiled-region FULL RE-RENDER driver — DEM terrain overlays VISIBLE on the map.
#
# The dem-reindex job carries DEM/ownership to the SEARCH docs; this one
# re-renders the TILES for the tiled regions so the computed inclines (and the
# on_street aria labels the 07-14 pilot only gave Trent Lakes) actually appear
# in the visual map. Per region:
#   build (tiles+search, --dem) → brotli → rsync tiles into the shared tree →
#   surgical live-index merge (merge-live-index.py) → upload indexes →
#   search upsert → mark done for BOTH this job and dem-reindex (no double
#   search work) → clean the local tile tree (the .pbf is source of truth).
#
# Order is BOB'S: kitchener-waterloo FIRST (Google visit), then Toronto, then
# the rest of Ontario, then Calgary. Austin waits for its 3DEP DEM provider.
#
# The dem-reindex agent is EXPECTED TO BE UNLOADED while this runs (tile
# renders + province slicing together can exhaust RAM); the LAST act of this
# driver is to load it again, so the search job resumes automatically.
#
# Manual:  bash run.sh        Status:  cat state/status.txt
# ──────────────────────────────────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
set -o pipefail

PROJECT="/Users/bob3/Documents/Bob/Claude/Tiled City Map"
VENV_PY="$PROJECT/venv/bin/python"
REGIONS="$PROJECT/regions.json"
BUILD="$PROJECT/tile-generation/build-tiles.py"
BROTLI="$PROJECT/tile-generation/brotli-tiles.sh"
MERGE="$PROJECT/tile-rerender/merge-live-index.py"
WORK="$PROJECT/tile-rerender"
STATE="$WORK/state"
DONE="$STATE/done.txt"
FAILED="$STATE/failed.txt"
STATUS="$STATE/status.txt"
LOG="$STATE/run.log"
PIDFILE="$STATE/run.pid"
ATT="$STATE/attempts"
DEM_DONE="$PROJECT/dem-reindex/state/done.txt"
DEM_PLIST="$HOME/Library/LaunchAgents/com.a11ybob.dem-reindex.plist"
mkdir -p "$STATE" "$ATT"
touch "$DONE" "$FAILED"

KEY="$HOME/.ssh/a11ybob_vps_ed25519"
VPS="ubuntu@66.70.189.24"
CTL="$HOME/.ssh/tile-rerender.ctl"
SSH_OPTS=(-i "$KEY" -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=180 \
          -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20)
RSYNC_E="ssh -i $KEY -o ControlPath=$CTL -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"
TILE_ROOT="/srv/tiles/toronto"

NICE=10
ZSTD_T=2
MAX_ATTEMPTS=3

ORDER=( kitchener-waterloo toronto trent-lakes peterborough burlington niagara barrie calgary )

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
  { echo "TILED-REGION FULL RE-RENDER (DEM overlays + on_street tiles)"
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
  local src localdir nd zst rmt staging band try
  src=$(field "$rid" source)
  localdir=$(field "$rid" localDir)
  nd="$localdir/search/map-features.ndjson"
  zst="$WORK/$rid.ndjson.zst"
  rmt="/home/ubuntu/map-data/$rid-dem.ndjson.zst"
  staging="$WORK/$rid-staging"

  [ -f "$src" ] || { log "source missing for $rid ($src)"; return 1; }

  # 1) FULL BUILD (tiles + search), with DEM grades.
  write_status "building $rid (FULL tiles + DEM — the long part)"
  log "build start $rid"
  if ! nice -n "$NICE" "$VENV_PY" "$BUILD" --region "$rid" --dem >> "$LOG" 2>&1; then
    log "BUILD FAILED $rid"; return 1
  fi
  [ -f "$nd" ] || { log "no ndjson after build $rid"; return 1; }

  # 2) BROTLI the tile tree (root + every lod band shares one tree walk).
  write_status "brotli $rid"
  if ! nice -n "$NICE" bash "$BROTLI" "$localdir" >> "$LOG" 2>&1; then
    log "BROTLI FAILED $rid"; return 1
  fi

  # 3) MERGE the live combined indexes (fetch over HTTPS — no SSH needed).
  write_status "merging live indexes for $rid"
  rm -rf "$staging"; mkdir -p "$staging"
  if ! "$VENV_PY" "$MERGE" "$rid" "$localdir" "$staging" >> "$LOG" 2>&1; then
    log "MERGE FAILED $rid"; return 1
  fi

  # 4) UPLOAD tiles FIRST, indexes AFTER — a published index must never name
  # a tile that isn't on the server yet. No --delete: other regions' tiles
  # share the tree. Retry the whole upload phase on network failure.
  for try in 1 2 3; do
    write_status "uploading $rid tiles (try $try)"
    ok=1
    # root band
    rsync -a --partial --timeout=300 -e "$RSYNC_E" \
      "$localdir/tiles/" "$VPS:$TILE_ROOT/tiles/" >> "$LOG" 2>&1 || ok=0
    # lod bands
    if [ "$ok" = 1 ]; then
      for band in "$localdir"/lod*/; do
        [ -d "$band/tiles" ] || continue
        b=$(basename "$band")
        rsync -a --partial --timeout=300 -e "$RSYNC_E" \
          "$band/tiles/" "$VPS:$TILE_ROOT/$b/tiles/" >> "$LOG" 2>&1 || { ok=0; break; }
      done
    fi
    if [ "$ok" = 1 ]; then
      write_status "uploading $rid indexes (try $try)"
      rsync -a --timeout=120 -e "$RSYNC_E" \
        "$staging/" "$VPS:$TILE_ROOT/" >> "$LOG" 2>&1 || ok=0
    fi
    [ "$ok" = 1 ] && break
    log "upload try $try failed for $rid; backoff"
    sleep $((try*60))
  done
  [ "$ok" = 1 ] || { log "UPLOAD FAILED $rid after retries"; return 1; }

  # 5) SEARCH upsert (same stream pattern as dem-reindex).
  write_status "search upsert $rid"
  zstd -19 "-T$ZSTD_T" -q -f "$nd" -o "$zst" || { log "ZSTD FAILED $rid"; return 1; }
  for try in 1 2 3; do
    if rsync --partial --inplace --timeout=180 -e "$RSYNC_E" "$zst" "$VPS:$rmt" \
       && ssh "${SSH_OPTS[@]}" "$VPS" "set -o pipefail; cd /home/ubuntu/a11ybob-website && zstd -dc '$rmt' | OPENSEARCH_URL=http://localhost:9200 node_modules/.bin/tsx scripts/upsert-map.ts -" >> "$LOG" 2>&1 \
       && ssh "${SSH_OPTS[@]}" "$VPS" "rm -f '$rmt'"; then
      rm -f "$zst"
      break
    fi
    log "search upsert try $try failed for $rid"
    [ "$try" = 3 ] && { rm -f "$zst"; log "SEARCH UPSERT FAILED $rid"; return 1; }
    sleep $((try*60))
  done

  # 6) This region's search work is DONE — dem-reindex must not repeat it.
  grep -qxF "$rid" "$DEM_DONE" 2>/dev/null || echo "$rid" >> "$DEM_DONE"

  # 7) CLEAN: the .pbf is source of truth; the tree and NDJSON are build
  # artefacts (Toronto's tree alone is ~1 GB after brotli).
  rm -rf "$staging"
  rm -f "$nd"
  rm -rf "$localdir/tiles" "$localdir"/lod*/
  log "DONE $rid (tiles + indexes + search live)"
  return 0
}

log "==== tile-rerender start (pid $$, $TOTAL regions) ===="
while :; do
  recompute_remaining
  if [ -z "$REMAINING_STR" ]; then
    write_status "ALL DONE — reloading dem-reindex"
    log "ALL DONE — reloading dem-reindex agent"
    launchctl load "$DEM_PLIST" 2>/dev/null || true
    exit 0
  fi

  progressed=0
  for rid in "${ORDER[@]}"; do
    is_done "$rid"   && continue
    is_failed "$rid" && continue
    if process_region "$rid"; then
      echo "$rid" >> "$DONE"; progressed=1
    else
      af="$ATT/$rid"; c=$(cat "$af" 2>/dev/null || echo 0); c=$((c+1)); echo "$c" > "$af"
      if [ "$c" -ge "$MAX_ATTEMPTS" ]; then echo "$rid" >> "$FAILED"; log "PARKED (failed) $rid after $c tries"; fi
    fi
    recompute_remaining
    write_status "between regions"
  done

  recompute_remaining
  if [ -z "$REMAINING_STR" ]; then
    write_status "ALL DONE — reloading dem-reindex"
    log "ALL DONE — reloading dem-reindex agent"
    launchctl load "$DEM_PLIST" 2>/dev/null || true
    exit 0
  fi
  [ "$progressed" -eq 0 ] && sleep 120 || sleep 10
done
