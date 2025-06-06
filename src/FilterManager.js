export class FilterManager {
    constructor() {
        this.filters = {
            buildings: true,
            roads: true,
            transit: true,
            shops: true,
            schools: true,
            worship: true,
            parks: true,
            addresses: true,
            // Accessibility features
            'accessible-toilets': true,
            'accessible-parking': true,
            'drinking-water': true,
            'benches': true,
            'shelters': true,
            'crossings': true,
            'curb-cuts': true,
            'elevators': true,
            'steps': true,
            'tactile-paving': true,
            'audio-signals': true,
            'tactile-maps': true,
            'digital-clocks': true,
            'info-points': true,
            'emergency-phones': true,
            'defibrillators': true,
            'accessible-medical': true,
            'barriers': true
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Handle filter changes - now inside accordion
        Object.keys(this.filters).forEach(filterType => {
            const checkbox = document.getElementById(`filter-${filterType}`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.toggleFilter(filterType, e.target.checked);
                });
            }
        });
    }
    
    toggleFilter(featureType, enabled) {
        this.filters[featureType] = enabled;
        this.updateVisibility(featureType, enabled);
        this.announceFilterChange(featureType, enabled);
    }
    
    updateVisibility(featureType, visible) {
        // Map feature types to CSS classes
        const classMap = {
            buildings: '.building',
            roads: '.road, .road-casing',  // Include both road and casing
            transit: '.transit-stop',
            shops: '.shop',
            schools: '.school',
            worship: '.worship',
            parks: '.park',
            addresses: '.address',
            // Accessibility features
            'accessible-toilets': '.accessible-toilet',
            'accessible-parking': '.accessible-parking',
            'drinking-water': '.drinking-water',
            'benches': '.bench',
            'shelters': '.shelter',
            'crossings': '.crossing',
            'curb-cuts': '.curb-cut',
            'elevators': '.elevator',
            'steps': '.steps',
            'tactile-paving': '.tactile-paving',
            'audio-signals': '.audio-signal',
            'tactile-maps': '.tactile-map',
            'digital-clocks': '.digital-clock',
            'info-points': '.info-point',
            'emergency-phones': '.emergency-phone',
            'defibrillators': '.defibrillator',
            'accessible-medical': '.accessible-medical',
            'barriers': '.barrier'
        };
        
        const selector = classMap[featureType];
        if (!selector) return;
        
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.style.visibility = visible ? 'visible' : 'hidden';
        });
    }
    
    announceFilterChange(featureType, enabled) {
        const announcements = document.getElementById('map-announcements');
        const featureNames = {
            buildings: 'Buildings',
            roads: 'Roads',
            transit: 'Transit stops',
            shops: 'Shops',
            schools: 'Schools',
            worship: 'Places of worship',
            parks: 'Parks and recreation',
            addresses: 'Addresses',
            // Accessibility features
            'accessible-toilets': 'Accessible toilets',
            'accessible-parking': 'Accessible parking',
            'drinking-water': 'Drinking water',
            'benches': 'Benches and rest areas',
            'shelters': 'Shelters',
            'crossings': 'Pedestrian crossings',
            'curb-cuts': 'Curb cuts and ramps',
            'elevators': 'Elevators',
            'steps': 'Steps and handrails',
            'tactile-paving': 'Tactile paving',
            'audio-signals': 'Audio crossing signals',
            'tactile-maps': 'Tactile maps',
            'digital-clocks': 'Digital clocks',
            'info-points': 'Information points',
            'emergency-phones': 'Emergency phones',
            'defibrillators': 'Defibrillators',
            'accessible-medical': 'Accessible medical facilities',
            'barriers': 'Barriers and obstacles'
        };
        
        const featureName = featureNames[featureType] || featureType;
        const action = enabled ? 'added to' : 'removed from';
        announcements.textContent = `${featureName} ${action} map`;
    }
    
    getActiveFilters() {
        return Object.entries(this.filters)
            .filter(([_, enabled]) => enabled)
            .map(([type, _]) => type);
    }
}