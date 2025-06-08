import { MapRenderer } from './MapRenderer.js';
import { LocationTracker } from './LocationTracker.js';
import { FilterManager } from './FilterManager.js';
import { AccessibilityManager } from './AccessibilityManager.js';
import { SVGTileManager } from './SVGTileManager.js';
import { FeatureRenderer } from './FeatureRenderer.js';

class MapApplication {
    constructor() {
        this.mapRenderer = null;
        this.locationTracker = null;
        this.filterManager = null;
        this.accessibilityManager = null;
        this.svgTileManager = null;
        this.featureRenderer = null;
        this.isTracking = false;
        this.isNavigating = false;
        
        this.init();
        
    }

    init() {
        // Initialize map renderer
        const mapSvg = document.getElementById('map-svg');
        this.mapRenderer = new MapRenderer(mapSvg);
        
        // Initialize location tracker
        this.locationTracker = new LocationTracker();
        
        // Initialize filter and accessibility managers
        this.filterManager = new FilterManager();
        this.accessibilityManager = new AccessibilityManager();
        
        // Override filter manager's updateVisibility to work with tiles
        const originalUpdateVisibility = this.filterManager.updateVisibility.bind(this.filterManager);
        this.filterManager.updateVisibility = (featureType, visible) => {
            // Call original method (for non-tile features)
            originalUpdateVisibility(featureType, visible);
            
            // Update tile visibility
            this.applyFiltersToTiles();
            
            // Update accessibility after filter change
            this.updateAccessibilityForTiles();
        };
        
        // Initialize SVG tile manager and feature renderer
        this.svgTileManager = new SVGTileManager();
        this.featureRenderer = new FeatureRenderer(this.mapRenderer);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Set up keyboard navigation
        this.setupKeyboardNavigation();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.mapRenderer.handleResize();
        });
        
        // Initial render after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.mapRenderer.handleResize();
            this.mapRenderer.render();
            
            // Apply initial filter states
            this.filterManager.applyInitialVisibility();
            
            // Load initial map tiles
            this.loadMapTiles();
        }, 100);
        
        // Listen for map view changes
        this.setupMapChangeListeners();
        
        // Check for debug mode in URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            document.getElementById('debug-panel').style.display = 'block';
        }
    }

    setupEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const controlSidebar = document.getElementById('control-sidebar');
        
        sidebarToggle.addEventListener('click', () => {
            const isExpanded = sidebarToggle.getAttribute('aria-expanded') === 'true';
            controlSidebar.classList.toggle('collapsed');
            document.body.classList.toggle('sidebar-collapsed');
            sidebarToggle.setAttribute('aria-expanded', !isExpanded);
            
            // Toggle icons
            const hamburgerIcon = sidebarToggle.querySelector('.hamburger-icon');
            const closeIcon = sidebarToggle.querySelector('.close-icon');
            
            if (isExpanded) {
                // Closing - show hamburger
                hamburgerIcon.style.display = 'inline';
                closeIcon.style.display = 'none';
            } else {
                // Opening - show close
                hamburgerIcon.style.display = 'none';
                closeIcon.style.display = 'inline';
            }
        });
        
        // Accordion functionality
        const accordionHeaders = document.querySelectorAll('.accordion-header');
        accordionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const isExpanded = header.getAttribute('aria-expanded') === 'true';
                const content = document.getElementById(header.getAttribute('aria-controls'));
                
                header.setAttribute('aria-expanded', !isExpanded);
                content.hidden = isExpanded;
            });
        });
        
        // Filter accordion functionality
        const filterAccordionHeaders = document.querySelectorAll('.filter-accordion-header');
        filterAccordionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const isExpanded = header.getAttribute('aria-expanded') === 'true';
                const content = document.getElementById(header.getAttribute('aria-controls'));
                
                header.setAttribute('aria-expanded', !isExpanded);
                content.hidden = isExpanded;
            });
        });
        
        // Filter sub-accordion functionality (nested)
        const filterSubAccordionHeaders = document.querySelectorAll(".filter-sub-accordion-header");
        filterSubAccordionHeaders.forEach(header => {
            header.addEventListener("click", () => {
                const isExpanded = header.getAttribute("aria-expanded") === "true";
                const content = document.getElementById(header.getAttribute("aria-controls"));
                
                header.setAttribute("aria-expanded", !isExpanded);
                content.hidden = isExpanded;
            });
        });
        
        // Toggle buttons
        document.getElementById('toggle-tracking').addEventListener('click', (e) => {
            this.toggleLocationTracking(e.currentTarget);
        });
        
        // Debug controls
        document.getElementById('set-location').addEventListener('click', () => {
            this.setMockLocation();
        });
        
        // Compass navigator controls
        this.setupCompassNavigator();
        
        // Location tracker callbacks
        this.locationTracker.onUpdate((position) => {
            this.handleLocationUpdate(position);
        });
        
        this.locationTracker.onError((error) => {
            this.handleLocationError(error);
        });
    }

    setupCompassNavigator() {
        // Direction buttons
        document.getElementById('nav-n').addEventListener('click', () => {
            this.panMap(0, -1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-ne').addEventListener('click', () => {
            this.panMap(1, -1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-e').addEventListener('click', () => {
            this.panMap(1, 0);
            this.announceMapChange();
        });
        
        document.getElementById('nav-se').addEventListener('click', () => {
            this.panMap(1, 1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-s').addEventListener('click', () => {
            this.panMap(0, 1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-sw').addEventListener('click', () => {
            this.panMap(-1, 1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-w').addEventListener('click', () => {
            this.panMap(-1, 0);
            this.announceMapChange();
        });
        
        document.getElementById('nav-nw').addEventListener('click', () => {
            this.panMap(-1, -1);
            this.announceMapChange();
        });
        
        // Zoom buttons
        document.getElementById('nav-zoom-in').addEventListener('click', () => {
            this.mapRenderer.zoomIn();
            this.announceMapChange();
        });
        
        document.getElementById('nav-zoom-out').addEventListener('click', () => {
            this.mapRenderer.zoomOut();
            this.announceMapChange();
        });
        
        // Center location button
        document.getElementById('nav-center').addEventListener('click', () => {
            this.centerOnCurrentLocation();
        });
    }
    
    setupKeyboardNavigation() {
        const mapContainer = document.getElementById('map-container');
        
        mapContainer.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 5 : 1;
            let handled = true;
            
            // Check for modifier key (Ctrl or Cmd)
            const hasModifier = e.ctrlKey || e.metaKey;
            
            switch(e.key) {
                case 'ArrowUp':
                    if (hasModifier) {
                        this.panMap(0, -step);
                        handled = true;
                    }
                    break;
                case 'ArrowDown':
                    if (hasModifier) {
                        this.panMap(0, step);
                        handled = true;
                    }
                    break;
                case 'ArrowLeft':
                    if (hasModifier) {
                        this.panMap(-step, 0);
                        handled = true;
                    }
                    break;
                case 'ArrowRight':
                    if (hasModifier) {
                        this.panMap(step, 0);
                        handled = true;
                    }
                    break;
                case '+':
                case '=':
                    this.mapRenderer.zoomIn();
                    handled = true;
                    break;
                case '-':
                case '_':
                    this.mapRenderer.zoomOut();
                    handled = true;
                    break;
                case 'h':
                case 'H':
                    this.centerOnCurrentLocation();
                    handled = true;
                    break;
                default:
                    handled = false;
            }
            
            if (handled) {
                e.preventDefault();
                this.announceMapChange();
            }
        });
    }

    panMap(dx, dy) {
        const currentCenter = this.mapRenderer.center;
        const zoomFactor = Math.pow(2, -this.mapRenderer.zoom);
        
        const newLat = currentCenter.lat - dy * zoomFactor * 0.1;
        const newLng = currentCenter.lng + dx * zoomFactor * 0.1;
        
        this.mapRenderer.setCenter(newLat, newLng);
    }

    toggleLocationTracking(button) {
        this.isTracking = !this.isTracking;
        button.setAttribute('aria-pressed', this.isTracking);
        
        if (this.isTracking) {
            this.locationTracker.startTracking();
            this.announceStatus('Location tracking enabled');
        } else {
            this.locationTracker.stopTracking();
            this.announceStatus('Location tracking disabled');
        }
    }

    // Navigation is now handled by accordion, remove old toggle method


    handleLocationUpdate(position) {
        // Update location display
        const locationElement = document.getElementById('current-location');
        const accuracyElement = document.getElementById('location-accuracy');
        
        locationElement.textContent = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
        accuracyElement.textContent = `${Math.round(position.accuracy)}m`;
        
        // Update map
        this.mapRenderer.drawUserLocation(position.lat, position.lng, position.accuracy);
        
        // Center map on location if first update
        if (!this.hasInitialLocation) {
            this.mapRenderer.setCenter(position.lat, position.lng);
            this.hasInitialLocation = true;
        }
    }

    handleLocationError(error) {
        const locationElement = document.getElementById('current-location');
        locationElement.textContent = 'Error: ' + error.message;
        
        this.announceStatus('Location error: ' + error.message);
    }

    centerOnCurrentLocation() {
        const position = this.locationTracker.getCurrentPosition();
        
        if (position) {
            this.mapRenderer.setCenter(position.lat, position.lng);
            this.announceStatus('Map centered on current location');
        } else {
            this.announceStatus('Current location not available');
        }
    }

    setMockLocation() {
        const lat = parseFloat(document.getElementById('lat-input').value);
        const lng = parseFloat(document.getElementById('lng-input').value);
        
        if (!isNaN(lat) && !isNaN(lng)) {
            this.locationTracker.enableMockLocation(true);
            this.locationTracker.setMockLocation(lat, lng);
            this.announceStatus(`Mock location set to ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
    }

    announceStatus(message) {
        // Create or update status live region
        let statusRegion = document.getElementById('status-live-region');
        if (!statusRegion) {
            statusRegion = document.createElement('div');
            statusRegion.id = 'status-live-region';
            statusRegion.setAttribute('aria-live', 'assertive');
            statusRegion.setAttribute('aria-atomic', 'true');
            statusRegion.className = 'screen-reader-only';
            document.body.appendChild(statusRegion);
        }
        
        statusRegion.textContent = message;
    }

    announceMapChange() {
        const center = this.mapRenderer.center;
        const zoom = this.mapRenderer.zoom;
        
        this.announceStatus(`Map view: zoom level ${zoom}, centered at ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
    }
    
    async loadMapTiles() {
        try {
            // Get current map bounds
            const bounds = this.getBoundsFromView();
            console.log('Loading tiles for bounds:', bounds);
            
            // Show loading indicator
            this.announceStatus('Loading map tiles...');
            
            // Load SVG tiles for the area
            const tiles = await this.svgTileManager.loadTilesForArea(bounds);
            console.log(`Loaded ${tiles ? tiles.length : 0} tiles`);
            
            if (!tiles || tiles.length === 0) {
                console.warn('No tiles returned for current view');
                this.announceStatus('No map data available for this area');
                return;
            }
            
            // Clear old tiles
            this.clearMapTiles();
            
            // Render tiles
            this.renderSVGTiles(tiles);
            
            // Apply current filters to the newly loaded tiles
            this.applyFiltersToTiles();
            
            // Update accessibility for keyboard navigation
            this.updateAccessibilityForTiles();
            
            // Announce completion
            this.announceStatus(`Map loaded. ${tiles.length} tiles displayed.`);
        } catch (error) {
            console.error('Error loading map tiles:', error);
            this.announceStatus('Error loading map. Please try again.');
        }
    }

    getBoundsFromView() {
        const center = this.mapRenderer.center;
        const zoom = this.mapRenderer.zoom;
        const width = this.mapRenderer.viewBox.width;
        const height = this.mapRenderer.viewBox.height;
        
        // Match the coordinate system from latLngToPixel
        const zoomScale = Math.pow(2, zoom - 17); // At zoom 17, scale = 1
        const baseTileSize = 1000; // pixels per tile at zoom 17
        const tileSize = baseTileSize * zoomScale;
        const degreesPerTile = 0.01;
        const pixelsPerDegree = tileSize / degreesPerTile;
        
        // Calculate how many degrees the viewport covers
        const viewportWidthDegrees = width / pixelsPerDegree;
        const viewportHeightDegrees = height / pixelsPerDegree;
        
        // Add some padding to ensure we load tiles around the edges
        const padding = degreesPerTile * 1; // 1 tile of padding on each side
        
        const bounds = {
            north: center.lat + viewportHeightDegrees / 2 + padding,
            south: center.lat - viewportHeightDegrees / 2 - padding,
            east: center.lng + viewportWidthDegrees / 2 + padding,
            west: center.lng - viewportWidthDegrees / 2 - padding
        };
        
        console.log(`Viewport covers ${viewportWidthDegrees.toFixed(4)} x ${viewportHeightDegrees.toFixed(4)} degrees`);
        console.log(`Bounds: N=${bounds.north.toFixed(4)}, S=${bounds.south.toFixed(4)}, E=${bounds.east.toFixed(4)}, W=${bounds.west.toFixed(4)}`);
        
        return bounds;
    }

    renderSVGTiles(tiles) {
        const tilesGroup = document.querySelector('#map-tiles') || 
                         this.mapRenderer.svg.querySelector('#map-tiles');
        
        if (!tilesGroup) {
            console.error('No tiles group found in SVG');
            return;
        }

        tiles.forEach(tile => {
            if (!tile.content) return;
            
            try {
                // Parse SVG content
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(tile.content, 'image/svg+xml');
                const svgElement = svgDoc.documentElement;
                
                // Create a group for this tile
                const tileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                tileGroup.setAttribute('class', 'tile');
                tileGroup.setAttribute('data-tile-id', tile.id);
                
                // Calculate tile position and scale
                const tilePixelPos = this.latLngToPixel(tile.lat, tile.lng);
                
                // Scale factor - matches the zoom level scaling
                const zoomScale = Math.pow(2, this.mapRenderer.zoom - 17); // At zoom 17, scale = 1
                const scale = zoomScale;
                
                // The tile.lat/lng represents the LOWER-LEFT corner of the tile
                // We need to position based on that corner, not center
                const scaledTileSize = 1000 * scale;
                
                console.log(`Tile ${tile.id}: zoom=${this.mapRenderer.zoom}, scale=${scale.toFixed(3)}, pos=(${tilePixelPos.x.toFixed(1)}, ${tilePixelPos.y.toFixed(1)})`);
                
                // Debug rectangle removed - tiles are working!
                
                // Position the tile
                // The tilePixelPos is for the tile's lat/lng (lower-left in geographic terms)
                // But in SVG, Y=0 is at top, so we just use the position directly
                console.log(`Positioning tile at translate(${tilePixelPos.x}, ${tilePixelPos.y}) scale(${scale})`);
                tileGroup.setAttribute('transform', 
                    `translate(${tilePixelPos.x}, ${tilePixelPos.y}) scale(${scale})`);
                
                // Create a group to hold the tile content with proper viewBox scaling
                const contentGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                
                // The tile SVG has viewBox="0 0 1000 1000" but we need to ensure content fills the tile
                // Copy all child elements from the SVG tile and fix duplicate IDs
                console.log(`Tile ${tile.id} has ${svgElement.children.length} child groups`);
                Array.from(svgElement.children).forEach((child, index) => {
                    const importedNode = document.importNode(child, true);
                    
                    // Fix the broken class- attribute
                    if (importedNode.hasAttribute('class-')) {
                        importedNode.setAttribute('class', importedNode.getAttribute('class-'));
                        importedNode.removeAttribute('class-');
                    }
                    
                    // Debug: log what we're adding
                    console.log(`  Group ${index}: id="${child.id}", children=${child.children.length}`);
                    
                    // Fix duplicate IDs by making them unique per tile
                    if (importedNode.id) {
                        importedNode.id = `${tile.id}-${importedNode.id}`;
                    }
                    
                    // Also fix any child element IDs
                    importedNode.querySelectorAll('[id]').forEach(element => {
                        element.id = `${tile.id}-${element.id}`;
                    });
                    
                    // Remove tabindex="-1" from all features to allow native tooltips
                    importedNode.querySelectorAll('[tabindex="-1"]').forEach(element => {
                        element.removeAttribute('tabindex');
                    });
                    
                    contentGroup.appendChild(importedNode);
                });
                
                tileGroup.appendChild(contentGroup);
                
                tilesGroup.appendChild(tileGroup);
            } catch (error) {
                console.error(`Error rendering tile ${tile.id}:`, error);
            }
        });
    }

    latLngToPixel(lat, lng) {
        const center = this.mapRenderer.center;
        const width = this.mapRenderer.viewBox.width;
        const height = this.mapRenderer.viewBox.height;
        
        // Calculate position relative to center
        const deltaLng = lng - center.lng;
        const deltaLat = lat - center.lat;
        
        // At zoom 17, tiles are 1000x1000 pixels (1:1 scale)
        const zoomScale = Math.pow(2, this.mapRenderer.zoom - 17);
        const tilePixelSize = 1000 * zoomScale;
        const degreesPerTile = 0.01;
        
        // Convert degrees to pixels
        const x = width / 2 + (deltaLng / degreesPerTile) * tilePixelSize;
        const y = height / 2 - (deltaLat / degreesPerTile) * tilePixelSize; // Negative because Y increases downward
        
        // Debug specific tile
        if (lat === 43.640 && lng === -79.380) {
            console.log(`Center tile debug: center=(${center.lat}, ${center.lng}), delta=(${deltaLat}, ${deltaLng}), viewport=(${width}x${height}), result=(${x}, ${y})`);
        }
        
        return { x, y };
    }
    
    clearMapTiles() {
        const tilesGroup = document.querySelector('#map-tiles');
        if (tilesGroup) {
            while (tilesGroup.firstChild) {
                tilesGroup.removeChild(tilesGroup.firstChild);
            }
        }
        // Announce to screen readers
        this.announceStatus('Map updating...');
    }
    
    hideTiles() {
        const tilesGroup = document.querySelector('#map-tiles');
        if (tilesGroup) {
            tilesGroup.style.opacity = '0';
            tilesGroup.style.pointerEvents = 'none';
        }
    }
    
    showTiles() {
        const tilesGroup = document.querySelector('#map-tiles');
        if (tilesGroup) {
            tilesGroup.style.opacity = '1';
            tilesGroup.style.pointerEvents = 'auto';
        }
    }
    
    setupMapChangeListeners() {
        let loadTimeout;
        let lastRequestBounds = null;
        
        // Create a debounced version of loadMapTiles
        const debouncedLoad = () => {
            clearTimeout(loadTimeout);
            
            // Cancel any pending requests
            if (this.svgTileManager) {
                this.svgTileManager.cancelAllRequests();
            }
            
            loadTimeout = setTimeout(() => {
                // Update viewport dimensions to ensure they're current
                const container = this.mapRenderer.svg.parentElement;
                const rect = container.getBoundingClientRect();
                this.mapRenderer.viewBox.width = rect.width;
                this.mapRenderer.viewBox.height = rect.height;
                
                // Get current bounds
                const bounds = this.getBoundsFromView();
                
                // Check if bounds have changed significantly
                if (this.boundsHaveChanged(bounds, lastRequestBounds)) {
                    lastRequestBounds = bounds;
                    this.loadMapTiles();
                }
            }, 300); // Wait 300ms after movement stops
        };
        
        // Override MapRenderer methods to add tile loading
        const originalSetCenter = this.mapRenderer.setCenter.bind(this.mapRenderer);
        this.mapRenderer.setCenter = (lat, lng) => {
            originalSetCenter(lat, lng);
            debouncedLoad();
        };
        
        const originalSetZoom = this.mapRenderer.setZoom.bind(this.mapRenderer);
        this.mapRenderer.setZoom = (zoom) => {
            originalSetZoom(zoom);
            debouncedLoad();
        };
    }
    
    boundsHaveChanged(bounds1, bounds2) {
        if (!bounds1 || !bounds2) return true;
        
        const threshold = 0.0001; // Small threshold for floating point comparison
        return Math.abs(bounds1.north - bounds2.north) > threshold ||
               Math.abs(bounds1.south - bounds2.south) > threshold ||
               Math.abs(bounds1.east - bounds2.east) > threshold ||
               Math.abs(bounds1.west - bounds2.west) > threshold;
    }
    
    applyFiltersToTiles() {
        // Apply visibility to each layer group in all tiles
        document.querySelectorAll('.tile').forEach(tile => {
            // Handle buildings layer
            const buildingsLayer = tile.querySelector('[id$="-buildings"]');
            if (buildingsLayer) {
                buildingsLayer.style.display = this.filterManager.filters.buildings ? '' : 'none';
            }
            
            // Handle roads layer
            const roadsLayer = tile.querySelector('[id$="-roads"]');
            if (roadsLayer) {
                roadsLayer.style.display = this.filterManager.filters.roads ? '' : 'none';
            }
            
            // Handle transit layer
            const transitLayer = tile.querySelector('[id$="-transit"]');
            if (transitLayer) {
                transitLayer.style.display = this.filterManager.filters.transit ? '' : 'none';
            }
            
            // Handle accessibility layer (includes accessible parking, etc.)
            const accessibilityLayer = tile.querySelector('[id$="-accessibility"]');
            if (accessibilityLayer) {
                // Show if any accessibility filter is enabled
                const showAccessibility = this.filterManager.filters['accessible-parking'] || 
                                        this.filterManager.filters['accessible-toilets'] ||
                                        this.filterManager.filters['benches'] ||
                                        this.filterManager.filters['shelters'];
                accessibilityLayer.style.display = showAccessibility ? '' : 'none';
            }
            
            // Handle water layer
            const waterLayer = tile.querySelector('[id$="-water"]');
            if (waterLayer) {
                // Show if any water filter is enabled
                const showWater = this.filterManager.filters['water-bodies'] ||
                                this.filterManager.filters['rivers'] ||
                                this.filterManager.filters['streams'] ||
                                this.filterManager.filters['canals'] ||
                                this.filterManager.filters['ditches'] ||
                                this.filterManager.filters['coastlines'];
                waterLayer.style.display = showWater ? '' : 'none';
            }
            
            // Handle parks layer
            const parksLayer = tile.querySelector('[id$="-parks"]');
            if (parksLayer) {
                parksLayer.style.display = this.filterManager.filters.parks ? '' : 'none';
            }
        });
        
        console.log('Applied filters to tiles:', {
            buildings: this.filterManager.filters.buildings,
            roads: this.filterManager.filters.roads,
            transit: this.filterManager.filters.transit,
            accessibility: this.filterManager.filters['accessible-parking']
        });
    }
    
    updateAccessibilityForTiles() {
        // Remove all existing tabindex attributes first
        document.querySelectorAll('[tabindex]').forEach(element => {
            if (element.closest('#map-tiles')) {
                element.removeAttribute('tabindex');
            }
        });
        
        // Only add tabindex to visible features based on rotor setting
        const rotorSetting = document.querySelector('input[name="rotor-mode"]:checked')?.value || 'all';
        
        // Get all visible features in tiles
        const visibleFeatures = [];
        document.querySelectorAll('.tile').forEach(tile => {
            // Check each layer group
            ['buildings', 'roads', 'transit', 'accessibility', 'water', 'parks'].forEach(layerId => {
                const layerGroup = tile.querySelector(`[id$="-${layerId}"]`);
                if (layerGroup && layerGroup.style.display !== 'none') {
                    // Get features from this layer
                    const features = layerGroup.querySelectorAll('polygon, polyline, circle');
                    features.forEach(feature => {
                        if (this.shouldIncludeInRotor(feature, rotorSetting)) {
                            visibleFeatures.push(feature);
                        }
                    });
                }
            });
        });
        
        // Sort features by their position (top to bottom, left to right)
        visibleFeatures.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            
            // Compare by Y first, then X
            if (Math.abs(aRect.top - bRect.top) > 10) {
                return aRect.top - bRect.top;
            }
            return aRect.left - bRect.left;
        });
        
        // Assign tabindex values
        visibleFeatures.forEach((feature, index) => {
            feature.setAttribute('tabindex', index + 1);
            
            // Ensure feature has proper ARIA attributes
            if (!feature.getAttribute('role')) {
                feature.setAttribute('role', 'img');
            }
            if (!feature.getAttribute('aria-label')) {
                // Try to generate a label from the feature
                const label = this.generateFeatureLabel(feature);
                if (label) {
                    feature.setAttribute('aria-label', label);
                }
            }
        });
        
        console.log(`Updated accessibility: ${visibleFeatures.length} features are keyboard navigable`);
    }
    
    shouldIncludeInRotor(feature, rotorSetting) {
        if (rotorSetting === 'all') return true;
        
        const featureClass = feature.getAttribute('class') || '';
        const parentId = feature.parentElement?.id || '';
        
        switch (rotorSetting) {
            case 'buildings':
                return parentId.includes('buildings');
            case 'roads':
                return parentId.includes('roads');
            case 'transit':
                return parentId.includes('transit');
            case 'accessibility':
                return parentId.includes('accessibility');
            case 'landmarks':
                // Include notable buildings, transit, etc.
                return parentId.includes('buildings') || parentId.includes('transit');
            default:
                return true;
        }
    }
    
    generateFeatureLabel(feature) {
        // Try to get label from existing attributes
        const existingLabel = feature.getAttribute('aria-label');
        if (existingLabel) return existingLabel;
        
        // Generate based on parent layer
        const parentId = feature.parentElement?.id || '';
        const featureType = feature.tagName.toLowerCase();
        
        if (parentId.includes('buildings')) {
            return 'Building';
        } else if (parentId.includes('roads')) {
            return 'Road segment';
        } else if (parentId.includes('transit')) {
            return featureType === 'circle' ? 'Transit stop' : 'Transit route';
        } else if (parentId.includes('accessibility')) {
            return 'Accessible facility';
        }
        
        return 'Map feature';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mapApp = new MapApplication();
});