#!/bin/bash
# Convert every generated tile into a BROTLI-ONLY serving tree for Caddy
# `precompressed br`. The generator (build-tiles.py) writes each tile as `.svg.gz`.
# This script, per tile:
#   1. brotli-compresses it to `.svg.br` (q11 — ~35-40% smaller than gzip; a straight
#      served-bandwidth win),
#   2. creates the 0-byte `.svg` BASE placeholder that Caddy's `precompressed` REQUIRES
#      to exist — without it the tile 404s (this bit us once: ~57% of tiles were
#      base-less and unservable until we back-filled them),
#   3. DELETES the `.svg.gz` so the tree is brotli-only. We dropped gzip storage
#      entirely (every browser supports brotli; the only clients that don't are bots/
#      curl, which get the empty placeholder). Saves ~1.5x the .br size on disk + upload.
#
# Result per tile: `tile.svg.br` + a 0-byte `tile.svg`, and NO `.svg.gz`.
# DEPLOY: rsync the whole tree to the VPS /srv/tiles — this carries BOTH the `.svg.br`
#   AND the 0-byte `.svg` bases (do not filter the bases out, or precompressed 404s).
#   There are no `.svg.gz` to upload. Caddy block: `file_server { precompressed br }`.
#
# Run after a build, before upload. Idempotent + incremental: after the first run the
# `.svg.gz` are gone, so a re-run only touches tiles the generator freshly re-emitted
# as `.svg.gz`. On a failed compress the `.svg.gz` is KEPT (retry-safe). Needs the
# `brotli` CLI (brew install brotli).
#
# Usage: ./brotli-tiles.sh [tile-store-dir]   (default: the Toronto store)
set -euo pipefail
DIR="${1:-/Volumes/Bob/MapData/toronto-svg-tiles}"
command -v brotli >/dev/null || { echo "brotli CLI not found (brew install brotli)"; exit 1; }
[ -d "$DIR" ] || { echo "no such dir: $DIR"; exit 1; }

export -f _one 2>/dev/null || true
_one() {
  local gz="$1" svg="${1%.gz}" br="${1%.gz}.br"     # tile.svg.gz -> tile.svg / tile.svg.br
  if [ ! -s "$br" ] || [ "$gz" -nt "$br" ]; then     # (re)build if br missing/empty/stale
    gunzip -c "$gz" | brotli -q 11 -c > "$br.tmp" && mv -f "$br.tmp" "$br" \
      || { rm -f "$br.tmp"; echo "FAILED (kept .gz): $gz" >&2; return 0; }
  fi
  [ -e "$svg" ] || : > "$svg"     # 0-byte base placeholder for `precompressed br`
  rm -f "$gz"                     # brotli-only: drop the gzip sidecar
}
export -f _one

NPROC=$( (sysctl -n hw.ncpu 2>/dev/null || nproc) )
find "$DIR" -name '*.svg.gz' -print0 \
  | xargs -0 -P "$NPROC" -I{} bash -c '_one "$@"' _ {}

echo "brotli-only: $(find "$DIR" -name '*.svg.br' | wc -l | tr -d ' ') .svg.br + $(find "$DIR" -name '*.svg' | wc -l | tr -d ' ') base .svg, $(find "$DIR" -name '*.svg.gz' | wc -l | tr -d ' ') .svg.gz left in $DIR"
