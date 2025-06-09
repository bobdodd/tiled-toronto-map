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
            this.accessibilityManager.updateTabOrder();
        };
        
        // Initialize SVG tile manager and feature renderer
        this.svgTileManager = new SVGTileManager();
        this.featureRenderer = new FeatureRenderer(this.mapRenderer);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Set up keyboard navigation
        this.setupKeyboardNavigation();
        
        // Set up touch gestures for pinch-to-zoom
        this.setupTouchGestures();
        
        // Set up trackpad/wheel zoom (for laptops)
        this.setupWheelZoom();
        
        // Set up drag-to-pan for mouse and touch
        this.setupDragToPan();
        
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
            
            // Update zoom button states
            this.updateZoomButtonStates();
            
            // Load initial map tiles
            this.loadMapTiles();
        }, 100);
        
        // Listen for map view changes
        this.setupMapChangeListeners();
        
        // Listen for viewBox changes from MapRenderer
        this.mapRenderer.svg.addEventListener('viewBoxChanged', () => {
            // Check if we need to load new tiles when viewBox changes
            const needsNewTiles = this.checkIfNeedNewTiles();
            if (needsNewTiles) {
                this.loadMapTiles();
            }
        });
        
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
            this.updateZoomButtonStates();
            this.announceMapChange();
        });
        
        document.getElementById('nav-zoom-out').addEventListener('click', () => {
            this.mapRenderer.zoomOut();
            this.updateZoomButtonStates();
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
                    this.updateZoomButtonStates();
                    handled = true;
                    break;
                case '-':
                case '_':
                    this.mapRenderer.zoomOut();
                    this.updateZoomButtonStates();
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
    
    setupTouchGestures() {
        const mapContainer = document.getElementById('map-container');
        let touches = [];
        let lastDistance = 0;
        let isPinching = false;
        
        mapContainer.addEventListener('touchstart', (e) => {
            // Store all touch points
            touches = Array.from(e.touches);
            
            if (touches.length === 2) {
                isPinching = true;
                // Calculate initial distance between two touches
                const dx = touches[0].clientX - touches[1].clientX;
                const dy = touches[0].clientY - touches[1].clientY;
                lastDistance = Math.sqrt(dx * dx + dy * dy);
                e.preventDefault();
            }
        }, { passive: false });
        
        mapContainer.addEventListener('touchmove', (e) => {
            if (isPinching && e.touches.length === 2) {
                // Calculate new distance
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (lastDistance > 0) {
                    // Calculate zoom change
                    const scale = distance / lastDistance;
                    
                    // Calculate the pinch center point (for future use)
                    // const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    // const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    
                    // Continuous zoom - accumulate smaller changes
                    const zoomDelta = Math.log2(scale);
                    const newZoom = this.mapRenderer.zoom + zoomDelta;
                    
                    // Apply zoom if within bounds
                    if (newZoom >= 15 && newZoom <= 23) {
                        this.mapRenderer.setZoom(newZoom);
                        this.updateZoomButtonStates();
                        lastDistance = distance;
                    }
                }
                
                e.preventDefault();
            }
        }, { passive: false });
        
        mapContainer.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                isPinching = false;
                lastDistance = 0;
            }
            touches = Array.from(e.touches);
        });
        
        mapContainer.addEventListener('touchcancel', () => {
            isPinching = false;
            lastDistance = 0;
            touches = [];
        });
    }
    
    setupWheelZoom() {
        const mapContainer = document.getElementById('map-container');
        
        mapContainer.addEventListener('wheel', (e) => {
            // Check if it's a pinch gesture (ctrl key on Mac trackpad)
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                
                // deltaY is negative when pinching out (zoom in), positive when pinching in (zoom out)
                // Adjust sensitivity based on platform
                // Mac trackpad gives smaller deltaY values than mouse wheel
                const sensitivity = Math.abs(e.deltaY) < 50 ? 0.01 : 0.002;
                const zoomDelta = -e.deltaY * sensitivity;
                const currentZoom = this.mapRenderer.zoom;
                const newZoom = currentZoom + zoomDelta;
                
                
                // Apply zoom if within bounds
                if (newZoom >= 15 && newZoom <= 23) {
                    this.mapRenderer.setZoom(newZoom);
                    this.updateZoomButtonStates();
                    // Don't announce every tiny change during continuous zoom
                    clearTimeout(this.zoomAnnounceTimeout);
                    this.zoomAnnounceTimeout = setTimeout(() => {
                        this.announceMapChange();
                    }, 500);
                }
            }
        }, { passive: false });
    }
    
    setupDragToPan() {
        const mapContainer = document.getElementById('map-container');
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLat = 0;
        let startLng = 0;
        
        // Mouse drag events
        mapContainer.addEventListener('mousedown', (e) => {
            // Only respond to left mouse button (button 0)
            if (e.button !== 0) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLat = this.mapRenderer.center.lat;
            startLng = this.mapRenderer.center.lng;
            
            // Prevent text selection during drag
            e.preventDefault();
            
            // Change cursor to grabbing
            mapContainer.style.cursor = 'grabbing';
        });
        
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // Convert pixel movement to degrees
            // Use the MapRenderer's coordinate system
            const pixelsPerDegree = 100000; // 0.01 degrees = 1000 pixels
            const scale = Math.pow(2, this.mapRenderer.zoom - 18);
            
            const deltaLng = -dx / (pixelsPerDegree * scale);
            const deltaLat = dy / (pixelsPerDegree * scale);
            
            this.mapRenderer.setCenter(startLat + deltaLat, startLng + deltaLng);
        });
        
        window.addEventListener('mouseup', (e) => {
            if (isDragging && e.button === 0) {
                isDragging = false;
                mapContainer.style.cursor = 'default';
            }
        });
        
        // Touch drag events
        let touchStartX = 0;
        let touchStartY = 0;
        let isTouchDragging = false;
        let currentTouchId = null;
        
        mapContainer.addEventListener('touchstart', (e) => {
            // If already pinching (2 touches), don't start drag
            if (e.touches.length > 1) {
                isTouchDragging = false;
                return;
            }
            
            // Single touch - start drag
            const touch = e.touches[0];
            currentTouchId = touch.identifier;
            isTouchDragging = true;
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            startLat = this.mapRenderer.center.lat;
            startLng = this.mapRenderer.center.lng;
        }, { passive: true });
        
        mapContainer.addEventListener('touchmove', (e) => {
            // If pinching, don't drag
            if (e.touches.length > 1) {
                isTouchDragging = false;
                return;
            }
            
            if (!isTouchDragging) return;
            
            // Find the touch we're tracking
            let touch = null;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === currentTouchId) {
                    touch = e.touches[i];
                    break;
                }
            }
            
            if (!touch) return;
            
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            
            // Convert pixel movement to degrees
            const pixelsPerDegree = 100000;
            const scale = Math.pow(2, this.mapRenderer.zoom - 18);
            
            const deltaLng = -dx / (pixelsPerDegree * scale);
            const deltaLat = dy / (pixelsPerDegree * scale);
            
            this.mapRenderer.setCenter(startLat + deltaLat, startLng + deltaLng);
            
            // Prevent default to avoid scrolling the page
            e.preventDefault();
        }, { passive: false });
        
        mapContainer.addEventListener('touchend', (e) => {
            // Check if our tracked touch ended
            let touchEnded = true;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === currentTouchId) {
                    touchEnded = false;
                    break;
                }
            }
            
            if (touchEnded) {
                isTouchDragging = false;
                currentTouchId = null;
            }
        });
        
        mapContainer.addEventListener('touchcancel', () => {
            isTouchDragging = false;
            currentTouchId = null;
        });
        
        // Don't set any special cursor by default - only show grabbing cursor when dragging
    }

    panMap(dx, dy) {
        const currentCenter = this.mapRenderer.center;
        
        // In the new coordinate system:
        // - 0.01 degrees = 1 tile = 1000 pixels at base zoom
        // - We want to pan by about 10% of the viewport
        const viewportWidthDegrees = this.mapRenderer.viewBox.width / 100000; // pixels to degrees
        const viewportHeightDegrees = this.mapRenderer.viewBox.height / 100000;
        
        // Use the smaller dimension to ensure diagonal moves are at 45 degrees
        const panAmount = Math.min(viewportWidthDegrees, viewportHeightDegrees) * 0.1;
        
        // For diagonal moves, normalize the vector to maintain consistent speed
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        const normalizedDx = magnitude > 0 ? dx / magnitude : 0;
        const normalizedDy = magnitude > 0 ? dy / magnitude : 0;
        
        // Note: In our coordinate system, Y is inverted (negative Y is up/north)
        // For longitude: positive dx should move east (increase lng)
        const newLat = currentCenter.lat - normalizedDy * panAmount;  // Negative because Y increases downward
        const newLng = currentCenter.lng + normalizedDx * panAmount;  // Positive dx = east
        
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
    
    updateZoomButtonStates() {
        const zoomInButton = document.getElementById('nav-zoom-in');
        const zoomOutButton = document.getElementById('nav-zoom-out');
        const currentZoom = this.mapRenderer.zoom;
        
        // Update zoom in button - disable when at max zoom (23)
        if (currentZoom >= 23) {
            zoomInButton.setAttribute('disabled', 'true');
            zoomInButton.setAttribute('aria-disabled', 'true');
            zoomInButton.classList.add('disabled');
        } else {
            zoomInButton.removeAttribute('disabled');
            zoomInButton.setAttribute('aria-disabled', 'false');
            zoomInButton.classList.remove('disabled');
        }
        
        // Update zoom out button - disable when at min zoom (15)
        if (currentZoom <= 15) {
            zoomOutButton.setAttribute('disabled', 'true');
            zoomOutButton.setAttribute('aria-disabled', 'true');
            zoomOutButton.classList.add('disabled');
        } else {
            zoomOutButton.removeAttribute('disabled');
            zoomOutButton.setAttribute('aria-disabled', 'false');
            zoomOutButton.classList.remove('disabled');
        }
    }
    
    async loadMapTiles() {
        try {
            // Get current map bounds
            const bounds = this.getBoundsFromView();
            
            // Show loading indicator
            this.announceStatus('Loading map tiles...');
            
            // Load SVG tiles for the area
            const tiles = await this.svgTileManager.loadTilesForArea(bounds);
            
            if (!tiles || tiles.length === 0) {
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
            if (this.accessibilityManager) {
                this.accessibilityManager.updateTabOrder();
            }
            
            // Announce completion
            this.announceStatus(`Map loaded. ${tiles.length} tiles displayed.`);
        } catch (error) {
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
        // At high zoom levels, reduce padding to avoid loading too many tiles
        const paddingMultiplier = zoom > 20 ? 0.5 : 1;
        const padding = degreesPerTile * paddingMultiplier;
        
        const bounds = {
            north: center.lat + viewportHeightDegrees / 2 + padding,
            south: center.lat - viewportHeightDegrees / 2 - padding,
            east: center.lng + viewportWidthDegrees / 2 + padding,
            west: center.lng - viewportWidthDegrees / 2 - padding
        };
        
        // Ensure bounds cover at least one tile
        const minTileSpan = degreesPerTile;
        if (bounds.north - bounds.south < minTileSpan) {
            const midLat = (bounds.north + bounds.south) / 2;
            bounds.north = midLat + minTileSpan / 2;
            bounds.south = midLat - minTileSpan / 2;
        }
        if (bounds.east - bounds.west < minTileSpan) {
            const midLng = (bounds.east + bounds.west) / 2;
            bounds.east = midLng + minTileSpan / 2;
            bounds.west = midLng - minTileSpan / 2;
        }
        
        
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
                
                // Calculate tile position
                const tilePixelPos = this.latLngToPixel(tile.lat, tile.lng);
                
                // Tiles are always 1000x1000 in their native coordinate system
                // ViewBox zooming handles the scaling
                
                
                // Position the tile at its absolute coordinates
                // No scaling needed - viewBox handles zoom
                tileGroup.setAttribute('transform', 
                    `translate(${tilePixelPos.x}, ${tilePixelPos.y})`);
                
                // Create a group to hold the tile content with proper viewBox scaling
                const contentGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                
                // The tile SVG has viewBox="0 0 1000 1000" but we need to ensure content fills the tile
                // Copy all child elements from the SVG tile and fix duplicate IDs
                Array.from(svgElement.children).forEach((child) => {
                    const importedNode = document.importNode(child, true);
                    
                    // Fix the broken class- attribute
                    if (importedNode.hasAttribute('class-')) {
                        importedNode.setAttribute('class', importedNode.getAttribute('class-'));
                        importedNode.removeAttribute('class-');
                    }
                    
                    
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
            }
        });
    }

    latLngToPixel(lat, lng) {
        // Use the MapRenderer's project method for consistent coordinates
        // This gives us absolute pixel coordinates in the SVG space
        return this.mapRenderer.project(lat, lng);
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
            // Only load tiles when panning, not zooming
            debouncedLoad();
            // Update accessibility when view changes
            if (this.accessibilityManager) {
                this.accessibilityManager.updateTabOrder();
            }
        };
        
        const originalSetZoom = this.mapRenderer.setZoom.bind(this.mapRenderer);
        this.mapRenderer.setZoom = (zoom) => {
            const newZoom = originalSetZoom(zoom);
            this.updateZoomButtonStates();
            // Don't reload tiles on zoom - viewBox handles it
            // Update accessibility when zoom changes
            if (this.accessibilityManager) {
                this.accessibilityManager.updateTabOrder();
            }
            return newZoom;
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
    
    checkIfNeedNewTiles() {
        // Check if the current bounds extend beyond what we've loaded
        // For now, return false to prevent unnecessary reloading
        // TODO: Implement proper tile boundary checking
        return false;
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
            
            // Handle accessible facilities layer
            const accessibleFacilitiesLayer = tile.querySelector('[id$="-accessible_facilities"]');
            if (accessibleFacilitiesLayer) {
                // Show if any accessible facilities filter is enabled
                const showAccessibleFacilities = 
                    this.filterManager.filters['accessible-toilets'] ||
                    this.filterManager.filters['changing-tables'] ||
                    this.filterManager.filters['elevators'] ||
                    this.filterManager.filters['automatic-doors'] ||
                    this.filterManager.filters['wide-doors'] ||
                    this.filterManager.filters['low-kerbs'] ||
                    this.filterManager.filters['gentle-inclines'];
                accessibleFacilitiesLayer.style.display = showAccessibleFacilities ? '' : 'none';
            }
            
            // Handle sensory accessibility layer
            const sensoryAccessibilityLayer = tile.querySelector('[id$="-sensory_accessibility"]');
            if (sensoryAccessibilityLayer) {
                // Show if any sensory accessibility filter is enabled
                const showSensoryAccessibility = 
                    this.filterManager.filters['tactile-paving'] ||
                    this.filterManager.filters['audio-signals'] ||
                    this.filterManager.filters['tactile-maps'];
                sensoryAccessibilityLayer.style.display = showSensoryAccessibility ? '' : 'none';
            }
            
            // Handle mobility access layer
            const mobilityAccessLayer = tile.querySelector('[id$="-mobility_access"]');
            if (mobilityAccessLayer) {
                // Show if any mobility access filter is enabled
                const showMobilityAccess = 
                    this.filterManager.filters['wheelchair-yes'] ||
                    this.filterManager.filters['wheelchair-no'] ||
                    this.filterManager.filters['wheelchair-limited'] ||
                    this.filterManager.filters['ramps'] ||
                    this.filterManager.filters['handrails'] ||
                    this.filterManager.filters['steps'];
                mobilityAccessLayer.style.display = showMobilityAccess ? '' : 'none';
            }
            
            // Handle accessible transport layer
            const accessibleTransportLayer = tile.querySelector('[id$="-accessible_transport"]');
            if (accessibleTransportLayer) {
                // Show if any accessible transport filter is enabled
                const showAccessibleTransport = 
                    this.filterManager.filters['disabled-parking'] ||
                    this.filterManager.filters['priority-disabled'] ||
                    this.filterManager.filters['accessible-bus'] ||
                    this.filterManager.filters['accessible-subway'] ||
                    this.filterManager.filters['accessible-tram'] ||
                    this.filterManager.filters['accessible-train'];
                accessibleTransportLayer.style.display = showAccessibleTransport ? '' : 'none';
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
        
    }
    
    updateAccessibilityForTiles() {
        // Remove all existing tabindex attributes first
        document.querySelectorAll('[tabindex]').forEach(element => {
            if (element.closest('#map-tiles')) {
                element.removeAttribute('tabindex');
            }
        });
        
        // Get selected rotor values from AccessibilityManager
        const selectedRotorValues = this.accessibilityManager.getSelectedRotorValues();
        
        // If no rotor values selected, don't add any tabindex
        if (selectedRotorValues.length === 0) {
            return;
        }
        
        // Get viewport bounds
        const mapContainer = document.getElementById('map-container');
        const containerRect = mapContainer.getBoundingClientRect();
        
        // Get all visible features in tiles that are within viewport
        const visibleFeatures = [];
        document.querySelectorAll('.tile').forEach(tile => {
            // Check each layer group
            ['buildings', 'roads', 'transit', 'accessibility', 'accessible_facilities', 'sensory_accessibility', 'mobility_access', 'accessible_transport', 'water', 'parks'].forEach(layerId => {
                const layerGroup = tile.querySelector(`[id$="-${layerId}"]`);
                if (layerGroup && layerGroup.style.display !== 'none') {
                    // Get features from this layer
                    const features = layerGroup.querySelectorAll('polygon, polyline, circle');
                    features.forEach(feature => {
                        if (this.shouldIncludeInRotor(feature, selectedRotorValues) && this.isFeatureInViewport(feature, containerRect)) {
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
        
    }
    
    shouldIncludeInRotor(feature, selectedRotorValues) {
        // If no values selected, don't include anything
        if (selectedRotorValues.length === 0) return false;
        
        const parentId = feature.parentElement?.id || '';
        const featureClasses = feature.className?.baseVal || '';
        
        // Check each selected rotor value
        for (const value of selectedRotorValues) {
            switch (value) {
                // Main categories
                case 'buildings':
                    if (parentId.includes('buildings') || featureClasses.includes('building')) return true;
                    break;
                case 'roads':
                    if (parentId.includes('roads') || featureClasses.includes('road')) return true;
                    break;
                case 'transit':
                    if (parentId.includes('transit') || featureClasses.includes('transit')) return true;
                    break;
                case 'parks':
                    if (parentId.includes('parks') || featureClasses.includes('park')) return true;
                    break;
                case 'water-bodies':
                    if (parentId.includes('water') || featureClasses.includes('water')) return true;
                    break;
                
                // Accessibility features
                case 'accessible-parking':
                    if (parentId.includes('accessibility') || parentId.includes('accessible_facilities')) return true;
                    break;
                case 'wheelchair-yes':
                case 'wheelchair-no':
                case 'wheelchair-limited':
                    if (parentId.includes('mobility_access')) return true;
                    break;
                case 'tactile-paving':
                case 'audio-signals':
                    if (parentId.includes('sensory_accessibility')) return true;
                    break;
                    
                // Waterways
                case 'rivers':
                case 'streams':
                case 'canals':
                case 'ditches':
                case 'coastlines':
                    if (parentId.includes('water')) return true;
                    break;
                    
                // Catch-all for other features
                default:
                    // Check if parent layer ID contains the rotor value
                    if (parentId.includes(value.replace('-', '_'))) return true;
                    break;
            }
        }
        
        return false;
    }
    
    isFeatureInViewport(feature, containerRect) {
        const featureRect = feature.getBoundingClientRect();
        
        // Check if feature intersects with viewport
        const intersects = !(
            featureRect.right < containerRect.left ||
            featureRect.left > containerRect.right ||
            featureRect.bottom < containerRect.top ||
            featureRect.top > containerRect.bottom
        );
        
        return intersects;
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