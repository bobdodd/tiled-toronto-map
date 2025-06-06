export class FilterManager {
    constructor() {
        this.filters = {
            buildings: true,
            roads: true,
            transit: false,
            shops: false,
            schools: false,
            worship: false,
            parks: false,
            addresses: false,
            // Healthcare features
            hospitals: false,
            clinics: false,
            doctors: false,
            dentists: false,
            pharmacies: false,
            veterinary: false,
            // Accessibility features
            'accessible-toilets': false,
            'accessible-parking': false,
            'drinking-water': false,
            'benches': false,
            'shelters': false,
            'crossings': false,
            'curb-cuts': false,
            'elevators': false,
            'steps': false,
            'tactile-paving': false,
            'audio-signals': false,
            'tactile-maps': false,
            'digital-clocks': false,
            'info-points': false,
            'emergency-phones': false,
            'defibrillators': false,
            'accessible-medical': false,
            'barriers': false,
            // Transportation Infrastructure
            'railways': false,
            'airports': false,
            'enhanced-highways': false,
            'transit-platforms': false,
            // Financial Services
            'banks': false,
            'atms': false,
            'post-offices': false,
            'currency-exchange': false
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
    
    applyInitialVisibility() {
        // Apply initial filter states to hide features that should be hidden by default
        Object.entries(this.filters).forEach(([filterType, enabled]) => {
            if (!enabled) {
                this.updateVisibility(filterType, false);
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
            // Healthcare features
            hospitals: '.hospital',
            clinics: '.clinic',
            doctors: '.doctor',
            dentists: '.dentist',
            pharmacies: '.pharmacy',
            veterinary: '.veterinary',
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
            'barriers': '.barrier',
            // Transportation Infrastructure
            'railways': '.railway',
            'airports': '.airport-way, .airport-terminal, .airport-point',
            'enhanced-highways': '.highway-casing, .highway-surface',
            'transit-platforms': '.transit-platform',
            // Financial Services
            'banks': '.bank',
            'atms': '.atm',
            'post-offices': '.post-office',
            'currency-exchange': '.currency-exchange'
        };
        
        const selector = classMap[featureType];
        if (!selector) return;
        
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.style.display = visible ? 'block' : 'none';
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
            // Healthcare features
            hospitals: 'Hospitals',
            clinics: 'Clinics',
            doctors: 'Doctors',
            dentists: 'Dentists',
            pharmacies: 'Pharmacies',
            veterinary: 'Veterinary clinics',
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
            'barriers': 'Barriers and obstacles',
            // Transportation Infrastructure
            'railways': 'Railway systems',
            'airports': 'Airport facilities', 
            'enhanced-highways': 'Major highways',
            'transit-platforms': 'Transit platforms',
            // Financial Services
            'banks': 'Banks',
            'atms': 'ATMs',
            'post-offices': 'Post offices',
            'currency-exchange': 'Currency exchange'
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