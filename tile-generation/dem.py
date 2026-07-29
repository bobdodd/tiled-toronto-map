#!/usr/bin/env python3
"""DEM street grades — rebuild item #4 (Bob's call: highest-res per region).

Samples ground elevation along pedestrian ways and computes their steepest
sustained grade, so paths with NO hand-mapped `incline` tag still classify
into the taxonomy's existing terrain categories (steep >8.33%, moderate
5-8.33%). A hand-tagged OSM `incline` ALWAYS wins — mappers on the ground
beat a raster — and gentle/flat ways are left untagged: asserting "gentle
incline" on every flat footway would flood the terrain overlay with noise
instead of information.

Which provider serves which part of the world now lives in `dem_sources`,
which covers Canada, the USA, Switzerland, England and — as a global
bare-earth floor — everywhere else. This module is the sampling and grade
maths on top of whatever those return.

The DTM (bare terrain) is used, never the DSM: a path under trees must not
inherit the canopy's height. Reads are windowed HTTP range requests against
COGs (GDAL /vsicurl) — nothing is downloaded whole — except England, which
publishes no cloud-optimised mirror and is read through its WCS a window at
a time instead.
"""

import math
import os

import dem_sources          # which provider serves which part of the world

# Concurrent block reads per raster (see DemSampler.elevations). Sample points
# along a path cluster into a handful of COG blocks, so reading each block ONCE
# and reading blocks in parallel replaces thousands of per-point HTTP round-trips
# with a few dozen overlapped ones.
#
# THIS NUMBER MULTIPLIES. search-region.py runs PARALLEL slices at once, so the
# real concurrency is DEM_READ_WORKERS x PARALLEL — at the old default of 8 with
# PARALLEL=2 that was SIXTEEN simultaneous range-read connections against the
# NRCan COGs.
#
# The link this runs on is wireless mobile, not a fixed line (~2.5 Mbps, and
# metered). Measured 2026-07-27: at 8 workers the reindex took roughly half the
# available bandwidth continuously and drove packet loss to the a11ybob VPS from
# 0% to 10%, which is enough to make the live site appear dead for minutes at a
# time while the server itself was provably idle. Small requests survived; large
# ones collapsed, because TCP congestion control does exactly that under loss.
#
# So the default is deliberately low. It is not a performance setting, it is a
# politeness setting: the machine shares a scarce, shared, metered link with a
# person trying to use the internet. Raise it with the environment variable on a
# fast fixed connection, where the original "6x at 8 workers" measurement holds.
#
#     DEM_READ_WORKERS=8 bash dem-reindex/run.sh
DEM_READ_WORKERS = max(1, int(os.environ.get("DEM_READ_WORKERS", "2")))


class DemSampler:
    """Elevation for lon/lat points from the best available source, with
    per-point fallback down the ladder where a finer mosaic has no data."""

    def __init__(self, bounds, tiers=None):
        import rasterio  # noqa: F401 — fail here, loudly, if the dep is absent
        self._rasterio = rasterio
        self.tiers = dem_sources.tiers_for(bounds) if tiers is None else tiers
        # Still called `ladder` because callers test it for truthiness to mean
        # "this region has any coverage at all".
        self.ladder = [s for _, srcs in self.tiers for s in srcs]
        if self.ladder:
            print(f"  DEM: {len(self.ladder)} candidate sources "
                  f"({', '.join(label for label, _ in self.tiers)})", flush=True)

    def _read_cog(self, src, pts, idxs, out):
        """Fill out[] from ONE raster for the points inside it; return the rest.

        Reads each touched BLOCK exactly once, and reads the blocks
        concurrently. Points along a pedestrian way cluster into a handful of
        blocks, so per-block-once + parallel collapses thousands of sequential
        range reads into a few dozen overlapped ones. Measured ~6x (8 workers)
        / ~8x (16) on a Regina test with identical results."""
        from concurrent.futures import ThreadPoolExecutor
        from rasterio.transform import rowcol
        from rasterio.windows import Window
        from pyproj import Transformer
        import threading

        ds = src.dataset()
        if ds is None:
            return idxs
        tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
        nodata = ds.nodata
        xs, ys = tr.transform([pts[i][0] for i in idxs], [pts[i][1] for i in idxs])
        rows, cols = rowcol(ds.transform, xs, ys)
        bh, bw = ds.block_shapes[0]
        blocks, still = {}, []
        for k, i in enumerate(idxs):
            r, c = int(rows[k]), int(cols[k])
            if 0 <= r < ds.height and 0 <= c < ds.width:
                blocks.setdefault((r // bh, c // bw), []).append((i, r, c))
            else:
                still.append(i)                  # outside this raster -> next source
        if not blocks:
            return still
        href = ds.name
        tl = threading.local()

        def read_block(item):
            (br, bc), members = item
            d = getattr(tl, "d", None)
            if d is None:
                d = tl.d = self._rasterio.open(href)   # one handle per worker thread
            arr = d.read(1, window=Window(bc * bw, br * bh, bw, bh),
                         boundless=True,
                         fill_value=(nodata if nodata is not None else 0))
            res = []
            for (i, r, c) in members:
                lr, lc = r - br * bh, c - bc * bw
                v = arr[lr, lc] if (0 <= lr < arr.shape[0] and 0 <= lc < arr.shape[1]) else None
                res.append((i, v))
            return res

        try:
            with ThreadPoolExecutor(max_workers=DEM_READ_WORKERS) as ex:
                batches = list(ex.map(read_block, list(blocks.items())))
        except Exception:
            return idxs                          # whole raster failed -> next source
        for res in batches:
            for (i, v) in res:
                if dem_sources.plausible(v, nodata):
                    out[i] = float(v)
                else:
                    still.append(i)
        return still

    def elevations(self, pts):
        """[(lon, lat)] -> [metres | None], best tier first; None where nothing
        covers a point.

        Sources are opened LAZILY: one whose bbox holds none of the outstanding
        points is never touched. That is what makes a 200-tile Zurich or a
        2000-tile US state affordable, where opening every match up front would
        be thousands of HTTP handles for a job that reads a handful."""
        out = [None] * len(pts)
        remaining = list(range(len(pts)))
        for label, sources in self.tiers:
            if not remaining:
                break
            for src in sources:
                if not remaining:
                    break
                if hasattr(src, 'sample'):        # a live service, not a file
                    remaining = src.sample(pts, remaining, out)
                    continue
                if src.bbox:
                    w, s, e, n = src.bbox
                    inside = [i for i in remaining
                              if w <= pts[i][0] <= e and s <= pts[i][1] <= n]
                    if not inside:
                        continue
                    keep = set(inside)
                    outside = [i for i in remaining if i not in keep]
                else:
                    inside, outside = remaining, []
                remaining = self._read_cog(src, pts, inside, out) + outside
        return out


# Pedestrian ways whose grade matters underfoot. Crossings and steps are
# excluded: a crossing is kerb-ramp-scale (its access story is the kerb),
# and steps are steep by definition — their own category already.
PED_HIGHWAYS = {'footway', 'path', 'pedestrian', 'track', 'living_street', 'cycleway'}

SAMPLE_M = 15.0        # spacing along the way
MIN_SEG_M = 10.0       # a grade needs at least this run to be "sustained"
INJECT_OVER = 5.0      # only moderate/steep asserts membership (see module doc)
DEG = 1.0 / 111000.0


def _line_points(geom, spacing_deg):
    """Points every ~spacing along a LineString/MultiLineString (incl. ends),
    as [(lon, lat)], plus the cumulative distance (deg) of each point."""
    lines = list(geom.geoms) if geom.geom_type == 'MultiLineString' else [geom]
    pts, dists = [], []
    for line in lines:
        length = line.length
        n = max(1, int(length / spacing_deg))
        base = len(pts)
        for i in range(n + 1):
            d = min(length, i * length / n)
            p = line.interpolate(d)
            pts.append((p.x, p.y))
            dists.append((base, d))
    return pts, dists


def assign_dem_grades(features, bounds, taxonomy):
    """Compute grades for untagged pedestrian ways and inject `incline` (as an
    OSM-style percentage) + reclassify, so the taxonomy's existing terrain
    categories pick them up exactly as if a mapper had tagged them. Marks
    provenance with _incline_source='dem'. Returns the count tagged."""
    candidates = []
    for f in features:
        props = f.get('properties') or {}
        if props.get('highway') not in PED_HIGHWAYS:
            continue
        if props.get('incline'):            # the mapper's tag always wins
            continue
        if props.get('footway') == 'crossing':
            continue
        # Bridges and tunnels: the DTM is BARE EARTH — under a bridge it dives
        # into the valley/corridor below, so a way crossing on the structure
        # samples a violent false grade (seen live: a Kitchener rail-bridge
        # cycleway "estimated at 40%"). The structure's own grade can't come
        # from a terrain model; skip.
        if props.get('bridge') or props.get('tunnel'):
            continue
        g = f.get('geometry')
        if g is None or g.is_empty or g.geom_type not in ('LineString', 'MultiLineString'):
            continue
        if g.length < MIN_SEG_M * DEG:      # too short to have a sustained grade
            continue
        candidates.append(f)
    if not candidates:
        return 0

    sampler = DemSampler(bounds)
    if not sampler.ladder:
        print("  DEM: no coverage for this region — grades skipped", flush=True)
        return 0

    # One flat batch of sample points across all candidates (spatially sorted
    # inside the sampler), then per-way grade from consecutive pairs.
    all_pts, spans = [], []
    for f in candidates:
        pts, dists = _line_points(f['geometry'], SAMPLE_M * DEG)
        spans.append((len(all_pts), len(pts), dists))
        all_pts.extend(pts)
    elevs = sampler.elevations(all_pts)

    n = 0
    for f, (start, count, dists) in zip(candidates, spans):
        zs = elevs[start:start + count]
        pts = all_pts[start:start + count]
        worst = 0.0
        for i in range(count - 1):
            (part_a, da), (part_b, db) = dists[i], dists[i + 1]
            if part_a != part_b:            # different parts of a multiline
                continue
            za, zb = zs[i], zs[i + 1]
            if za is None or zb is None:
                continue
            # ground run in metres (lat/lon anisotropy ~cos(lat) on lon)
            (lon_a, lat_a), (lon_b, lat_b) = pts[i], pts[i + 1]
            klon = math.cos(math.radians((lat_a + lat_b) / 2))
            run = math.hypot((lon_b - lon_a) * klon, lat_b - lat_a) / DEG
            if run < MIN_SEG_M:
                continue
            grade = abs(zb - za) / run * 100.0
            # A single pair past ~35% on a walkable way is a raster artefact
            # (an unsplit bridge approach, a retaining-wall edge, a lidar
            # void), not a path anyone graded — drop the pair, keep the way's
            # honest next-worst.
            if grade > 35.0:
                continue
            worst = max(worst, grade)
        if worst > INJECT_OVER:
            props = f['properties']
            props['incline'] = f"{worst:.1f}%"
            props['_incline_source'] = 'dem'
            f['classification'] = taxonomy.classify_all(
                props, 'way') or f.get('classification')
            n += 1
    return n
