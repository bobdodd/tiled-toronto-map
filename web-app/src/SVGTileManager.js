export class SVGTileManager {
    constructor() {
        // Determine base URL based on environment
        if (window.location.hostname === 'localhost') {
            // Local development - use local proxy
            this.tileBaseUrl = '/maps/tiles/tiles/';
        } else {
            // Production - use relative path (same domain)
            this.tileBaseUrl = '/maps/tiles/tiles/';
        }
        this.tileIndex = null;
        this.tileCache = new Map();
        this.maxCacheSize = 20;
        this.tileSize = 0.01; // 0.01 degrees per tile (roughly 1km)
        this.loadedTiles = new Set();
        this.activeRequests = new Map();
    }

    async loadTileIndex() {
        if (this.tileIndex) return this.tileIndex;
        
        try {
            // tile-index.json is one level up from the tiles directory
            const indexUrl = '/maps/tiles/tile-index.json';
            const response = await fetch(indexUrl);
            this.tileIndex = await response.json();
            return this.tileIndex;
        } catch (error) {
            console.error('Failed to load tile index:', error);
            this.tileIndex = { tiles: [], bounds: null };
            return this.tileIndex;
        }
    }

    coordsToTileId(lat, lng) {
        const tileY = Math.floor(lat / this.tileSize) * this.tileSize;
        const tileX = Math.floor(lng / this.tileSize) * this.tileSize;
        return `${tileY.toFixed(3)}_${tileX.toFixed(3)}`;
    }

    getTileUrl(tileId) {
        const tileUrl = this.tileBaseUrl + tileId + '.svg.gz';
        return tileUrl;
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
        if (this.tileCache.has(tileId)) {
            return this.tileCache.get(tileId);
        }

        if (this.activeRequests.has(tileId)) {
            return this.activeRequests.get(tileId);
        }

        const url = this.getTileUrl(tileId);
        const request = this.fetchTile(url, tileId);
        this.activeRequests.set(tileId, request);

        try {
            const svgContent = await request;
            this.cacheTree(tileId, svgContent);
            this.activeRequests.delete(tileId);
            return svgContent;
        } catch (error) {
            this.activeRequests.delete(tileId);
            console.error(`Failed to load tile ${tileId}:`, error);
            return null;
        }
    }

    async fetchTile(url, tileId) {
        const response = await fetch(url);
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
            if (url.endsWith('.gz')) {
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
            if (url.endsWith('.gz')) {
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

    cacheTree(tileId, svgContent) {
        if (this.tileCache.size >= this.maxCacheSize) {
            const firstKey = this.tileCache.keys().next().value;
            this.tileCache.delete(firstKey);
        }
        this.tileCache.set(tileId, svgContent);
    }

    async loadTilesForArea(bounds) {
        await this.loadTileIndex();
        
        const tiles = this.getTilesForBounds(bounds);
        const loadPromises = tiles.map(tile => 
            this.loadTile(tile.id).then(content => ({
                ...tile,
                content
            }))
        );

        const loadedTiles = await Promise.all(loadPromises);
        return loadedTiles.filter(tile => tile.content !== null);
    }

    clearCache() {
        this.tileCache.clear();
        this.loadedTiles.clear();
        this.activeRequests.clear();
    }

    cancelAllRequests() {
        this.activeRequests.clear();
    }
}