import { MapRenderer } from './MapRenderer.js';
import { LocationTracker } from './LocationTracker.js';
import { FilterManager } from './FilterManager.js';
import { AccessibilityManager } from './AccessibilityManager.js';
import { SVGTileManager } from './SVGTileManager.js';
import { FeatureRenderer } from './FeatureRenderer.js';
import { Avatar } from './Avatar.js';
import { TaxonomyClient } from './TaxonomyClient.js';
import { buildFilterUI } from './FilterUI.js';
import { setupTooltip } from './Tooltip.js';

class MapApplication {
    constructor() {
        this.mapRenderer = null;
        this.locationTracker = null;
        this.filterManager = null;
        this.accessibilityManager = null;
        this.svgTileManager = null;
        this.featureRenderer = null;
        this.avatar = null;
        this.isTracking = false;
        this.isNavigating = false;
        this.hasInitialLocation = false;
        
        this.init().catch((e) => console.error('Map init failed:', e));

    }

    async init() {
        // Initialize map renderer
        const mapSvg = document.getElementById('map-svg');
        this.mapRenderer = new MapRenderer(mapSvg);

        // Check for position parameter in URL
        this.handleInitialPosition();

        // Initialize location tracker
        this.locationTracker = new LocationTracker();

        // Load the taxonomy — single source of truth for filters/classes.
        // Non-fatal: if it fails the map still loads, filters just stay inert.
        try {
            this.taxonomy = await TaxonomyClient.load('taxonomy.json');
        } catch (e) {
            console.error('Taxonomy load failed; filters disabled:', e);
            this.taxonomy = new TaxonomyClient({});
        }

        // Build the filter + rotor controls from the taxonomy (replaces the old hand-coded HTML)
        buildFilterUI(this.taxonomy, document.getElementById('filter-groups'), 'filter');
        buildFilterUI(this.taxonomy, document.getElementById('rotor-groups'), 'rotor');

        // Initialize filter and accessibility managers
        this.filterManager = new FilterManager(this.taxonomy);
        this.accessibilityManager = new AccessibilityManager(this.taxonomy);

        // After a filter change, refresh the rotor's tab order too.
        const originalUpdateVisibility = this.filterManager.updateVisibility.bind(this.filterManager);
        this.filterManager.updateVisibility = (id, enabled) => {
            originalUpdateVisibility(id, enabled);
            this.accessibilityManager.updateTabOrder();
        };
        
        // Initialize SVG tile manager and feature renderer
        this.svgTileManager = new SVGTileManager();
        this.featureRenderer = new FeatureRenderer(this.mapRenderer);
        
        // Initialize avatar
        this.avatar = new Avatar(this.mapRenderer);
        
        // Set up event listeners
        this.setupEventListeners();

        // Sticky name tooltip on focus/hover (reads each feature's aria-label).
        // Delegates on #map-svg, so it covers tiles loaded later too.
        setupTooltip();

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
            
            // Set initial avatar position at map center
            const center = this.mapRenderer.center;
            this.avatar.setPosition(center.lat, center.lng, false);
            
            // Load initial map tiles (clear any existing)
            this.loadMapTiles(true);
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
            
            // When tracking is disabled, revert avatar to center position
            const center = this.mapRenderer.center;
            this.avatar.setPosition(center.lat, center.lng, false);
        }
    }

    // Navigation is now handled by accordion, remove old toggle method


    handleLocationUpdate(position) {
        // Update location display
        const locationElement = document.getElementById('current-location');
        const accuracyElement = document.getElementById('location-accuracy');
        
        locationElement.textContent = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
        accuracyElement.textContent = `${Math.round(position.accuracy)}m`;
        
        // Update avatar with real location
        this.avatar.setPosition(position.lat, position.lng, true);
        
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
        // First try to get the current GPS position if tracking is active
        if (this.isTracking) {
            const position = this.locationTracker.getCurrentPosition();
            if (position) {
                this.mapRenderer.setCenter(position.lat, position.lng);
                this.announceStatus('Map centered on current location');
                return;
            }
        }
        
        // Otherwise, center on avatar's position (which should always exist)
        if (this.avatar && this.avatar.position) {
            this.mapRenderer.setCenter(this.avatar.position.lat, this.avatar.position.lng);
            this.announceStatus('Map centered on avatar location');
        } else {
            // This shouldn't happen, but just in case
            this.announceStatus('No location available');
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
    
    async loadMapTiles(clearExisting = false) {
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
            
            // Only clear old tiles if explicitly requested (e.g., on initial load)
            if (clearExisting) {
                this.clearMapTiles();
            }
            
            // Get currently loaded tile IDs
            const tilesGroup = document.querySelector('#map-tiles');
            const loadedTileIds = new Set();
            if (tilesGroup) {
                tilesGroup.querySelectorAll('[data-tile-id]').forEach(tile => {
                    loadedTileIds.add(tile.getAttribute('data-tile-id'));
                });
            }
            
            // Only render tiles that aren't already loaded
            const newTiles = tiles.filter(tile => !loadedTileIds.has(tile.id));
            
            if (newTiles.length > 0) {
                // Render only new tiles
                this.renderSVGTiles(newTiles);
                
                // Apply current filters to the newly loaded tiles
                this.applyFiltersToTiles();
                
                // Update accessibility for keyboard navigation
                if (this.accessibilityManager) {
                    this.accessibilityManager.updateTabOrder();
                }
            }
            
            // Clean up tiles that are far outside the current view
            this.cleanupDistantTiles();
            
            // Announce completion
            this.announceStatus(`Map loaded. ${tiles.length} tiles available.`);
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
            
            // Check if this tile already exists and remove it
            const existingTile = tilesGroup.querySelector(`[data-tile-id="${tile.id}"]`);
            if (existingTile) {
                existingTile.remove();
            }
            
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
    
    cleanupDistantTiles() {
        const bounds = this.getBoundsFromView();
        const tilesGroup = document.querySelector('#map-tiles');
        
        if (!tilesGroup) return;
        
        // Add a buffer to prevent removing tiles too aggressively
        const buffer = 0.02; // 2 extra tiles in each direction
        const expandedBounds = {
            north: bounds.north + buffer,
            south: bounds.south - buffer,
            east: bounds.east + buffer,
            west: bounds.west - buffer
        };
        
        // Remove tiles that are outside the expanded bounds
        tilesGroup.querySelectorAll('[data-tile-id]').forEach(tile => {
            const tileId = tile.getAttribute('data-tile-id');
            const [lat, lng] = tileId.split('_').map(parseFloat);
            
            // Check if tile is outside expanded bounds
            if (lat + 0.01 < expandedBounds.south || lat > expandedBounds.north ||
                lng + 0.01 < expandedBounds.west || lng > expandedBounds.east) {
                tile.remove();
            }
        });
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
            // Update avatar position
            if (this.avatar) {
                this.avatar.refresh();
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
            // Update avatar position
            if (this.avatar) {
                this.avatar.refresh();
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
        const bounds = this.getBoundsFromView();
        const tilesGroup = document.querySelector('#map-tiles');
        
        if (!tilesGroup || tilesGroup.children.length === 0) {
            return true; // No tiles loaded yet
        }
        
        // Get the bounds of currently loaded tiles
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        
        tilesGroup.querySelectorAll('[data-tile-id]').forEach(tile => {
            const tileId = tile.getAttribute('data-tile-id');
            const [lat, lng] = tileId.split('_').map(parseFloat);
            
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat + 0.01); // 0.01 degree per tile
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng + 0.01);
        });
        
        // Check if current view bounds extend beyond loaded tiles
        return bounds.north > maxLat || bounds.south < minLat ||
               bounds.east > maxLng || bounds.west < minLng;
    }
    
    applyFiltersToTiles() {
        // Re-apply every current filter to the (re)loaded tiles. FilterManager
        // now owns tile filtering (base hide/show, overlay highlight) via the
        // taxonomy; this just refreshes it after new tiles appear.
        if (this.filterManager) this.filterManager.applyInitialVisibility();
    }

    isFeatureInViewport(feature, containerRect) {
        const featureRect = feature.getBoundingClientRect();
        
        // Calculate the intersection rectangle
        const intersectionLeft = Math.max(featureRect.left, containerRect.left);
        const intersectionRight = Math.min(featureRect.right, containerRect.right);
        const intersectionTop = Math.max(featureRect.top, containerRect.top);
        const intersectionBottom = Math.min(featureRect.bottom, containerRect.bottom);
        
        // Check if there's an intersection
        if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) {
            return false;
        }
        
        // Calculate visible dimensions
        const visibleWidth = intersectionRight - intersectionLeft;
        const visibleHeight = intersectionBottom - intersectionTop;
        
        // WCAG 2.2 AAA requires minimum 44x44 CSS pixels for interactive targets
        // We'll require at least 44x44 pixels visible OR 50% of the feature visible
        // (for features smaller than 44x44)
        const minTargetSize = 44;
        
        // For small features, check if at least 50% is visible
        if (featureRect.width < minTargetSize || featureRect.height < minTargetSize) {
            const featureArea = featureRect.width * featureRect.height;
            const visibleArea = visibleWidth * visibleHeight;
            return visibleArea >= featureArea * 0.5;
        }
        
        // For larger features, ensure at least 44x44 pixels are visible
        return visibleWidth >= minTargetSize && visibleHeight >= minTargetSize;
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
    
    handleInitialPosition() {
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const pos = urlParams.get('pos');
        
        // Define preset positions
        const positions = {
            'toronto': { lat: 43.655, lng: -79.375, zoom: 17 },
            'vancouver': { lat: 49.195, lng: -123.18, zoom: 16 }, // YVR airport
            'yvr': { lat: 49.195, lng: -123.18, zoom: 16 }, // Alias for Vancouver
            'downtown-toronto': { lat: 43.651, lng: -79.382, zoom: 17 },
            'cn-tower': { lat: 43.6426, lng: -79.3871, zoom: 18 },
            'uoft': { lat: 43.6629, lng: -79.3957, zoom: 17 }, // University of Toronto
            'yorkdale': { lat: 43.7254, lng: -79.4521, zoom: 17 }, // Yorkdale Mall
            'pearson': { lat: 43.6777, lng: -79.6248, zoom: 16 } // Toronto Pearson Airport
        };
        
        // Check if position is specified and valid
        if (pos && positions[pos.toLowerCase()]) {
            const location = positions[pos.toLowerCase()];
            
            // Set the map center and zoom
            this.mapRenderer.center = { lat: location.lat, lng: location.lng };
            if (location.zoom) {
                this.mapRenderer.zoom = location.zoom;
            }
            
            console.log(`Starting at ${pos}: ${location.lat}, ${location.lng}`);
        } else if (pos) {
            // Try to parse as lat,lng coordinates
            const coords = pos.split(',');
            if (coords.length === 2) {
                const lat = parseFloat(coords[0]);
                const lng = parseFloat(coords[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    this.mapRenderer.center = { lat, lng };
                    console.log(`Starting at custom coordinates: ${lat}, ${lng}`);
                }
            } else {
                console.warn(`Unknown position: ${pos}`);
            }
        }
        
        // Also check for individual lat/lng/zoom parameters
        const lat = urlParams.get('lat');
        const lng = urlParams.get('lng');
        const zoom = urlParams.get('zoom');
        
        if (lat && lng) {
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);
            if (!isNaN(latNum) && !isNaN(lngNum)) {
                this.mapRenderer.center = { lat: latNum, lng: lngNum };
                console.log(`Starting at coordinates: ${latNum}, ${lngNum}`);
            }
        }
        
        if (zoom) {
            const zoomNum = parseInt(zoom);
            if (!isNaN(zoomNum) && zoomNum >= 10 && zoomNum <= 20) {
                this.mapRenderer.zoom = zoomNum;
            }
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mapApp = new MapApplication();
});