import { MapRenderer } from './MapRenderer.js';
import { LocationTracker } from './LocationTracker.js';

class MapApplication {
    constructor() {
        this.mapRenderer = null;
        this.locationTracker = null;
        this.isTracking = false;
        this.isNavigating = false;
        this.highContrast = false;
        
        this.init();
    }

    init() {
        // Initialize map renderer
        const mapSvg = document.getElementById('map-svg');
        this.mapRenderer = new MapRenderer(mapSvg);
        
        // Initialize location tracker
        this.locationTracker = new LocationTracker();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Set up keyboard navigation
        this.setupKeyboardNavigation();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.mapRenderer.handleResize();
        });
        
        // Initial render
        this.mapRenderer.render();
        
        // Check for debug mode in URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            document.getElementById('debug-panel').style.display = 'block';
        }
    }

    setupEventListeners() {
        // Map controls
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.mapRenderer.zoomIn();
        });
        
        document.getElementById('zoom-out').addEventListener('click', () => {
            this.mapRenderer.zoomOut();
        });
        
        document.getElementById('center-location').addEventListener('click', () => {
            this.centerOnCurrentLocation();
        });
        
        // Toggle buttons
        document.getElementById('toggle-tracking').addEventListener('click', (e) => {
            this.toggleLocationTracking(e.currentTarget);
        });
        
        document.getElementById('toggle-navigation').addEventListener('click', (e) => {
            this.toggleNavigation(e.currentTarget);
        });
        
        document.getElementById('toggle-contrast').addEventListener('click', (e) => {
            this.toggleHighContrast(e.currentTarget);
        });
        
        // Debug controls
        document.getElementById('set-location').addEventListener('click', () => {
            this.setMockLocation();
        });
        
        // Location tracker callbacks
        this.locationTracker.onUpdate((position) => {
            this.handleLocationUpdate(position);
        });
        
        this.locationTracker.onError((error) => {
            this.handleLocationError(error);
        });
    }

    setupKeyboardNavigation() {
        const mapContainer = document.getElementById('map-container');
        
        mapContainer.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 5 : 1;
            let handled = true;
            
            switch(e.key) {
                case 'ArrowUp':
                    this.panMap(0, -step);
                    break;
                case 'ArrowDown':
                    this.panMap(0, step);
                    break;
                case 'ArrowLeft':
                    this.panMap(-step, 0);
                    break;
                case 'ArrowRight':
                    this.panMap(step, 0);
                    break;
                case '+':
                case '=':
                    this.mapRenderer.zoomIn();
                    break;
                case '-':
                case '_':
                    this.mapRenderer.zoomOut();
                    break;
                case 'h':
                case 'H':
                    this.centerOnCurrentLocation();
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

    toggleNavigation(button) {
        this.isNavigating = !this.isNavigating;
        button.setAttribute('aria-pressed', this.isNavigating);
        
        const navPanel = document.getElementById('navigation-panel');
        navPanel.classList.toggle('active', this.isNavigating);
        
        if (this.isNavigating) {
            this.announceStatus('Navigation mode enabled');
            document.getElementById('destination-input').focus();
        } else {
            this.announceStatus('Navigation mode disabled');
        }
    }

    toggleHighContrast(button) {
        this.highContrast = !this.highContrast;
        button.setAttribute('aria-pressed', this.highContrast);
        
        document.body.classList.toggle('high-contrast', this.highContrast);
        this.announceStatus(this.highContrast ? 'High contrast mode enabled' : 'High contrast mode disabled');
    }

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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mapApp = new MapApplication();
});