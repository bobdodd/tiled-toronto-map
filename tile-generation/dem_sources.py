"""DEM sources: which elevation provider serves which part of the world.

Canada was the only provider for a long time, and dem.py's shape reflects that:
one STAC endpoint, a fixed three-entry ladder, every matching raster opened up
front. Canada's ladder returns 9-17 big MOSAIC rasters, so that was fine.

The rest of the world is not like that, in three ways that each break an
assumption:

  • TILES, NOT MOSAICS. swissALTI3D ships 1 km tiles, so a Zurich bbox matches
    200+ of them, and 3DEP's lidar DTM matches thousands across a US state.
    Opening every one up front would be thousands of HTTP handles for a job
    that will touch a handful. Sources here are opened LAZILY, only when a
    sample point actually falls inside one.

  • PAGINATION. The old _stac_cog_urls asked for limit=50 and ignored the
    `next` link, so anything past 50 tiles silently vanished. That never bit
    Canada (mosaics) and would have quietly produced partial coverage
    everywhere else. Paging is mandatory here, and the page cap is logged when
    it is hit rather than passing for success.

  • NOT ALWAYS COGs. England has no cloud-optimised mirror; it has a live
    WCS. So a "source" is not necessarily a file — it is anything that can
    answer "elevation at these lon/lats", and the WCS source fetches windows
    on demand instead.

Vertical model rule, unchanged and non-negotiable: DTM (bare earth) only,
never DSM. A path under trees must not inherit the canopy's height, and a
street must not inherit the buildings beside it.

Providers, best-first per country:

  Canada        NRCan Datacube STAC -> hrdem-1m, hrdem-2m, mrdem-30
  USA           3DEP lidar DTM (1-2 m, Planetary Computer, SAS-signed)
                -> 3DEP seamless 1/3 arc-second (~10 m, public USGS S3)
                -> 3DEP seamless 1 arc-second (~30 m)
  Switzerland   swissALTI3D 2 m (swisstopo STAC, open)
  England       Environment Agency LIDAR Composite DTM 1 m (WCS, windowed)
  everywhere    FABDEM V1-2 (~30 m bare-earth, buildings and forest removed)

FABDEM is the global floor, so no region silently gets nothing. It is
CC BY-NC-SA (non-commercial) — Bob's call 2026-07-29, accepted for a personal
research site. It is NOT applied to Canada, which already has mrdem-30 at the
same tier and is deployed.

Accuracy note, measured rather than assumed (2026-07-29): FABDEM was checked
against England's 1 m lidar at the same coordinates and agreed to within 0.3 m
on open terrain (Primrose Hill 50.9 vs 51.2, Hampstead Heath 90.9 vs 91.1).
Its weakness is RESOLUTION, not bias: at ~31 m posts against SAMPLE_M = 15 m
spacing, consecutive samples often land in the same pixel, so it reports the
big hills and flattens short sharp ramps. That is the same trade already
accepted for mrdem-30 across most of Canada.
"""

import json
import math
import urllib.parse
import urllib.request

# --- endpoints -------------------------------------------------------------

STAC_CANADA = "https://datacube.services.geo.ca/stac/api/search"
STAC_PC     = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
PC_SIGN     = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"
STAC_SWISS  = "https://data.geo.admin.ch/api/stac/v0.9/search"

USGS_SEAMLESS = ("https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation"
                 "/{res}/TIFF/current/{tile}/USGS_{res}_{tile}.tif")

EA_WCS = "https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m-2022/wcs"
EA_COVERAGE = "13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m"
# From the service's own DescribeCoverage: grid low 80000,4000 high 575999,660999
# in EPSG:27700. See WcsSource — outside this the service returns ZEROS.
EA_ENVELOPE = (80000.0, 4000.0, 576000.0, 661000.0)

FABDEM_TILE = ("https://huggingface.co/datasets/links-ads/fabdem-v12/resolve/main"
               "/tiles/{block}_FABDEM_V1-2/{tile}_FABDEM_V1-2.tif")

# How many STAC pages to walk before giving up. 20 pages x 100 = 2000 tiles,
# far more than any one slice needs; hitting it means the bbox is wrong.
STAC_PAGE_CAP = 20
STAC_PAGE_SIZE = 100

# Country boxes, (west, south, east, north). Deliberately generous: they only
# choose a PROVIDER, and every provider already fails soft to the next tier.
BOX_CANADA = (-141.5, 41.0, -52.0, 84.0)
BOX_USA    = (-125.5, 24.0, -66.5, 49.5)
BOX_SWISS  = (5.8, 45.7, 10.6, 48.0)
BOX_ENGLAND = (-6.5, 49.8, 2.0, 55.9)


def _box_hit(box, bounds):
    w, s, e, n = box
    return not (bounds['east'] < w or bounds['west'] > e or
                bounds['north'] < s or bounds['south'] > n)


# --- STAC ------------------------------------------------------------------

def _get_json(url, timeout=45):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "a11ybob-dem/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except Exception:
        return None


def _stac_items(search_url, collection, bounds, label):
    """Every item of a collection covering the bbox, following `next` links.

    The old code stopped at 50 items with no indication it had. Truncation
    here is LOUD, because a silently short tile list is indistinguishable from
    a region that genuinely has thin coverage."""
    bbox = f"{bounds['west']},{bounds['south']},{bounds['east']},{bounds['north']}"
    url = (f"{search_url}?collections={urllib.parse.quote(collection)}"
           f"&bbox={bbox}&limit={STAC_PAGE_SIZE}")
    items, pages = [], 0
    while url and pages < STAC_PAGE_CAP:
        doc = _get_json(url)
        if not doc:
            break
        items.extend(doc.get("features", []))
        pages += 1
        url = None
        for link in doc.get("links", []):
            if link.get("rel") == "next" and link.get("href"):
                url = link["href"]
                break
    if pages >= STAC_PAGE_CAP and url:
        print(f"  DEM: WARNING {label} hit the {STAC_PAGE_CAP}-page cap "
              f"({len(items)} tiles); coverage may be incomplete", flush=True)
    return items


def _pc_sign(href):
    """Planetary Computer blobs are not public (409 without a token). The
    signing endpoint works anonymously; tokens last about an hour, which is
    shorter than a big slice takes, so sources re-sign on read failure."""
    doc = _get_json(f"{PC_SIGN}?href={urllib.parse.quote(href, safe='')}", timeout=60)
    return (doc or {}).get("href") or href


# --- tile-name maths -------------------------------------------------------

def _corner(lat, lon):
    ns = 'N' if lat >= 0 else 'S'
    ew = 'E' if lon >= 0 else 'W'
    return f"{ns}{abs(int(lat)):02d}{ew}{abs(int(lon)):03d}"


def _tiles_1deg(bounds):
    """SW corners of the 1-degree tiles a bbox touches."""
    out = []
    for lat in range(int(math.floor(bounds['south'])), int(math.floor(bounds['north'])) + 1):
        for lon in range(int(math.floor(bounds['west'])), int(math.floor(bounds['east'])) + 1):
            out.append((lat, lon))
    return out


def _fabdem_urls(bounds):
    """FABDEM is 1-degree tiles inside 10-degree folders, both named by their
    south-west corner, so the URL is derivable and needs no catalogue."""
    urls = []
    for lat, lon in _tiles_1deg(bounds):
        blat = int(math.floor(lat / 10.0) * 10)
        blon = int(math.floor(lon / 10.0) * 10)
        block = f"{_corner(blat, blon)}-{_corner(blat + 10, blon + 10)}"
        urls.append((FABDEM_TILE.format(block=block, tile=_corner(lat, lon)),
                     (lon, lat, lon + 1, lat + 1)))
    return urls


def _usgs_seamless_urls(bounds, res):
    """USGS seamless is 1-degree tiles named by their NORTH-WEST corner, which
    is n(lat+1) of the tile's south edge. res is '13' (1/3 arc-sec, ~10 m) or
    '1' (1 arc-sec, ~30 m). Public, no auth, no catalogue needed."""
    urls = []
    for lat, lon in _tiles_1deg(bounds):
        tile = f"n{abs(lat + 1):02d}w{abs(lon):03d}"
        urls.append((USGS_SEAMLESS.format(res=res, tile=tile),
                     (lon, lat, lon + 1, lat + 1)))
    return urls


# --- sources ---------------------------------------------------------------

class CogSource:
    """One cloud-optimised raster, opened only if a point lands inside it.

    `signer` is called to (re)build the URL. It exists for Planetary Computer,
    whose SAS tokens expire mid-slice; on a read failure the source signs
    again and retries once before giving up."""

    def __init__(self, href, bbox, signer=None):
        self.href, self.bbox, self._signer = href, bbox, signer
        self._ds = None
        self._dead = False

    def _open(self, force=False):
        if self._dead:
            return None
        if self._ds is not None and not force:
            return self._ds
        import rasterio
        url = self._signer(self.href) if self._signer else self.href
        try:
            self._ds = rasterio.open(url if url.startswith("/vsi") else f"/vsicurl/{url}")
        except Exception:
            self._ds = None
            if force:
                self._dead = True
        return self._ds

    def dataset(self):
        ds = self._open()
        if ds is None and self._signer:
            ds = self._open(force=True)      # token probably expired
        return ds


class WcsSource:
    """A live WCS, not a file. Elevation comes from GetCoverage over a small
    window around the points, which is a windowed read done server-side.

    England has no cloud-optimised mirror of its 1 m composite, only this. The
    windows are cached per grid cell so a path crossing one cell is fetched
    once, not once per point."""

    CELL = 1000          # metres; one fetch covers a 1 km cell plus margin
    MARGIN = 50

    def __init__(self, base, coverage_id, crs, bbox, envelope):
        self.base, self.coverage_id, self.crs, self.bbox = base, coverage_id, crs, bbox
        # The coverage's OWN extent in its OWN CRS, from DescribeCoverage.
        # This is not belt-and-braces, it is load-bearing: asked for a window
        # outside its coverage the EA WCS returns a raster of ZEROS, not
        # nodata. Dublin sits inside any lat/lon box loose enough to hold
        # Cornwall, so without this check Ireland silently read 0 m everywhere
        # and never fell through to FABDEM — and England's own coast and
        # borders would have read 0 m too.
        self.envelope = envelope
        self._cache = {}
        self._tr = None

    def _transformer(self):
        if self._tr is None:
            from pyproj import Transformer
            self._tr = Transformer.from_crs("EPSG:4326", self.crs, always_xy=True)
        return self._tr

    def _window(self, cx, cy):
        """The raster for one grid cell, fetched once."""
        key = (cx, cy)
        if key in self._cache:
            return self._cache[key]
        x0, y0 = cx * self.CELL - self.MARGIN, cy * self.CELL - self.MARGIN
        x1, y1 = (cx + 1) * self.CELL + self.MARGIN, (cy + 1) * self.CELL + self.MARGIN
        url = (f"{self.base}?service=WCS&version=2.0.1&request=GetCoverage"
               f"&coverageId={self.coverage_id}"
               f"&subset=E({int(x0)},{int(x1)})&subset=N({int(y0)},{int(y1)})"
               f"&format=image/tiff")
        ds = None
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "a11ybob-dem/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                blob = r.read()
            if blob[:2] in (b'II', b'MM'):
                import numpy as np
                from rasterio.io import MemoryFile
                mf = MemoryFile(blob)
                ds = mf.open()
                # Measured 2026-07-29: Dublin, Belfast, Snowdon and the North Sea
                # each came back 90000/90000 EXACT ZEROS with nodata untouched,
                # while Primrose Hill came back 90000/90000 non-zero. So all-zero
                # is how this service says "not covered", and an entire 1.1 km
                # window of exactly 0.000 m is not something 1 m lidar produces
                # over land. Without this, Ireland read 0 m everywhere and never
                # fell through to FABDEM, and England's coast would have too.
                if not np.any(ds.read(1) != 0):
                    ds.close()
                    mf.close()
                    self._cache[key] = (None, None)
                    return self._cache[key]
                self._cache[key] = (mf, ds)      # hold the MemoryFile open
                return self._cache[key]
        except Exception:
            pass
        self._cache[key] = (None, None)
        return self._cache[key]

    def sample(self, pts, idxs, out):
        """Fill out[i] for those idxs this source can answer; return the rest."""
        tr = self._transformer()
        xs, ys = tr.transform([pts[i][0] for i in idxs], [pts[i][1] for i in idxs])
        x0, y0, x1, y1 = self.envelope
        cells, still = {}, []
        for k, i in enumerate(idxs):
            x, y = xs[k], ys[k]
            if not (x0 <= x <= x1 and y0 <= y <= y1):
                still.append(i)          # outside the coverage -> next tier
                continue
            cells.setdefault((int(x // self.CELL), int(y // self.CELL)),
                             []).append((i, x, y))
        for cell, members in cells.items():
            _, ds = self._window(*cell)
            if ds is None:
                still.extend(i for i, _, _ in members)
                continue
            for i, x, y in members:
                try:
                    v = next(ds.sample([(x, y)]))[0]
                except Exception:
                    still.append(i)
                    continue
                if plausible(v, ds.nodata):
                    out[i] = float(v)
                else:
                    still.append(i)
        return still


def plausible(v, nodata):
    if v is None:
        return False
    try:
        f = float(v)
    except Exception:
        return False
    if nodata is not None and f == nodata:
        return False
    # below the Dead Sea shore is junk, and FABDEM/USGS voids are -9999/-3.4e38
    return math.isfinite(f) and f > -420.0


# --- per-country tier construction ----------------------------------------

def _swiss_asset(assets):
    """swisstopo keys assets by FILENAME, not by role, e.g.
    swissalti3d_2019_2685-1241_2_2056_5728.tif. Prefer the 2 m over the 0.5 m:
    a 1 km tile at 0.5 m is 16x the bytes for detail finer than SAMPLE_M."""
    tifs = [k for k in assets if k.endswith('.tif')]
    for want in ('_2_', '_0.5_'):
        for k in sorted(tifs):
            if want in k:
                return assets[k].get('href')
    return assets[tifs[0]].get('href') if tifs else None


def _stac_sources(search_url, collection, bounds, asset, label, signer=None):
    srcs = []
    for it in _stac_items(search_url, collection, bounds, label):
        assets = it.get('assets') or {}
        if asset == '@swiss':
            href = _swiss_asset(assets)
        else:
            href = (assets.get(asset) or {}).get('href')
        if not href:
            continue
        bb = it.get('bbox') or []
        bbox = tuple(bb[:4]) if len(bb) >= 4 else None
        srcs.append(CogSource(href, bbox, signer=signer))
    return srcs


def tiers_for(bounds):
    """[(label, [source, ...]), ...] best-first for this bbox."""
    tiers = []

    if _box_hit(BOX_CANADA, bounds):
        for coll in ("hrdem-mosaic-1m", "hrdem-mosaic-2m", "mrdem-30"):
            srcs = _stac_sources(STAC_CANADA, coll, bounds, "dtm", coll)
            if srcs:
                tiers.append((coll, srcs))
        return tiers                      # Canada is complete and deployed

    if _box_hit(BOX_USA, bounds):
        srcs = _stac_sources(STAC_PC, "3dep-lidar-dtm", bounds, "data",
                             "3dep-lidar-dtm", signer=_pc_sign)
        if srcs:
            tiers.append(("3dep-lidar-dtm", srcs))
        for res, name in (("13", "3dep-seamless-10m"), ("1", "3dep-seamless-30m")):
            tiers.append((name, [CogSource(u, bb) for u, bb in
                                 _usgs_seamless_urls(bounds, res)]))

    if _box_hit(BOX_SWISS, bounds):
        srcs = _stac_sources(STAC_SWISS, "ch.swisstopo.swissalti3d", bounds,
                             "@swiss", "swissalti3d")
        if srcs:
            tiers.append(("swissalti3d-2m", srcs))

    if _box_hit(BOX_ENGLAND, bounds):
        tiers.append(("ea-lidar-1m",
                      [WcsSource(EA_WCS, EA_COVERAGE, "EPSG:27700",
                                 BOX_ENGLAND, EA_ENVELOPE)]))

    # Global bare-earth floor, so nothing outside Canada silently gets nothing.
    tiers.append(("fabdem-30m", [CogSource(u, bb) for u, bb in _fabdem_urls(bounds)]))
    return tiers
