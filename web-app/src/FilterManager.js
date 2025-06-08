export class FilterManager {
    constructor() {
        this.filters = {
            buildings: true,
            roads: true,
            transit: true,
            shops: false,
            schools: false,
            worship: false,
            parks: true,
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
            'changing-tables': false,
            'automatic-doors': false,
            'wide-doors': false,
            'low-kerbs': false,
            'gentle-inclines': false,
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
            'currency-exchange': false,
            // Sustenance & Food
            'restaurants': false,
            'cafes': false,
            'fast-food': false,
            'bars': false,
            'pubs': false,
            'food-courts': false,
            // Accommodation & Tourism
            'hotels': false,
            'hostels': false,
            'guest-houses': false,
            'campsites': false,
            'attractions': false,
            'museums': false,
            'galleries': false,
            'viewpoints': false,
            'tourist-info': false,
            // Entertainment & Culture
            'cinemas': false,
            'theatres': false,
            'libraries': false,
            'community-centres': false,
            'arts-centres': false,
            'sports-centres': false,
            'swimming-pools': false,
            'golf-courses': false,
            'stadiums': false,
            // Emergency Services
            'police-stations': false,
            'fire-stations': false,
            'emergency-phones-civil': false,
            'emergency-defibrillators': false,
            // Historic Features
            'monuments': false,
            'memorials': false,
            'archaeological-sites': false,
            'castles': false,
            'ruins': false,
            // Man-made Structures
            'bridges': false,
            'tunnels': false,
            'towers': false,
            'masts': false,
            'piers': false,
            'breakwaters': false,
            // Barriers
            'fences': false,
            'walls': false,
            'hedges': false,
            'gates': false,
            'bollards': false,
            // Natural Features
            'water-bodies': true,
            'forests': false,
            'woods': false,
            'grasslands': false,
            'beaches': false,
            'cliffs': false,
            'peaks': false,
            'trees': false,
            // Waterways
            'rivers': false,
            'streams': false,
            'canals': false,
            'ditches': false,
            'coastlines': false
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
            'changing-tables': '.changing-table',
            'automatic-doors': '.automatic-door',
            'wide-doors': '.wide-door',
            'low-kerbs': '.low-kerb',
            'gentle-inclines': '.gentle-incline',
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
            'currency-exchange': '.currency-exchange',
            // Sustenance & Food
            'restaurants': '.restaurant',
            'cafes': '.cafe',
            'fast-food': '.fast-food',
            'bars': '.bar',
            'pubs': '.pub',
            'food-courts': '.food-court',
            // Accommodation & Tourism
            'hotels': '.hotel',
            'hostels': '.hostel',
            'guest-houses': '.guest-house',
            'campsites': '.campsite',
            'attractions': '.attraction',
            'museums': '.museum',
            'galleries': '.gallery',
            'viewpoints': '.viewpoint',
            'tourist-info': '.tourist-info',
            // Entertainment & Culture
            'cinemas': '.cinema',
            'theatres': '.theatre',
            'libraries': '.library',
            'community-centres': '.community-centre',
            'arts-centres': '.arts-centre',
            'sports-centres': '.sports-centre',
            'swimming-pools': '.swimming-pool',
            'golf-courses': '.golf-course',
            'stadiums': '.stadium',
            // Emergency Services
            'police-stations': '.police-station',
            'fire-stations': '.fire-station',
            'emergency-phones-civil': '.emergency-phone',
            'emergency-defibrillators': '.emergency-defibrillator',
            // Historic Features
            'monuments': '.monument',
            'memorials': '.memorial',
            'archaeological-sites': '.archaeological-site',
            'castles': '.castle',
            'ruins': '.ruins',
            // Man-made Structures
            'bridges': '.bridge',
            'tunnels': '.tunnel',
            'towers': '.tower',
            'masts': '.mast',
            'piers': '.pier',
            'breakwaters': '.breakwater',
            // Barriers
            'fences': '.fence',
            'walls': '.wall',
            'hedges': '.hedge',
            'gates': '.gate',
            'bollards': '.bollard',
            // Natural Features
            'water-bodies': '.water-body',
            'forests': '.forest',
            'woods': '.wood',
            'grasslands': '.grassland',
            'beaches': '.beach',
            'cliffs': '.cliff',
            'peaks': '.peak',
            'trees': '.tree',
            // Waterways
            'rivers': '.river',
            'streams': '.stream',
            'canals': '.canal',
            'ditches': '.ditch',
            'coastlines': '.coastline'
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
            'changing-tables': 'Changing tables',
            'automatic-doors': 'Automatic doors',
            'wide-doors': 'Wide doorways',
            'low-kerbs': 'Low kerbs',
            'gentle-inclines': 'Gentle inclines',
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
            'currency-exchange': 'Currency exchange',
            // Sustenance & Food
            'restaurants': 'Restaurants',
            'cafes': 'Cafes',
            'fast-food': 'Fast food',
            'bars': 'Bars',
            'pubs': 'Pubs',
            'food-courts': 'Food courts',
            // Accommodation & Tourism
            'hotels': 'Hotels',
            'hostels': 'Hostels',
            'guest-houses': 'Guest houses',
            'campsites': 'Campsites',
            'attractions': 'Tourist attractions',
            'museums': 'Museums',
            'galleries': 'Art galleries',
            'viewpoints': 'Scenic viewpoints',
            'tourist-info': 'Tourist information',
            // Entertainment & Culture
            'cinemas': 'Cinemas',
            'theatres': 'Theatres',
            'libraries': 'Libraries',
            'community-centres': 'Community centres',
            'arts-centres': 'Arts centres',
            'sports-centres': 'Sports centres',
            'swimming-pools': 'Swimming pools',
            'golf-courses': 'Golf courses',
            'stadiums': 'Stadiums',
            // Emergency Services
            'police-stations': 'Police stations',
            'fire-stations': 'Fire stations',
            'emergency-phones-civil': 'Emergency phones',
            'emergency-defibrillators': 'Emergency defibrillators',
            // Historic Features
            'monuments': 'Monuments',
            'memorials': 'Memorials',
            'archaeological-sites': 'Archaeological sites',
            'castles': 'Castles',
            'ruins': 'Historic ruins',
            // Man-made Structures
            'bridges': 'Bridges',
            'tunnels': 'Tunnels',
            'towers': 'Towers',
            'masts': 'Masts and antennas',
            'piers': 'Piers',
            'breakwaters': 'Breakwaters',
            // Barriers
            'fences': 'Fences',
            'walls': 'Walls',
            'hedges': 'Hedges',
            'gates': 'Gates',
            'bollards': 'Bollards',
            // Natural Features
            'water-bodies': 'Water bodies',
            'forests': 'Forests',
            'woods': 'Woods',
            'grasslands': 'Grasslands',
            'beaches': 'Beaches',
            'cliffs': 'Cliffs',
            'peaks': 'Mountain peaks',
            'trees': 'Trees',
            // Waterways
            'rivers': 'Rivers',
            'streams': 'Streams',
            'canals': 'Canals',
            'ditches': 'Ditches',
            'coastlines': 'Coastlines'
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