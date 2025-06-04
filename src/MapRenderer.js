export class MapRenderer {
    constructor(svgElement) {
        this.svg = svgElement;
        this.tilesGroup = svgElement.querySelector('#map-tiles');
        this.featuresGroup = svgElement.querySelector('#map-features');
        this.labelsGroup = svgElement.querySelector('#map-labels');
        this.locationGroup = svgElement.querySelector('#user-location');
        this.routeGroup = svgElement.querySelector('#navigation-route');
        
        this.tileSize = 256;
        this.zoom = 15;
        this.center = { lat: 40.7128, lng: -74.0060 }; // Default NYC
        
        // Get initial container size
        const container = svgElement.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.viewBox = {
            x: 0,
            y: 0,
            width: rect.width || 800,
            height: rect.height || 600
        };
        
        this.tileCache = new Map();
        this.loadedTiles = new Set();
    }

    setCenter(lat, lng) {
        this.center = { lat, lng };
        this.render();
    }

    setZoom(zoom) {
        this.zoom = Math.max(1, Math.min(19, zoom));
        this.render();
    }

    zoomIn() {
        this.setZoom(this.zoom + 1);
    }

    zoomOut() {
        this.setZoom(this.zoom - 1);
    }

    latLngToTile(lat, lng, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor((lng + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x, y };
    }

    tileToLatLng(x, y, zoom) {
        const n = Math.pow(2, zoom);
        const lng = x / n * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
        const lat = latRad * 180 / Math.PI;
        return { lat, lng };
    }

    project(lat, lng) {
        const centerTile = this.latLngToTile(this.center.lat, this.center.lng, this.zoom);
        const tile = this.latLngToTile(lat, lng, this.zoom);
        
        const scale = this.tileSize;
        const x = (tile.x - centerTile.x) * scale + this.viewBox.width / 2;
        const y = (tile.y - centerTile.y) * scale + this.viewBox.height / 2;
        
        return { x, y };
    }

    async loadTile(x, y, z) {
        const key = `${z}/${x}/${y}`;
        if (this.loadedTiles.has(key)) return;
        
        // Debug: Log first few tiles
        if (this.loadedTiles.size < 3) {
            console.log(`Loading tile ${key}`);
        }
        
        const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
        
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.setAttribute('href', tileUrl);
        // Use exact tile size
        image.setAttribute('width', this.tileSize);
        image.setAttribute('height', this.tileSize);
        
        // Remove opacity handling for now
        
        const centerTile = this.latLngToTile(this.center.lat, this.center.lng, this.zoom);
        // Calculate position - ensure integer values
        const offsetX = Math.round((x - centerTile.x) * this.tileSize + this.viewBox.width / 2 - this.tileSize / 2);
        const offsetY = Math.round((y - centerTile.y) * this.tileSize + this.viewBox.height / 2 - this.tileSize / 2);
        
        image.setAttribute('x', offsetX);
        image.setAttribute('y', offsetY);
        image.setAttribute('aria-label', `Map tile ${x},${y} at zoom ${z}`);
        
        // Add error handling for failed tiles
        image.addEventListener('error', () => {
            // Replace failed tile with a placeholder
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', offsetX);
            rect.setAttribute('y', offsetY);
            rect.setAttribute('width', this.tileSize);
            rect.setAttribute('height', this.tileSize);
            rect.setAttribute('fill', '#e5e3df');
            rect.setAttribute('aria-label', `Map tile ${x},${y} failed to load`);
            image.parentNode.replaceChild(rect, image);
        });
        
        this.tilesGroup.appendChild(image);
        this.loadedTiles.add(key);
    }

    async render() {
        // Clear existing tiles
        while (this.tilesGroup.firstChild) {
            this.tilesGroup.removeChild(this.tilesGroup.firstChild);
        }
        this.loadedTiles.clear();
        
        // Don't add a background rect - let's see if this is causing the issue
        
        // Calculate visible tile range
        const centerTile = this.latLngToTile(this.center.lat, this.center.lng, this.zoom);
        const tilesX = Math.ceil(this.viewBox.width / this.tileSize) + 2;
        const tilesY = Math.ceil(this.viewBox.height / this.tileSize) + 2;
        
        const startX = Math.floor(centerTile.x - tilesX / 2);
        const startY = Math.floor(centerTile.y - tilesY / 2);
        const endX = Math.ceil(centerTile.x + tilesX / 2);
        const endY = Math.ceil(centerTile.y + tilesY / 2);
        
        // Load visible tiles
        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                this.loadTile(x, y, this.zoom);
            }
        }
        
        // Update viewBox for proper centering
        this.updateViewBox();
    }

    updateViewBox() {
        // Keep viewBox static at 0 0 width height
        this.svg.setAttribute('viewBox', 
            `0 0 ${this.viewBox.width} ${this.viewBox.height}`);
    }

    drawUserLocation(lat, lng, accuracy) {
        // Clear existing location marker
        while (this.locationGroup.firstChild) {
            this.locationGroup.removeChild(this.locationGroup.firstChild);
        }
        
        const pos = this.project(lat, lng);
        
        // Accuracy circle
        if (accuracy > 0) {
            const radiusMeters = accuracy;
            const radiusPixels = radiusMeters / (40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, this.zoom + 8));
            
            const accuracyCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            accuracyCircle.setAttribute('cx', pos.x);
            accuracyCircle.setAttribute('cy', pos.y);
            accuracyCircle.setAttribute('r', radiusPixels * this.tileSize);
            accuracyCircle.setAttribute('fill', 'rgba(66, 133, 244, 0.2)');
            accuracyCircle.setAttribute('stroke', 'rgba(66, 133, 244, 0.5)');
            accuracyCircle.setAttribute('stroke-width', '2');
            accuracyCircle.setAttribute('aria-label', `Location accuracy: ${accuracy} meters`);
            this.locationGroup.appendChild(accuracyCircle);
        }
        
        // Location dot
        const locationDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        locationDot.setAttribute('cx', pos.x);
        locationDot.setAttribute('cy', pos.y);
        locationDot.setAttribute('r', '8');
        locationDot.setAttribute('fill', '#4285F4');
        locationDot.setAttribute('stroke', 'white');
        locationDot.setAttribute('stroke-width', '3');
        locationDot.setAttribute('aria-label', 'Your current location');
        locationDot.setAttribute('role', 'img');
        this.locationGroup.appendChild(locationDot);
        
        // Direction indicator (if available)
        const directionArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        directionArrow.setAttribute('d', 'M 0,-15 L -7,0 L 0,-5 L 7,0 Z');
        directionArrow.setAttribute('fill', '#4285F4');
        directionArrow.setAttribute('stroke', 'white');
        directionArrow.setAttribute('stroke-width', '2');
        directionArrow.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
        directionArrow.setAttribute('aria-hidden', 'true');
        this.locationGroup.appendChild(directionArrow);
    }

    drawRoute(coordinates) {
        // Clear existing route
        while (this.routeGroup.firstChild) {
            this.routeGroup.removeChild(this.routeGroup.firstChild);
        }
        
        if (!coordinates || coordinates.length < 2) return;
        
        // Convert coordinates to screen points
        const points = coordinates.map(coord => {
            const pos = this.project(coord.lat, coord.lng);
            return `${pos.x},${pos.y}`;
        }).join(' ');
        
        // Route line shadow
        const routeShadow = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        routeShadow.setAttribute('points', points);
        routeShadow.setAttribute('fill', 'none');
        routeShadow.setAttribute('stroke', 'rgba(0, 0, 0, 0.3)');
        routeShadow.setAttribute('stroke-width', '8');
        routeShadow.setAttribute('stroke-linejoin', 'round');
        routeShadow.setAttribute('stroke-linecap', 'round');
        routeShadow.setAttribute('aria-hidden', 'true');
        this.routeGroup.appendChild(routeShadow);
        
        // Main route line
        const routeLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        routeLine.setAttribute('points', points);
        routeLine.setAttribute('fill', 'none');
        routeLine.setAttribute('stroke', '#4285F4');
        routeLine.setAttribute('stroke-width', '5');
        routeLine.setAttribute('stroke-linejoin', 'round');
        routeLine.setAttribute('stroke-linecap', 'round');
        routeLine.setAttribute('aria-label', 'Navigation route');
        routeLine.setAttribute('role', 'img');
        this.routeGroup.appendChild(routeLine);
        
        // Start marker
        const startPos = this.project(coordinates[0].lat, coordinates[0].lng);
        const startMarker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        startMarker.setAttribute('cx', startPos.x);
        startMarker.setAttribute('cy', startPos.y);
        startMarker.setAttribute('r', '10');
        startMarker.setAttribute('fill', '#34A853');
        startMarker.setAttribute('stroke', 'white');
        startMarker.setAttribute('stroke-width', '3');
        startMarker.setAttribute('aria-label', 'Route start');
        this.routeGroup.appendChild(startMarker);
        
        // End marker
        const endPos = this.project(coordinates[coordinates.length - 1].lat, coordinates[coordinates.length - 1].lng);
        const endMarker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        endMarker.setAttribute('cx', endPos.x);
        endMarker.setAttribute('cy', endPos.y);
        endMarker.setAttribute('r', '10');
        endMarker.setAttribute('fill', '#EA4335');
        endMarker.setAttribute('stroke', 'white');
        endMarker.setAttribute('stroke-width', '3');
        endMarker.setAttribute('aria-label', 'Route destination');
        this.routeGroup.appendChild(endMarker);
    }

    handleResize() {
        const container = this.svg.parentElement;
        const rect = container.getBoundingClientRect();
        this.viewBox.width = rect.width;
        this.viewBox.height = rect.height;
        this.updateViewBox();
        this.render();
    }
}