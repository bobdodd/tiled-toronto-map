import { MapRenderer } from './MapRenderer.js';
import { LocationTracker } from './LocationTracker.js';
import { FilterManager } from './FilterManager.js';
import { AccessibilityManager } from './AccessibilityManager.js';
import { SVGTileManager } from './SVGTileManager.js';
import { Avatar } from './Avatar.js';
import { TaxonomyClient } from './TaxonomyClient.js';
import { buildFilterUI } from './FilterUI.js';
import { setupTooltip } from './Tooltip.js';
import { SearchManager } from './SearchManager.js';

class MapApplication {
    constructor() {
        this.mapRenderer = null;
        this.locationTracker = null;
        this.filterManager = null;
        this.accessibilityManager = null;
        this.svgTileManager = null;
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
        // Tabindex bands keep header < map controls < map (positive throughout):
        // filter controls start at 101, rotor controls at 4002, map features at
        // 9000+ (assigned by the rotor in AccessibilityManager.updateTabOrder).
        buildFilterUI(this.taxonomy, document.getElementById('filter-groups'), 'filter', 101);
        buildFilterUI(this.taxonomy, document.getElementById('rotor-groups'), 'rotor', 4002);

        // Initialize filter and accessibility managers
        this.filterManager = new FilterManager(this.taxonomy);
        this.accessibilityManager = new AccessibilityManager(this.taxonomy);

        // After a filter change, refresh the rotor's tab order too.
        const originalUpdateVisibility = this.filterManager.updateVisibility.bind(this.filterManager);
        this.filterManager.updateVisibility = (id, enabled) => {
            originalUpdateVisibility(id, enabled);
            this.accessibilityManager.updateTabOrder();
        };
        
        // Initialize SVG tile manager
        this.svgTileManager = new SVGTileManager();

        // Initialize avatar
        this.avatar = new Avatar(this.mapRenderer);
        
        // Set up event listeners
        this.setupEventListeners();

        // Sticky name tooltip on focus/hover (reads each feature's aria-label).
        // Delegates on #map-svg, so it covers tiles loaded later too.
        setupTooltip();

        // Map search (places / POIs / addresses, with accessibility filters),
        // backed by the OpenSearch map-features index via a same-origin proxy.
        // Selecting a result recentres and moves focus onto the actual feature.
        this.searchManager = new SearchManager({
            getCenter: () => this.mapRenderer.center,
            onSelect: (result) => this.goToSearchResult(result),
            announce: (msg) => this.announceStatus(msg),
        });

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
            // Refresh which features can take focus — only those now on-screen.
            // Debounced because a pan/zoom fires viewBoxChanged rapidly; silent so
            // it doesn't spam the live region while panning.
            clearTimeout(this._tabOrderRefresh);
            this._tabOrderRefresh = setTimeout(() => {
                this.accessibilityManager.updateTabOrder();
            }, 150);
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

        // Skip links (first two tab stops)
        const skipCompass = document.getElementById('skip-to-compass');
        if (skipCompass) skipCompass.addEventListener('click', (e) => {
            e.preventDefault();
            const first = document.getElementById('nav-n'); // first compass control
            if (first) first.focus();
        });
        const skipMap = document.getElementById('skip-to-map');
        if (skipMap) skipMap.addEventListener('click', (e) => {
            e.preventDefault();
            this.focusFirstMapFeature();
        });
        
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

            // Panning is gated behind Ctrl/Cmd ON PURPOSE: bare arrow keys belong
            // to the screen reader (virtual cursor / reading), so we must never
            // hijack them. A bare arrow sets handled=false and falls through
            // untouched — no preventDefault — so the SR still receives it.
            const hasModifier = e.ctrlKey || e.metaKey;

            switch(e.key) {
                case 'ArrowUp':
                    if (hasModifier) this.panMap(0, -step);
                    else handled = false;
                    break;
                case 'ArrowDown':
                    if (hasModifier) this.panMap(0, step);
                    else handled = false;
                    break;
                case 'ArrowLeft':
                    if (hasModifier) this.panMap(-step, 0);
                    else handled = false;
                    break;
                case 'ArrowRight':
                    if (hasModifier) this.panMap(step, 0);
                    else handled = false;
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

    // "Skip to map" target. The rotor assigns a positive tabindex ONLY to
    // features that are both in a selected category AND currently in the
    // viewport, so `#map-tiles [tabindex]` is exactly the set you can see and
    // operate — the same set you'd tab into from the header. Jump to the first
    // of those (lowest tabindex). If nothing is navigable yet (no rotor
    // category chosen), place focus in the map document itself and say how to
    // make features keyboard-navigable.
    focusFirstMapFeature() {
        const focusables = Array.from(document.querySelectorAll('#map-tiles [tabindex]'))
            .map((el) => ({ el, ti: parseInt(el.getAttribute('tabindex'), 10) }))
            .filter((x) => x.ti > 0)
            .sort((a, b) => a.ti - b.ti);
        if (focusables.length) {
            focusables[0].el.focus();
            return;
        }
        const svg = document.getElementById('map-svg');
        if (svg) {
            svg.setAttribute('tabindex', '-1');
            svg.focus({ preventScroll: true });
        }
        this.announceStatus('Map. Choose a category in the Rotor to navigate features by keyboard.');
    }

    // Search result chosen → recentre on it and move keyboard/screen-reader
    // focus onto the actual feature in the tile, so the sticky tooltip and focus
    // outline behave exactly as for ordinary keyboard navigation. Features carry
    // role="img" + aria-label from the generator, so focusing one announces its
    // name. Addresses with no drawn feature simply recentre.
    async goToSearchResult(result) {
        if (!result || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return;

        // Pull in to a readable street-level zoom if we're currently zoomed out.
        if (this.mapRenderer.zoom < 18) this.mapRenderer.setZoom(18);
        this.mapRenderer.setCenter(result.lat, result.lng);
        this.announceStatus(`Showing ${result.display}`);

        const el = await this.waitForFeature(String(result.id), 3000);
        if (el) {
            this.focusFeatureElement(el);
        }
        // else: the point is recentred but has no labelled feature to focus
        // (e.g. a bare address node). The recentre is the result.
    }

    // Resolve the tile feature element for an OSM id, waiting for its tile to
    // render if needed (setCenter triggers an async tile load). Returns null if
    // it never appears within the timeout.
    waitForFeature(osmId, timeoutMs) {
        const escId = (window.CSS && CSS.escape) ? CSS.escape(osmId) : osmId.replace(/"/g, '\\"');
        const selector = `#map-tiles [data-osm-id="${escId}"]`;
        const pick = () => this.bestFeatureMatch(document.querySelectorAll(selector));

        return new Promise((resolve) => {
            const existing = pick();
            if (existing) { resolve(existing); return; }

            const tiles = document.getElementById('map-tiles');
            if (!tiles) { resolve(null); return; }

            const observer = new MutationObserver(() => {
                const found = pick();
                if (found) { observer.disconnect(); clearTimeout(timer); resolve(found); }
            });
            observer.observe(tiles, { childList: true, subtree: true });

            const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
        });
    }

    // A feature clipped across tiles can appear in several loaded tiles. Prefer
    // an instance currently within the viewport so focus lands on something the
    // user can see.
    bestFeatureMatch(nodeList) {
        const nodes = Array.from(nodeList);
        if (nodes.length === 0) return null;
        const vp = this.mapRenderer.svg.getBoundingClientRect();
        const onScreen = nodes.find((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 &&
                   r.right > vp.left && r.left < vp.right &&
                   r.bottom > vp.top && r.top < vp.bottom;
        });
        return onScreen || nodes[0];
    }

    // Move focus onto a feature element. It gets a positive tabindex in a
    // dedicated "search target" band (above the compass, below the map-feature
    // band) so its place in the Tab circuit is well-defined; any previous search
    // target is cleared first. Focusing fires the map's focusin handler, which
    // draws the outline, and the sticky tooltip, which reads the aria-label.
    focusFeatureElement(el) {
        document.querySelectorAll('#map-tiles [data-search-focus]').forEach((prev) => {
            prev.removeAttribute('tabindex');
            prev.removeAttribute('data-search-focus');
        });
        el.setAttribute('tabindex', '8500');
        el.setAttribute('data-search-focus', '');
        el.focus({ preventScroll: true });
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
        // ONE polite region for all transient status — pan/zoom, search, tracking,
        // tile-load, the skip-link hint. (Location DATA has its own region: the
        // visible #location-info panel.) Clear-then-set so an identical
        // consecutive message still re-announces and writers don't clobber each
        // other mid-phrase. Polite, not assertive: status should never interrupt
        // the screen reader mid-sentence.
        const region = document.getElementById('map-announcements');
        if (!region) return;
        region.textContent = '';
        region.textContent = message;
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
        // Load generation: if a newer load starts while this one awaits (fast
        // panning), the stale one bows out instead of rendering/announcing.
        const gen = (this._loadGen = (this._loadGen || 0) + 1);
        try {
            // Get current map bounds
            const bounds = this.getBoundsFromView();

            // If the zoom has crossed an LOD band boundary, the old band's tiles
            // (same ids, different content) must be cleared and replaced.
            const band = this.svgTileManager.bandForZoom(this.mapRenderer.zoom);
            if (band !== this._loadedBand) {
                clearExisting = true;
                this._loadedBand = band;
            }

            // Show loading indicator
            this.announceStatus('Loading map tiles...');

            // Load SVG tiles for the area (band chosen from the zoom)
            const { tiles, stats } = await this.svgTileManager.loadTilesForArea(bounds, this.mapRenderer.zoom);

            if (gen !== this._loadGen) return; // superseded by a newer load

            if (!tiles || tiles.length === 0) {
                this.announceStatus(stats && stats.failed > 0
                    ? `Map data could not be loaded — ${stats.failed} tile${stats.failed === 1 ? '' : 's'} failed.`
                    : 'No map data available for this area');
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

            // Honest completion — report failures rather than counting survivors.
            this.announceStatus(stats && stats.failed > 0
                ? `Map loaded — ${stats.loaded} tile${stats.loaded === 1 ? '' : 's'}, ${stats.failed} failed to load.`
                : `Map loaded. ${stats ? stats.loaded : tiles.length} tile${(stats ? stats.loaded : tiles.length) === 1 ? '' : 's'}.`);
        } catch (error) {
            if (gen === this._loadGen) {
                this.announceStatus('Error loading map. Please try again.');
            }
        }
    }

    getBoundsFromView() {
        const center = this.mapRenderer.center;
        const zoom = this.mapRenderer.zoom;
        const width = this.mapRenderer.viewBox.width;
        const height = this.mapRenderer.viewBox.height;
        
        // The viewBox lives in project() space, whose scale is FIXED at 1000px per
        // 0.01° regardless of zoom — the viewBox itself already encodes the zoom
        // (it grows as you zoom out). So this conversion must use that same fixed
        // scale, NOT a zoom-dependent one; otherwise the tiles we load stop lining
        // up with where project() actually draws them (the off-zoom breakage).
        const degreesPerTile = 0.01;
        const pixelsPerDegree = 1000 / degreesPerTile; // 100000 — must match MapRenderer.project()

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

            const existingTile = tilesGroup.querySelector(`[data-tile-id="${tile.id}"]`);
            if (existingTile) existingTile.remove();

            try {
                const svgDoc = new DOMParser().parseFromString(tile.content, 'image/svg+xml');
                const svgElement = svgDoc.documentElement;

                const tileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                tileGroup.setAttribute('class', 'tile');
                tileGroup.setAttribute('data-tile-id', tile.id);
                // North-up: anchor each tile by its NORTH edge (south edge + one
                // tile); the generator flips Y internally. ViewBox handles zoom.
                const pos = this.latLngToPixel(tile.lat + 0.01, tile.lng);
                tileGroup.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

                // Hot path: MOVE the parsed nodes straight in (adoptNode, not a
                // deep importNode clone) in a single insert. The generator now
                // emits tile-unique clip ids + correct classes, so none of the old
                // per-feature fixups (id rename, clip relink, class-/tabindex
                // patches) are needed — this runs for every tile on every pan/zoom.
                const frag = document.createDocumentFragment();
                while (svgElement.firstChild) {
                    frag.appendChild(document.adoptNode(svgElement.firstChild));
                }
                tileGroup.appendChild(frag);

                tilesGroup.appendChild(tileGroup);
            } catch (error) {
                console.error(`Failed to render tile ${tile.id}:`, error);
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
                // Keep the renderer's VIEWPORT (container pixel size) current — it
                // can change on resize — then DERIVE the viewBox from the current
                // zoom. The viewBox is zoom-scaled (viewport / 2^(zoom-18)); the old
                // code wrote the raw container size straight into viewBox.width/
                // height, which is only correct at zoom 18. At any other zoom it
                // snapped the viewBox back to zoom-18 scale ~300ms after a pan — a
                // phantom zoom-in (this.zoom stayed put, but the view jumped a
                // level). Recompute around the existing centre so the view holds.
                const r = this.mapRenderer;
                const rect = r.svg.parentElement.getBoundingClientRect();
                r.viewport.width = rect.width;
                r.viewport.height = rect.height;
                const cx = r.viewBox.x + r.viewBox.width / 2;
                const cy = r.viewBox.y + r.viewBox.height / 2;
                const scale = Math.pow(2, r.zoom - 18);
                r.viewBox.width = rect.width / scale;
                r.viewBox.height = rect.height / scale;
                r.viewBox.x = cx - r.viewBox.width / 2;
                r.viewBox.y = cy - r.viewBox.height / 2;
                r.updateViewBox();

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
            // The viewBox alone handles zoom WITHIN a band; only when the zoom
            // crosses an LOD band boundary do we load the new band's tiles
            // (loadMapTiles detects the change and clears the old band first).
            if (this.svgTileManager.bandForZoom(newZoom) !== this._loadedBand) {
                this.loadMapTiles();
            }
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