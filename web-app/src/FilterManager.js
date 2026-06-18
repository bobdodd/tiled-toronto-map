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
            // Mobility access
            'wheelchair-yes': false,
            'wheelchair-no': false,
            'wheelchair-limited': false,
            'ramps': false,
            'handrails': false,
            // Accessible transport
            'disabled-parking': false,
            'priority-disabled': false,
            'accessible-bus': false,
            'accessible-subway': false,
            'accessible-tram': false,
            'accessible-train': false,
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
            // Aeroway Features
            'runways': false,
            'taxiways': false,
            'airport-aprons': false,
            'airport-terminals': false,
            'airport-gates': false,
            'helipads': false,
            'hangars': false,
            'windsocks': false,
            // Terminal Building Features
            'terminal-buildings': false,
            'indoor-areas': false,
            'indoor-corridors': false,
            'indoor-rooms': false,
            'indoor-walls': false,
            // Gates & Boarding
            'jet-bridges': false,
            'gate-areas': false,
            'seating-areas': false,
            // Check-in & Security
            'check-in-counters': false,
            'baggage-drop': false,
            'security-checkpoints': false,
            'customs-areas': false,
            'immigration-control': false,
            'security-barriers': false,
            // Terminal Services
            'duty-free-shops': false,
            'airport-lounges': false,
            'baggage-claim': false,
            'lost-property': false,
            'terminal-information': false,
            // Terminal Amenities
            'terminal-restrooms': false,
            'family-restrooms': false,
            'shower-facilities': false,
            'nursing-rooms': false,
            'prayer-rooms': false,
            'smoking-areas': false,
            // Terminal Accessibility
            'wheelchair-rental': false,
            'terminal-elevators': false,
            'escalators': false,
            'moving-walkways': false,
            'tactile-paving-terminal': false,
            'animal-relief-areas': false,
            // Transportation Connections
            'taxi-stands': false,
            'car-rental': false,
            'airport-bus-terminals': false,
            'airport-train-stations': false,
            'parking-garages': false,
            'valet-parking': false,
            // Terminal Food & Beverage
            'terminal-restaurants': false,
            'fast-food-outlets': false,
            'coffee-shops': false,
            'airport-bars': false,
            'convenience-stores': false,
            'vending-machines': false,
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
        // Map feature types to CSS classes. Memoised on the instance so it also
        // serves as the single source of truth the rotor derives its keyboard
        // targets from (see AccessibilityManager.updateTabOrder) — adding a
        // category here makes it work for BOTH filtering and rotor navigation.
        this.classMap = this.classMap || {
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
            // Mobility access
            'wheelchair-yes': '.mobility-wheelchair_yes',
            'wheelchair-no': '.mobility-wheelchair_no',
            'wheelchair-limited': '.mobility-wheelchair_limited',
            'ramps': '.mobility-ramp, .mobility-wheelchair_ramp, .mobility-stroller_ramp, .mobility-bicycle_ramp',
            'handrails': '.mobility-handrail, .mobility-handrail_center, .mobility-handrail_left, .mobility-handrail_right',
            // Accessible transport
            'disabled-parking': '.transport-disabled_parking',
            'priority-disabled': '.transport-priority_access',
            'accessible-bus': '.transport-accessible_bus',
            'accessible-subway': '.transport-accessible_subway',
            'accessible-tram': '.transport-accessible_tram',
            'accessible-train': '.transport-accessible_train',
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
            // Aeroway Features
            'runways': '.aeroway-runway',
            'taxiways': '.aeroway-taxiway, .aeroway-taxilane',
            'airport-aprons': '.aeroway-apron',
            'airport-terminals': '.aeroway-terminal',
            'airport-gates': '.aeroway-gate',
            'helipads': '.aeroway-helipad, .aeroway-heliport',
            'hangars': '.aeroway-hangar',
            'windsocks': '.aeroway-windsock, .aeroway-navigationaid, .aeroway-holding_position, .aeroway-parking_position',
            // Terminal Building Features
            'terminal-buildings': '.building-terminal',
            'indoor-areas': '.indoor-area',
            'indoor-corridors': '.indoor-corridor',
            'indoor-rooms': '.indoor-room',
            'indoor-walls': '.indoor-wall',
            // Gates & Boarding
            'jet-bridges': '.aeroway-jet_bridge',
            'gate-areas': '.indoor-gate_area',
            'seating-areas': '.amenity-seating, .amenity-bench',
            // Check-in & Security
            'check-in-counters': '.amenity-check_in',
            'baggage-drop': '.amenity-baggage_drop',
            'security-checkpoints': '.amenity-security_check, .barrier-checkpoint',
            'customs-areas': '.amenity-customs',
            'immigration-control': '.amenity-immigration',
            'security-barriers': '.barrier-gate, .barrier-turnstile, .barrier-full-height_turnstile',
            // Terminal Services
            'duty-free-shops': '.shop-duty_free',
            'airport-lounges': '.amenity-lounge',
            'baggage-claim': '.amenity-baggage_claim',
            'lost-property': '.amenity-lost_property',
            'terminal-information': '.amenity-information',
            // Terminal Amenities
            'terminal-restrooms': '.amenity-toilets',
            'family-restrooms': '.amenity-toilets',
            'shower-facilities': '.amenity-shower',
            'nursing-rooms': '.amenity-nursing_room',
            'prayer-rooms': '.amenity-prayer_room',
            'smoking-areas': '.amenity-smoking_area',
            // Terminal Accessibility
            'wheelchair-rental': '.amenity-wheelchair_rental',
            'terminal-elevators': '.highway-elevator',
            'escalators': '.highway-escalator',
            'moving-walkways': '.conveying-moving_walkway',
            'tactile-paving-terminal': '.tactile-paving',
            'animal-relief-areas': '.amenity-animal_relief_area',
            // Transportation Connections
            'taxi-stands': '.amenity-taxi',
            'car-rental': '.amenity-car_rental',
            'airport-bus-terminals': '.amenity-bus_station',
            'airport-train-stations': '.railway-airport_station',
            'parking-garages': '.amenity-parking',
            'valet-parking': '.amenity-valet_parking',
            // Terminal Food & Beverage
            'terminal-restaurants': '.amenity-restaurant',
            'fast-food-outlets': '.amenity-fast_food',
            'coffee-shops': '.amenity-cafe',
            'airport-bars': '.amenity-bar',
            'convenience-stores': '.shop-convenience',
            'vending-machines': '.amenity-vending_machine',
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
        
        const selector = this.classMap[featureType];
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
            // Mobility access
            'wheelchair-yes': 'Wheelchair accessible locations',
            'wheelchair-no': 'Not wheelchair accessible locations',
            'wheelchair-limited': 'Limited wheelchair accessibility',
            'ramps': 'Ramps (all types)',
            'handrails': 'Handrails',
            // Accessible transport
            'disabled-parking': 'Disabled parking capacity',
            'priority-disabled': 'Priority disabled access',
            'accessible-bus': 'Wheelchair accessible buses',
            'accessible-subway': 'Wheelchair accessible subway',
            'accessible-tram': 'Wheelchair accessible trams',
            'accessible-train': 'Wheelchair accessible trains',
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
            // Aeroway Features
            'runways': 'Airport runways',
            'taxiways': 'Taxiways and taxilanes',
            'airport-aprons': 'Airport aprons',
            'airport-terminals': 'Airport terminals',
            'airport-gates': 'Airport gates',
            'helipads': 'Helipads and heliports',
            'hangars': 'Aircraft hangars',
            'windsocks': 'Navigation aids and markers',
            // Terminal Building Features
            'terminal-buildings': 'Terminal buildings',
            'indoor-areas': 'Indoor areas',
            'indoor-corridors': 'Indoor corridors',
            'indoor-rooms': 'Indoor rooms',
            'indoor-walls': 'Indoor walls',
            // Gates & Boarding
            'jet-bridges': 'Jet bridges',
            'gate-areas': 'Gate waiting areas',
            'seating-areas': 'Seating areas',
            // Check-in & Security
            'check-in-counters': 'Check-in counters',
            'baggage-drop': 'Baggage drop-off areas',
            'security-checkpoints': 'Security checkpoints',
            'customs-areas': 'Customs areas',
            'immigration-control': 'Immigration control',
            'security-barriers': 'Security barriers and gates',
            // Terminal Services
            'duty-free-shops': 'Duty-free shops',
            'airport-lounges': 'Airport lounges',
            'baggage-claim': 'Baggage claim areas',
            'lost-property': 'Lost and found',
            'terminal-information': 'Terminal information desks',
            // Terminal Amenities
            'terminal-restrooms': 'Terminal restrooms',
            'family-restrooms': 'Family restrooms',
            'shower-facilities': 'Shower facilities',
            'nursing-rooms': 'Nursing rooms',
            'prayer-rooms': 'Prayer rooms',
            'smoking-areas': 'Designated smoking areas',
            // Terminal Accessibility
            'wheelchair-rental': 'Wheelchair rental services',
            'terminal-elevators': 'Terminal elevators',
            'escalators': 'Escalators',
            'moving-walkways': 'Moving walkways',
            'tactile-paving-terminal': 'Tactile paving in terminals',
            'animal-relief-areas': 'Service animal relief areas',
            // Transportation Connections
            'taxi-stands': 'Taxi stands',
            'car-rental': 'Car rental counters',
            'airport-bus-terminals': 'Airport bus terminals',
            'airport-train-stations': 'Airport train stations',
            'parking-garages': 'Parking garages',
            'valet-parking': 'Valet parking services',
            // Terminal Food & Beverage
            'terminal-restaurants': 'Terminal restaurants',
            'fast-food-outlets': 'Fast food outlets',
            'coffee-shops': 'Coffee shops',
            'airport-bars': 'Airport bars and pubs',
            'convenience-stores': 'Convenience stores',
            'vending-machines': 'Vending machines',
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