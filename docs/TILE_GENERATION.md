# Tile Generation & Deployment

How a region (Toronto, Trent Lakes, Peterborough, Calgary, …) is built and
published. Every region is built independently but lands on one global grid, so
they share a single served base, a single combined tile index, and a single
search index.

> Connection details (SSH host, user, key) live in `tile-studio/config.json`
> (gitignored; see `config.example.json`). They are deliberately **not** in this
> doc — this repo is public.

## Architecture

A single OSM parse per region produces **two** outputs in lockstep, so the map
and search can never drift apart:

1. **SVG tiles** — pre-rendered, gzip + brotli compressed, on a global
   **0.01° grid** (`tileSize`). Because the tiling origin is snapped to that
   grid, every region's tiles use globally-unique filenames (`<lat>_<lng>.svg.gz`)
   and simply slot together — Toronto, Trent Lakes and Calgary coexist with empty
   cells between them. Tiles are emitted at the root zoom plus several LOD bands
   (`lod12 … lod22`). Gaps are filled too (lake/rural cells are generated, not
   skipped), so panning never hits a missing tile.
2. **`search/map-features.ndjson`** — one document per findable feature (named
   things, POIs, addresses) with OSM accessibility tags as filterable fields and
   a geo_point. This feeds the OpenSearch `map-features` index behind
   `/api/map-nearby` (the Context Map and "describe surroundings") and
   `/api/map-search`.

### One shared base, one combined index

The live visual map is served from **one base directory** that holds **every
region's tiles plus a single combined `tile-index.json`**. For historical
reasons that base is named `toronto/`:

- Served path: `/srv/tiles/toronto/` on the VPS.
- URL base: `https://tiles.a11ybob.com/toronto/` (Caddy `root * /srv/tiles`).

Each region in `regions.json` also carries its own `remotePath` / `baseUrl` —
those describe **standalone** single-region serving. The live combined map does
not use them; it uses the shared base above. The viewer loads the one combined
index, requests only tiles that exist, and leaves gaps blank.

## Prerequisites

```bash
# From the project root — creates venv/ and installs osmium, shapely, pyproj …
./tile-generation/setup-tile-builder.sh

# System tools (Homebrew — no Docker on this machine)
brew install osmium-tool brotli
```

OpenSearch runs on the VPS (`localhost:9200`, not exposed publicly). The index
loaders live in the **a11ybob site repo** (`scripts/index-map.ts`,
`scripts/upsert-map.ts`) and are run on the VPS, where both `tsx` and OpenSearch
are available.

## `regions.json`

The single source of truth for regions. One entry per region:

```jsonc
{
  "id": "calgary",
  "label": "Calgary",
  "localDir": "/Volumes/Bob/MapData/calgary-svg-tiles", // where tiles are written
  "remotePath": "/srv/tiles/calgary/",                  // standalone serving only
  "baseUrl": "https://tiles.a11ybob.com/calgary/",      // standalone serving only
  "source":    "/Volumes/Bob/MapData/calgary.osm.pbf",  // this region's extract
  "osmSource": "/Volumes/Bob/MapData/alberta.osm.pbf",  // larger pbf to carve from
  "bounds": { "north": 51.21, "south": 50.84, "east": -113.86, "west": -114.32 },
  "center": { "lat": 51.045, "lng": -114.07 },
  "defaultZoom": 18,
  "tileSize": 0.01
}
```

**Getting the OSM source.** `build-tiles.py` uses `source` if it exists; otherwise
it carves `bounds` out of `osmSource` with `osmium extract`. So:

- A region **inside an extract you already have** (Trent Lakes, Peterborough sit
  inside `toronto.osm.pbf`) just sets `osmSource` to that file — no download.
- A region **outside it** (Calgary is in Alberta) needs its own download first:
  ```bash
  curl -L -o /Volumes/Bob/MapData/alberta.osm.pbf \
    https://download.geofabrik.de/north-america/canada/alberta-latest.osm.pbf
  ```

`activeRegion` is only the tile-studio default; the CLI selects a region with
`--region`, so leave `activeRegion` as-is when adding one.

## Build a region

```bash
cd "<project root>"
# Sanity-check the region resolves and bounds look right:
./venv/bin/python tile-generation/build-tiles.py --check --region calgary

# Build (parses once; writes all LOD bands + search/map-features.ndjson).
# A city-sized region takes a while — run it and let it finish.
./venv/bin/python tile-generation/build-tiles.py --region calgary

# Brotli-compress the tiles (Caddy serves precompressed .br; ~35-40% < gzip).
./tile-generation/brotli-tiles.sh /Volumes/Bob/MapData/calgary-svg-tiles
```

## Deploy to the live site

Tiles first, combined index last (so the index never references a tile that
isn't there yet), then the search index. **Never `--delete`** — the base holds
every other region.

> **Permissions.** macOS ships `openrsync`, which has no `--chmod`, and the tile
> store is on an exFAT volume whose files are mode `700`. Those perms carry
> across the copy, so Caddy returns **403** until you fix them (step 2). Or
> `brew install rsync` for GNU rsync 3.x, add `--chmod=D755,F644` to the pushes,
> and skip the manual chmods.

```bash
# 0. Snapshot the live combined index (root + every band) for rollback.
ssh <vps> 'cd /srv/tiles/toronto && for f in tile-index.json lod*/tile-index.json; do cp "$f" "$f.bak"; done'

# 1. Push the new region's TILE FILES into the shared base (no --delete).
#    EXCLUDE tile-index.json — the COMBINED index goes in step 3; the per-region
#    one would clobber it. Exclude search/ (NDJSON is for OpenSearch, not serving),
#    styles/ (already in the base) and the OSM sources.
rsync -rlt \
  --exclude 'data/' --exclude 'search/' --exclude 'styles/' \
  --exclude '*.osm.pbf' --exclude '*.osm' --exclude 'tile-index.json' \
  -e "ssh -i <key>" \
  <region-localDir>/ <user>@<host>:/srv/tiles/toronto/

# 2. Fix the exFAT 700 perms on just-pushed tiles (scoped to -perm 700, so the
#    existing 644 tiles are untouched).
ssh <vps> 'find /srv/tiles/toronto \( -name "*.svg.gz" -o -name "*.svg.br" \) -perm 700 -exec chmod 644 {} +'

# 3. Rebuild the COMBINED index from ALL live regions, push it, fix its perms.
#    (combine-map.py merges each region's per-band tile-index into one union.)
./venv/bin/python tile-generation/combine-map.py /tmp/combined \
  <toronto-localDir> <trent-lakes-localDir> <peterborough-localDir> <region-localDir>
rsync -rlt -e "ssh -i <key>" /tmp/combined/ <user>@<host>:/srv/tiles/toronto/
ssh <vps> 'cd /srv/tiles/toronto && chmod 644 tile-index.json lod*/tile-index.json'
```

Sanity check: the combined root `total_tiles` should equal the sum of every
region's own root tile count (e.g. 6344 + 2977 + 100 + 1702 = 11123).

## Search index (OpenSearch)

**Source of truth: `/home/ubuntu/map-data/` on the VPS holds one NDJSON per
region** — `map-features.ndjson` (Toronto, historical name), `trent-lakes.ndjson`,
`peterborough.ndjson`, `calgary.ndjson`, … A full reindex rebuilds `map-features`
from the **concatenation of all of them**, so a region only persists across
reindexes if its NDJSON lives here.

So adding a region is a **dual write** — update the live index AND drop the
region's NDJSON into `/home/ubuntu/map-data/`:

```bash
# 1. Put the region's NDJSON in the source-of-truth dir (durable; survives reindex).
gzip -c <region-localDir>/search/map-features.ndjson \
  | ssh <vps> 'gunzip > /home/ubuntu/map-data/<region>.ndjson'

# 2a. ADD it to the live index — append/upsert, SAFE (keyed by osm_id, no delete,
#     leaves every other region untouched). This is how you add one region:
ssh <vps> 'cd /home/ubuntu/a11ybob-website && OPENSEARCH_URL=http://localhost:9200 \
  node_modules/.bin/tsx scripts/upsert-map.ts /home/ubuntu/map-data/<region>.ndjson'

# 2b. OR full reindex from scratch (DANGER: scripts/index-map.ts DROPS the index
#     first). Only when you mean to rebuild everything — feed it ALL regions:
ssh <vps> 'cd /home/ubuntu/a11ybob-website && cat /home/ubuntu/map-data/*.ndjson > /tmp/all.ndjson && \
  OPENSEARCH_URL=http://localhost:9200 node_modules/.bin/tsx scripts/index-map.ts /tmp/all.ndjson'
```

`index-map.ts` deduplicates by `osm_id`, so the indexed count is slightly below
the line sum (features shared across regions collapse).

## Verify

```bash
# A tile from the new region serves (200, not 403):
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://tiles.a11ybob.com/toronto/<lat>_<lng>.svg.gz"

# The combined index now covers the new region's bounds:
curl -s "https://tiles.a11ybob.com/toronto/tile-index.json" | grep -o '"north":[0-9.]*'

# Search / Context Map returns the new region:
curl -s "https://a11ybob.com/api/map-nearby?lat=51.045&lng=-114.063" | head
```

## Serving (Caddy)

`tiles.a11ybob.com` is `root * /srv/tiles` with `file_server { precompressed br
gzip }`, CORS limited to `https://a11ybob.com`, and a one-day cache. So a tile at
`/srv/tiles/toronto/lod14/tiles/<lat>_<lng>.svg.gz` is reachable at
`https://tiles.a11ybob.com/toronto/lod14/tiles/<lat>_<lng>.svg.gz`, and Caddy
serves the `.br` automatically when the client accepts brotli.

## Gotchas

- **exFAT → 403.** The local tile store is on an exFAT volume (files mode 700),
  and macOS `openrsync` has no `--chmod`, so the 700 perms carry across and Caddy
  returns 403. chmod the pushed tiles on the server (`-perm 700 → 644`), or use
  GNU rsync (`brew install rsync`) with `--chmod=D755,F644`.
- **Never `--delete`** against `/srv/tiles/toronto/` — it is the shared base for
  every region.
- **`index-map.ts` wipes the index.** Use `upsert-map.ts` to add a region.
- **A new region needs three things**, not one: its tiles in the shared base, the
  rebuilt combined index, and its features upserted into OpenSearch. Tiles alone
  won't show in search; an index alone won't show on the visual map.
- **A far region needs its own OSM source.** Regions inside `toronto.osm.pbf` are
  free; anything outside it (other provinces) needs a Geofabrik download first.
