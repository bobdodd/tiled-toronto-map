export class FeatureRenderer {
    constructor(mapRenderer) {
        this.mapRenderer = mapRenderer;
        this.SVG_NS = 'http://www.w3.org/2000/svg';
    }
    
    renderFeatures(features) {
        const featuresGroup = document.querySelector('#map-features');
        if (!featuresGroup) return;
        
        // Save focus outline if it exists
        const focusOutline = document.querySelector('#focus-outline');
        
        // Clear existing features
        while (featuresGroup.firstChild) {
            featuresGroup.removeChild(featuresGroup.firstChild);
        }
        
        // Create groups for each feature type
        const groups = {
            buildings: this.createGroup('buildings-group', 'Buildings'),
            roads: this.createGroup('roads-group', 'Roads'),
            transitStops: this.createGroup('transit-group', 'Transit stops'),
            shops: this.createGroup('shops-group', 'Shops'),
            schools: this.createGroup('schools-group', 'Schools'),
            worship: this.createGroup('worship-group', 'Places of worship'),
            parks: this.createGroup('parks-group', 'Parks and recreation'),
            addresses: this.createGroup('addresses-group', 'Addresses'),
            // Healthcare features
            hospitals: this.createGroup('hospitals-group', 'Hospitals'),
            clinics: this.createGroup('clinics-group', 'Clinics'),
            doctors: this.createGroup('doctors-group', 'Doctors'),
            dentists: this.createGroup('dentists-group', 'Dentists'),
            pharmacies: this.createGroup('pharmacies-group', 'Pharmacies'),
            veterinary: this.createGroup('veterinary-group', 'Veterinary'),
            // Accessibility features
            accessibleToilets: this.createGroup('accessible-toilets-group', 'Accessible toilets'),
            accessibleParking: this.createGroup('accessible-parking-group', 'Accessible parking'),
            drinkingWater: this.createGroup('drinking-water-group', 'Drinking water'),
            benches: this.createGroup('benches-group', 'Benches'),
            shelters: this.createGroup('shelters-group', 'Shelters'),
            crossings: this.createGroup('crossings-group', 'Pedestrian crossings'),
            curbCuts: this.createGroup('curb-cuts-group', 'Curb cuts'),
            elevators: this.createGroup('elevators-group', 'Elevators'),
            steps: this.createGroup('steps-group', 'Steps'),
            tactilePaving: this.createGroup('tactile-paving-group', 'Tactile paving'),
            audioSignals: this.createGroup('audio-signals-group', 'Audio signals'),
            tactileMaps: this.createGroup('tactile-maps-group', 'Tactile maps'),
            digitalClocks: this.createGroup('digital-clocks-group', 'Digital clocks'),
            infoPoints: this.createGroup('info-points-group', 'Information points'),
            emergencyPhones: this.createGroup('emergency-phones-group', 'Emergency phones'),
            defibrillators: this.createGroup('defibrillators-group', 'Defibrillators'),
            accessibleMedical: this.createGroup('accessible-medical-group', 'Accessible medical'),
            barriers: this.createGroup('barriers-group', 'Barriers'),
            // Transportation Infrastructure
            railways: this.createGroup('railways-group', 'Railway systems'),
            airports: this.createGroup('airports-group', 'Airport facilities'),
            enhancedHighways: this.createGroup('enhanced-highways-group', 'Major highways'),
            transitPlatforms: this.createGroup('transit-platforms-group', 'Transit platforms'),
            // Financial Services
            banks: this.createGroup('banks-group', 'Banks'),
            atms: this.createGroup('atms-group', 'ATMs'),
            postOffices: this.createGroup('post-offices-group', 'Post offices'),
            currencyExchange: this.createGroup('currency-exchange-group', 'Currency exchange'),
            // Sustenance & Food
            restaurants: this.createGroup('restaurants-group', 'Restaurants'),
            cafes: this.createGroup('cafes-group', 'Cafes'),
            fastFood: this.createGroup('fast-food-group', 'Fast food'),
            bars: this.createGroup('bars-group', 'Bars'),
            pubs: this.createGroup('pubs-group', 'Pubs'),
            foodCourts: this.createGroup('food-courts-group', 'Food courts'),
            // Accommodation & Tourism
            hotels: this.createGroup('hotels-group', 'Hotels'),
            hostels: this.createGroup('hostels-group', 'Hostels'),
            guestHouses: this.createGroup('guest-houses-group', 'Guest houses'),
            campsites: this.createGroup('campsites-group', 'Campsites'),
            attractions: this.createGroup('attractions-group', 'Tourist attractions'),
            museums: this.createGroup('museums-group', 'Museums'),
            galleries: this.createGroup('galleries-group', 'Art galleries'),
            viewpoints: this.createGroup('viewpoints-group', 'Scenic viewpoints'),
            touristInfo: this.createGroup('tourist-info-group', 'Tourist information')
        };
        
        // Add groups to features container
        Object.values(groups).forEach(group => featuresGroup.appendChild(group));
        
        // Render each feature type
        this.renderBuildings(features.buildings, groups.buildings);
        this.renderRoads(features.roads, groups.roads);
        this.renderTransitStops(features.transitStops, groups.transitStops);
        this.renderParks(features.parks, groups.parks);
        this.renderShops(features.shops, groups.shops);
        this.renderSchools(features.schools, groups.schools);
        this.renderWorship(features.worship, groups.worship);
        this.renderAddresses(features.addresses, groups.addresses);
        
        // Render healthcare features
        this.renderHospitals(features.hospitals, groups.hospitals);
        this.renderClinics(features.clinics, groups.clinics);
        this.renderDoctors(features.doctors, groups.doctors);
        this.renderDentists(features.dentists, groups.dentists);
        this.renderPharmacies(features.pharmacies, groups.pharmacies);
        this.renderVeterinary(features.veterinary, groups.veterinary);
        
        // Render accessibility features
        this.renderAccessibleToilets(features.accessibleToilets, groups.accessibleToilets);
        this.renderAccessibleParking(features.accessibleParking, groups.accessibleParking);
        this.renderDrinkingWater(features.drinkingWater, groups.drinkingWater);
        this.renderBenches(features.benches, groups.benches);
        this.renderShelters(features.shelters, groups.shelters);
        this.renderCrossings(features.crossings, groups.crossings);
        this.renderCurbCuts(features.curbCuts, groups.curbCuts);
        this.renderElevators(features.elevators, groups.elevators);
        this.renderSteps(features.steps, groups.steps);
        this.renderTactilePaving(features.tactilePaving, groups.tactilePaving);
        this.renderAudioSignals(features.audioSignals, groups.audioSignals);
        this.renderTactileMaps(features.tactileMaps, groups.tactileMaps);
        this.renderDigitalClocks(features.digitalClocks, groups.digitalClocks);
        this.renderInfoPoints(features.infoPoints, groups.infoPoints);
        this.renderEmergencyPhones(features.emergencyPhones, groups.emergencyPhones);
        this.renderDefibrillators(features.defibrillators, groups.defibrillators);
        this.renderAccessibleMedical(features.accessibleMedical, groups.accessibleMedical);
        this.renderBarriers(features.barriers, groups.barriers);
        
        // Render transportation infrastructure
        this.renderRailways(features.railways, groups.railways);
        this.renderAirports(features.airports, groups.airports);
        this.renderEnhancedHighways(features.enhancedHighways, groups.enhancedHighways);
        this.renderTransitPlatforms(features.transitPlatforms, groups.transitPlatforms);
        
        // Render financial services
        this.renderBanks(features.banks, groups.banks);
        this.renderAtms(features.atms, groups.atms);
        this.renderPostOffices(features.postOffices, groups.postOffices);
        this.renderCurrencyExchange(features.currencyExchange, groups.currencyExchange);
        
        // Render sustenance & food
        this.renderRestaurants(features.restaurants, groups.restaurants);
        this.renderCafes(features.cafes, groups.cafes);
        this.renderFastFood(features.fastFood, groups.fastFood);
        this.renderBars(features.bars, groups.bars);
        this.renderPubs(features.pubs, groups.pubs);
        this.renderFoodCourts(features.foodCourts, groups.foodCourts);
        
        // Render accommodation & tourism
        this.renderHotels(features.hotels, groups.hotels);
        this.renderHostels(features.hostels, groups.hostels);
        this.renderGuestHouses(features.guestHouses, groups.guestHouses);
        this.renderCampsites(features.campsites, groups.campsites);
        this.renderAttractions(features.attractions, groups.attractions);
        this.renderMuseums(features.museums, groups.museums);
        this.renderGalleries(features.galleries, groups.galleries);
        this.renderViewpoints(features.viewpoints, groups.viewpoints);
        this.renderTouristInfo(features.touristInfo, groups.touristInfo);
        
        // Re-add focus outline if it existed
        if (focusOutline) {
            featuresGroup.appendChild(focusOutline);
        }
    }
    
    createGroup(id, label) {
        const group = document.createElementNS(this.SVG_NS, 'g');
        group.setAttribute('id', id);
        group.setAttribute('aria-label', label);
        return group;
    }
    
    renderBuildings(buildings, group) {
        buildings.forEach((feature, index) => {
            // Create individual group for each building
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'building-feature');
            const label = this.generateBuildingLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const polygon = this.createPolygon(feature, 'building');
            polygon.setAttribute('fill', '#e0e0e0');
            polygon.setAttribute('stroke', '#999');
            polygon.setAttribute('stroke-width', '1');
            featureGroup.appendChild(polygon);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderRoads(roads, group) {
        // Sort roads by type so major roads render first (underneath)
        const sortedRoads = [...roads].sort((a, b) => {
            const order = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway'];
            const aIndex = order.indexOf(a.properties.highway) || 999;
            const bIndex = order.indexOf(b.properties.highway) || 999;
            return aIndex - bIndex;
        });
        
        sortedRoads.forEach((feature, index) => {
            // Create individual group for each road
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'road-feature');
            const label = this.generateRoadLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const roadType = feature.properties.highway;
            
            // Draw road casing (darker outline) first
            const casing = this.createPolyline(feature, 'road-casing');
            casing.setAttribute('fill', 'none');
            casing.setAttribute('stroke', this.getRoadCasingColor(roadType));
            casing.setAttribute('stroke-width', this.getRoadCasingWidth(roadType));
            casing.setAttribute('stroke-linecap', 'round');
            casing.setAttribute('stroke-linejoin', 'round');
            casing.setAttribute('aria-hidden', 'true');
            featureGroup.appendChild(casing);
            
            // Draw road surface
            const road = this.createPolyline(feature, 'road');
            road.setAttribute('fill', 'none');
            road.setAttribute('stroke', this.getRoadColor(roadType));
            road.setAttribute('stroke-width', this.getRoadWidth(roadType));
            road.setAttribute('stroke-linecap', 'round');
            road.setAttribute('stroke-linejoin', 'round');
            featureGroup.appendChild(road);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderTransitStops(stops, group) {
        stops.forEach((feature, index) => {
            // Create individual group for each transit stop
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'transit-feature');
            const label = this.generateTransitLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'transit-stop');
            circle.setAttribute('fill', '#ff9800');
            circle.setAttribute('fill-opacity', '0.7');
            circle.setAttribute('stroke', '#ff6600');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '5');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderShops(shops, group) {
        shops.forEach((feature, index) => {
            // Create individual group for each shop
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'shop-feature');
            const label = this.generateShopLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'shop');
                circle.setAttribute('fill', 'none');
                circle.setAttribute('stroke', '#e91e63');
                circle.setAttribute('stroke-width', '3');
                circle.setAttribute('r', '6');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'shop');
                polygon.setAttribute('fill', '#fce4ec');
                polygon.setAttribute('stroke', '#e91e63');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderSchools(schools, group) {
        schools.forEach((feature, index) => {
            // Create individual group for each school
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'school-feature');
            const label = this.generateSchoolLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'school');
                circle.setAttribute('fill', '#3f51b5');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'school');
                polygon.setAttribute('fill', '#e8eaf6');
                polygon.setAttribute('stroke', '#3f51b5');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderWorship(places, group) {
        places.forEach((feature, index) => {
            // Create individual group for each place of worship
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'worship-feature');
            const label = this.generateWorshipLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'worship');
                circle.setAttribute('fill', '#9c27b0');
                circle.setAttribute('r', '7');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'worship');
                polygon.setAttribute('fill', '#f3e5f5');
                polygon.setAttribute('stroke', '#9c27b0');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderParks(parks, group) {
        parks.forEach((feature, index) => {
            // Create individual group for each park
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'park-feature');
            const label = this.generateParkLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const polygon = this.createPolygon(feature, 'park');
            polygon.setAttribute('fill', '#c8e6c9');
            polygon.setAttribute('stroke', '#4caf50');
            polygon.setAttribute('stroke-width', '1');
            featureGroup.appendChild(polygon);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderAddresses(addresses, group) {
        addresses.forEach((feature, index) => {
            // Create individual group for each address
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'address-feature');
            const label = this.generateAddressLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'address');
            circle.setAttribute('fill', '#2196f3');
            circle.setAttribute('r', '4');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    createPolygon(feature, className) {
        const polygon = document.createElementNS(this.SVG_NS, 'polygon');
        const points = this.coordinatesToPoints(feature.geometry.coordinates[0]);
        polygon.setAttribute('points', points);
        polygon.setAttribute('class', className);
        return polygon;
    }
    
    createPolyline(feature, className) {
        const polyline = document.createElementNS(this.SVG_NS, 'polyline');
        const points = this.coordinatesToPoints(feature.geometry.coordinates);
        polyline.setAttribute('points', points);
        polyline.setAttribute('class', className);
        return polyline;
    }
    
    createCircle(feature, className) {
        const circle = document.createElementNS(this.SVG_NS, 'circle');
        const pos = this.mapRenderer.project(
            feature.geometry.coordinates[1],
            feature.geometry.coordinates[0]
        );
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('class', className);
        return circle;
    }
    
    createRect(feature, className, width, height) {
        const rect = document.createElementNS(this.SVG_NS, 'rect');
        const pos = this.mapRenderer.project(
            feature.geometry.coordinates[1],
            feature.geometry.coordinates[0]
        );
        rect.setAttribute('x', pos.x - width/2);
        rect.setAttribute('y', pos.y - height/2);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('class', className);
        return rect;
    }
    
    coordinatesToPoints(coordinates) {
        return coordinates.map(coord => {
            const pos = this.mapRenderer.project(coord[1], coord[0]);
            return `${pos.x},${pos.y}`;
        }).join(' ');
    }
    
    // Label generation methods
    generateBuildingLabel(props) {
        let label = '';
        
        if (props.building === 'yes') {
            label = 'Building';
        } else if (props.building) {
            label = `${props.building} building`;
        }
        
        if (props.name) {
            label = props.name + (label ? ', ' + label : '');
        }
        
        if (props['building:levels']) {
            label += `, ${props['building:levels']} floors`;
        }
        
        if (props['addr:street']) {
            label += `, ${props['addr:street']}`;
            if (props['addr:housenumber']) {
                label += ` ${props['addr:housenumber']}`;
            }
        }
        
        return label || 'Building';
    }
    
    generateRoadLabel(props) {
        let label = props.name || '';
        
        const roadTypes = {
            primary: 'Primary road',
            secondary: 'Secondary road',
            tertiary: 'Tertiary road',
            residential: 'Residential street',
            service: 'Service road',
            footway: 'Footpath',
            pedestrian: 'Pedestrian street'
        };
        
        const type = roadTypes[props.highway] || 'Road';
        label = label ? `${label}, ${type}` : type;
        
        if (props.lanes) {
            label += `, ${props.lanes} lanes`;
        }
        
        if (props.maxspeed) {
            label += `, speed limit ${props.maxspeed}`;
        }
        
        return label;
    }
    
    generateTransitLabel(props) {
        let label = '';
        
        if (props.railway === 'station') {
            label = 'Train station';
        } else if (props.railway === 'tram_stop') {
            label = 'Tram stop';
        } else if (props.railway === 'subway_entrance') {
            label = 'Subway entrance';
        } else if (props.highway === 'bus_stop') {
            label = 'Bus stop';
        }
        
        if (props.name) {
            label += `: ${props.name}`;
        }
        
        if (props.shelter === 'yes') {
            label += ', has shelter';
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        if (props.route_ref) {
            label += `, routes: ${props.route_ref}`;
        }
        
        return label || 'Transit stop';
    }
    
    generateShopLabel(props) {
        let label = props.name || '';
        
        if (props.shop && props.shop !== 'yes') {
            const shopType = props.shop.replace(/_/g, ' ');
            label = label ? `${label}, ${shopType}` : shopType;
        } else {
            label = label || 'Shop';
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        return label;
    }
    
    generateSchoolLabel(props) {
        let label = props.name || 'School';
        
        if (props['school:type']) {
            label += `, ${props['school:type']}`;
        }
        
        if (props.operator) {
            label += `, operated by ${props.operator}`;
        }
        
        return label;
    }
    
    generateWorshipLabel(props) {
        let label = props.name || 'Place of worship';
        
        if (props.religion) {
            label += `, ${props.religion}`;
        }
        
        if (props.denomination) {
            label += ` (${props.denomination})`;
        }
        
        return label;
    }
    
    generateParkLabel(props) {
        let label = props.name || '';
        
        const types = {
            park: 'Park',
            playground: 'Playground',
            garden: 'Garden',
            sports_centre: 'Sports center',
            pitch: 'Sports pitch'
        };
        
        const type = types[props.leisure] || 'Recreation area';
        label = label ? `${label}, ${type}` : type;
        
        if (props.sport) {
            label += ` for ${props.sport}`;
        }
        
        return label;
    }
    
    generateAddressLabel(props) {
        let label = '';
        
        if (props['addr:housenumber']) {
            label = props['addr:housenumber'];
        }
        
        if (props['addr:street']) {
            label += ` ${props['addr:street']}`;
        }
        
        if (props['addr:city']) {
            label += `, ${props['addr:city']}`;
        }
        
        return label || 'Address';
    }
    
    getRoadWidth(roadType) {
        const widths = {
            motorway: '6',
            trunk: '5',
            primary: '4.5',
            secondary: '4',
            tertiary: '3.5',
            residential: '3',
            service: '2',
            footway: '1.5',
            pedestrian: '2.5',
            unclassified: '3'
        };
        
        return widths[roadType] || '2.5';
    }
    
    getRoadColor(roadType) {
        const colors = {
            motorway: '#e990a0',
            trunk: '#fbb29a',
            primary: '#fcd6a4',
            secondary: '#f7fabf',
            tertiary: '#ffffff',
            residential: '#ffffff',
            service: '#ffffff',
            footway: '#fafaf5',
            pedestrian: '#ededed',
            unclassified: '#ffffff'
        };
        
        return colors[roadType] || '#ffffff';
    }
    
    getRoadCasingColor(roadType) {
        const colors = {
            motorway: '#dc2a67',
            trunk: '#e06d5f',
            primary: '#e5a864',
            secondary: '#d4c26a',
            tertiary: '#c6c6c6',
            residential: '#c6c6c6',
            service: '#c6c6c6',
            footway: '#c5c5c5',
            pedestrian: '#c5c5c5',
            unclassified: '#c6c6c6'
        };
        
        return colors[roadType] || '#c6c6c6';
    }
    
    getRoadCasingWidth(roadType) {
        // Casing is slightly wider than the road
        const baseWidth = parseFloat(this.getRoadWidth(roadType));
        return (baseWidth + 1.5).toString();
    }
    
    // Accessibility feature rendering methods
    renderAccessibleToilets(toilets, group) {
        toilets.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'accessible-toilet-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Accessible toilet');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'accessible-toilet');
            circle.setAttribute('fill', '#4a90e2');
            circle.setAttribute('stroke', '#2c5aa0');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '6');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderAccessibleParking(parking, group) {
        parking.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'accessible-parking-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Accessible parking');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'accessible-parking');
                circle.setAttribute('fill', '#5cb85c');
                circle.setAttribute('stroke', '#449d44');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'accessible-parking');
                polygon.setAttribute('fill', '#d4edda');
                polygon.setAttribute('stroke', '#5cb85c');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderDrinkingWater(water, group) {
        water.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'drinking-water-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Drinking water');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'drinking-water');
            circle.setAttribute('fill', '#17a2b8');
            circle.setAttribute('stroke', '#138496');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '5');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderBenches(benches, group) {
        benches.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'bench-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Bench');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'bench');
            circle.setAttribute('fill', '#f8f9fa');
            circle.setAttribute('stroke', '#6c757d');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '4');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderShelters(shelters, group) {
        shelters.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'shelter-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Shelter');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'shelter');
                circle.setAttribute('fill', '#ffc107');
                circle.setAttribute('stroke', '#e0a800');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '6');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'shelter');
                polygon.setAttribute('fill', '#fff3cd');
                polygon.setAttribute('stroke', '#ffc107');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCrossings(crossings, group) {
        crossings.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'crossing-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Pedestrian crossing');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'crossing');
            circle.setAttribute('fill', '#fd7e14');
            circle.setAttribute('stroke', '#dc6402');
            circle.setAttribute('stroke-width', '3');
            circle.setAttribute('r', '7');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCurbCuts(curbCuts, group) {
        curbCuts.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'curb-cut-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Curb cut');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'curb-cut');
            circle.setAttribute('fill', '#20c997');
            circle.setAttribute('stroke', '#17a085');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '4');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderElevators(elevators, group) {
        elevators.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'elevator-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Elevator');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'elevator');
            circle.setAttribute('fill', '#6f42c1');
            circle.setAttribute('stroke', '#59359a');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '8');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderSteps(steps, group) {
        steps.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'steps-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Steps');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'steps');
                circle.setAttribute('fill', '#dc3545');
                circle.setAttribute('stroke', '#c82333');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '5');
                featureGroup.appendChild(circle);
            } else {
                const line = this.createPolyline(feature, 'steps');
                line.setAttribute('stroke', '#dc3545');
                line.setAttribute('stroke-width', '4');
                line.setAttribute('stroke-linecap', 'round');
                featureGroup.appendChild(line);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderTactilePaving(tactile, group) {
        tactile.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'tactile-paving-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Tactile paving');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'tactile-paving');
                circle.setAttribute('fill', '#e83e8c');
                circle.setAttribute('stroke', '#d91a72');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '4');
                featureGroup.appendChild(circle);
            } else {
                const line = this.createPolyline(feature, 'tactile-paving');
                line.setAttribute('stroke', '#e83e8c');
                line.setAttribute('stroke-width', '3');
                line.setAttribute('stroke-linecap', 'round');
                featureGroup.appendChild(line);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderAudioSignals(signals, group) {
        signals.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'audio-signal-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Audio crossing signal');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'audio-signal');
            circle.setAttribute('fill', '#fd7e14');
            circle.setAttribute('stroke', '#dc6402');
            circle.setAttribute('stroke-width', '3');
            circle.setAttribute('r', '6');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderTactileMaps(maps, group) {
        maps.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'tactile-map-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Tactile map');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'tactile-map');
            circle.setAttribute('fill', '#6610f2');
            circle.setAttribute('stroke', '#520dc2');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '6');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderDigitalClocks(clocks, group) {
        clocks.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'digital-clock-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Digital clock');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'digital-clock');
            circle.setAttribute('fill', '#343a40');
            circle.setAttribute('stroke', '#1d2124');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '5');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderInfoPoints(points, group) {
        points.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'info-point-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Information point');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'info-point');
            circle.setAttribute('fill', '#007bff');
            circle.setAttribute('stroke', '#0056b3');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '6');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderEmergencyPhones(phones, group) {
        phones.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'emergency-phone-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Emergency phone');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'emergency-phone');
            circle.setAttribute('fill', '#dc3545');
            circle.setAttribute('stroke', '#c82333');
            circle.setAttribute('stroke-width', '3');
            circle.setAttribute('r', '7');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderDefibrillators(defib, group) {
        defib.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'defibrillator-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Defibrillator');
            featureGroup.setAttribute('aria-label', label);
            
            const circle = this.createCircle(feature, 'defibrillator');
            circle.setAttribute('fill', '#e74c3c');
            circle.setAttribute('stroke', '#c0392b');
            circle.setAttribute('stroke-width', '3');
            circle.setAttribute('r', '8');
            featureGroup.appendChild(circle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderAccessibleMedical(medical, group) {
        medical.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'accessible-medical-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Accessible medical facility');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'accessible-medical');
                circle.setAttribute('fill', '#28a745');
                circle.setAttribute('stroke', '#1e7e34');
                circle.setAttribute('stroke-width', '3');
                circle.setAttribute('r', '9');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'accessible-medical');
                polygon.setAttribute('fill', '#d1ecf1');
                polygon.setAttribute('stroke', '#28a745');
                polygon.setAttribute('stroke-width', '3');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderBarriers(barriers, group) {
        barriers.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'barrier-feature');
            const label = this.generateAccessibilityLabel(feature.properties, 'Barrier');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'barrier');
                circle.setAttribute('fill', '#6c757d');
                circle.setAttribute('stroke', '#495057');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '4');
                featureGroup.appendChild(circle);
            } else {
                const line = this.createPolyline(feature, 'barrier');
                line.setAttribute('stroke', '#6c757d');
                line.setAttribute('stroke-width', '3');
                line.setAttribute('stroke-linecap', 'round');
                featureGroup.appendChild(line);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    generateAccessibilityLabel(props, baseType) {
        let label = props.name || baseType;
        
        // Add accessibility information
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        } else if (props.wheelchair === 'no') {
            label += ', not wheelchair accessible';
        } else if (props.wheelchair === 'limited') {
            label += ', limited wheelchair access';
        }
        
        if (props.tactile_paving === 'yes') {
            label += ', has tactile paving';
        }
        
        if (props.handrail === 'yes') {
            label += ', has handrail';
        }
        
        if (props.barrier) {
            label += `, ${props.barrier} barrier`;
        }
        
        if (props['traffic_signals:sound'] === 'yes') {
            label += ', has audio signals';
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        return label;
    }
    
    // Healthcare feature rendering methods
    renderHospitals(hospitals, group) {
        hospitals.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'hospital-feature');
            const label = this.generateHealthcareLabel(feature.properties, 'Hospital');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'hospital');
                circle.setAttribute('fill', '#dc3545');
                circle.setAttribute('stroke', '#c82333');
                circle.setAttribute('stroke-width', '3');
                circle.setAttribute('r', '10');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'hospital');
                polygon.setAttribute('fill', '#f8d7da');
                polygon.setAttribute('stroke', '#dc3545');
                polygon.setAttribute('stroke-width', '3');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderClinics(clinics, group) {
        clinics.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'clinic-feature');
            const label = this.generateHealthcareLabel(feature.properties, 'Clinic');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'clinic');
                circle.setAttribute('fill', '#007bff');
                circle.setAttribute('stroke', '#0056b3');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'clinic');
                polygon.setAttribute('fill', '#d1ecf1');
                polygon.setAttribute('stroke', '#007bff');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderDoctors(doctors, group) {
        doctors.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'doctor-feature');
            const label = this.generateHealthcareLabel(feature.properties, 'Doctor');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'doctor');
                circle.setAttribute('fill', '#28a745');
                circle.setAttribute('stroke', '#1e7e34');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '7');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'doctor');
                polygon.setAttribute('fill', '#d4edda');
                polygon.setAttribute('stroke', '#28a745');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderDentists(dentists, group) {
        dentists.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'dentist-feature');
            const label = this.generateHealthcareLabel(feature.properties, 'Dentist');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'dentist');
                circle.setAttribute('fill', '#17a2b8');
                circle.setAttribute('stroke', '#138496');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '7');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'dentist');
                polygon.setAttribute('fill', '#d1ecf1');
                polygon.setAttribute('stroke', '#17a2b8');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderPharmacies(pharmacies, group) {
        pharmacies.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'pharmacy-feature');
            const label = this.generateHealthcareLabel(feature.properties, 'Pharmacy');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'pharmacy');
                circle.setAttribute('fill', '#20c997');
                circle.setAttribute('stroke', '#17a085');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'pharmacy');
                polygon.setAttribute('fill', '#d1f2eb');
                polygon.setAttribute('stroke', '#20c997');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderVeterinary(veterinary, group) {
        veterinary.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'veterinary-feature');
            const label = this.generateHealthcareLabel(feature.properties, 'Veterinary');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'veterinary');
                circle.setAttribute('fill', '#fd7e14');
                circle.setAttribute('stroke', '#dc6402');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '7');
                featureGroup.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'veterinary');
                polygon.setAttribute('fill', '#ffeaa7');
                polygon.setAttribute('stroke', '#fd7e14');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    generateHealthcareLabel(props, baseType) {
        let label = props.name || baseType;
        
        if (props.operator) {
            label += `, operated by ${props.operator}`;
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        } else if (props.wheelchair === 'no') {
            label += ', not wheelchair accessible';
        } else if (props.wheelchair === 'limited') {
            label += ', limited wheelchair access';
        }
        
        if (props.phone) {
            label += `, phone: ${props.phone}`;
        }
        
        if (props.website) {
            label += ', has website';
        }
        
        if (props.emergency === 'yes') {
            label += ', emergency services available';
        }
        
        return label;
    }
    
    // Transportation Infrastructure rendering methods
    renderRailways(railways, group) {
        railways.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'railway-feature');
            const label = this.generateRailwayLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const line = this.createPolyline(feature, 'railway');
            const railwayType = feature.properties.railway;
            
            // Style based on railway type
            switch (railwayType) {
                case 'rail':
                    line.setAttribute('stroke', '#8b4513');
                    line.setAttribute('stroke-width', '3');
                    break;
                case 'subway':
                    line.setAttribute('stroke', '#ff6600');
                    line.setAttribute('stroke-width', '2');
                    break;
                case 'tram':
                    line.setAttribute('stroke', '#00bcd4');
                    line.setAttribute('stroke-width', '2');
                    break;
                case 'light_rail':
                    line.setAttribute('stroke', '#4caf50');
                    line.setAttribute('stroke-width', '2');
                    break;
                case 'monorail':
                    line.setAttribute('stroke', '#9c27b0');
                    line.setAttribute('stroke-width', '2');
                    break;
                default:
                    line.setAttribute('stroke', '#666');
                    line.setAttribute('stroke-width', '2');
            }
            
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke-dasharray', '5,5');
            featureGroup.appendChild(line);
            group.appendChild(featureGroup);
        });
    }
    
    renderAirports(airports, group) {
        airports.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'airport-feature');
            const label = this.generateAirportLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const aerowayType = feature.properties.aeroway;
            
            if (feature.geometry.type === 'LineString') {
                const line = this.createPolyline(feature, 'airport-way');
                line.setAttribute('fill', 'none');
                
                switch (aerowayType) {
                    case 'runway':
                        line.setAttribute('stroke', '#666');
                        line.setAttribute('stroke-width', '8');
                        break;
                    case 'taxiway':
                        line.setAttribute('stroke', '#999');
                        line.setAttribute('stroke-width', '4');
                        break;
                }
                featureGroup.appendChild(line);
            } else if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'airport-terminal');
                polygon.setAttribute('fill', '#e3f2fd');
                polygon.setAttribute('stroke', '#1976d2');
                polygon.setAttribute('stroke-width', '2');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'airport-point');
                circle.setAttribute('fill', '#1976d2');
                circle.setAttribute('stroke', '#0d47a1');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderEnhancedHighways(highways, group) {
        highways.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'enhanced-highway-feature');
            const label = this.generateEnhancedHighwayLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            const highwayType = feature.properties.highway;
            
            // Enhanced styling for major highways
            const casing = this.createPolyline(feature, 'highway-casing');
            const surface = this.createPolyline(feature, 'highway-surface');
            
            casing.setAttribute('fill', 'none');
            surface.setAttribute('fill', 'none');
            
            switch (highwayType) {
                case 'motorway':
                    casing.setAttribute('stroke', '#8b0000');
                    casing.setAttribute('stroke-width', '12');
                    surface.setAttribute('stroke', '#ff4444');
                    surface.setAttribute('stroke-width', '8');
                    break;
                case 'trunk':
                    casing.setAttribute('stroke', '#b8860b');
                    casing.setAttribute('stroke-width', '10');
                    surface.setAttribute('stroke', '#ffd700');
                    surface.setAttribute('stroke-width', '6');
                    break;
                case 'motorway_link':
                    casing.setAttribute('stroke', '#8b0000');
                    casing.setAttribute('stroke-width', '8');
                    surface.setAttribute('stroke', '#ff4444');
                    surface.setAttribute('stroke-width', '4');
                    break;
                case 'trunk_link':
                    casing.setAttribute('stroke', '#b8860b');
                    casing.setAttribute('stroke-width', '6');
                    surface.setAttribute('stroke', '#ffd700');
                    surface.setAttribute('stroke-width', '3');
                    break;
            }
            
            featureGroup.appendChild(casing);
            featureGroup.appendChild(surface);
            group.appendChild(featureGroup);
        });
    }
    
    renderTransitPlatforms(platforms, group) {
        platforms.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'transit-platform-feature');
            const label = this.generateTransitPlatformLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'transit-platform');
                polygon.setAttribute('fill', '#fff3e0');
                polygon.setAttribute('stroke', '#f57c00');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'LineString') {
                const line = this.createPolyline(feature, 'transit-platform');
                line.setAttribute('stroke', '#f57c00');
                line.setAttribute('stroke-width', '6');
                line.setAttribute('fill', 'none');
                featureGroup.appendChild(line);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'transit-platform', 12, 12);
                rect.setAttribute('fill', '#fff3e0');
                rect.setAttribute('stroke', '#f57c00');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    // Label generation methods for transportation infrastructure
    generateRailwayLabel(props) {
        let label = '';
        const railwayType = props.railway;
        
        switch (railwayType) {
            case 'rail':
                label = 'Railway track';
                break;
            case 'subway':
                label = 'Subway line';
                break;
            case 'tram':
                label = 'Tram line';
                break;
            case 'light_rail':
                label = 'Light rail';
                break;
            case 'monorail':
                label = 'Monorail';
                break;
            default:
                label = 'Railway';
        }
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.operator) {
            label += ` operated by ${props.operator}`;
        }
        
        return label;
    }
    
    generateAirportLabel(props) {
        let label = '';
        const aerowayType = props.aeroway;
        
        switch (aerowayType) {
            case 'runway':
                label = 'Airport runway';
                break;
            case 'taxiway':
                label = 'Airport taxiway';
                break;
            case 'terminal':
                label = 'Airport terminal';
                break;
            default:
                label = 'Airport facility';
        }
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.ref) {
            label += ` ${props.ref}`;
        }
        
        return label;
    }
    
    generateEnhancedHighwayLabel(props) {
        let label = '';
        const highwayType = props.highway;
        
        switch (highwayType) {
            case 'motorway':
                label = 'Motorway';
                break;
            case 'trunk':
                label = 'Trunk road';
                break;
            case 'motorway_link':
                label = 'Motorway link';
                break;
            case 'trunk_link':
                label = 'Trunk road link';
                break;
            default:
                label = 'Major highway';
        }
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.ref) {
            label += ` (${props.ref})`;
        }
        
        return label;
    }
    
    generateTransitPlatformLabel(props) {
        let label = 'Transit platform';
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.public_transport === 'platform') {
            label = 'Public transport platform';
        } else if (props.railway === 'platform') {
            label = 'Railway platform';
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        return label;
    }
    
    // Financial Services rendering methods
    renderBanks(banks, group) {
        banks.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'bank-feature');
            const label = this.generateBankLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'bank');
                polygon.setAttribute('fill', '#e8f5e8');
                polygon.setAttribute('stroke', '#2e7d32');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'bank', 14, 14);
                rect.setAttribute('fill', '#2e7d32');
                rect.setAttribute('stroke', '#1b5e20');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderAtms(atms, group) {
        atms.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'atm-feature');
            const label = this.generateAtmLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            // ATMs are always points - render as distinctive diamond shape
            const diamond = this.createDiamond(feature, 'atm', 8);
            diamond.setAttribute('fill', '#4caf50');
            diamond.setAttribute('stroke', '#2e7d32');
            diamond.setAttribute('stroke-width', '2');
            featureGroup.appendChild(diamond);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderPostOffices(postOffices, group) {
        postOffices.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'post-office-feature');
            const label = this.generatePostOfficeLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'post-office');
                polygon.setAttribute('fill', '#fff3e0');
                polygon.setAttribute('stroke', '#e65100');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'post-office');
                circle.setAttribute('fill', '#e65100');
                circle.setAttribute('stroke', '#bf360c');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCurrencyExchange(exchanges, group) {
        exchanges.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'currency-exchange-feature');
            const label = this.generateCurrencyExchangeLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'currency-exchange');
                polygon.setAttribute('fill', '#f3e5f5');
                polygon.setAttribute('stroke', '#7b1fa2');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const triangle = this.createTriangle(feature, 'currency-exchange', 10);
                triangle.setAttribute('fill', '#7b1fa2');
                triangle.setAttribute('stroke', '#4a148c');
                triangle.setAttribute('stroke-width', '2');
                featureGroup.appendChild(triangle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    // Helper method to create diamond shape for ATMs
    createDiamond(feature, className, size) {
        const coords = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
        const diamond = document.createElementNS(this.SVG_NS, 'polygon');
        diamond.setAttribute('class', className);
        
        // Create diamond points (rotated square)
        const points = [
            [coords.x, coords.y - size],     // top
            [coords.x + size, coords.y],     // right
            [coords.x, coords.y + size],     // bottom
            [coords.x - size, coords.y]      // left
        ].map(point => point.join(',')).join(' ');
        
        diamond.setAttribute('points', points);
        return diamond;
    }
    
    // Helper method to create triangle shape for currency exchange
    createTriangle(feature, className, size) {
        const coords = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
        const triangle = document.createElementNS(this.SVG_NS, 'polygon');
        triangle.setAttribute('class', className);
        
        // Create triangle points (pointing up)
        const points = [
            [coords.x, coords.y - size],              // top
            [coords.x - size * 0.866, coords.y + size * 0.5],  // bottom left
            [coords.x + size * 0.866, coords.y + size * 0.5]   // bottom right
        ].map(point => point.join(',')).join(' ');
        
        triangle.setAttribute('points', points);
        return triangle;
    }
    
    // Label generation methods for financial services
    generateBankLabel(props) {
        let label = 'Bank';
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.operator) {
            label += ` (${props.operator})`;
        }
        
        if (props.atm === 'yes') {
            label += ', has ATM';
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        return label;
    }
    
    generateAtmLabel(props) {
        let label = 'ATM';
        
        if (props.operator) {
            label += ` (${props.operator})`;
        }
        
        if (props.network) {
            label += `, network: ${props.network}`;
        }
        
        if (props.cash_in === 'yes') {
            label += ', cash deposits available';
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        if (props['24/7'] === 'yes' || props.opening_hours === '24/7') {
            label += ', 24/7 access';
        }
        
        return label;
    }
    
    generatePostOfficeLabel(props) {
        let label = 'Post office';
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.operator) {
            label += ` (${props.operator})`;
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        return label;
    }
    
    generateCurrencyExchangeLabel(props) {
        let label = 'Currency exchange';
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.operator) {
            label += ` (${props.operator})`;
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        return label;
    }
    
    // Sustenance & Food rendering methods
    renderRestaurants(restaurants, group) {
        restaurants.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'restaurant-feature');
            const label = this.generateSustenanceLabel(feature.properties, 'Restaurant');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'restaurant');
                polygon.setAttribute('fill', '#ffebee');
                polygon.setAttribute('stroke', '#d32f2f');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'restaurant');
                circle.setAttribute('fill', '#d32f2f');
                circle.setAttribute('stroke', '#b71c1c');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCafes(cafes, group) {
        cafes.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'cafe-feature');
            const label = this.generateSustenanceLabel(feature.properties, 'Cafe');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'cafe');
                polygon.setAttribute('fill', '#f3e5f5');
                polygon.setAttribute('stroke', '#7b1fa2');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'cafe');
                circle.setAttribute('fill', '#7b1fa2');
                circle.setAttribute('stroke', '#4a148c');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '7');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderFastFood(fastFood, group) {
        fastFood.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'fast-food-feature');
            const label = this.generateSustenanceLabel(feature.properties, 'Fast food');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'fast-food');
                polygon.setAttribute('fill', '#fff3e0');
                polygon.setAttribute('stroke', '#f57c00');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'fast-food', 10, 10);
                rect.setAttribute('fill', '#f57c00');
                rect.setAttribute('stroke', '#e65100');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderBars(bars, group) {
        bars.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'bar-feature');
            const label = this.generateSustenanceLabel(feature.properties, 'Bar');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'bar');
                polygon.setAttribute('fill', '#e8eaf6');
                polygon.setAttribute('stroke', '#3f51b5');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const triangle = this.createTriangle(feature, 'bar', 8);
                triangle.setAttribute('fill', '#3f51b5');
                triangle.setAttribute('stroke', '#1a237e');
                triangle.setAttribute('stroke-width', '2');
                featureGroup.appendChild(triangle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderPubs(pubs, group) {
        pubs.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'pub-feature');
            const label = this.generateSustenanceLabel(feature.properties, 'Pub');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'pub');
                polygon.setAttribute('fill', '#e0f2f1');
                polygon.setAttribute('stroke', '#00695c');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const diamond = this.createDiamond(feature, 'pub', 8);
                diamond.setAttribute('fill', '#00695c');
                diamond.setAttribute('stroke', '#004d40');
                diamond.setAttribute('stroke-width', '2');
                featureGroup.appendChild(diamond);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderFoodCourts(foodCourts, group) {
        foodCourts.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'food-court-feature');
            const label = this.generateSustenanceLabel(feature.properties, 'Food court');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'food-court');
                polygon.setAttribute('fill', '#fcf4ff');
                polygon.setAttribute('stroke', '#6a1b9a');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'food-court', 12, 12);
                rect.setAttribute('fill', '#6a1b9a');
                rect.setAttribute('stroke', '#4a148c');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    // Label generation method for sustenance features
    generateSustenanceLabel(props, baseType) {
        let label = baseType;
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.cuisine) {
            label += `, ${props.cuisine} cuisine`;
        }
        
        if (props.operator || props.brand) {
            label += ` (${props.operator || props.brand})`;
        }
        
        if (props.diet_vegan === 'yes') {
            label += ', vegan options';
        } else if (props.diet_vegetarian === 'yes') {
            label += ', vegetarian options';
        }
        
        if (props.takeaway === 'yes') {
            label += ', takeaway available';
        }
        
        if (props.delivery === 'yes') {
            label += ', delivery available';
        }
        
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        if (props.outdoor_seating === 'yes') {
            label += ', outdoor seating';
        }
        
        if (props.wifi === 'yes') {
            label += ', WiFi available';
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        return label;
    }
    
    // Accommodation & Tourism rendering methods
    renderHotels(hotels, group) {
        hotels.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'hotel-feature');
            const label = this.generateTourismLabel(feature.properties, 'Hotel');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'hotel');
                polygon.setAttribute('fill', '#e1f5fe');
                polygon.setAttribute('stroke', '#0277bd');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'hotel', 12, 12);
                rect.setAttribute('fill', '#0277bd');
                rect.setAttribute('stroke', '#01579b');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderHostels(hostels, group) {
        hostels.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'hostel-feature');
            const label = this.generateTourismLabel(feature.properties, 'Hostel');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'hostel');
                polygon.setAttribute('fill', '#f3e5f5');
                polygon.setAttribute('stroke', '#7b1fa2');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'hostel');
                circle.setAttribute('fill', '#7b1fa2');
                circle.setAttribute('stroke', '#4a148c');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderGuestHouses(guestHouses, group) {
        guestHouses.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'guest-house-feature');
            const label = this.generateTourismLabel(feature.properties, 'Guest house');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'guest-house');
                polygon.setAttribute('fill', '#fff3e0');
                polygon.setAttribute('stroke', '#ff8f00');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const triangle = this.createTriangle(feature, 'guest-house', 8);
                triangle.setAttribute('fill', '#ff8f00');
                triangle.setAttribute('stroke', '#e65100');
                triangle.setAttribute('stroke-width', '2');
                featureGroup.appendChild(triangle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCampsites(campsites, group) {
        campsites.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'campsite-feature');
            const label = this.generateTourismLabel(feature.properties, 'Campsite');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'campsite');
                polygon.setAttribute('fill', '#e8f5e8');
                polygon.setAttribute('stroke', '#388e3c');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const diamond = this.createDiamond(feature, 'campsite', 8);
                diamond.setAttribute('fill', '#388e3c');
                diamond.setAttribute('stroke', '#1b5e20');
                diamond.setAttribute('stroke-width', '2');
                featureGroup.appendChild(diamond);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderAttractions(attractions, group) {
        attractions.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'attraction-feature');
            const label = this.generateTourismLabel(feature.properties, 'Tourist attraction');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'attraction');
                polygon.setAttribute('fill', '#fce4ec');
                polygon.setAttribute('stroke', '#e91e63');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'attraction');
                circle.setAttribute('fill', '#e91e63');
                circle.setAttribute('stroke', '#ad1457');
                circle.setAttribute('stroke-width', '3');
                circle.setAttribute('r', '10');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderMuseums(museums, group) {
        museums.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'museum-feature');
            const label = this.generateTourismLabel(feature.properties, 'Museum');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'museum');
                polygon.setAttribute('fill', '#f1f8e9');
                polygon.setAttribute('stroke', '#689f38');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'museum', 14, 10);
                rect.setAttribute('fill', '#689f38');
                rect.setAttribute('stroke', '#33691e');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderGalleries(galleries, group) {
        galleries.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'gallery-feature');
            const label = this.generateTourismLabel(feature.properties, 'Art gallery');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'gallery');
                polygon.setAttribute('fill', '#fafafa');
                polygon.setAttribute('stroke', '#424242');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'gallery', 10, 12);
                rect.setAttribute('fill', '#424242');
                rect.setAttribute('stroke', '#212121');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderViewpoints(viewpoints, group) {
        viewpoints.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'viewpoint-feature');
            const label = this.generateTourismLabel(feature.properties, 'Scenic viewpoint');
            featureGroup.setAttribute('aria-label', label);
            
            // Viewpoints are typically points only
            const triangle = this.createTriangle(feature, 'viewpoint', 10);
            triangle.setAttribute('fill', '#ff9800');
            triangle.setAttribute('stroke', '#e65100');
            triangle.setAttribute('stroke-width', '3');
            featureGroup.appendChild(triangle);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderTouristInfo(touristInfo, group) {
        touristInfo.forEach((feature, index) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'tourist-info-feature');
            const label = this.generateTourismLabel(feature.properties, 'Tourist information');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'tourist-info');
                polygon.setAttribute('fill', '#e3f2fd');
                polygon.setAttribute('stroke', '#1976d2');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'tourist-info');
                circle.setAttribute('fill', '#1976d2');
                circle.setAttribute('stroke', '#0d47a1');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '7');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    // Label generation method for tourism features
    generateTourismLabel(props, baseType) {
        let label = baseType;
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.operator || props.brand) {
            label += ` (${props.operator || props.brand})`;
        }
        
        // Accommodation-specific info
        if (props.stars) {
            label += `, ${props.stars} stars`;
        }
        
        if (props.rooms) {
            label += `, ${props.rooms} rooms`;
        }
        
        if (props.beds) {
            label += `, ${props.beds} beds`;
        }
        
        // Tourism-specific info
        if (props.historic) {
            label += `, historic ${props.historic}`;
        }
        
        if (props.museum_type) {
            label += `, ${props.museum_type} museum`;
        }
        
        if (props.artwork_type) {
            label += `, ${props.artwork_type} gallery`;
        }
        
        if (props.information) {
            label += `, ${props.information} information`;
        }
        
        // Accessibility and services
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        if (props.internet_access === 'wlan' || props.wifi === 'yes') {
            label += ', WiFi available';
        }
        
        if (props.parking === 'yes') {
            label += ', parking available';
        }
        
        if (props.fee === 'yes') {
            label += ', entrance fee required';
        } else if (props.fee === 'no') {
            label += ', free admission';
        }
        
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        if (props.website) {
            label += ', has website';
        }
        
        if (props.phone) {
            label += `, phone: ${props.phone}`;
        }
        
        return label;
    }
}