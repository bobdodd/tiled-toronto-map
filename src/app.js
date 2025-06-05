import { MapRenderer } from './MapRenderer.js';
import { LocationTracker } from './LocationTracker.js';
import { FilterManager } from './FilterManager.js';
import { AccessibilityManager } from './AccessibilityManager.js';
import { OSMDataFetcher } from './OSMDataFetcher.js';
import { FeatureRenderer } from './FeatureRenderer.js';

class MapApplication {
    constructor() {
        this.mapRenderer = null;
        this.locationTracker = null;
        this.filterManager = null;
        this.accessibilityManager = null;
        this.osmDataFetcher = null;
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
        
        // Initialize data fetcher and feature renderer
        this.osmDataFetcher = new OSMDataFetcher();
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
            
            // Load initial map features
            this.loadMapFeatures();
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
    
    async loadMapFeatures() {
        try {
            // Get current map bounds
            const bounds = this.osmDataFetcher.getBoundsFromView(
                this.mapRenderer.center,
                this.mapRenderer.zoom,
                this.mapRenderer.viewBox.width,
                this.mapRenderer.viewBox.height
            );
            
            // Show loading indicator
            this.announceStatus('Loading map features...');
            
            // Fetch OSM data
            const features = await this.osmDataFetcher.fetchArea(bounds);
            
            // Render features
            this.featureRenderer.renderFeatures(features);
            
            // Hide OSM tiles now that we have vector features
            this.hideTiles();
            
            // Update accessibility
            this.accessibilityManager.updateTabOrder();
            
            // Apply current filters
            Object.keys(this.filterManager.filters).forEach(filterType => {
                this.filterManager.updateVisibility(filterType, this.filterManager.filters[filterType]);
            });
            
            // Announce completion
            const featureCount = Object.values(features).reduce((sum, arr) => sum + arr.length, 0);
            this.announceStatus(`Map features loaded. ${featureCount} features available.`);
        } catch (error) {
            console.error('Error loading map features:', error);
            this.announceStatus('Error loading map features. Please try again.');
        }
    }
    
    clearMapFeatures() {
        const featuresGroup = document.querySelector('#map-features');
        if (featuresGroup) {
            while (featuresGroup.firstChild) {
                featuresGroup.removeChild(featuresGroup.firstChild);
            }
        }
        // Show tiles again when features are cleared
        this.showTiles();
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
        
        // Create a debounced version of loadMapFeatures
        const debouncedLoad = () => {
            clearTimeout(loadTimeout);
            loadTimeout = setTimeout(() => {
                this.loadMapFeatures();
            }, 500); // Wait 500ms after movement stops
        };
        
        // Override MapRenderer methods to add feature loading
        const originalSetCenter = this.mapRenderer.setCenter.bind(this.mapRenderer);
        this.mapRenderer.setCenter = (lat, lng) => {
            // Clear features immediately
            this.clearMapFeatures();
            originalSetCenter(lat, lng);
            debouncedLoad();
        };
        
        const originalSetZoom = this.mapRenderer.setZoom.bind(this.mapRenderer);
        this.mapRenderer.setZoom = (zoom) => {
            // Clear features immediately
            this.clearMapFeatures();
            originalSetZoom(zoom);
            debouncedLoad();
        };
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mapApp = new MapApplication();
});