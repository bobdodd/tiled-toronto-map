#!/usr/bin/env python3
"""DEM street grades — rebuild item #4 (Bob's call: highest-res per region).

Samples ground elevation along pedestrian ways and computes their steepest
sustained grade, so paths with NO hand-mapped `incline` tag still classify
into the taxonomy's existing terrain categories (steep >8.33%, moderate
5-8.33%). A hand-tagged OSM `incline` ALWAYS wins — mappers on the ground
beat a raster — and gentle/flat ways are left untagged: asserting "gentle
incline" on every flat footway would flood the terrain overlay with noise
instead of information.

Canada sources (NRCan Datacube STAC -> public COGs on S3), best-first:
    hrdem-mosaic-1m  (lidar, urban+growing coverage)
    hrdem-mosaic-2m
    mrdem-30         (national medium-res — always covers)
The DTM asset (bare terrain) is used, never the DSM: a path under trees must
not inherit the canopy's height. Reads are windowed HTTP range requests
against the COGs (GDAL /vsicurl) — nothing is downloaded whole; sample
points are sorted spatially so GDAL's block cache actually gets hits.

Other countries (Austin/3DEP, Zurich/swissALTI3D, Ireland) get their own
ladder entries when their regions are scheduled; regions outside every
ladder simply skip DEM.
"""

import json
import math
import urllib.request

STAC_SEARCH = "https://datacube.services.geo.ca/stac/api/search"

# (collection, asset) best-first. DTM = bare-earth terrain.
CANADA_LADDER = [
    ("hrdem-mosaic-1m", "dtm"),
    ("hrdem-mosaic-2m", "dtm"),
    ("mrdem-30", "dtm"),
]


def _stac_cog_urls(collection, asset, bounds):
    """The COG hrefs of a collection's items covering the region bbox."""
    bbox = f"{bounds['west']},{bounds['south']},{bounds['east']},{bounds['north']}"
    url = f"{STAC_SEARCH}?collections={collection}&bbox={bbox}&limit=50"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            items = json.load(r).get("features", [])
    except Exception:
        return []
    out = []
    for it in items:
        a = (it.get("assets") or {}).get(asset)
        if a and a.get("href"):
            out.append(a["href"])
    return out


class DemSampler:
    """Elevation for lon/lat points from the best available source, with
    per-point fallback down the ladder where a finer mosaic has no data."""

    def __init__(self, bounds, ladder=None):
        import rasterio  # noqa: F401 — fail here, loudly, if the dep is absent
        self._rasterio = rasterio
        self.ladder = []          # [(dataset, transformer, nodata)]
        self._open(bounds, ladder or CANADA_LADDER)

    def _open(self, bounds, ladder):
        from pyproj import Transformer
        for collection, asset in ladder:
            for href in _stac_cog_urls(collection, asset, bounds):
                try:
                    ds = self._rasterio.open(href)
                except Exception:
                    continue
                tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
                self.ladder.append((ds, tr, ds.nodata))
        print(f"  DEM: {len(self.ladder)} source rasters "
              f"({', '.join(c for c, _ in ladder)})", flush=True)

    def elevations(self, pts):
        """[(lon, lat)] -> [metres | None]. Tries each raster in ladder order
        per point; None where nothing covers it."""
        out = [None] * len(pts)
        remaining = list(range(len(pts)))
        for ds, tr, nodata in self.ladder:
            if not remaining:
                break
            xs, ys = tr.transform([pts[i][0] for i in remaining],
                                  [pts[i][1] for i in remaining])
            # Sort by projected row/col so windowed reads hit warm blocks.
            order = sorted(range(len(remaining)), key=lambda k: (ys[k], xs[k]))
            coords = [(xs[k], ys[k]) for k in order]
            try:
                vals = [v[0] for v in ds.sample(coords)]
            except Exception:
                continue
            still = []
            for k, v in zip(order, vals):
                i = remaining[k]
                bad = (v is None or (nodata is not None and v == nodata)
                       or not math.isfinite(v) or v < -420)  # below Dead Sea = junk
                if bad:
                    still.append(i)
                else:
                    out[i] = float(v)
            remaining = still
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
            worst = max(worst, abs(zb - za) / run * 100.0)
        if worst > INJECT_OVER:
            props = f['properties']
            props['incline'] = f"{worst:.1f}%"
            props['_incline_source'] = 'dem'
            f['classification'] = taxonomy.classify_all(
                props, 'way') or f.get('classification')
            n += 1
    return n
