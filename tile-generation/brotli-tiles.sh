#!/bin/bash
# Brotli-compress every tile alongside its .svg.gz, for Caddy `precompressed br`.
# Brotli (q11) runs ~35-40% smaller than gzip on these SVGs — a straight bandwidth
# cut for served traffic. Run after a build, before upload. Idempotent: skips a
# tile whose .svg.br is newer than its .svg.gz. Needs the `brotli` CLI (brew).
#
# Usage: ./brotli-tiles.sh [tile-store-dir]   (default: the Toronto store)
set -euo pipefail
DIR="${1:-/Volumes/Bob/MapData/toronto-svg-tiles}"
command -v brotli >/dev/null || { echo "brotli CLI not found (brew install brotli)"; exit 1; }
[ -d "$DIR" ] || { echo "no such dir: $DIR"; exit 1; }

export -f _one 2>/dev/null || true
_one() {
  local gz="$1" br="${1%.gz}.br"          # tile.svg.gz -> tile.svg.br
  [ -f "$br" ] && [ "$br" -nt "$gz" ] && return 0   # up to date, skip
  gunzip -c "$gz" | brotli -q 11 -c > "$br"
}
export -f _one

NPROC=$( (sysctl -n hw.ncpu 2>/dev/null || nproc) )
find "$DIR" -name '*.svg.gz' -print0 \
  | xargs -0 -P "$NPROC" -I{} bash -c '_one "$@"' _ {}

echo "brotli done: $(find "$DIR" -name '*.svg.br' | wc -l | tr -d ' ') .svg.br files in $DIR"
