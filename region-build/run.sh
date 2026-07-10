#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Generic search-region build + deploy driver.   run.sh <region-id>
#
# Builds a region's search NDJSON (tile-generation/search-region.py) and upserts it into the
# live OpenSearch map-features index, in a way that survives being interrupted at any point.
# There is much of the USA still to add; this is the runner for all of it.
#
# Designed to run UNATTENDED under launchd:
#   • PACED — parse capped to PARALLEL cores + niced, zstd to ZSTD_T threads. The Mac stays usable.
#   • RESUMABLE — every step records a marker only AFTER it returned 0:
#       parse   → search-region.py --resume skips slices that already parsed (its own markers)
#       chunks  → state/chunks.done, written after the last chunk is compressed
#       upload  → state/uploaded.txt, one line per chunk that reached the index
#     Closing the lid suspends it; waking resumes it; a reboot restarts it (launchd RunAtLoad)
#     and it skips everything already done. Nothing is ever trusted because a file exists —
#     a killed step leaves a truncated file, and truncated is worse than absent.
#   • NETWORK RESILIENT — one shared SSH connection (ControlMaster); rsync --partial --inplace;
#     every remote step retried with backoff. On repeated failure it exits non-zero and launchd
#     brings it straight back, with all state intact.
#   • CHUNKED DEPLOY — a dropped connection costs one chunk, not a 5 GB re-upload. The upsert is
#     idempotent (append by osm_id), so re-sending a chunk is harmless.
#
# Manual:  bash run.sh new-york          (safe to run by hand; single-instance guarded)
# Status:  cat region-build/state/<region>/status.txt
# Restart: rm -rf region-build/state/<region>   (forces a full rebuild)
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail
# An unmatched glob must vanish, not become the literal "*.zst" — otherwise an empty chunk
# directory would have us rsync a file by that name and "succeed" at uploading nothing.
shopt -s nullglob

REGION="${1:?usage: run.sh <region-id>}"

PROJECT="/Users/bob3/Documents/Bob/Claude/Tiled City Map"
VENV_PY="$PROJECT/venv/bin/python"
SEARCH_REGION="$PROJECT/tile-generation/search-region.py"
REGIONS="${REGION_BUILD_REGIONS:-$PROJECT/regions.json}"
WORK="$PROJECT/region-build"
STATE="$WORK/state/$REGION"
CHUNKS="$WORK/chunks/$REGION"

STATUS="$STATE/status.txt"
LOG="$STATE/run.log"
PIDFILE="$STATE/run.pid"
UPLOADED="$STATE/uploaded.txt"
mkdir -p "$STATE" "$CHUNKS"
touch "$UPLOADED"

# The box never appears in this file: this repo is public and no tracked file names it.
# tile-studio/config.json is gitignored and is where every other script reads it from.
read -r SSH_HOST SSH_USER SSH_PORT SSH_KEY < <("$VENV_PY" -c "
import json;c=json.load(open('$PROJECT/tile-studio/config.json'))['ssh']
print(c['host'], c['user'], c.get('port',22), c['sshKey'])") || {
  echo "cannot read ssh details from tile-studio/config.json"; exit 1; }
KEY="${SSH_KEY/#\~/$HOME}"
# Overridable ONLY so the deploy half can be exercised against an unreachable host and a toy
# region without touching the live index.
VPS="${REGION_BUILD_VPS:-$SSH_USER@$SSH_HOST}"
CTL="$HOME/.ssh/region-build.ctl"    # MUST be space-free: rsync's -e string word-splits it
SSH_OPTS=(-i "$KEY" -p "$SSH_PORT" -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=180 \
          -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20)
RSYNC_E="ssh -i $KEY -p $SSH_PORT -o ControlPath=$CTL -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"
SITE=/home/ubuntu/a11ybob-website
REMOTE_DIR=/home/ubuntu/map-data

PARALLEL=2          # concurrent slice parses (of 8 cores → leaves 6 for the user), the same as the
                    # Canada runners. NOT search-region.py's own default of cores-3: that is for an
                    # attended run you are sitting and waiting on. This one grinds for hours in the
                    # background on a laptop, and the machine has to stay usable while it does.
NICE=10             # build runs niced so foreground work wins the CPU
ZSTD_T=2            # compression threads (don't grab all cores)
CHUNK_LINES="${REGION_BUILD_CHUNK_LINES:-500000}"   # ~280 MB raw / ~35 MB compressed per chunk
MAX_TRIES="${REGION_BUILD_MAX_TRIES:-6}"   # per remote step, before handing back to launchd to retry the whole run

log()  { echo "$(date '+%F %T')  $*" | tee -a "$LOG"; }
say()  { printf '%s\n' "$*" > "$STATUS"; log "$*"; }
nlines() { local n; n=$(wc -l < "$1" 2>/dev/null | tr -d ' '); echo "${n:-0}"; }

# ── single instance, stale-pid safe (launchd serialises; this covers manual runs) ────────────
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  echo "already running (pid $(cat "$PIDFILE"))"; exit 0
fi
echo $$ > "$PIDFILE"
cleanup() { rm -f "$PIDFILE"; ssh -O exit -o ControlPath="$CTL" "$VPS" 2>/dev/null; }
trap cleanup EXIT

# ── retry a step with backoff; the caller decides what "the step" is ─────────────────────────
retry() {
  local label="$1"; shift
  local n=0
  until "$@"; do
    n=$((n + 1))
    if [ "$n" -ge "$MAX_TRIES" ]; then
      log "$label: giving up after $n attempts"
      return 1
    fi
    local wait=$(( n < 4 ? n * 15 : 60 ))
    log "$label: attempt $n failed; retrying in ${wait}s"
    sleep "$wait"
  done
  return 0
}

if [ -f "$STATE/deploy.done" ]; then
  say "$REGION: already deployed ($(cat "$STATE/deploy.done")). Nothing to do."
  exit 0
fi

LOCALDIR=$("$VENV_PY" -c "import json,sys;print({r['id']:r for r in json.load(open('$REGIONS'))['regions']}['$REGION']['localDir'])") || {
  say "$REGION: not in regions.json"; exit 1; }
NDJSON="$LOCALDIR/search/map-features.ndjson"
SLICES="$(dirname "$LOCALDIR")/$REGION-slices"

# ── 1) BUILD ─────────────────────────────────────────────────────────────────────────────────
# --keep-slices, NOT because we want them, but because search-region.py would delete them on
# success — and if the DEPLOY then failed, the next run would re-parse the whole state. We
# delete them ourselves once the region is safely in the index.
if [ -f "$STATE/parse.done" ] && [ -s "$NDJSON" ]; then
  say "$REGION: build already complete ($(nlines "$NDJSON") docs) — skipping to deploy."
else
  say "$REGION: building (niced, $PARALLEL slices at a time). This resumes if interrupted."
  if nice -n "$NICE" "$VENV_PY" "$SEARCH_REGION" --region "$REGION" \
        --parallel "$PARALLEL" --resume --keep-slices >> "$LOG" 2>&1; then
    date '+%F %T' > "$STATE/parse.done"
    say "$REGION: build done — $(nlines "$NDJSON") docs."
  else
    say "$REGION: build FAILED; launchd will retry and resume from the last good slice."
    exit 1
  fi
fi

# ── 2) CHUNK + COMPRESS ──────────────────────────────────────────────────────────────────────
# Split first, compress second, and only then write chunks.done — a run killed mid-compress
# leaves a truncated .zst, which the next run must redo rather than upload.
if [ -f "$STATE/chunks.done" ]; then
  say "$REGION: $(ls "$CHUNKS" | grep -c '\.zst$') chunks already prepared."
else
  say "$REGION: splitting $(nlines "$NDJSON") docs into chunks of $CHUNK_LINES..."
  find "$CHUNKS" -mindepth 1 -delete
  split -l "$CHUNK_LINES" -a 3 -d "$NDJSON" "$CHUNKS/chunk-" || exit 1
  parts=("$CHUNKS"/chunk-*)
  n_parts=${#parts[@]}
  [ "$n_parts" -gt 0 ] || { say "$REGION: split produced no chunks — is $NDJSON empty?"; exit 1; }
  i=0
  for part in "${parts[@]}"; do
    i=$((i + 1))
    say "$REGION: compressing chunk $i/$n_parts..."
    nice -n "$NICE" zstd -19 -T"$ZSTD_T" -q -f "$part" -o "$part.zst" || exit 1
    rm -f "$part"
  done
  date '+%F %T' > "$STATE/chunks.done"
  say "$REGION: $n_parts chunks compressed ($(du -sh "$CHUNKS" | cut -f1))."
fi

# ── 3) UPLOAD + UPSERT, one chunk at a time ──────────────────────────────────────────────────
push_chunk() {
  local f="$1" base; base=$(basename "$f")
  rsync --partial --inplace -e "$RSYNC_E" "$f" "$VPS:$REMOTE_DIR/$base" || return 1
  ssh "${SSH_OPTS[@]}" "$VPS" \
    "set -o pipefail; cd $SITE && zstd -dc $REMOTE_DIR/$base | OPENSEARCH_URL=http://localhost:9200 node_modules/.bin/tsx scripts/upsert-map.ts -" || return 1
  ssh "${SSH_OPTS[@]}" "$VPS" "rm -f $REMOTE_DIR/$base" || return 1
  return 0
}

retry "mkdir remote" ssh "${SSH_OPTS[@]}" "$VPS" "mkdir -p $REMOTE_DIR" || exit 1
zsts=("$CHUNKS"/*.zst)
total=${#zsts[@]}
[ "$total" -gt 0 ] || { say "$REGION: chunks.done is set but no .zst chunks exist — rm $STATE/chunks.done and rerun."; exit 1; }
done_n=$(nlines "$UPLOADED")
for f in "${zsts[@]}"; do
  base=$(basename "$f")
  if grep -qxF "$base" "$UPLOADED"; then continue; fi
  say "$REGION: upserting $base ($((done_n + 1))/$total)..."
  if retry "upsert $base" push_chunk "$f"; then
    echo "$base" >> "$UPLOADED"          # only AFTER the chunk reached the index
    done_n=$((done_n + 1))
  else
    say "$REGION: $base failed after $MAX_TRIES tries; launchd will retry from this chunk."
    exit 1
  fi
done

# ── 4) VERIFY + CLEAN ────────────────────────────────────────────────────────────────────────
COUNT=$(ssh "${SSH_OPTS[@]}" "$VPS" "curl -s localhost:9200/map-features/_count" | sed -E 's/.*"count":([0-9]+).*/\1/')
date '+%F %T' > "$STATE/deploy.done"
# Only ever delete the two directories this run created. A malformed localDir in regions.json
# must not turn into `rm -rf /` + "-slices".
case "$SLICES" in /Users/bob3/MapData/*-slices) rm -rf "$SLICES";; *) log "refusing to delete odd slices path: $SLICES";; esac
case "$CHUNKS" in "$WORK"/chunks/*) rm -rf "$CHUNKS";; *) log "refusing to delete odd chunks path: $CHUNKS";; esac
say "$REGION: DONE — $done_n/$total chunks upserted; map-features now holds ${COUNT:-?} docs. Slices and chunks cleaned."
