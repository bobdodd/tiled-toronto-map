# Province-scale search indexing (Context Map, no tiles)

How to give the **Context Map** — the no-graphics, describe-your-surroundings demo —
coverage of a whole province or territory, **without rendering any tiles**.

## Why this is separate from tiles

The Context Map reads `/api/map-nearby` + `/api/map-search` over the OpenSearch
`map-features` index and loads **no tiles**. So its coverage is the **index**, not
tiles. Tiles are the expensive part (render time, storage, bandwidth); the Context
Map doesn't need them. So we can blanket entire provinces into the search index for
a fraction of the cost of tiling them — the path to all-of-Canada coverage.

Natural features — **lakes, rivers, forests, waterfalls** — are kept and indexed.
They're the whole point of describing the environment to a blind user standing in
the middle of nowhere ("Lac Bleu, 200 m north").

## Why it's chunked + parallel

A whole province won't parse in one pass: one process would hold every feature and
its geometry in memory and OOM a 16 GB box. And the parse is **CPU-bound** (~89% in
shapely geometry building). So `search-region.py`:

1. slices the region into N equal **vertical** strips,
2. cuts them in **one `osmium extract` pass** (strategy `smart` — keeps whole
   natural-feature relations; do **not** use `complete_ways`, it drops the big
   lakes/forests),
3. parses each slice in its **own process, in parallel** (memory releases per slice;
   parallelism across cores is the speedup — Quebec went ~5.7 h sequential → ~2 h),
4. concatenates and **caps giant geometries** (no doc may be huge — bad for indexing
   *and* for the Node nearest-point route, which loads each candidate's geometry;
   coarse shorelines are fine for "the lake is 200 m north").

## Per-province workflow

```bash
# 0. One-time: get the province's Geofabrik extract (provinces are NOT inside
#    toronto.osm.pbf except Ontario-ish; like Calgary needed alberta).
curl -L -o /Volumes/Bob/MapData/<prov>.osm.pbf \
  https://download.geofabrik.de/north-america/canada/<prov>-latest.osm.pbf

# 1. Add a search-only region to regions.json: id, source (the .pbf), bounds (the
#    province bbox — features outside it are filtered out, so make it cover the whole
#    province), and optionally "searchSlices" (default 16). localDir is where the
#    NDJSON is written (e.g. /Volumes/Bob/MapData/<prov>-search). No remotePath/tiles.

# 2. Build the search NDJSON (chunked, parallel, capped). Takes a while — it's the
#    parse. Add --keep-slices to inspect, --skip-extract to retry after a failure.
./venv/bin/python tile-generation/search-region.py --region <prov>
#   -> <localDir>/search/map-features.ndjson   (no tiles)

# 3. Deploy: compress -> rsync -> decompress on the VPS -> upsert (append by osm_id)
#    -> DELETE the NDJSON from the server (it's an intermediate build file).
tile-generation/deploy-search-region.sh <prov>
```

That's it — the province is then live in the Context Map (`/api/map-nearby`) and
search (`/api/map-search`).

**The NDJSON is not kept on the server.** Once a region is upserted, the deploy script
removes `/home/ubuntu/map-data/<prov>.ndjson` — it's an intermediate build file and the
VPS disk is scarce. The **live copy** is the OpenSearch index; the **source-of-truth** is
the `.pbf` extract on the build box (re-runnable via `search-region.py`). One consequence:
`index-map.ts`'s from-scratch reindex (which cats `map-data/*.ndjson`) no longer has a
corpus to read. To rebuild from scratch, re-parse the `.pbf`s, or use OpenSearch
`_reindex` / snapshots instead.

## OpenSearch capacity (read before scaling up)

OpenSearch/Lucene is **disk-based**: the index is memory-**mapped** segment files,
served from the **OS file cache** (off-heap RAM). The index is *not* held in heap, so
it scales with **disk**, not RAM. Our fields are all off-heap (geo_point/keyword =
doc-values, name/text = inverted index, `geom` = `enabled:false`, stored only). The
heap is for query working memory + indexing buffers + caches.

- **Rule:** heap ≤ ~50% of RAM (the rest must stay free for the OS file cache; over-
  growing the heap *starves* it).
- **Done once** (2026-06-28): raised heap 1 g → 3 g via
  `/etc/opensearch/jvm.options.d/heap.options` (`-Xms3g`/`-Xmx3g`) + restart, for the
  Quebec load (2.29M → 11.34M docs; heap then ~67% of 3 g).
- **For all-of-Canada:** the bottlenecks are parse time (CPU — this is why it's
  chunked+parallel) and eventually index size. Disk fits a long way (57 GB free), but
  a much larger index wants more RAM for the OS cache → a **bigger VPS**. Best long-
  term: run the **parse + index from a rented cloud box** (fast cores + fast bandwidth
  into the VPS), sidestepping both the 16 GB Mac and the home upload.

## Notes

- `build-tiles.py` gained `--source/--bbox/--out` so it can run `--search-only` on an
  ad-hoc slice without a regions.json entry (that's how the orchestrator runs each
  slice).
- If a dense slice fails (OOM), raise `--slices` so each strip is smaller, and re-run
  with `--skip-extract`.
- The `quebec` region in regions.json is the worked example (whole province, 16 slices).
