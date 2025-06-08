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
        console.log('SVGTileManager initialized with base URL:', this.tileBaseUrl);
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
            console.log('Loading tile index from:', indexUrl);
            const response = await fetch(indexUrl);
            this.tileIndex = await response.json();
            console.log('Loaded tile index:', this.tileIndex);
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
        console.log('Generated tile URL:', tileUrl);
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
        console.log(`Fetching tile ${tileId} from: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check Content-Encoding header
        const contentEncoding = response.headers.get('content-encoding');
        console.log(`Content-Encoding for ${tileId}: ${contentEncoding}`);
        
        // If the server is not sending proper gzip headers, we need to decompress manually
        if (url.endsWith('.gz') && contentEncoding !== 'gzip') {
            // The content is gzipped but server isn't telling browser to decompress
            // We need to decompress it ourselves
            const arrayBuffer = await response.arrayBuffer();
            const decompressed = await this.decompressGzip(arrayBuffer);
            console.log(`Manually decompressed tile ${tileId} (${decompressed.length} bytes)`);
            console.log(`First 200 chars: ${decompressed.substring(0, 200)}`);
            return decompressed;
        } else {
            // Server is handling decompression or file is not gzipped
            const svgText = await response.text();
            console.log(`Loaded tile ${tileId} (${svgText.length} bytes)`);
            console.log(`First 200 chars: ${svgText.substring(0, 200)}`);
            
            // Validate that we have valid SVG
            if (!svgText.includes('<svg')) {
                console.error(`Invalid SVG content for tile ${tileId}`);
                return null;
            }
            
            return svgText;
        }
    }
    
    async decompressGzip(arrayBuffer) {
        // Use the DecompressionStream API if available
        if ('DecompressionStream' in window) {
            const ds = new DecompressionStream('gzip');
            const decompressedStream = new Response(arrayBuffer).body.pipeThrough(ds);
            const decompressedArrayBuffer = await new Response(decompressedStream).arrayBuffer();
            return new TextDecoder().decode(decompressedArrayBuffer);
        } else {
            // Fallback: Could use pako.js library here
            console.error('DecompressionStream not available. Cannot decompress gzip in browser.');
            throw new Error('Cannot decompress gzip content');
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