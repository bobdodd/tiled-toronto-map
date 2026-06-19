export class MapRenderer {
    constructor(svgElement) {
        this.svg = svgElement;
        this.tilesGroup = svgElement.querySelector('#map-tiles');
        this.featuresGroup = svgElement.querySelector('#map-features');
        this.labelsGroup = svgElement.querySelector('#map-labels');
        this.locationGroup = svgElement.querySelector('#user-location');
        this.routeGroup = svgElement.querySelector('#navigation-route');
        
        this.tileSize = 256;
        this.zoom = 18; // Default = 1:1 with project()'s 1000px/0.01° scale (init sizes the viewBox to viewport.width, which is the zoom-18 size); zoom out to 15, in to 23
        // Center on the middle of the shifted tile coverage area
        // Now centered one tile north to avoid Lake Ontario
        this.center = { lat: 43.655, lng: -79.375 }; // Center of the shifted coverage
        
        // Get initial container size
        const container = svgElement.parentElement;
        const rect = container.getBoundingClientRect();
        
        // Store viewport (actual window size) separately from viewBox
        this.viewport = {
            width: rect.width || 800,
            height: rect.height || 600
        };
        
        // ViewBox controls the zoom level
        this.viewBox = {
            x: 0,
            y: 0,
            width: rect.width || 800,
            height: rect.height || 600
        };
        
        // Track the current scale based on zoom
        this.currentScale = 1;
        
        this.tileCache = new Map();
        this.loadedTiles = new Set();
    }

    setCenter(lat, lng) {
        const oldCenter = this.center;
        this.center = { lat, lng };
        
        // If we're initialized, pan the viewBox instead of re-rendering
        if (this.isInitialized) {
            const oldPixel = this.project(oldCenter.lat, oldCenter.lng);
            const newPixel = this.project(lat, lng);
            
            // Move the viewBox by the difference
            this.viewBox.x += newPixel.x - oldPixel.x;
            this.viewBox.y += newPixel.y - oldPixel.y;
            
            this.updateViewBox();
            
            // Check if we need new tiles
            this.checkAndLoadTiles();
        } else {
            this.render();
        }
    }

    setZoom(zoom) {
        // Allow zoom up to 23 for detailed accessibility (44x44 pixel touch targets)
        // At zoom 23, features will be much larger and easier to interact with
        const previousZoom = this.zoom;
        this.zoom = Math.max(15, Math.min(23, zoom));
        
        if (this.zoom !== previousZoom) {
            // Calculate the scale change
            const scaleFactor = Math.pow(2, this.zoom - previousZoom);
            
            // Get current center of viewBox
            const centerX = this.viewBox.x + this.viewBox.width / 2;
            const centerY = this.viewBox.y + this.viewBox.height / 2;
            
            // Scale the viewBox dimensions
            this.viewBox.width = this.viewport.width / Math.pow(2, this.zoom - 18);
            this.viewBox.height = this.viewport.height / Math.pow(2, this.zoom - 18);
            
            // Recenter the viewBox
            this.viewBox.x = centerX - this.viewBox.width / 2;
            this.viewBox.y = centerY - this.viewBox.height / 2;
            
            // Update the SVG viewBox attribute
            this.updateViewBox();
            
            // Check if we need to load more tiles (only when zooming out)
            if (this.zoom < previousZoom) {
                this.checkAndLoadTiles();
            }
        }
        
        return this.zoom;
    }

    zoomIn() {
        return this.setZoom(this.zoom + 1);
    }

    zoomOut() {
        return this.setZoom(this.zoom - 1);
    }
    
    isMaxZoom() {
        return this.zoom >= 23;
    }
    
    isMinZoom() {
        return this.zoom <= 15;
    }
    
    initializeCoordinateSystem() {
        // Set up the initial coordinate system centered on our location
        // Convert center lat/lng to pixel coordinates at zoom 18
        const centerPixel = this.project(this.center.lat, this.center.lng);
        
        // Position viewBox so that center is in the middle
        this.viewBox.x = centerPixel.x - this.viewport.width / 2;
        this.viewBox.y = centerPixel.y - this.viewport.height / 2;
        this.viewBox.width = this.viewport.width;
        this.viewBox.height = this.viewport.height;
        
        this.updateViewBox();
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
        // Match the tile generation's simple linear projection
        // Tiles use 0.01 degrees = 1000 pixels
        const degreesPerTile = 0.01;
        const pixelsPerTile = 1000;
        
        // Simple linear projection (same as tile generation)
        // In the tile generation, coordinates are calculated as:
        // x = lng * (pixelsPerTile / degreesPerTile)
        // y = lat * (pixelsPerTile / degreesPerTile)
        // No inversion needed - tiles handle their own internal Y-axis flipping
        const x = (lng / degreesPerTile) * pixelsPerTile;
        // North-up: y DECREASES as latitude increases. This must match the
        // generator's coord_to_svg, which flips Y so each tile is north-up
        // internally (y = (north - lat)/range). The old `+lat` increased
        // southward, which mis-stacked vertically-adjacent tiles by 2 tile
        // heights — fine with one tile in view, scrambled when zoomed out.
        const y = -(lat / degreesPerTile) * pixelsPerTile;

        return { x, y };
    }

    async render() {
        // Initial render - set up the base coordinate system
        if (!this.isInitialized) {
            this.initializeCoordinateSystem();
            this.isInitialized = true;
        }
        
        // Clear existing tiles
        while (this.tilesGroup.firstChild) {
            this.tilesGroup.removeChild(this.tilesGroup.firstChild);
        }
        this.loadedTiles.clear();
        
        // Add a solid background to prevent any patterns
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        // Background should cover the entire coordinate space, not just viewBox
        bgRect.setAttribute('x', '-10000');
        bgRect.setAttribute('y', '-10000');
        bgRect.setAttribute('width', '20000');
        bgRect.setAttribute('height', '20000');
        bgRect.setAttribute('fill', '#e5e3df');
        bgRect.setAttribute('stroke', 'none');
        this.tilesGroup.appendChild(bgRect);
        
        // Update viewBox for proper centering
        this.updateViewBox();
    }

    updateViewBox() {
        // Update the SVG viewBox for zooming
        this.svg.setAttribute('viewBox', 
            `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
    }
    
    checkAndLoadTiles() {
        // Check if current viewBox extends beyond loaded tiles
        // This would trigger the app.js tile loading logic
        // For now, we'll emit an event that app.js can listen to
        const event = new CustomEvent('viewBoxChanged', { 
            detail: { 
                viewBox: this.viewBox,
                zoom: this.zoom 
            }
        });
        this.svg.dispatchEvent(event);
    }

    drawUserLocation(lat, lng, accuracy) {
        // Clear existing location marker
        while (this.locationGroup.firstChild) {
            this.locationGroup.removeChild(this.locationGroup.firstChild);
        }
        
        const pos = this.project(lat, lng);
        
        // Accuracy circle
        if (accuracy > 0) {
            // Convert meters to pixels using simple projection
            // At Toronto's latitude (43.6°), 1 degree ≈ 111km, so 0.01° ≈ 1.11km
            const metersPerDegree = 111000 * Math.cos(lat * Math.PI / 180);
            const metersPerTile = 0.01 * metersPerDegree; // 0.01 degrees per tile
            const pixelsPerMeter = 1000 / metersPerTile; // 1000 pixels per tile
            const radiusPixels = accuracy * pixelsPerMeter;
            
            const accuracyCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            accuracyCircle.setAttribute('cx', pos.x);
            accuracyCircle.setAttribute('cy', pos.y);
            accuracyCircle.setAttribute('r', radiusPixels);
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
        
        // Update viewport size
        this.viewport.width = rect.width;
        this.viewport.height = rect.height;
        
        // Recalculate viewBox to maintain zoom level
        const scale = Math.pow(2, this.zoom - 18);
        this.viewBox.width = this.viewport.width / scale;
        this.viewBox.height = this.viewport.height / scale;
        
        this.updateViewBox();
        
        // Only re-render if we actually need new tiles
        // For now, keep the render call
        this.render();
    }
}