export class LocationTracker {
    constructor() {
        this.watchId = null;
        this.currentPosition = null;
        this.isTracking = false;
        this.updateCallbacks = [];
        this.errorCallbacks = [];
        this.mockLocation = null;
        this.useMockLocation = false;
    }

    startTracking() {
        if (this.isTracking) return;
        
        if (!navigator.geolocation) {
            this.handleError({
                code: 0,
                message: 'Geolocation is not supported by your browser'
            });
            return;
        }

        this.isTracking = true;
        
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        if (this.useMockLocation && this.mockLocation) {
            // Use mock location for testing
            this.simulateMockLocation();
        } else {
            // Use real GPS
            this.watchId = navigator.geolocation.watchPosition(
                (position) => this.handlePosition(position),
                (error) => this.handleError(error),
                options
            );
        }
    }

    stopTracking() {
        if (!this.isTracking) return;
        
        this.isTracking = false;
        
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        
        if (this.mockIntervalId) {
            clearInterval(this.mockIntervalId);
            this.mockIntervalId = null;
        }
    }

    setMockLocation(lat, lng, accuracy = 10) {
        this.mockLocation = {
            coords: {
                latitude: lat,
                longitude: lng,
                accuracy: accuracy,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null
            },
            timestamp: Date.now()
        };
        
        if (this.useMockLocation && this.isTracking) {
            this.handlePosition(this.mockLocation);
        }
    }

    enableMockLocation(enable = true) {
        this.useMockLocation = enable;
        
        if (this.isTracking) {
            this.stopTracking();
            this.startTracking();
        }
    }

    simulateMockLocation() {
        // Immediately send the current mock location
        if (this.mockLocation) {
            this.handlePosition(this.mockLocation);
        }
        
        // Set up interval to simulate movement if needed
        this.mockIntervalId = setInterval(() => {
            if (this.mockLocation) {
                // Add small random movement to simulate GPS drift
                const drift = 0.00001;
                this.mockLocation.coords.latitude += (Math.random() - 0.5) * drift;
                this.mockLocation.coords.longitude += (Math.random() - 0.5) * drift;
                this.mockLocation.timestamp = Date.now();
                
                this.handlePosition(this.mockLocation);
            }
        }, 3000); // Update every 3 seconds
    }

    handlePosition(position) {
        this.currentPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp
        };

        // Location is announced by the visible #location-info panel (updated in
        // app.handleLocationUpdate, which is aria-live). No separate region here
        // — that produced a second, competing announcement of the same update.

        // Call all registered callbacks
        this.updateCallbacks.forEach(callback => {
            callback(this.currentPosition);
        });
    }

    handleError(error) {
        let message;
        
        switch(error.code) {
            case error.PERMISSION_DENIED:
                message = "Location permission denied. Please enable location services.";
                break;
            case error.POSITION_UNAVAILABLE:
                message = "Location information is unavailable.";
                break;
            case error.TIMEOUT:
                message = "The request to get location timed out.";
                break;
            default:
                message = error.message || "An unknown error occurred.";
                break;
        }
        
        console.error('Geolocation error:', message);
        
        this.errorCallbacks.forEach(callback => {
            callback({ code: error.code, message });
        });
    }

    onUpdate(callback) {
        this.updateCallbacks.push(callback);
    }

    onError(callback) {
        this.errorCallbacks.push(callback);
    }

    getCurrentPosition() {
        return this.currentPosition;
    }

    isLocationAvailable() {
        return !!navigator.geolocation;
    }

    // Utility method to calculate distance between two points
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;
        
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c; // Distance in meters
    }

    // Utility method to calculate bearing between two points
    calculateBearing(lat1, lng1, lat2, lng2) {
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;
        
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) -
                  Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        
        const θ = Math.atan2(y, x);
        
        return (θ * 180 / Math.PI + 360) % 360; // Bearing in degrees
    }
}