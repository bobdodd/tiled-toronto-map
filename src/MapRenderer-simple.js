// Simplified map renderer for testing
export class MapRenderer {
    constructor(svgElement) {
        this.svg = svgElement;
        this.tilesGroup = svgElement.querySelector('#map-tiles');
        this.zoom = 15;
        this.center = { lat: 40.7128, lng: -74.0060 };
        this.tileSize = 256;
    }

    latLngToTile(lat, lng, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor((lng + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x, y };
    }

    async render() {
        // Clear
        while (this.tilesGroup.firstChild) {
            this.tilesGroup.removeChild(this.tilesGroup.firstChild);
        }

        // Get center tile
        const centerTile = this.latLngToTile(this.center.lat, this.center.lng, this.zoom);
        
        // Just render a 3x3 grid of tiles
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = centerTile.x + dx;
                const y = centerTile.y + dy;
                
                const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                image.setAttribute('href', `https://tile.openstreetmap.org/${this.zoom}/${x}/${y}.png`);
                image.setAttribute('x', (dx + 1) * this.tileSize);
                image.setAttribute('y', (dy + 1) * this.tileSize);
                image.setAttribute('width', this.tileSize);
                image.setAttribute('height', this.tileSize);
                
                this.tilesGroup.appendChild(image);
            }
        }
    }
    
    // Stub methods
    setCenter() {}
    setZoom() {}
    zoomIn() {}
    zoomOut() {}
    project() { return {x: 0, y: 0}; }
    drawUserLocation() {}
    drawRoute() {}
    handleResize() {}
    updateViewBox() {}
}