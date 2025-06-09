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
            touristInfo: this.createGroup('tourist-info-group', 'Tourist information'),
            // Entertainment & Culture
            cinemas: this.createGroup('cinemas-group', 'Cinemas'),
            theatres: this.createGroup('theatres-group', 'Theatres'),
            libraries: this.createGroup('libraries-group', 'Libraries'),
            communityCentres: this.createGroup('community-centres-group', 'Community centres'),
            artsCentres: this.createGroup('arts-centres-group', 'Arts centres'),
            sportsCentres: this.createGroup('sports-centres-group', 'Sports centres'),
            swimmingPools: this.createGroup('swimming-pools-group', 'Swimming pools'),
            golfCourses: this.createGroup('golf-courses-group', 'Golf courses'),
            stadiums: this.createGroup('stadiums-group', 'Stadiums'),
            // Emergency Services
            policeStations: this.createGroup('police-stations-group', 'Police stations'),
            fireStations: this.createGroup('fire-stations-group', 'Fire stations'),
            emergencyPhonesCivil: this.createGroup('emergency-phones-civil-group', 'Emergency phones (civil)'),
            emergencyDefibrillators: this.createGroup('emergency-defibrillators-group', 'Emergency defibrillators'),
            // Historic Features
            monuments: this.createGroup('monuments-group', 'Monuments'),
            memorials: this.createGroup('memorials-group', 'Memorials'),
            archaeologicalSites: this.createGroup('archaeological-sites-group', 'Archaeological sites'),
            castles: this.createGroup('castles-group', 'Castles'),
            ruins: this.createGroup('ruins-group', 'Historic ruins'),
            // Man-made Structures
            bridges: this.createGroup('bridges-group', 'Bridges'),
            tunnels: this.createGroup('tunnels-group', 'Tunnels'),
            towers: this.createGroup('towers-group', 'Towers'),
            masts: this.createGroup('masts-group', 'Masts and antennas'),
            piers: this.createGroup('piers-group', 'Piers'),
            breakwaters: this.createGroup('breakwaters-group', 'Breakwaters'),
            // Barriers
            fences: this.createGroup('fences-group', 'Fences'),
            walls: this.createGroup('walls-group', 'Walls'),
            hedges: this.createGroup('hedges-group', 'Hedges'),
            gates: this.createGroup('gates-group', 'Gates'),
            bollards: this.createGroup('bollards-group', 'Bollards'),
            // Natural Features
            waterBodies: this.createGroup('water-bodies-group', 'Water bodies'),
            forests: this.createGroup('forests-group', 'Forests'),
            woods: this.createGroup('woods-group', 'Woods'),
            grasslands: this.createGroup('grasslands-group', 'Grasslands'),
            beaches: this.createGroup('beaches-group', 'Beaches'),
            cliffs: this.createGroup('cliffs-group', 'Cliffs'),
            peaks: this.createGroup('peaks-group', 'Mountain peaks'),
            trees: this.createGroup('trees-group', 'Individual trees'),
            // Waterways
            rivers: this.createGroup('rivers-group', 'Rivers'),
            streams: this.createGroup('streams-group', 'Streams'),
            canals: this.createGroup('canals-group', 'Canals'),
            ditches: this.createGroup('ditches-group', 'Ditches'),
            coastlines: this.createGroup('coastlines-group', 'Coastlines')
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
        
        // Render entertainment & culture
        this.renderCinemas(features.cinemas, groups.cinemas);
        this.renderTheatres(features.theatres, groups.theatres);
        this.renderLibraries(features.libraries, groups.libraries);
        this.renderCommunityCentres(features.communityCentres, groups.communityCentres);
        this.renderArtsCentres(features.artsCentres, groups.artsCentres);
        this.renderSportsCentres(features.sportsCentres, groups.sportsCentres);
        this.renderSwimmingPools(features.swimmingPools, groups.swimmingPools);
        this.renderGolfCourses(features.golfCourses, groups.golfCourses);
        this.renderStadiums(features.stadiums, groups.stadiums);
        
        // Render emergency services
        this.renderPoliceStations(features.policeStations, groups.policeStations);
        this.renderFireStations(features.fireStations, groups.fireStations);
        this.renderEmergencyPhonesCivil(features.emergencyPhones, groups.emergencyPhonesCivil);
        this.renderEmergencyDefibrillators(features.emergencyDefibrillators, groups.emergencyDefibrillators);
        
        // Render historic features
        this.renderMonuments(features.monuments, groups.monuments);
        this.renderMemorials(features.memorials, groups.memorials);
        this.renderArchaeologicalSites(features.archaeologicalSites, groups.archaeologicalSites);
        this.renderCastles(features.castles, groups.castles);
        this.renderRuins(features.ruins, groups.ruins);
        
        // Render man-made structures
        this.renderBridges(features.bridges, groups.bridges);
        this.renderTunnels(features.tunnels, groups.tunnels);
        this.renderTowers(features.towers, groups.towers);
        this.renderMasts(features.masts, groups.masts);
        this.renderPiers(features.piers, groups.piers);
        this.renderBreakwaters(features.breakwaters, groups.breakwaters);
        
        // Render barriers
        this.renderFences(features.fences, groups.fences);
        this.renderWalls(features.walls, groups.walls);
        this.renderHedges(features.hedges, groups.hedges);
        this.renderGates(features.gates, groups.gates);
        this.renderBollards(features.bollards, groups.bollards);
        
        // Render natural features
        this.renderWaterBodies(features.waterBodies, groups.waterBodies);
        this.renderForests(features.forests, groups.forests);
        this.renderWoods(features.woods, groups.woods);
        this.renderGrasslands(features.grasslands, groups.grasslands);
        this.renderBeaches(features.beaches, groups.beaches);
        this.renderCliffs(features.cliffs, groups.cliffs);
        this.renderPeaks(features.peaks, groups.peaks);
        this.renderTrees(features.trees, groups.trees);
        
        // Render waterways
        this.renderRivers(features.rivers, groups.rivers);
        this.renderStreams(features.streams, groups.streams);
        this.renderCanals(features.canals, groups.canals);
        this.renderDitches(features.ditches, groups.ditches);
        this.renderCoastlines(features.coastlines, groups.coastlines);
        
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
        buildings.forEach((feature) => {
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
        
        sortedRoads.forEach((feature) => {
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
        stops.forEach((feature) => {
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
        shops.forEach((feature) => {
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
        schools.forEach((feature) => {
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
        places.forEach((feature) => {
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
        parks.forEach((feature) => {
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
        addresses.forEach((feature) => {
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
    
    // Additional coordinate conversion methods for consistency
    polygonToSVG(coordinates) {
        return this.coordinatesToPoints(coordinates);
    }
    
    lineToSVG(coordinates) {
        return this.coordinatesToPoints(coordinates);
    }
    
    toSVGCoordinates(lat, lon) {
        const pos = this.mapRenderer.project(lat, lon);
        return { x: pos.x, y: pos.y };
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
        toilets.forEach((feature) => {
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
        parking.forEach((feature) => {
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
        water.forEach((feature) => {
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
        benches.forEach((feature) => {
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
        shelters.forEach((feature) => {
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
        crossings.forEach((feature) => {
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
        curbCuts.forEach((feature) => {
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
        elevators.forEach((feature) => {
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
        steps.forEach((feature) => {
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
        tactile.forEach((feature) => {
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
        signals.forEach((feature) => {
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
        maps.forEach((feature) => {
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
        clocks.forEach((feature) => {
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
        points.forEach((feature) => {
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
        phones.forEach((feature) => {
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
        defib.forEach((feature) => {
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
        medical.forEach((feature) => {
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
        barriers.forEach((feature) => {
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
        hospitals.forEach((feature) => {
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
        clinics.forEach((feature) => {
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
        doctors.forEach((feature) => {
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
        dentists.forEach((feature) => {
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
        pharmacies.forEach((feature) => {
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
        veterinary.forEach((feature) => {
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
        railways.forEach((feature) => {
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
        airports.forEach((feature) => {
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
        highways.forEach((feature) => {
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
        platforms.forEach((feature) => {
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
        banks.forEach((feature) => {
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
        atms.forEach((feature) => {
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
        postOffices.forEach((feature) => {
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
        exchanges.forEach((feature) => {
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
        restaurants.forEach((feature) => {
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
        cafes.forEach((feature) => {
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
        fastFood.forEach((feature) => {
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
        bars.forEach((feature) => {
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
        pubs.forEach((feature) => {
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
        foodCourts.forEach((feature) => {
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
        hotels.forEach((feature) => {
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
        hostels.forEach((feature) => {
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
        guestHouses.forEach((feature) => {
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
        campsites.forEach((feature) => {
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
        attractions.forEach((feature) => {
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
        museums.forEach((feature) => {
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
        galleries.forEach((feature) => {
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
        viewpoints.forEach((feature) => {
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
        touristInfo.forEach((feature) => {
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
    
    // Entertainment & Culture rendering methods
    renderCinemas(cinemas, group) {
        cinemas.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'cinema-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Cinema');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'cinema');
                polygon.setAttribute('fill', '#e1bee7');
                polygon.setAttribute('stroke', '#8e24aa');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'cinema');
                circle.setAttribute('fill', '#8e24aa');
                circle.setAttribute('stroke', '#6a1b9a');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '9');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderTheatres(theatres, group) {
        theatres.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'theatre-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Theatre');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'theatre');
                polygon.setAttribute('fill', '#ffcdd2');
                polygon.setAttribute('stroke', '#d32f2f');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'theatre', 16, 12);
                rect.setAttribute('fill', '#d32f2f');
                rect.setAttribute('stroke', '#b71c1c');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderLibraries(libraries, group) {
        libraries.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'library-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Library');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'library');
                polygon.setAttribute('fill', '#e8f5e8');
                polygon.setAttribute('stroke', '#2e7d32');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'library', 12, 15);
                rect.setAttribute('fill', '#2e7d32');
                rect.setAttribute('stroke', '#1b5e20');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCommunityCentres(centres, group) {
        centres.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'community-centre-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Community centre');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'community-centre');
                polygon.setAttribute('fill', '#e3f2fd');
                polygon.setAttribute('stroke', '#1565c0');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'community-centre');
                circle.setAttribute('fill', '#1565c0');
                circle.setAttribute('stroke', '#0d47a1');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '10');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderArtsCentres(centres, group) {
        centres.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'arts-centre-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Arts centre');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'arts-centre');
                polygon.setAttribute('fill', '#fce4ec');
                polygon.setAttribute('stroke', '#c2185b');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const diamond = this.createDiamond(feature, 'arts-centre', 9);
                diamond.setAttribute('fill', '#c2185b');
                diamond.setAttribute('stroke', '#880e4f');
                diamond.setAttribute('stroke-width', '2');
                featureGroup.appendChild(diamond);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderSportsCentres(centres, group) {
        centres.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'sports-centre-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Sports centre');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'sports-centre');
                polygon.setAttribute('fill', '#fff3e0');
                polygon.setAttribute('stroke', '#ef6c00');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const rect = this.createRect(feature, 'sports-centre', 14, 14);
                rect.setAttribute('fill', '#ef6c00');
                rect.setAttribute('stroke', '#e65100');
                rect.setAttribute('stroke-width', '2');
                featureGroup.appendChild(rect);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderSwimmingPools(pools, group) {
        pools.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'swimming-pool-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Swimming pool');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'swimming-pool');
                polygon.setAttribute('fill', '#e0f2f1');
                polygon.setAttribute('stroke', '#00695c');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'swimming-pool');
                circle.setAttribute('fill', '#00695c');
                circle.setAttribute('stroke', '#004d40');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '8');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderGolfCourses(courses, group) {
        courses.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'golf-course-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Golf course');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'golf-course');
                polygon.setAttribute('fill', '#f1f8e9');
                polygon.setAttribute('stroke', '#689f38');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'golf-course');
                circle.setAttribute('fill', '#689f38');
                circle.setAttribute('stroke', '#33691e');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('r', '12');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderStadiums(stadiums, group) {
        stadiums.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'stadium-feature');
            const label = this.generateEntertainmentLabel(feature.properties, 'Stadium');
            featureGroup.setAttribute('aria-label', label);
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = this.createPolygon(feature, 'stadium');
                polygon.setAttribute('fill', '#ffebee');
                polygon.setAttribute('stroke', '#d84315');
                polygon.setAttribute('stroke-width', '3');
                polygon.setAttribute('fill-opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'stadium');
                circle.setAttribute('fill', '#d84315');
                circle.setAttribute('stroke', '#bf360c');
                circle.setAttribute('stroke-width', '3');
                circle.setAttribute('r', '15');
                featureGroup.appendChild(circle);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    // Label generation method for entertainment features
    generateEntertainmentLabel(props, baseType) {
        let label = baseType;
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.operator || props.brand) {
            label += ` (${props.operator || props.brand})`;
        }
        
        // Entertainment-specific info
        if (props.screen) {
            label += `, ${props.screen} screens`;
        }
        
        if (props.capacity) {
            label += `, capacity: ${props.capacity}`;
        }
        
        if (props.sport) {
            label += `, sport: ${props.sport}`;
        }
        
        if (props.leisure_centre) {
            label += `, leisure centre type: ${props.leisure_centre}`;
        }
        
        if (props.access && props.access !== 'yes') {
            label += `, access: ${props.access}`;
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
            label += ', admission fee required';
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
    
    // Emergency Services Rendering Methods
    renderPoliceStations(policeStations, group) {
        policeStations.forEach((feature) => {
            // Create individual group for each police station
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'police-station-feature');
            featureGroup.setAttribute('aria-label', this.generateEmergencyLabel(feature.properties, 'Police station'));
            
            if (feature.geometry.type === 'Polygon') {
                // Render as polygon (building)
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                const coords = feature.geometry.coordinates[0];
                const projectedCoords = coords.map(coord => this.mapRenderer.project(coord[1], coord[0]));
                const points = projectedCoords.map(p => `${p.x},${p.y}`).join(' ');
                
                polygon.setAttribute('points', points);
                polygon.setAttribute('fill', '#003d82');
                polygon.setAttribute('stroke', '#001a3a');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('class', 'police-station');
                
                featureGroup.appendChild(polygon);
            } else {
                // Render as point (shield symbol)
                const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                
                // Create shield shape
                const shield = document.createElementNS(this.SVG_NS, 'path');
                const shieldPath = `M ${point.x} ${point.y - 8} 
                                   C ${point.x - 6} ${point.y - 8} ${point.x - 6} ${point.y - 2} ${point.x - 6} ${point.y + 2}
                                   L ${point.x} ${point.y + 8}
                                   L ${point.x + 6} ${point.y + 2}
                                   C ${point.x + 6} ${point.y - 2} ${point.x + 6} ${point.y - 8} ${point.x} ${point.y - 8} Z`;
                shield.setAttribute('d', shieldPath);
                shield.setAttribute('fill', '#003d82');
                shield.setAttribute('stroke', '#001a3a');
                shield.setAttribute('stroke-width', '2');
                shield.setAttribute('class', 'police-station');
                
                featureGroup.appendChild(shield);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderFireStations(fireStations, group) {
        fireStations.forEach((feature) => {
            // Create individual group for each fire station
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'fire-station-feature');
            featureGroup.setAttribute('aria-label', this.generateEmergencyLabel(feature.properties, 'Fire station'));
            
            if (feature.geometry.type === 'Polygon') {
                // Render as polygon (building)
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                const coords = feature.geometry.coordinates[0];
                const projectedCoords = coords.map(coord => this.mapRenderer.project(coord[1], coord[0]));
                const points = projectedCoords.map(p => `${p.x},${p.y}`).join(' ');
                
                polygon.setAttribute('points', points);
                polygon.setAttribute('fill', '#d32f2f');
                polygon.setAttribute('stroke', '#b71c1c');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('class', 'fire-station');
                
                featureGroup.appendChild(polygon);
            } else {
                // Render as point (fire truck symbol)
                const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                
                // Create fire truck rectangle
                const truck = document.createElementNS(this.SVG_NS, 'rect');
                truck.setAttribute('x', point.x - 8);
                truck.setAttribute('y', point.y - 4);
                truck.setAttribute('width', '16');
                truck.setAttribute('height', '8');
                truck.setAttribute('fill', '#d32f2f');
                truck.setAttribute('stroke', '#b71c1c');
                truck.setAttribute('stroke-width', '2');
                truck.setAttribute('class', 'fire-station');
                
                featureGroup.appendChild(truck);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderEmergencyPhonesCivil(emergencyPhones, group) {
        emergencyPhones.forEach((feature) => {
            // Create individual group for each emergency phone
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'emergency-phone-feature');
            featureGroup.setAttribute('aria-label', this.generateEmergencyLabel(feature.properties, 'Emergency phone'));
            
            const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
            
            // Create phone symbol (rectangle with small circle)
            const phoneBox = document.createElementNS(this.SVG_NS, 'rect');
            phoneBox.setAttribute('x', point.x - 4);
            phoneBox.setAttribute('y', point.y - 6);
            phoneBox.setAttribute('width', '8');
            phoneBox.setAttribute('height', '12');
            phoneBox.setAttribute('fill', '#ff6600');
            phoneBox.setAttribute('stroke', '#e65100');
            phoneBox.setAttribute('stroke-width', '2');
            phoneBox.setAttribute('class', 'emergency-phone');
            
            const phoneCircle = document.createElementNS(this.SVG_NS, 'circle');
            phoneCircle.setAttribute('cx', point.x);
            phoneCircle.setAttribute('cy', point.y - 2);
            phoneCircle.setAttribute('r', '2');
            phoneCircle.setAttribute('fill', '#e65100');
            phoneCircle.setAttribute('class', 'emergency-phone');
            
            featureGroup.appendChild(phoneBox);
            featureGroup.appendChild(phoneCircle);
            group.appendChild(featureGroup);
        });
    }
    
    renderEmergencyDefibrillators(emergencyDefibrillators, group) {
        emergencyDefibrillators.forEach((feature) => {
            // Create individual group for each defibrillator
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'emergency-defibrillator-feature');
            featureGroup.setAttribute('aria-label', this.generateEmergencyLabel(feature.properties, 'Emergency defibrillator'));
            
            const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
            
            // Create AED symbol (green cross in circle)
            const circle = document.createElementNS(this.SVG_NS, 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', '8');
            circle.setAttribute('fill', '#4caf50');
            circle.setAttribute('stroke', '#2e7d32');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('class', 'emergency-defibrillator');
            
            // Add cross symbol
            const crossV = document.createElementNS(this.SVG_NS, 'rect');
            crossV.setAttribute('x', point.x - 1);
            crossV.setAttribute('y', point.y - 5);
            crossV.setAttribute('width', '2');
            crossV.setAttribute('height', '10');
            crossV.setAttribute('fill', 'white');
            crossV.setAttribute('class', 'emergency-defibrillator');
            
            const crossH = document.createElementNS(this.SVG_NS, 'rect');
            crossH.setAttribute('x', point.x - 5);
            crossH.setAttribute('y', point.y - 1);
            crossH.setAttribute('width', '10');
            crossH.setAttribute('height', '2');
            crossH.setAttribute('fill', 'white');
            crossH.setAttribute('class', 'emergency-defibrillator');
            
            featureGroup.appendChild(circle);
            featureGroup.appendChild(crossV);
            featureGroup.appendChild(crossH);
            group.appendChild(featureGroup);
        });
    }
    
    // Label generation method for emergency services
    generateEmergencyLabel(props, baseType) {
        let label = baseType;
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        if (props.operator) {
            label += ` (${props.operator})`;
        }
        
        // Emergency-specific info
        if (props.emergency) {
            label += `, emergency type: ${props.emergency}`;
        }
        
        if (props.ref) {
            label += `, reference: ${props.ref}`;
        }
        
        // Service hours
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        } else if (baseType.includes('Police') || baseType.includes('Fire')) {
            label += ', 24/7 emergency service';
        }
        
        // Accessibility
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        // Equipment info for defibrillators
        if (baseType.includes('defibrillator')) {
            if (props.defibrillator === 'yes') {
                label += ', AED available';
            }
            if (props.access) {
                label += `, access: ${props.access}`;
            }
            if (props.indoor === 'yes') {
                label += ', located indoors';
            } else if (props.indoor === 'no') {
                label += ', located outdoors';
            }
        }
        
        // Location info for emergency phones
        if (baseType.includes('phone')) {
            if (props.covered === 'yes') {
                label += ', covered';
            }
            if (props.shelter === 'yes') {
                label += ', in shelter';
            }
        }
        
        // Contact info
        if (props.phone) {
            label += `, phone: ${props.phone}`;
        }
        
        if (props.website) {
            label += ', has website';
        }
        
        return label;
    }
    
    // Historic Features Rendering Methods
    renderMonuments(monuments, group) {
        monuments.forEach((feature) => {
            // Create individual group for each monument
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'monument-feature');
            featureGroup.setAttribute('aria-label', this.generateHistoricLabel(feature.properties, 'Monument'));
            
            if (feature.geometry.type === 'Polygon') {
                // Render as polygon (area)
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                const coords = feature.geometry.coordinates[0];
                const projectedCoords = coords.map(coord => this.mapRenderer.project(coord[1], coord[0]));
                const points = projectedCoords.map(p => `${p.x},${p.y}`).join(' ');
                
                polygon.setAttribute('points', points);
                polygon.setAttribute('fill', '#8d6e63');
                polygon.setAttribute('stroke', '#5d4037');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('class', 'monument');
                
                featureGroup.appendChild(polygon);
            } else {
                // Render as point (obelisk symbol)
                const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                
                // Create obelisk shape
                const obelisk = document.createElementNS(this.SVG_NS, 'path');
                const obeliskPath = `M ${point.x} ${point.y - 10} 
                                   L ${point.x - 3} ${point.y - 8} 
                                   L ${point.x - 4} ${point.y + 8}
                                   L ${point.x + 4} ${point.y + 8}
                                   L ${point.x + 3} ${point.y - 8} Z`;
                obelisk.setAttribute('d', obeliskPath);
                obelisk.setAttribute('fill', '#8d6e63');
                obelisk.setAttribute('stroke', '#5d4037');
                obelisk.setAttribute('stroke-width', '2');
                obelisk.setAttribute('class', 'monument');
                
                featureGroup.appendChild(obelisk);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderMemorials(memorials, group) {
        memorials.forEach((feature) => {
            // Create individual group for each memorial
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'memorial-feature');
            featureGroup.setAttribute('aria-label', this.generateHistoricLabel(feature.properties, 'Memorial'));
            
            if (feature.geometry.type === 'Polygon') {
                // Render as polygon (area)
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                const coords = feature.geometry.coordinates[0];
                const projectedCoords = coords.map(coord => this.mapRenderer.project(coord[1], coord[0]));
                const points = projectedCoords.map(p => `${p.x},${p.y}`).join(' ');
                
                polygon.setAttribute('points', points);
                polygon.setAttribute('fill', '#607d8b');
                polygon.setAttribute('stroke', '#37474f');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('class', 'memorial');
                
                featureGroup.appendChild(polygon);
            } else {
                // Render as point (cross symbol)
                const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                
                // Create memorial cross
                const crossV = document.createElementNS(this.SVG_NS, 'rect');
                crossV.setAttribute('x', point.x - 2);
                crossV.setAttribute('y', point.y - 8);
                crossV.setAttribute('width', '4');
                crossV.setAttribute('height', '16');
                crossV.setAttribute('fill', '#607d8b');
                crossV.setAttribute('stroke', '#37474f');
                crossV.setAttribute('stroke-width', '1');
                crossV.setAttribute('class', 'memorial');
                
                const crossH = document.createElementNS(this.SVG_NS, 'rect');
                crossH.setAttribute('x', point.x - 6);
                crossH.setAttribute('y', point.y - 4);
                crossH.setAttribute('width', '12');
                crossH.setAttribute('height', '4');
                crossH.setAttribute('fill', '#607d8b');
                crossH.setAttribute('stroke', '#37474f');
                crossH.setAttribute('stroke-width', '1');
                crossH.setAttribute('class', 'memorial');
                
                featureGroup.appendChild(crossV);
                featureGroup.appendChild(crossH);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderArchaeologicalSites(archaeologicalSites, group) {
        archaeologicalSites.forEach((feature) => {
            // Create individual group for each archaeological site
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'archaeological-site-feature');
            featureGroup.setAttribute('aria-label', this.generateHistoricLabel(feature.properties, 'Archaeological site'));
            
            if (feature.geometry.type === 'Polygon') {
                // Render as polygon (area)
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                const coords = feature.geometry.coordinates[0];
                const projectedCoords = coords.map(coord => this.mapRenderer.project(coord[1], coord[0]));
                const points = projectedCoords.map(p => `${p.x},${p.y}`).join(' ');
                
                polygon.setAttribute('points', points);
                polygon.setAttribute('fill', '#8bc34a');
                polygon.setAttribute('stroke', '#689f38');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('stroke-dasharray', '5,5');
                polygon.setAttribute('class', 'archaeological-site');
                
                featureGroup.appendChild(polygon);
            } else {
                // Render as point (excavation symbol)
                const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                
                // Create excavation square with dashed border
                const square = document.createElementNS(this.SVG_NS, 'rect');
                square.setAttribute('x', point.x - 6);
                square.setAttribute('y', point.y - 6);
                square.setAttribute('width', '12');
                square.setAttribute('height', '12');
                square.setAttribute('fill', '#8bc34a');
                square.setAttribute('stroke', '#689f38');
                square.setAttribute('stroke-width', '2');
                square.setAttribute('stroke-dasharray', '3,3');
                square.setAttribute('class', 'archaeological-site');
                
                featureGroup.appendChild(square);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCastles(castles, group) {
        castles.forEach((feature) => {
            // Create individual group for each castle
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'castle-feature');
            featureGroup.setAttribute('aria-label', this.generateHistoricLabel(feature.properties, 'Castle'));
            
            if (feature.geometry.type === 'Polygon') {
                // Render as polygon (area)
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                const coords = feature.geometry.coordinates[0];
                const projectedCoords = coords.map(coord => this.mapRenderer.project(coord[1], coord[0]));
                const points = projectedCoords.map(p => `${p.x},${p.y}`).join(' ');
                
                polygon.setAttribute('points', points);
                polygon.setAttribute('fill', '#9c27b0');
                polygon.setAttribute('stroke', '#6a1b9a');
                polygon.setAttribute('stroke-width', '3');
                polygon.setAttribute('class', 'castle');
                
                featureGroup.appendChild(polygon);
            } else {
                // Render as point (castle tower symbol)
                const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                
                // Create castle tower
                const tower = document.createElementNS(this.SVG_NS, 'rect');
                tower.setAttribute('x', point.x - 5);
                tower.setAttribute('y', point.y - 8);
                tower.setAttribute('width', '10');
                tower.setAttribute('height', '16');
                tower.setAttribute('fill', '#9c27b0');
                tower.setAttribute('stroke', '#6a1b9a');
                tower.setAttribute('stroke-width', '2');
                tower.setAttribute('class', 'castle');
                
                // Add crenellations
                const crens = document.createElementNS(this.SVG_NS, 'path');
                const crensPath = `M ${point.x - 5} ${point.y - 8} 
                                  L ${point.x - 3} ${point.y - 8} 
                                  L ${point.x - 3} ${point.y - 10}
                                  L ${point.x - 1} ${point.y - 10}
                                  L ${point.x - 1} ${point.y - 8}
                                  L ${point.x + 1} ${point.y - 8}
                                  L ${point.x + 1} ${point.y - 10}
                                  L ${point.x + 3} ${point.y - 10}
                                  L ${point.x + 3} ${point.y - 8}
                                  L ${point.x + 5} ${point.y - 8}`;
                crens.setAttribute('d', crensPath);
                crens.setAttribute('fill', 'none');
                crens.setAttribute('stroke', '#6a1b9a');
                crens.setAttribute('stroke-width', '2');
                crens.setAttribute('class', 'castle');
                
                featureGroup.appendChild(tower);
                featureGroup.appendChild(crens);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    renderRuins(ruins, group) {
        ruins.forEach((feature) => {
            // Create individual group for each ruin
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'ruins-feature');
            featureGroup.setAttribute('aria-label', this.generateHistoricLabel(feature.properties, 'Historic ruins'));
            
            if (feature.geometry.type === 'Polygon') {
                // Render as polygon (area)
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                const coords = feature.geometry.coordinates[0];
                const projectedCoords = coords.map(coord => this.mapRenderer.project(coord[1], coord[0]));
                const points = projectedCoords.map(p => `${p.x},${p.y}`).join(' ');
                
                polygon.setAttribute('points', points);
                polygon.setAttribute('fill', '#795548');
                polygon.setAttribute('stroke', '#4e342e');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('fill-opacity', '0.7');
                polygon.setAttribute('class', 'ruins');
                
                featureGroup.appendChild(polygon);
            } else {
                // Render as point (broken column symbol)
                const point = this.mapRenderer.project(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                
                // Create broken column segments
                const segment1 = document.createElementNS(this.SVG_NS, 'rect');
                segment1.setAttribute('x', point.x - 3);
                segment1.setAttribute('y', point.y - 8);
                segment1.setAttribute('width', '6');
                segment1.setAttribute('height', '6');
                segment1.setAttribute('fill', '#795548');
                segment1.setAttribute('stroke', '#4e342e');
                segment1.setAttribute('stroke-width', '1');
                segment1.setAttribute('class', 'ruins');
                
                const segment2 = document.createElementNS(this.SVG_NS, 'rect');
                segment2.setAttribute('x', point.x - 2);
                segment2.setAttribute('y', point.y + 1);
                segment2.setAttribute('width', '4');
                segment2.setAttribute('height', '4');
                segment2.setAttribute('fill', '#795548');
                segment2.setAttribute('stroke', '#4e342e');
                segment2.setAttribute('stroke-width', '1');
                segment2.setAttribute('class', 'ruins');
                
                const segment3 = document.createElementNS(this.SVG_NS, 'rect');
                segment3.setAttribute('x', point.x - 1);
                segment3.setAttribute('y', point.y + 6);
                segment3.setAttribute('width', '2');
                segment3.setAttribute('height', '3');
                segment3.setAttribute('fill', '#795548');
                segment3.setAttribute('stroke', '#4e342e');
                segment3.setAttribute('stroke-width', '1');
                segment3.setAttribute('class', 'ruins');
                
                featureGroup.appendChild(segment1);
                featureGroup.appendChild(segment2);
                featureGroup.appendChild(segment3);
            }
            
            group.appendChild(featureGroup);
        });
    }
    
    // Label generation method for historic features
    generateHistoricLabel(props, baseType) {
        let label = baseType;
        
        if (props.name) {
            label += ` - ${props.name}`;
        }
        
        // Historic-specific info
        if (props.historic) {
            label += `, type: ${props.historic}`;
        }
        
        if (props.heritage) {
            label += `, heritage status: ${props.heritage}`;
        }
        
        if (props.start_date) {
            label += `, dating from: ${props.start_date}`;
        }
        
        if (props.civilization) {
            label += `, civilization: ${props.civilization}`;
        }
        
        if (props.archaeological_site) {
            label += `, site type: ${props.archaeological_site}`;
        }
        
        if (props.castle_type) {
            label += `, castle type: ${props.castle_type}`;
        }
        
        if (props.ruins) {
            label += `, ruins type: ${props.ruins}`;
        }
        
        // Accessibility
        if (props.wheelchair === 'yes') {
            label += ', wheelchair accessible';
        }
        
        // Visitor information
        if (props.opening_hours) {
            label += `, hours: ${props.opening_hours}`;
        }
        
        if (props.fee === 'yes') {
            label += ', entrance fee required';
        } else if (props.fee === 'no') {
            label += ', free admission';
        }
        
        if (props.website) {
            label += ', has website';
        }
        
        if (props.phone) {
            label += `, phone: ${props.phone}`;
        }
        
        if (props.wikipedia) {
            label += ', has Wikipedia article';
        }
        
        return label;
    }
    
    // Man-made Structures rendering methods
    renderBridges(bridges, group) {
        bridges.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'bridge-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'bridge');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#8e9aaf');
                polygon.setAttribute('stroke', '#5d6674');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'bridge');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#8e9aaf');
                polyline.setAttribute('stroke-width', '6');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - bridge marker
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'bridge');
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '8');
                circle.setAttribute('fill', '#8e9aaf');
                circle.setAttribute('stroke', '#5d6674');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('opacity', '0.8');
                featureGroup.appendChild(circle);
                
                // Bridge icon
                const text = document.createElementNS(this.SVG_NS, 'text');
                text.setAttribute('x', coords.x);
                text.setAttribute('y', coords.y + 4);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-family', 'Arial, sans-serif');
                text.setAttribute('font-size', '12');
                text.setAttribute('fill', 'white');
                text.setAttribute('font-weight', 'bold');
                text.textContent = '🌉';
                featureGroup.appendChild(text);
            }
            
            const label = this.generateManmadeLabel(feature.properties, 'Bridge');
            featureGroup.setAttribute('aria-label', label);
            group.appendChild(featureGroup);
        });
    }
    
    renderTunnels(tunnels, group) {
        tunnels.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'tunnel-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'tunnel');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#3e3e3e');
                polygon.setAttribute('stroke', '#1a1a1a');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('opacity', '0.7');
                polygon.setAttribute('stroke-dasharray', '5,5');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'tunnel');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#3e3e3e');
                polyline.setAttribute('stroke-width', '6');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('opacity', '0.7');
                polyline.setAttribute('stroke-dasharray', '10,5');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - tunnel entrance
                const rect = document.createElementNS(this.SVG_NS, 'rect');
                rect.setAttribute('class', 'tunnel');
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
                rect.setAttribute('x', coords.x - 8);
                rect.setAttribute('y', coords.y - 6);
                rect.setAttribute('width', '16');
                rect.setAttribute('height', '12');
                rect.setAttribute('fill', '#3e3e3e');
                rect.setAttribute('stroke', '#1a1a1a');
                rect.setAttribute('stroke-width', '2');
                rect.setAttribute('opacity', '0.8');
                rect.setAttribute('rx', '6');
                featureGroup.appendChild(rect);
                
                // Tunnel entrance icon
                const text = document.createElementNS(this.SVG_NS, 'text');
                text.setAttribute('x', coords.x);
                text.setAttribute('y', coords.y + 3);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-family', 'Arial, sans-serif');
                text.setAttribute('font-size', '10');
                text.setAttribute('fill', 'white');
                text.setAttribute('font-weight', 'bold');
                text.textContent = '⚫';
                featureGroup.appendChild(text);
            }
            
            const label = this.generateManmadeLabel(feature.properties, 'Tunnel');
            featureGroup.setAttribute('aria-label', label);
            group.appendChild(featureGroup);
        });
    }
    
    renderTowers(towers, group) {
        towers.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'tower-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'tower');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#9e9e9e');
                polygon.setAttribute('stroke', '#424242');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else {
                // Point geometry - tower shape
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
                
                // Tower base (rectangle)
                const base = document.createElementNS(this.SVG_NS, 'rect');
                base.setAttribute('class', 'tower');
                base.setAttribute('x', coords.x - 6);
                base.setAttribute('y', coords.y - 4);
                base.setAttribute('width', '12');
                base.setAttribute('height', '8');
                base.setAttribute('fill', '#9e9e9e');
                base.setAttribute('stroke', '#424242');
                base.setAttribute('stroke-width', '2');
                base.setAttribute('opacity', '0.8');
                featureGroup.appendChild(base);
                
                // Tower spire (triangle)
                const spire = document.createElementNS(this.SVG_NS, 'polygon');
                spire.setAttribute('class', 'tower');
                spire.setAttribute('points', `${coords.x},${coords.y-4} ${coords.x-4},${coords.y+4} ${coords.x+4},${coords.y+4}`);
                spire.setAttribute('fill', '#757575');
                spire.setAttribute('stroke', '#424242');
                spire.setAttribute('stroke-width', '1');
                spire.setAttribute('opacity', '0.8');
                featureGroup.appendChild(spire);
            }
            
            const label = this.generateManmadeLabel(feature.properties, 'Tower');
            featureGroup.setAttribute('aria-label', label);
            group.appendChild(featureGroup);
        });
    }
    
    renderMasts(masts, group) {
        masts.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'mast-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            const coords = this.toSVGCoordinates(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
            
            // Mast pole (line)
            const pole = document.createElementNS(this.SVG_NS, 'line');
            pole.setAttribute('class', 'mast');
            pole.setAttribute('x1', coords.x);
            pole.setAttribute('y1', coords.y + 8);
            pole.setAttribute('x2', coords.x);
            pole.setAttribute('y2', coords.y - 12);
            pole.setAttribute('stroke', '#ff5722');
            pole.setAttribute('stroke-width', '3');
            pole.setAttribute('opacity', '0.8');
            featureGroup.appendChild(pole);
            
            // Antenna elements (horizontal lines)
            for (let i = 0; i < 3; i++) {
                const antenna = document.createElementNS(this.SVG_NS, 'line');
                antenna.setAttribute('class', 'mast');
                const y = coords.y - 8 + (i * 4);
                antenna.setAttribute('x1', coords.x - 4);
                antenna.setAttribute('y1', y);
                antenna.setAttribute('x2', coords.x + 4);
                antenna.setAttribute('y2', y);
                antenna.setAttribute('stroke', '#ff5722');
                antenna.setAttribute('stroke-width', '2');
                antenna.setAttribute('opacity', '0.8');
                featureGroup.appendChild(antenna);
            }
            
            // Base circle
            const base = document.createElementNS(this.SVG_NS, 'circle');
            base.setAttribute('class', 'mast');
            base.setAttribute('cx', coords.x);
            base.setAttribute('cy', coords.y + 8);
            base.setAttribute('r', '4');
            base.setAttribute('fill', '#d84315');
            base.setAttribute('stroke', '#bf360c');
            base.setAttribute('stroke-width', '1');
            base.setAttribute('opacity', '0.8');
            featureGroup.appendChild(base);
            
            const label = this.generateManmadeLabel(feature.properties, 'Mast/Antenna');
            featureGroup.setAttribute('aria-label', label);
            group.appendChild(featureGroup);
        });
    }
    
    renderPiers(piers, group) {
        piers.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'pier-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'pier');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#8d6e63');
                polygon.setAttribute('stroke', '#5d4037');
                polygon.setAttribute('stroke-width', '2');
                polygon.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'pier');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#8d6e63');
                polyline.setAttribute('stroke-width', '8');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - pier dock
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
                
                // Pier platform (rectangle)
                const platform = document.createElementNS(this.SVG_NS, 'rect');
                platform.setAttribute('class', 'pier');
                platform.setAttribute('x', coords.x - 10);
                platform.setAttribute('y', coords.y - 4);
                platform.setAttribute('width', '20');
                platform.setAttribute('height', '8');
                platform.setAttribute('fill', '#8d6e63');
                platform.setAttribute('stroke', '#5d4037');
                platform.setAttribute('stroke-width', '2');
                platform.setAttribute('opacity', '0.8');
                featureGroup.appendChild(platform);
                
                // Pier posts
                for (let i = 0; i < 3; i++) {
                    const post = document.createElementNS(this.SVG_NS, 'line');
                    post.setAttribute('class', 'pier');
                    const x = coords.x - 6 + (i * 6);
                    post.setAttribute('x1', x);
                    post.setAttribute('y1', coords.y + 4);
                    post.setAttribute('x2', x);
                    post.setAttribute('y2', coords.y + 12);
                    post.setAttribute('stroke', '#5d4037');
                    post.setAttribute('stroke-width', '2');
                    post.setAttribute('opacity', '0.8');
                    featureGroup.appendChild(post);
                }
            }
            
            const label = this.generateManmadeLabel(feature.properties, 'Pier');
            featureGroup.setAttribute('aria-label', label);
            group.appendChild(featureGroup);
        });
    }
    
    renderBreakwaters(breakwaters, group) {
        breakwaters.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'breakwater-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'breakwater');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#546e7a');
                polygon.setAttribute('stroke', '#37474f');
                polygon.setAttribute('stroke-width', '3');
                polygon.setAttribute('opacity', '0.8');
                polygon.setAttribute('stroke-dasharray', '8,4');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'breakwater');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#546e7a');
                polyline.setAttribute('stroke-width', '10');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('opacity', '0.8');
                polyline.setAttribute('stroke-dasharray', '12,6');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - breakwater section
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
                
                // Breakwater rocks (irregular shape)
                const path = document.createElementNS(this.SVG_NS, 'path');
                path.setAttribute('class', 'breakwater');
                path.setAttribute('d', `M${coords.x-8},${coords.y} L${coords.x-4},${coords.y-6} L${coords.x+2},${coords.y-4} L${coords.x+8},${coords.y-2} L${coords.x+6},${coords.y+4} L${coords.x-2},${coords.y+6} Z`);
                path.setAttribute('fill', '#546e7a');
                path.setAttribute('stroke', '#37474f');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('opacity', '0.8');
                featureGroup.appendChild(path);
            }
            
            const label = this.generateManmadeLabel(feature.properties, 'Breakwater');
            featureGroup.setAttribute('aria-label', label);
            group.appendChild(featureGroup);
        });
    }
    
    generateManmadeLabel(props, type) {
        let label = `${type}`;
        
        if (props.name) {
            label += `: ${props.name}`;
        }
        
        if (props.operator) {
            label += `, operated by ${props.operator}`;
        }
        
        if (props.height) {
            label += `, height: ${props.height}`;
        }
        
        if (props.material) {
            label += `, material: ${props.material}`;
        }
        
        if (props.construction_date || props.start_date) {
            const date = props.construction_date || props.start_date;
            label += `, built: ${date}`;
        }
        
        if (props.layer) {
            label += `, layer: ${props.layer}`;
        }
        
        if (props.bridge && props.bridge !== 'yes') {
            label += `, bridge type: ${props.bridge}`;
        }
        
        if (props.tunnel && props.tunnel !== 'yes') {
            label += `, tunnel type: ${props.tunnel}`;
        }
        
        if (props['tower:type']) {
            label += `, tower type: ${props['tower:type']}`;
        }
        
        if (props.access) {
            label += `, access: ${props.access}`;
        }
        
        if (props._relation) {
            label += ' (complex structure)';
        }
        
        return label;
    }
    
    // Barriers rendering methods
    renderFences(fences, group) {
        fences.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'fence-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'fence');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#8B4513');
                polyline.setAttribute('stroke-width', '2');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('stroke-dasharray', '3,2');
                polyline.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - fence post marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const rect = document.createElementNS(this.SVG_NS, 'rect');
                rect.setAttribute('class', 'fence');
                rect.setAttribute('x', coords.x - 2);
                rect.setAttribute('y', coords.y - 2);
                rect.setAttribute('width', '4');
                rect.setAttribute('height', '4');
                rect.setAttribute('fill', '#8B4513');
                rect.setAttribute('stroke', '#654321');
                rect.setAttribute('stroke-width', '1');
                rect.setAttribute('opacity', '0.8');
                featureGroup.appendChild(rect);
            }
            
            // Add label
            const label = this.generateFenceLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderWalls(walls, group) {
        walls.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'wall-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'wall');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#696969');
                polyline.setAttribute('stroke-width', '4');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('opacity', '0.9');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - wall section marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const rect = document.createElementNS(this.SVG_NS, 'rect');
                rect.setAttribute('class', 'wall');
                rect.setAttribute('x', coords.x - 3);
                rect.setAttribute('y', coords.y - 3);
                rect.setAttribute('width', '6');
                rect.setAttribute('height', '6');
                rect.setAttribute('fill', '#696969');
                rect.setAttribute('stroke', '#404040');
                rect.setAttribute('stroke-width', '1');
                rect.setAttribute('opacity', '0.9');
                featureGroup.appendChild(rect);
            }
            
            // Add label
            const label = this.generateWallLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderHedges(hedges, group) {
        hedges.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'hedge-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'hedge');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#228B22');
                polyline.setAttribute('stroke-width', '3');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('stroke-dasharray', '2,1');
                polyline.setAttribute('opacity', '0.7');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - hedge section marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'hedge');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '3');
                circle.setAttribute('fill', '#228B22');
                circle.setAttribute('stroke', '#006400');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.7');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateHedgeLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderGates(gates, group) {
        gates.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'gate-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'gate');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#FFD700');
                polyline.setAttribute('stroke-width', '2');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('stroke-dasharray', '5,3');
                polyline.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - gate marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'gate');
                polygon.setAttribute('points', `${coords.x-3},${coords.y+3} ${coords.x+3},${coords.y+3} ${coords.x},${coords.y-3}`);
                polygon.setAttribute('fill', '#FFD700');
                polygon.setAttribute('stroke', '#DAA520');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polygon);
            }
            
            // Add label
            const label = this.generateGateLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderBollards(bollards, group) {
        bollards.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'bollard-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                // Line of bollards
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'bollard');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#DC143C');
                polyline.setAttribute('stroke-width', '2');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('stroke-dasharray', '1,3');
                polyline.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - individual bollard
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'bollard');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '2');
                circle.setAttribute('fill', '#DC143C');
                circle.setAttribute('stroke', '#B22222');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.8');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateBollardLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    // Barrier label generation methods
    generateFenceLabel(props) {
        let label = 'Fence';
        
        if (props.material) {
            label += `, ${props.material}`;
        }
        
        if (props.height) {
            label += `, height: ${props.height}`;
        }
        
        if (props.access) {
            label += `, access: ${props.access}`;
        }
        
        return label;
    }
    
    generateWallLabel(props) {
        let label = 'Wall';
        
        if (props.material) {
            label += `, ${props.material}`;
        }
        
        if (props.height) {
            label += `, height: ${props.height}`;
        }
        
        if (props.access) {
            label += `, access: ${props.access}`;
        }
        
        return label;
    }
    
    generateHedgeLabel(props) {
        let label = 'Hedge';
        
        if (props.species) {
            label += `, ${props.species}`;
        }
        
        if (props.height) {
            label += `, height: ${props.height}`;
        }
        
        if (props.access) {
            label += `, access: ${props.access}`;
        }
        
        return label;
    }
    
    generateGateLabel(props) {
        let label = 'Gate';
        
        if (props.access) {
            label += `, access: ${props.access}`;
        }
        
        if (props.material) {
            label += `, ${props.material}`;
        }
        
        if (props.width) {
            label += `, width: ${props.width}`;
        }
        
        if (props.locked && props.locked === 'yes') {
            label += ', locked';
        }
        
        return label;
    }
    
    generateBollardLabel(props) {
        let label = 'Bollard';
        
        if (props.material) {
            label += `, ${props.material}`;
        }
        
        if (props.height) {
            label += `, height: ${props.height}`;
        }
        
        if (props.colour || props.color) {
            const color = props.colour || props.color;
            label += `, ${color}`;
        }
        
        if (props.removable && props.removable === 'yes') {
            label += ', removable';
        }
        
        return label;
    }
    
    // Natural Features rendering methods
    renderWaterBodies(waterBodies, group) {
        waterBodies.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'water-body-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'water-body');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#4FC3F7');
                polygon.setAttribute('stroke', '#2196F3');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.7');
                featureGroup.appendChild(polygon);
            } else if (feature.geometry.type === 'MultiPolygon') {
                // Handle multipolygon water bodies
                feature.geometry.coordinates.forEach(polygonCoords => {
                    const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                    polygon.setAttribute('class', 'water-body');
                    polygon.setAttribute('points', this.polygonToSVG(polygonCoords[0]));
                    polygon.setAttribute('fill', '#4FC3F7');
                    polygon.setAttribute('stroke', '#2196F3');
                    polygon.setAttribute('stroke-width', '1');
                    polygon.setAttribute('opacity', '0.7');
                    featureGroup.appendChild(polygon);
                });
            } else if (feature.geometry.type === 'Point') {
                // Point geometry - water source marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'water-body');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '4');
                circle.setAttribute('fill', '#4FC3F7');
                circle.setAttribute('stroke', '#2196F3');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.7');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateWaterBodyLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderForests(forests, group) {
        forests.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'forest-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'forest');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#388E3C');
                polygon.setAttribute('stroke', '#2E7D32');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.6');
                featureGroup.appendChild(polygon);
            } else {
                // Point geometry - forest marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'forest');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '6');
                circle.setAttribute('fill', '#388E3C');
                circle.setAttribute('stroke', '#2E7D32');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.6');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateForestLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderWoods(woods, group) {
        woods.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'wood-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'wood');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#66BB6A');
                polygon.setAttribute('stroke', '#4CAF50');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.6');
                featureGroup.appendChild(polygon);
            } else {
                // Point geometry - wood marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'wood');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '5');
                circle.setAttribute('fill', '#66BB6A');
                circle.setAttribute('stroke', '#4CAF50');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.6');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateWoodLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderGrasslands(grasslands, group) {
        grasslands.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'grassland-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'grassland');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#8BC34A');
                polygon.setAttribute('stroke', '#689F38');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.5');
                featureGroup.appendChild(polygon);
            } else {
                // Point geometry - grassland marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'grassland');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '4');
                circle.setAttribute('fill', '#8BC34A');
                circle.setAttribute('stroke', '#689F38');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.5');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateGrasslandLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderBeaches(beaches, group) {
        beaches.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'beach-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'Polygon') {
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'beach');
                polygon.setAttribute('points', this.polygonToSVG(feature.geometry.coordinates[0]));
                polygon.setAttribute('fill', '#FFCC02');
                polygon.setAttribute('stroke', '#FFA000');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.6');
                featureGroup.appendChild(polygon);
            } else {
                // Point geometry - beach marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'beach');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '4');
                circle.setAttribute('fill', '#FFCC02');
                circle.setAttribute('stroke', '#FFA000');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.6');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateBeachLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCliffs(cliffs, group) {
        cliffs.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'cliff-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'cliff');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#8D6E63');
                polyline.setAttribute('stroke-width', '3');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('stroke-dasharray', '2,2');
                polyline.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - cliff marker
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'cliff');
                polygon.setAttribute('points', `${coords.x-3},${coords.y+3} ${coords.x+3},${coords.y+3} ${coords.x+3},${coords.y-1} ${coords.x-3},${coords.y-1}`);
                polygon.setAttribute('fill', '#8D6E63');
                polygon.setAttribute('stroke', '#5D4037');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polygon);
            }
            
            // Add label
            const label = this.generateCliffLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderPeaks(peaks, group) {
        peaks.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'peak-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'peak');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#795548');
                polyline.setAttribute('stroke-width', '2');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - peak marker (triangle)
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('class', 'peak');
                polygon.setAttribute('points', `${coords.x},${coords.y-4} ${coords.x-3},${coords.y+2} ${coords.x+3},${coords.y+2}`);
                polygon.setAttribute('fill', '#795548');
                polygon.setAttribute('stroke', '#5D4037');
                polygon.setAttribute('stroke-width', '1');
                polygon.setAttribute('opacity', '0.8');
                featureGroup.appendChild(polygon);
            }
            
            // Add label
            const label = this.generatePeakLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderTrees(trees, group) {
        trees.forEach((feature) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'tree-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (feature.geometry.type === 'LineString') {
                const polyline = document.createElementNS(this.SVG_NS, 'polyline');
                polyline.setAttribute('class', 'tree');
                polyline.setAttribute('points', this.lineToSVG(feature.geometry.coordinates));
                polyline.setAttribute('stroke', '#4CAF50');
                polyline.setAttribute('stroke-width', '2');
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('opacity', '0.7');
                featureGroup.appendChild(polyline);
            } else {
                // Point geometry - tree marker (circle)
                const coords = this.toSVGCoordinates(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                const circle = document.createElementNS(this.SVG_NS, 'circle');
                circle.setAttribute('class', 'tree');
                circle.setAttribute('cx', coords.x);
                circle.setAttribute('cy', coords.y);
                circle.setAttribute('r', '3');
                circle.setAttribute('fill', '#4CAF50');
                circle.setAttribute('stroke', '#388E3C');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('opacity', '0.7');
                featureGroup.appendChild(circle);
            }
            
            // Add label
            const label = this.generateTreeLabel(feature.properties);
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    // Natural Features label generation methods
    generateWaterBodyLabel(props) {
        let label = 'Water body';
        
        if (props.name) {
            label = props.name;
        } else if (props.water) {
            label = `${props.water} water body`;
        }
        
        if (props.natural === 'water' && props.waterway) {
            label = `${props.waterway}`;
        }
        
        return label;
    }
    
    generateForestLabel(props) {
        let label = 'Forest';
        
        if (props.name) {
            label = props.name;
        }
        
        if (props.leaf_type) {
            label += `, ${props.leaf_type}`;
        }
        
        return label;
    }
    
    generateWoodLabel(props) {
        let label = 'Wood';
        
        if (props.name) {
            label = props.name;
        }
        
        if (props.leaf_type) {
            label += `, ${props.leaf_type}`;
        }
        
        return label;
    }
    
    generateGrasslandLabel(props) {
        let label = 'Grassland';
        
        if (props.name) {
            label = props.name;
        }
        
        return label;
    }
    
    generateBeachLabel(props) {
        let label = 'Beach';
        
        if (props.name) {
            label = props.name;
        }
        
        if (props.surface) {
            label += `, ${props.surface}`;
        }
        
        return label;
    }
    
    generateCliffLabel(props) {
        let label = 'Cliff';
        
        if (props.name) {
            label = props.name;
        }
        
        if (props.height) {
            label += `, height: ${props.height}`;
        }
        
        return label;
    }
    
    generatePeakLabel(props) {
        let label = 'Mountain peak';
        
        if (props.name) {
            label = props.name;
        }
        
        if (props.ele) {
            label += `, elevation: ${props.ele}m`;
        }
        
        return label;
    }
    
    generateTreeLabel(props) {
        let label = 'Tree';
        
        if (props.species) {
            label = props.species;
        }
        
        if (props.height) {
            label += `, height: ${props.height}`;
        }
        
        return label;
    }
    
    // Waterway rendering methods
    renderRivers(rivers, group) {
        if (!rivers) return;
        
        rivers.forEach((river) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'river-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (river.geometry.type === 'LineString') {
                const coordinates = river.geometry.coordinates;
                const points = this.lineToSVG(coordinates);
                
                const line = document.createElementNS(this.SVG_NS, 'polyline');
                line.setAttribute('points', points);
                line.setAttribute('class', 'river');
                line.setAttribute('fill', 'none');
                line.setAttribute('stroke', '#4fc3f7');
                line.setAttribute('stroke-width', '4');
                line.setAttribute('stroke-linecap', 'round');
                line.setAttribute('stroke-linejoin', 'round');
                
                featureGroup.appendChild(line);
            } else if (river.geometry.type === 'Polygon') {
                const coordinates = river.geometry.coordinates[0];
                const points = this.polygonToSVG(coordinates);
                
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('points', points);
                polygon.setAttribute('class', 'river');
                polygon.setAttribute('fill', '#4fc3f7');
                polygon.setAttribute('fill-opacity', '0.7');
                polygon.setAttribute('stroke', '#0288d1');
                polygon.setAttribute('stroke-width', '2');
                
                featureGroup.appendChild(polygon);
            } else if (river.geometry.type === 'MultiPolygon') {
                // Handle multipolygon rivers (like the Hudson)
                river.geometry.coordinates.forEach(polygonCoords => {
                    const coordinates = polygonCoords[0]; // Outer ring
                    const points = this.polygonToSVG(coordinates);
                    
                    const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                    polygon.setAttribute('points', points);
                    polygon.setAttribute('class', 'river');
                    polygon.setAttribute('fill', '#4fc3f7');
                    polygon.setAttribute('fill-opacity', '0.7');
                    polygon.setAttribute('stroke', '#0288d1');
                    polygon.setAttribute('stroke-width', '2');
                    
                    featureGroup.appendChild(polygon);
                });
            }
            
            const label = this.generateRiverLabel(river.properties || {});
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderStreams(streams, group) {
        if (!streams) return;
        
        streams.forEach((stream) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'stream-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (stream.geometry.type === 'LineString') {
                const coordinates = stream.geometry.coordinates;
                const points = this.lineToSVG(coordinates);
                
                const line = document.createElementNS(this.SVG_NS, 'polyline');
                line.setAttribute('points', points);
                line.setAttribute('class', 'stream');
                line.setAttribute('fill', 'none');
                line.setAttribute('stroke', '#81d4fa');
                line.setAttribute('stroke-width', '2');
                line.setAttribute('stroke-linecap', 'round');
                line.setAttribute('stroke-linejoin', 'round');
                
                featureGroup.appendChild(line);
            } else if (stream.geometry.type === 'Polygon') {
                const coordinates = stream.geometry.coordinates[0];
                const points = this.polygonToSVG(coordinates);
                
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('points', points);
                polygon.setAttribute('class', 'stream');
                polygon.setAttribute('fill', '#81d4fa');
                polygon.setAttribute('fill-opacity', '0.6');
                polygon.setAttribute('stroke', '#0288d1');
                polygon.setAttribute('stroke-width', '1');
                
                featureGroup.appendChild(polygon);
            }
            
            const label = this.generateStreamLabel(stream.properties || {});
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCanals(canals, group) {
        if (!canals) return;
        
        canals.forEach((canal) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'canal-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (canal.geometry.type === 'LineString') {
                const coordinates = canal.geometry.coordinates;
                const points = this.lineToSVG(coordinates);
                
                const line = document.createElementNS(this.SVG_NS, 'polyline');
                line.setAttribute('points', points);
                line.setAttribute('class', 'canal');
                line.setAttribute('fill', 'none');
                line.setAttribute('stroke', '#00bcd4');
                line.setAttribute('stroke-width', '3');
                line.setAttribute('stroke-linecap', 'square');
                line.setAttribute('stroke-dasharray', '10,5');
                
                featureGroup.appendChild(line);
            } else if (canal.geometry.type === 'Polygon') {
                const coordinates = canal.geometry.coordinates[0];
                const points = this.polygonToSVG(coordinates);
                
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('points', points);
                polygon.setAttribute('class', 'canal');
                polygon.setAttribute('fill', '#00bcd4');
                polygon.setAttribute('fill-opacity', '0.6');
                polygon.setAttribute('stroke', '#00838f');
                polygon.setAttribute('stroke-width', '2');
                
                featureGroup.appendChild(polygon);
            }
            
            const label = this.generateCanalLabel(canal.properties || {});
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderDitches(ditches, group) {
        if (!ditches) return;
        
        ditches.forEach((ditch) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'ditch-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (ditch.geometry.type === 'LineString') {
                const coordinates = ditch.geometry.coordinates;
                const points = this.lineToSVG(coordinates);
                
                const line = document.createElementNS(this.SVG_NS, 'polyline');
                line.setAttribute('points', points);
                line.setAttribute('class', 'ditch');
                line.setAttribute('fill', 'none');
                line.setAttribute('stroke', '#8bc34a');
                line.setAttribute('stroke-width', '1.5');
                line.setAttribute('stroke-linecap', 'round');
                line.setAttribute('stroke-dasharray', '3,2');
                
                featureGroup.appendChild(line);
            } else if (ditch.geometry.type === 'Polygon') {
                const coordinates = ditch.geometry.coordinates[0];
                const points = this.polygonToSVG(coordinates);
                
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('points', points);
                polygon.setAttribute('class', 'ditch');
                polygon.setAttribute('fill', '#8bc34a');
                polygon.setAttribute('fill-opacity', '0.4');
                polygon.setAttribute('stroke', '#689f38');
                polygon.setAttribute('stroke-width', '1');
                
                featureGroup.appendChild(polygon);
            }
            
            const label = this.generateDitchLabel(ditch.properties || {});
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    renderCoastlines(coastlines, group) {
        if (!coastlines) return;
        
        coastlines.forEach((coastline) => {
            const featureGroup = document.createElementNS(this.SVG_NS, 'g');
            featureGroup.setAttribute('class', 'coastline-feature');
            featureGroup.setAttribute('tabindex', '-1');
            
            if (coastline.geometry.type === 'LineString') {
                const coordinates = coastline.geometry.coordinates;
                const points = this.lineToSVG(coordinates);
                
                const line = document.createElementNS(this.SVG_NS, 'polyline');
                line.setAttribute('points', points);
                line.setAttribute('class', 'coastline');
                line.setAttribute('fill', 'none');
                line.setAttribute('stroke', '#2196f3');
                line.setAttribute('stroke-width', '8');
                line.setAttribute('stroke-linecap', 'round');
                line.setAttribute('stroke-linejoin', 'round');
                
                featureGroup.appendChild(line);
            } else if (coastline.geometry.type === 'Polygon') {
                const coordinates = coastline.geometry.coordinates[0];
                const points = this.polygonToSVG(coordinates);
                
                const polygon = document.createElementNS(this.SVG_NS, 'polygon');
                polygon.setAttribute('points', points);
                polygon.setAttribute('class', 'coastline');
                polygon.setAttribute('fill', '#f57c00');
                polygon.setAttribute('fill-opacity', '0.3');
                polygon.setAttribute('stroke', '#e65100');
                polygon.setAttribute('stroke-width', '2');
                
                featureGroup.appendChild(polygon);
            }
            
            const label = this.generateCoastlineLabel(coastline.properties || {});
            featureGroup.setAttribute('aria-label', label);
            
            group.appendChild(featureGroup);
        });
    }
    
    // Label generation methods for waterways
    generateRiverLabel(props) {
        let label = 'River';
        
        if (props.name) {
            label = `River: ${props.name}`;
        }
        
        if (props.width) {
            label += `, width: ${props.width}m`;
        }
        
        return label;
    }
    
    generateStreamLabel(props) {
        let label = 'Stream';
        
        if (props.name) {
            label = `Stream: ${props.name}`;
        }
        
        if (props.width) {
            label += `, width: ${props.width}m`;
        }
        
        return label;
    }
    
    generateCanalLabel(props) {
        let label = 'Canal';
        
        if (props.name) {
            label = `Canal: ${props.name}`;
        }
        
        if (props.usage) {
            label += `, usage: ${props.usage}`;
        }
        
        return label;
    }
    
    generateDitchLabel(props) {
        let label = 'Ditch';
        
        if (props.name) {
            label = `Ditch: ${props.name}`;
        }
        
        return label;
    }
    
    generateCoastlineLabel(props) {
        let label = 'Coastline';
        
        if (props.name) {
            label = `Coastline: ${props.name}`;
        }
        
        return label;
    }
}