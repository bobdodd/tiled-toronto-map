// Base URL for the pre-rendered SVG tile store.
//
// The viewer is deliberately PASSIVE: it does no map-data processing
// itself, it only fetches finished tiles from this location. Point this at
// any static host or CDN that serves the tile set — a real deployment would
// use its own CDN. For this demo the tiles live on a dedicated subdomain,
// kept separate from the site that hosts the viewer.
//
// Expected layout under this base:
//   <TILE_BASE>/tile-index.json
//   <TILE_BASE>/tiles/<lat>_<lng>.svg.gz
//
// A `?tiles=<base>` URL query param overrides this default — for validating a
// freshly generated tile set against a local copy before publishing, e.g.
//   index.html?tiles=local-tiles/
// served by a static server rooted at web-app/ (see the local-tiles symlink).
// The default is unchanged for production deployments.
const DEFAULT_TILE_BASE = 'https://tiles.a11ybob.com/toronto/';
const TILE_BASE = (() => {
    if (typeof window === 'undefined') return DEFAULT_TILE_BASE;
    const override = new URLSearchParams(window.location.search).get('tiles');
    if (!override) return DEFAULT_TILE_BASE;
    return override.endsWith('/') ? override : override + '/';
})();

// Level-of-detail bands. Each is a self-contained tile set under TILE_BASE: the
// full set at the root, the coarser ones under /lodNN/. A band is served at any
// zoom >= its minZoom (so the list is tried high-to-low). The coarse sets drop
// features below the readable-"m" floor for that zoom (see RENDERING_AT_SCALE.md),
// so zooming out fetches fewer AND lighter tiles.
// The index's `tiles` list is a bare array of FILENAME STRINGS (slimmed — every
// other per-entry field was derivable or unread, and the whole-city list is
// 21,760 entries per band). Object entries ({file}/{id}) are still accepted:
// older indexes and local dev tile sets use them.
function tileIdSet(tiles) {
    return new Set((tiles || [])
        .map((t) => String(typeof t === 'string' ? t : (t.file || t.id || ''))
            .replace(/\.svg(\.gz)?$/, ''))
        .filter(Boolean));
}

const LOD_BANDS = [
    { name: 'lod22', minZoom: 22 },  // zoom in: ~individuals, full inspection
    { name: 'lod21', minZoom: 21 },
    { name: 'lod20', minZoom: 20 },
    { name: 'lod19', minZoom: 19 },
    { name: '',      minZoom: 18 },  // root URL (back-compat), z18
    { name: 'lod17', minZoom: 17 },
    { name: 'lod16', minZoom: 16 },
    { name: 'lod15', minZoom: 15 },
    { name: 'lod14', minZoom: 14 },
    { name: 'lod13', minZoom: 13 },
    { name: 'lod12', minZoom: 0 },   // coarsest, zoom <= 12, ~whole metro
];

export class SVGTileManager {
    constructor() {
        this.currentBand = '';
        this.tileBaseUrl = TILE_BASE + 'tiles/';
        this.indexUrl = TILE_BASE + 'tile-index.json';
        this.tileIndex = null;
        this.tileVersion = null;
        this.existingTileIds = null; // ids that actually exist (from the index)
        this.regions = null;   // per-region coverage rectangles (from the combined index)
        // Tile cache is keyed by BAND:tileId and PERSISTS across band switches, so
        // zooming out then back reuses tiles instead of re-fetching (smoother zoom,
        // less traffic). Sized well above one viewport (a z15 view is ~64 tiles) so
        // the current band + its neighbours + a pan ring all stay resident.
        this.tileCache = new Map();
        this.maxCacheSize = 400;
        this.bandIndex = {};   // band -> {tileIndex, existingTileIds, tileVersion}
        this.tileSize = 0.01; // 0.01 degrees per tile (roughly 1km)
        this.loadedTiles = new Set();
        this.activeRequests = new Map();
    }

    // Cache/request key — band-scoped, since the same tileId is different content
    // per band.
    cacheKey(tileId, band = this.currentBand) { return band + ':' + tileId; }

    // Which LOD band serves this zoom.
    bandForZoom(zoom) {
        for (const b of LOD_BANDS) if (zoom >= b.minZoom) return b.name;
        return LOD_BANDS[LOD_BANDS.length - 1].name;
    }

    bandBase(band) {
        return band ? TILE_BASE + band + '/' : TILE_BASE;
    }

    // Switch the active band: point at its tile dir + index. The tile cache is
    // band-scoped and PERSISTS (a zoom back to this band reuses it), and each
    // band's index is remembered, so switching is fetch-free once a band's been
    // seen. In-flight requests are NOT cancelled here — letting them finish + cache
    // means a quick zoom back finds them ready.
    setBand(band) {
        if (band === this.currentBand) return;
        this.currentBand = band;
        const base = this.bandBase(band);
        this.tileBaseUrl = base + 'tiles/';
        this.indexUrl = base + 'tile-index.json';
        const bi = this.bandIndex[band];
        this.tileIndex = bi ? bi.tileIndex : null;
        this.existingTileIds = bi ? bi.existingTileIds : null;
        this.tileVersion = bi ? bi.tileVersion : null;
        if (bi && bi.regions) this.regions = bi.regions; // band-independent; keep last known
    }

    // Is this point inside ANY mapped region? Drives the "outside the mapped area"
    // feedback. Prefers the per-region rectangles published in the combined index
    // (`regions`) — band-independent and exact, since each region fills its whole
    // bbox so in-rectangle == a tile exists there. Falls back to the actual tile set
    // if an older index has no `regions` field, and to "assume covered" if we have no
    // coverage info at all (never cry wolf on missing data).
    isInCoverage(lat, lng) {
        const regions = this.regions;
        if (regions && regions.length) {
            return regions.some((r) => {
                const b = r.bounds || r;
                return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
            });
        }
        if (this.existingTileIds && this.existingTileIds.size) {
            return this.existingTileIds.has(this.coordsToTileId(lat, lng));
        }
        return true;
    }

    async loadTileIndex() {
        if (this.tileIndex) return this.tileIndex;
        
        try {
            // NO cache-buster (the old ?t=Date.now() forced a full re-download
            // of the multi-megabyte whole-city index on EVERY visit and band
            // switch): the server now compresses the index in transit and
            // caches it for only 5 minutes, so a tile republish still
            // propagates quickly. Tile URLs carry ?v=<version> for their own
            // cache busting, as before.
            const response = await fetch(this.indexUrl);
            this.tileIndex = await response.json();
            // Content version (from the index, at most 5 minutes stale)
            // appended to tile URLs so a tile republish busts the browser
            // cache for everyone — without it, the 24h max-age on stable
            // tile URLs hides updates.
            this.tileVersion = this.tileIndex.version || null;
            // The set of tile ids that actually exist, so empty cells in a sparse
            // map aren't mistaken for load failures.
            this.existingTileIds = tileIdSet(this.tileIndex.tiles);
            // Per-region coverage rectangles, for the "outside the mapped area" test.
            this.regions = this.tileIndex.regions || null;
            // Remember this band's index so a later switch back doesn't re-fetch it.
            this.bandIndex[this.currentBand] = {
                tileIndex: this.tileIndex,
                existingTileIds: this.existingTileIds,
                tileVersion: this.tileVersion,
                regions: this.regions,
            };
            console.log(`Loaded tile index: ${this.tileIndex.tiles?.length || 0} tiles available (v${this.tileVersion || 'none'})`);
            return this.tileIndex;
        } catch (error) {
            console.error('Failed to load tile index:', error);
            this.tileIndex = { tiles: [], bounds: null };
            return this.tileIndex;
        }
    }

    coordsToTileId(lat, lng) {
        // Snap to the tile grid with a tiny epsilon BEFORE flooring. lat/0.01 can
        // land just below an integer in floating point (43.67/0.01 = 4366.9999…),
        // so a bare floor maps the tile to the row below it — fetching the wrong
        // tile's content while positioning it for the correct row (vertical gap +
        // ghosting). The epsilon (« half a tile) cancels that representation error.
        const eps = 1e-6;
        const tileY = Math.floor(lat / this.tileSize + eps) * this.tileSize;
        const tileX = Math.floor(lng / this.tileSize + eps) * this.tileSize;
        return `${tileY.toFixed(3)}_${tileX.toFixed(3)}`;
    }

    getTileUrl(tileId) {
        // Request the LOGICAL .svg; Caddy `precompressed br gzip` serves the
        // .svg.br (or .svg.gz) variant with Content-Encoding, and the browser
        // decompresses it natively — so we get plain SVG text, no manual gunzip.
        // Brotli is ~35-40% smaller than gzip here, cutting served bandwidth.
        const tileUrl = this.tileBaseUrl + tileId + '.svg';
        return this.tileVersion ? `${tileUrl}?v=${encodeURIComponent(this.tileVersion)}` : tileUrl;
    }

    getTilesForBounds(bounds) {
        const tiles = [];
        const minLat = Math.floor(bounds.south / this.tileSize) * this.tileSize;
        const maxLat = Math.ceil(bounds.north / this.tileSize) * this.tileSize;
        const minLng = Math.floor(bounds.west / this.tileSize) * this.tileSize;
        const maxLng = Math.ceil(bounds.east / this.tileSize) * this.tileSize;

        for (let lat = minLat; lat < maxLat; lat += this.tileSize) {
            for (let lng = minLng; lng < maxLng; lng += this.tileSize) {
                const tileId = this.coordsToTileId(lat, lng);
                tiles.push({
                    id: tileId,
                    lat: lat,
                    lng: lng,
                    url: this.getTileUrl(tileId)
                });
            }
        }

        return tiles;
    }

    async loadTile(tileId) {
        const key = this.cacheKey(tileId);
        if (this.tileCache.has(key)) {
            return this.tileCache.get(key);
        }

        if (this.activeRequests.has(key)) {
            return this.activeRequests.get(key).promise;
        }

        const url = this.getTileUrl(tileId);
        const controller = new AbortController();
        const promise = this.fetchTile(url, tileId, controller.signal);
        this.activeRequests.set(key, { promise, controller });

        try {
            const svgContent = await promise;
            this.cacheTree(key, svgContent);
            this.activeRequests.delete(key);
            return svgContent;
        } catch (error) {
            this.activeRequests.delete(key);
            // Aborted requests (cancelled on pan) are expected, not errors.
            if (error.name !== 'AbortError') {
                console.error(`Failed to load tile ${tileId}:`, error);
            }
            return null;
        }
    }

    async fetchTile(url, tileId, signal) {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check Content-Encoding header
        const contentEncoding = response.headers.get('content-encoding');
        const contentType = response.headers.get('content-type');
        
        // First, try to read as text to see if browser already decompressed
        const responseClone = response.clone();
        try {
            const text = await responseClone.text();
            
            // Check if we got valid SVG
            if (text.includes('<svg') && text.includes('</svg>')) {
                return text;
            }
            
            // If not valid SVG and URL suggests gzip, try manual decompression
            if (/\.gz(\?|$)/.test(url)) {
                console.log(`Content doesn't look like SVG, attempting manual decompression for ${tileId}`);
                const arrayBuffer = await response.arrayBuffer();
                const decompressed = await this.decompressGzip(arrayBuffer);
                
                // Validate decompressed content
                if (!decompressed.includes('<svg')) {
                    console.error(`Decompressed content is not valid SVG for tile ${tileId}`);
                    return null;
                }
                
                return decompressed;
            }
        } catch (textError) {
            // If reading as text failed, try manual decompression
            if (/\.gz(\?|$)/.test(url)) {
                try {
                    const arrayBuffer = await response.arrayBuffer();
                    const decompressed = await this.decompressGzip(arrayBuffer);
                    
                    // Validate decompressed content
                    if (!decompressed.includes('<svg')) {
                        console.error(`Decompressed content is not valid SVG for tile ${tileId}`);
                        return null;
                    }
                    
                    return decompressed;
                } catch (decompressError) {
                    console.error(`Failed to decompress tile ${tileId}:`, decompressError);
                    return null;
                }
            }
        }
        
        console.error(`Failed to load tile ${tileId}: Invalid content`);
        return null;
    }
    
    async decompressGzip(arrayBuffer) {
        try {
            // Try DecompressionStream API first (Chrome 80+, Edge 80+, Safari 16.4+)
            if ('DecompressionStream' in window) {
                try {
                    const ds = new DecompressionStream('gzip');
                    const decompressedStream = new Response(arrayBuffer).body.pipeThrough(ds);
                    const decompressedArrayBuffer = await new Response(decompressedStream).arrayBuffer();
                    return new TextDecoder().decode(decompressedArrayBuffer);
                } catch (streamError) {
                    console.warn('DecompressionStream failed, trying pako fallback:', streamError);
                }
            }
            
            // Fallback to pako library
            if (typeof pako !== 'undefined') {
                try {
                    const uint8Array = new Uint8Array(arrayBuffer);
                    const decompressed = pako.ungzip(uint8Array);
                    return new TextDecoder().decode(decompressed);
                } catch (pakoError) {
                    console.error('Pako decompression failed:', pakoError);
                    throw pakoError;
                }
            } else {
                throw new Error('No gzip decompression method available');
            }
        } catch (error) {
            console.error('Failed to decompress gzip content:', error);
            throw error;
        }
    }

    cacheTree(key, svgContent) {   // key = band:tileId (see cacheKey)
        if (this.tileCache.has(key)) this.tileCache.delete(key);   // refresh LRU position
        else if (this.tileCache.size >= this.maxCacheSize) {
            const firstKey = this.tileCache.keys().next().value;
            this.tileCache.delete(firstKey);
        }
        this.tileCache.set(key, svgContent);
    }

    async loadTilesForArea(bounds, zoom) {
        // Pick the LOD band for this zoom and load that band's index.
        if (typeof zoom === 'number') this.setBand(this.bandForZoom(zoom));
        await this.loadTileIndex();

        const all = this.getTilesForBounds(bounds);
        // Only request tiles that exist in the index — the rest are empty cells in
        // a sparse map. So any null result below is a GENUINE load failure, not an
        // absent tile, which lets the caller report failures honestly.
        const wanted = (this.existingTileIds && this.existingTileIds.size)
            ? all.filter(tile => this.existingTileIds.has(tile.id))
            : all;
        // Centre-first: request the tiles nearest the view centre before the edges,
        // so the part the user is looking at fills in first.
        const cx = (bounds.east + bounds.west) / 2, cy = (bounds.north + bounds.south) / 2;
        wanted.sort((a, b) =>
            ((a.lat - cy) ** 2 + (a.lng - cx) ** 2) - ((b.lat - cy) ** 2 + (b.lng - cx) ** 2));

        const results = await Promise.all(wanted.map(tile =>
            this.loadTile(tile.id).then(content => ({ ...tile, content }))
        ));

        const tiles = results.filter(tile => tile.content !== null);
        const stats = {
            requested: wanted.length,
            loaded: tiles.length,
            failed: wanted.length - tiles.length,
        };
        return { tiles, stats, band: this.currentBand };
    }

    // Warm the cache for an area of a (possibly NON-active) band, in the background,
    // without rendering — so zooming to that band or panning into that area is
    // instant. Funded by the Brotli bandwidth saving. Skips tiles already cached or
    // in flight, and tiles that don't exist in that band's index.
    async prefetchArea(bounds, band) {
        if (band == null) return;
        let bi = this.bandIndex[band];
        if (!bi) {
            try {
                const r = await fetch(this.bandBase(band) + 'tile-index.json');
                const idx = await r.json();
                bi = this.bandIndex[band] = {
                    tileIndex: idx,
                    existingTileIds: tileIdSet(idx.tiles),
                    tileVersion: idx.version || null,
                    regions: idx.regions || null,
                };
            } catch (_) { return; }
        }
        const base = this.bandBase(band) + 'tiles/';
        const ver = bi.tileVersion;
        for (const t of this.getTilesForBounds(bounds)) {
            if (bi.existingTileIds && bi.existingTileIds.size && !bi.existingTileIds.has(t.id)) continue;
            const key = this.cacheKey(t.id, band);
            if (this.tileCache.has(key) || this.activeRequests.has(key)) continue;
            const url = base + t.id + '.svg' + (ver ? '?v=' + encodeURIComponent(ver) : '');
            const controller = new AbortController();
            const promise = this.fetchTile(url, t.id, controller.signal);
            this.activeRequests.set(key, { promise, controller });
            promise.then(c => { if (c) this.cacheTree(key, c); this.activeRequests.delete(key); })
                   .catch(() => this.activeRequests.delete(key));
        }
    }

    clearCache() {
        this.tileCache.clear();
        this.loadedTiles.clear();
        this.activeRequests.clear();
    }

    cancelAllRequests() {
        // Actually abort in-flight fetches (not just drop their dedup entries),
        // so fast panning doesn't leave orphaned fetches running or re-fetch the
        // same tile because its in-flight promise was forgotten.
        this.activeRequests.forEach(({ controller }) => {
            try { controller.abort(); } catch (_) { /* already settled */ }
        });
        this.activeRequests.clear();
    }
}