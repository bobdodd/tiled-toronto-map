export class OSMDataFetcher {
    constructor() {
        this.overpassUrl = 'https://overpass-api.de/api/interpreter';
        this.cache = new Map();
    }
    
    async fetchArea(bounds) {
        const cacheKey = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
        
        // Overpass QL query
        const query = `
            [out:json][timeout:25];
            (
                // Buildings
                way["building"](${bbox});
                relation["building"](${bbox});
                
                // Roads
                way["highway"~"^(primary|secondary|tertiary|residential|service|unclassified|pedestrian|footway)$"](${bbox});
                
                // Transit stops
                node["highway"="bus_stop"](${bbox});
                node["railway"="tram_stop"](${bbox});
                node["railway"="station"](${bbox});
                node["railway"="subway_entrance"](${bbox});
                
                // Shops
                node["shop"](${bbox});
                way["shop"](${bbox});
                
                // Schools
                node["amenity"="school"](${bbox});
                way["amenity"="school"](${bbox});
                relation["amenity"="school"](${bbox});
                
                // Places of worship
                node["amenity"="place_of_worship"](${bbox});
                way["amenity"="place_of_worship"](${bbox});
                
                // Healthcare facilities
                node["amenity"="hospital"](${bbox});
                way["amenity"="hospital"](${bbox});
                relation["amenity"="hospital"](${bbox});
                node["amenity"="clinic"](${bbox});
                way["amenity"="clinic"](${bbox});
                node["amenity"="doctors"](${bbox});
                way["amenity"="doctors"](${bbox});
                node["amenity"="dentist"](${bbox});
                way["amenity"="dentist"](${bbox});
                node["amenity"="pharmacy"](${bbox});
                way["amenity"="pharmacy"](${bbox});
                node["amenity"="veterinary"](${bbox});
                way["amenity"="veterinary"](${bbox});
                node["healthcare"](${bbox});
                way["healthcare"](${bbox});
                
                // Parks and recreation
                way["leisure"~"^(park|playground|garden|sports_centre|pitch)$"](${bbox});
                relation["leisure"~"^(park|playground|garden)$"](${bbox});
                
                // Address points
                node["addr:housenumber"](${bbox});
                
                // Accessibility features
                // Public facilities
                node["amenity"="toilets"](${bbox});
                node["amenity"="parking"]["wheelchair"="yes"](${bbox});
                way["amenity"="parking"]["wheelchair"="yes"](${bbox});
                node["amenity"="drinking_water"](${bbox});
                node["amenity"="bench"](${bbox});
                way["amenity"="shelter"](${bbox});
                node["amenity"="shelter"](${bbox});
                
                // Navigation & mobility
                node["highway"="crossing"](${bbox});
                node["barrier"="kerb"](${bbox});
                node["highway"="elevator"](${bbox});
                way["highway"="steps"](${bbox});
                node["highway"="steps"](${bbox});
                way["tactile_paving"="yes"](${bbox});
                node["tactile_paving"="yes"](${bbox});
                
                // Audio & visual aids
                node["traffic_signals:sound"="yes"](${bbox});
                node["information"="tactile_map"](${bbox});
                node["amenity"="clock"]["display"="digital"](${bbox});
                node["tourism"="information"](${bbox});
                
                // Emergency & safety
                node["emergency"="phone"](${bbox});
                node["emergency"="defibrillator"](${bbox});
                node["amenity"="hospital"]["wheelchair"="yes"](${bbox});
                way["amenity"="hospital"]["wheelchair"="yes"](${bbox});
                node["barrier"="bollard"](${bbox});
                way["barrier"="fence"](${bbox});
                way["barrier"="wall"](${bbox});
                
                // Transportation Infrastructure
                // Railway systems
                way["railway"="rail"](${bbox});
                way["railway"="subway"](${bbox});
                way["railway"="tram"](${bbox});
                way["railway"="light_rail"](${bbox});
                way["railway"="monorail"](${bbox});
                
                // Airport facilities
                way["aeroway"="runway"](${bbox});
                way["aeroway"="taxiway"](${bbox});
                node["aeroway"="terminal"](${bbox});
                way["aeroway"="terminal"](${bbox});
                relation["aeroway"="terminal"](${bbox});
                
                // Enhanced highways
                way["highway"="motorway"](${bbox});
                way["highway"="trunk"](${bbox});
                way["highway"="motorway_link"](${bbox});
                way["highway"="trunk_link"](${bbox});
                
                // Transit platforms
                node["public_transport"="platform"](${bbox});
                way["public_transport"="platform"](${bbox});
                node["railway"="platform"](${bbox});
                way["railway"="platform"](${bbox});
                
                // Financial Services
                node["amenity"="bank"](${bbox});
                way["amenity"="bank"](${bbox});
                relation["amenity"="bank"](${bbox});
                node["amenity"="atm"](${bbox});
                node["amenity"="post_office"](${bbox});
                way["amenity"="post_office"](${bbox});
                relation["amenity"="post_office"](${bbox});
                node["amenity"="bureau_de_change"](${bbox});
                way["amenity"="bureau_de_change"](${bbox});
                
                // Sustenance & Food
                node["amenity"="restaurant"](${bbox});
                way["amenity"="restaurant"](${bbox});
                relation["amenity"="restaurant"](${bbox});
                node["amenity"="cafe"](${bbox});
                way["amenity"="cafe"](${bbox});
                node["amenity"="fast_food"](${bbox});
                way["amenity"="fast_food"](${bbox});
                node["amenity"="bar"](${bbox});
                way["amenity"="bar"](${bbox});
                node["amenity"="pub"](${bbox});
                way["amenity"="pub"](${bbox});
                node["amenity"="food_court"](${bbox});
                way["amenity"="food_court"](${bbox});
                
                // Accommodation & Tourism
                node["tourism"="hotel"](${bbox});
                way["tourism"="hotel"](${bbox});
                relation["tourism"="hotel"](${bbox});
                node["tourism"="hostel"](${bbox});
                way["tourism"="hostel"](${bbox});
                node["tourism"="guest_house"](${bbox});
                way["tourism"="guest_house"](${bbox});
                node["tourism"="camp_site"](${bbox});
                way["tourism"="camp_site"](${bbox});
                relation["tourism"="camp_site"](${bbox});
                node["tourism"="attraction"](${bbox});
                way["tourism"="attraction"](${bbox});
                relation["tourism"="attraction"](${bbox});
                node["tourism"="museum"](${bbox});
                way["tourism"="museum"](${bbox});
                relation["tourism"="museum"](${bbox});
                node["tourism"="gallery"](${bbox});
                way["tourism"="gallery"](${bbox});
                node["tourism"="viewpoint"](${bbox});
                node["tourism"="information"](${bbox});
                way["tourism"="information"](${bbox});
                
                // Entertainment & Culture
                node["amenity"="cinema"](${bbox});
                way["amenity"="cinema"](${bbox});
                relation["amenity"="cinema"](${bbox});
                node["amenity"="theatre"](${bbox});
                way["amenity"="theatre"](${bbox});
                relation["amenity"="theatre"](${bbox});
                node["amenity"="library"](${bbox});
                way["amenity"="library"](${bbox});
                relation["amenity"="library"](${bbox});
                node["amenity"="community_centre"](${bbox});
                way["amenity"="community_centre"](${bbox});
                relation["amenity"="community_centre"](${bbox});
                node["amenity"="arts_centre"](${bbox});
                way["amenity"="arts_centre"](${bbox});
                relation["amenity"="arts_centre"](${bbox});
                node["leisure"="sports_centre"](${bbox});
                way["leisure"="sports_centre"](${bbox});
                relation["leisure"="sports_centre"](${bbox});
                node["leisure"="swimming_pool"](${bbox});
                way["leisure"="swimming_pool"](${bbox});
                relation["leisure"="swimming_pool"](${bbox});
                node["leisure"="golf_course"](${bbox});
                way["leisure"="golf_course"](${bbox});
                relation["leisure"="golf_course"](${bbox});
                node["leisure"="stadium"](${bbox});
                way["leisure"="stadium"](${bbox});
                relation["leisure"="stadium"](${bbox});
                
                // Emergency Services
                node["amenity"="police"](${bbox});
                way["amenity"="police"](${bbox});
                relation["amenity"="police"](${bbox});
                node["amenity"="fire_station"](${bbox});
                way["amenity"="fire_station"](${bbox});
                relation["amenity"="fire_station"](${bbox});
                node["emergency"="phone"](${bbox});
                node["emergency"="defibrillator"](${bbox});
                
                // Historic Features
                node["historic"="monument"](${bbox});
                way["historic"="monument"](${bbox});
                relation["historic"="monument"](${bbox});
                node["historic"="memorial"](${bbox});
                way["historic"="memorial"](${bbox});
                relation["historic"="memorial"](${bbox});
                node["historic"="archaeological_site"](${bbox});
                way["historic"="archaeological_site"](${bbox});
                relation["historic"="archaeological_site"](${bbox});
                node["historic"="castle"](${bbox});
                way["historic"="castle"](${bbox});
                relation["historic"="castle"](${bbox});
                node["historic"="ruins"](${bbox});
                way["historic"="ruins"](${bbox});
                relation["historic"="ruins"](${bbox});
                
                // Man-made Structures
                node["man_made"="bridge"](${bbox});
                way["man_made"="bridge"](${bbox});
                relation["man_made"="bridge"](${bbox});
                node["man_made"="tunnel"](${bbox});
                way["man_made"="tunnel"](${bbox});
                relation["man_made"="tunnel"](${bbox});
                node["man_made"="tower"](${bbox});
                way["man_made"="tower"](${bbox});
                relation["man_made"="tower"](${bbox});
                node["man_made"="mast"](${bbox});
                way["man_made"="mast"](${bbox});
                relation["man_made"="mast"](${bbox});
                node["man_made"="pier"](${bbox});
                way["man_made"="pier"](${bbox});
                relation["man_made"="pier"](${bbox});
                node["man_made"="breakwater"](${bbox});
                way["man_made"="breakwater"](${bbox});
                relation["man_made"="breakwater"](${bbox});
            );
            out body;
            >;
            out skel qt;
        `;
        
        try {
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Overpass API error: ${response.status}`);
            }
            
            const data = await response.json();
            const features = this.convertToGeoJSON(data);
            
            // Cache the result
            this.cache.set(cacheKey, features);
            
            return features;
        } catch (error) {
            console.error('Error fetching OSM data:', error);
            return {
                buildings: [],
                roads: [],
                transitStops: [],
                shops: [],
                schools: [],
                worship: [],
                parks: [],
                addresses: [],
                // Healthcare features
                hospitals: [],
                clinics: [],
                doctors: [],
                dentists: [],
                pharmacies: [],
                veterinary: [],
                // Accessibility features
                accessibleToilets: [],
                accessibleParking: [],
                drinkingWater: [],
                benches: [],
                shelters: [],
                crossings: [],
                curbCuts: [],
                elevators: [],
                steps: [],
                tactilePaving: [],
                audioSignals: [],
                tactileMaps: [],
                digitalClocks: [],
                infoPoints: [],
                emergencyPhones: [],
                defibrillators: [],
                accessibleMedical: [],
                barriers: [],
                // Transportation Infrastructure
                railways: [],
                airports: [],
                enhancedHighways: [],
                transitPlatforms: [],
                // Financial Services
                banks: [],
                atms: [],
                postOffices: [],
                currencyExchange: [],
                // Sustenance & Food
                restaurants: [],
                cafes: [],
                fastFood: [],
                bars: [],
                pubs: [],
                foodCourts: [],
                // Accommodation & Tourism
                hotels: [],
                hostels: [],
                guestHouses: [],
                campsites: [],
                attractions: [],
                museums: [],
                galleries: [],
                viewpoints: [],
                touristInfo: [],
                // Entertainment & Culture
                cinemas: [],
                theatres: [],
                libraries: [],
                communityCentres: [],
                artsCentres: [],
                sportsCentres: [],
                swimmingPools: [],
                golfCourses: [],
                stadiums: [],
                // Emergency Services
                policeStations: [],
                fireStations: [],
                emergencyPhones: [],
                emergencyDefibrillators: [],
                // Historic Features
                monuments: [],
                memorials: [],
                archaeologicalSites: [],
                castles: [],
                ruins: [],
                // Man-made Structures
                bridges: [],
                tunnels: [],
                towers: [],
                masts: [],
                piers: [],
                breakwaters: []
            };
        }
    }
    
    convertToGeoJSON(osmData) {
        const features = {
            buildings: [],
            roads: [],
            transitStops: [],
            shops: [],
            schools: [],
            worship: [],
            parks: [],
            addresses: [],
            // Healthcare features
            hospitals: [],
            clinics: [],
            doctors: [],
            dentists: [],
            pharmacies: [],
            veterinary: [],
            // Accessibility features
            accessibleToilets: [],
            accessibleParking: [],
            drinkingWater: [],
            benches: [],
            shelters: [],
            crossings: [],
            curbCuts: [],
            elevators: [],
            steps: [],
            tactilePaving: [],
            audioSignals: [],
            tactileMaps: [],
            digitalClocks: [],
            infoPoints: [],
            emergencyPhones: [],
            defibrillators: [],
            accessibleMedical: [],
            barriers: [],
            // Transportation Infrastructure
            railways: [],
            airports: [],
            enhancedHighways: [],
            transitPlatforms: [],
            // Financial Services
            banks: [],
            atms: [],
            postOffices: [],
            currencyExchange: [],
            // Sustenance & Food
            restaurants: [],
            cafes: [],
            fastFood: [],
            bars: [],
            pubs: [],
            foodCourts: [],
            // Accommodation & Tourism
            hotels: [],
            hostels: [],
            guestHouses: [],
            campsites: [],
            attractions: [],
            museums: [],
            galleries: [],
            viewpoints: [],
            touristInfo: [],
            // Entertainment & Culture
            cinemas: [],
            theatres: [],
            libraries: [],
            communityCentres: [],
            artsCentres: [],
            sportsCentres: [],
            swimmingPools: [],
            golfCourses: [],
            stadiums: [],
            // Emergency Services
            policeStations: [],
            fireStations: [],
            emergencyPhones: [],
            emergencyDefibrillators: [],
            // Historic Features
            monuments: [],
            memorials: [],
            archaeologicalSites: [],
            castles: [],
            ruins: [],
            // Man-made Structures
            bridges: [],
            tunnels: [],
            towers: [],
            masts: [],
            piers: [],
            breakwaters: []
        };
        
        // Create a map of nodes for reference
        const nodes = new Map();
        osmData.elements.filter(e => e.type === 'node').forEach(node => {
            nodes.set(node.id, node);
        });
        
        // Process each element
        osmData.elements.forEach(element => {
            if (element.type === 'node') {
                this.processNode(element, features);
            } else if (element.type === 'way') {
                this.processWay(element, nodes, features);
            } else if (element.type === 'relation') {
                this.processRelation(element, nodes, features);
            }
        });
        
        return features;
    }
    
    processNode(node, features) {
        const tags = node.tags || {};
        
        // Transit stops
        if (tags.highway === 'bus_stop' || tags.railway === 'tram_stop' || 
            tags.railway === 'station' || tags.railway === 'subway_entrance') {
            features.transitStops.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Shops
        if (tags.shop) {
            features.shops.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Schools
        if (tags.amenity === 'school') {
            features.schools.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Places of worship
        if (tags.amenity === 'place_of_worship') {
            features.worship.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Healthcare facilities
        if (tags.amenity === 'hospital') {
            features.hospitals.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'clinic') {
            features.clinics.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'doctors') {
            features.doctors.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'dentist') {
            features.dentists.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'pharmacy') {
            features.pharmacies.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'veterinary') {
            features.veterinary.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Addresses
        if (tags['addr:housenumber']) {
            features.addresses.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Accessibility features
        if (tags.amenity === 'toilets') {
            features.accessibleToilets.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'parking' && tags.wheelchair === 'yes') {
            features.accessibleParking.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'drinking_water') {
            features.drinkingWater.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'bench') {
            features.benches.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'shelter') {
            features.shelters.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.highway === 'crossing') {
            features.crossings.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.barrier === 'kerb') {
            features.curbCuts.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.highway === 'elevator') {
            features.elevators.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.highway === 'steps') {
            features.steps.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tactile_paving === 'yes') {
            features.tactilePaving.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags['traffic_signals:sound'] === 'yes') {
            features.audioSignals.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.information === 'tactile_map') {
            features.tactileMaps.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'clock' && tags.display === 'digital') {
            features.digitalClocks.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'information') {
            features.infoPoints.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.emergency === 'phone') {
            features.emergencyPhones.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.emergency === 'defibrillator') {
            features.defibrillators.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'hospital' && tags.wheelchair === 'yes') {
            features.accessibleMedical.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.barrier === 'bollard') {
            features.barriers.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Transportation Infrastructure nodes
        if (tags.aeroway === 'terminal') {
            features.airports.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.public_transport === 'platform' || tags.railway === 'platform') {
            features.transitPlatforms.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Financial Services nodes
        if (tags.amenity === 'bank') {
            features.banks.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'atm') {
            features.atms.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'post_office') {
            features.postOffices.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'bureau_de_change') {
            features.currencyExchange.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Sustenance & Food nodes
        if (tags.amenity === 'restaurant') {
            features.restaurants.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'cafe') {
            features.cafes.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'fast_food') {
            features.fastFood.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'bar') {
            features.bars.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'pub') {
            features.pubs.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'food_court') {
            features.foodCourts.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Accommodation & Tourism nodes
        if (tags.tourism === 'hotel') {
            features.hotels.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'hostel') {
            features.hostels.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'guest_house') {
            features.guestHouses.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'camp_site') {
            features.campsites.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'attraction') {
            features.attractions.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'museum') {
            features.museums.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'gallery') {
            features.galleries.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'viewpoint') {
            features.viewpoints.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.tourism === 'information') {
            features.touristInfo.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Entertainment & Culture features
        if (tags.amenity === 'cinema') {
            features.cinemas.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'theatre') {
            features.theatres.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'library') {
            features.libraries.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'community_centre') {
            features.communityCentres.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'arts_centre') {
            features.artsCentres.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.leisure === 'sports_centre') {
            features.sportsCentres.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.leisure === 'swimming_pool') {
            features.swimmingPools.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.leisure === 'golf_course') {
            features.golfCourses.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.leisure === 'stadium') {
            features.stadiums.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Emergency Services
        if (tags.amenity === 'police') {
            features.policeStations.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'fire_station') {
            features.fireStations.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.emergency === 'phone') {
            features.emergencyPhones.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.emergency === 'defibrillator') {
            features.emergencyDefibrillators.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Historic Features
        if (tags.historic === 'monument') {
            features.monuments.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.historic === 'memorial') {
            features.memorials.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.historic === 'archaeological_site') {
            features.archaeologicalSites.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.historic === 'castle') {
            features.castles.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.historic === 'ruins') {
            features.ruins.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        // Man-made Structures
        if (tags.man_made === 'bridge') {
            features.bridges.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.man_made === 'tunnel') {
            features.tunnels.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.man_made === 'tower') {
            features.towers.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.man_made === 'mast') {
            features.masts.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.man_made === 'pier') {
            features.piers.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
        
        if (tags.man_made === 'breakwater') {
            features.breakwaters.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat]
                },
                properties: tags
            });
        }
    }
    
    processWay(way, nodes, features) {
        const tags = way.tags || {};
        
        // Get coordinates
        const coordinates = way.nodes.map(nodeId => {
            const node = nodes.get(nodeId);
            return node ? [node.lon, node.lat] : null;
        }).filter(coord => coord !== null);
        
        if (coordinates.length < 2) return;
        
        // Buildings
        if (tags.building && coordinates.length >= 3) {
            // Ensure polygon is closed
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            // Check if this is a reasonable building size
            // Calculate rough bounding box
            let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
            closedCoords.forEach(coord => {
                minLat = Math.min(minLat, coord[1]);
                maxLat = Math.max(maxLat, coord[1]);
                minLng = Math.min(minLng, coord[0]);
                maxLng = Math.max(maxLng, coord[0]);
            });
            
            // If the building spans more than 0.01 degrees (about 1km), skip it
            const latSpan = maxLat - minLat;
            const lngSpan = maxLng - minLng;
            
            if (latSpan < 0.01 && lngSpan < 0.01) {
                features.buildings.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else {
                console.warn('Skipping large building:', tags.name || 'unnamed', latSpan, lngSpan);
            }
        }
        
        // Roads
        if (tags.highway) {
            features.roads.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: tags
            });
        }
        
        // Parks
        if (tags.leisure && coordinates.length >= 3) {
            // Ensure polygon is closed
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            // Check size
            let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
            closedCoords.forEach(coord => {
                minLat = Math.min(minLat, coord[1]);
                maxLat = Math.max(maxLat, coord[1]);
                minLng = Math.min(minLng, coord[0]);
                maxLng = Math.max(maxLng, coord[0]);
            });
            
            const latSpan = maxLat - minLat;
            const lngSpan = maxLng - minLng;
            
            if (latSpan < 0.05 && lngSpan < 0.05) { // Parks can be larger than buildings
                features.parks.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Shops (polygon)
        if (tags.shop && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            features.shops.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                },
                properties: tags
            });
        }
        
        // Schools (polygon)
        if (tags.amenity === 'school' && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            features.schools.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                },
                properties: tags
            });
        }
        
        // Places of worship (polygon)
        if (tags.amenity === 'place_of_worship' && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            features.worship.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                },
                properties: tags
            });
        }
        
        // Healthcare facilities (polygon)
        if ((tags.amenity === 'hospital' || tags.amenity === 'clinic' || 
             tags.amenity === 'doctors' || tags.amenity === 'dentist' || 
             tags.amenity === 'pharmacy' || tags.amenity === 'veterinary') && 
            coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            // Determine which healthcare category to add to
            if (tags.amenity === 'hospital') {
                features.hospitals.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'clinic') {
                features.clinics.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'doctors') {
                features.doctors.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'dentist') {
                features.dentists.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'pharmacy') {
                features.pharmacies.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'veterinary') {
                features.veterinary.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Accessibility features (ways)
        if (tags.amenity === 'parking' && tags.wheelchair === 'yes' && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            features.accessibleParking.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'shelter' && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            features.shelters.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                },
                properties: tags
            });
        }
        
        if (tags.highway === 'steps') {
            features.steps.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: tags
            });
        }
        
        if (tags.tactile_paving === 'yes') {
            features.tactilePaving.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: tags
            });
        }
        
        if (tags.amenity === 'hospital' && tags.wheelchair === 'yes' && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            features.accessibleMedical.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                },
                properties: tags
            });
        }
        
        if (tags.barrier === 'fence' || tags.barrier === 'wall') {
            features.barriers.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: tags
            });
        }
        
        // Transportation Infrastructure (ways)
        // Railway systems
        if (tags.railway === 'rail' || tags.railway === 'subway' || tags.railway === 'tram' || 
            tags.railway === 'light_rail' || tags.railway === 'monorail') {
            features.railways.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: tags
            });
        }
        
        // Airport facilities
        if (tags.aeroway === 'runway' || tags.aeroway === 'taxiway') {
            features.airports.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: tags
            });
        }
        
        if (tags.aeroway === 'terminal' && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            features.airports.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                },
                properties: tags
            });
        }
        
        // Enhanced highways (motorways and trunk roads)
        if (tags.highway === 'motorway' || tags.highway === 'trunk' || 
            tags.highway === 'motorway_link' || tags.highway === 'trunk_link') {
            features.enhancedHighways.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: tags
            });
        }
        
        // Transit platforms
        if (tags.public_transport === 'platform' || tags.railway === 'platform') {
            if (coordinates.length >= 3) {
                const closedCoords = [...coordinates];
                if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                    closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                    closedCoords.push(closedCoords[0]);
                }
                features.transitPlatforms.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else {
                features.transitPlatforms.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    },
                    properties: tags
                });
            }
        }
        
        // Financial Services (ways)
        if ((tags.amenity === 'bank' || tags.amenity === 'post_office' || 
             tags.amenity === 'bureau_de_change') && coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            // Determine which financial service category to add to
            if (tags.amenity === 'bank') {
                features.banks.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'post_office') {
                features.postOffices.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'bureau_de_change') {
                features.currencyExchange.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Sustenance & Food (ways)
        if ((tags.amenity === 'restaurant' || tags.amenity === 'cafe' || 
             tags.amenity === 'fast_food' || tags.amenity === 'bar' || 
             tags.amenity === 'pub' || tags.amenity === 'food_court') && 
            coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            // Determine which sustenance category to add to
            if (tags.amenity === 'restaurant') {
                features.restaurants.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'cafe') {
                features.cafes.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'fast_food') {
                features.fastFood.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'bar') {
                features.bars.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'pub') {
                features.pubs.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'food_court') {
                features.foodCourts.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Accommodation & Tourism (ways)
        if ((tags.tourism === 'hotel' || tags.tourism === 'hostel' || 
             tags.tourism === 'guest_house' || tags.tourism === 'camp_site' || 
             tags.tourism === 'attraction' || tags.tourism === 'museum' || 
             tags.tourism === 'gallery' || tags.tourism === 'information') && 
            coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            // Determine which tourism category to add to
            if (tags.tourism === 'hotel') {
                features.hotels.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.tourism === 'hostel') {
                features.hostels.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.tourism === 'guest_house') {
                features.guestHouses.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.tourism === 'camp_site') {
                features.campsites.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.tourism === 'attraction') {
                features.attractions.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.tourism === 'museum') {
                features.museums.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.tourism === 'gallery') {
                features.galleries.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.tourism === 'information') {
                features.touristInfo.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Entertainment & Culture (ways)
        if ((tags.amenity === 'cinema' || tags.amenity === 'theatre' || 
             tags.amenity === 'library' || tags.amenity === 'community_centre' || 
             tags.amenity === 'arts_centre' || tags.leisure === 'sports_centre' || 
             tags.leisure === 'swimming_pool' || tags.leisure === 'golf_course' || 
             tags.leisure === 'stadium') && 
            coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            // Determine which entertainment category to add to
            if (tags.amenity === 'cinema') {
                features.cinemas.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'theatre') {
                features.theatres.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'library') {
                features.libraries.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'community_centre') {
                features.communityCentres.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'arts_centre') {
                features.artsCentres.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.leisure === 'sports_centre') {
                features.sportsCentres.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.leisure === 'swimming_pool') {
                features.swimmingPools.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.leisure === 'golf_course') {
                features.golfCourses.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.leisure === 'stadium') {
                features.stadiums.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Emergency Services (ways)
        if ((tags.amenity === 'police' || tags.amenity === 'fire_station') && 
            coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            if (tags.amenity === 'police') {
                features.policeStations.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.amenity === 'fire_station') {
                features.fireStations.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Historic Features (ways)
        if ((tags.historic === 'monument' || tags.historic === 'memorial' || 
             tags.historic === 'archaeological_site' || tags.historic === 'castle' || 
             tags.historic === 'ruins') && 
            coordinates.length >= 3) {
            const closedCoords = [...coordinates];
            if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                closedCoords.push(closedCoords[0]);
            }
            
            if (tags.historic === 'monument') {
                features.monuments.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.historic === 'memorial') {
                features.memorials.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.historic === 'archaeological_site') {
                features.archaeologicalSites.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.historic === 'castle') {
                features.castles.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            } else if (tags.historic === 'ruins') {
                features.ruins.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closedCoords]
                    },
                    properties: tags
                });
            }
        }
        
        // Man-made Structures (ways)
        if ((tags.man_made === 'bridge' || tags.man_made === 'tunnel' || 
             tags.man_made === 'tower' || tags.man_made === 'mast' || 
             tags.man_made === 'pier' || tags.man_made === 'breakwater') && 
            coordinates.length >= 2) {
            
            // Handle different geometry types for man-made structures
            let geometry;
            if (coordinates.length >= 3 && 
                (tags.man_made === 'bridge' || tags.man_made === 'tower' || 
                 tags.man_made === 'pier' || tags.man_made === 'breakwater')) {
                // Polygon for larger structures
                const closedCoords = [...coordinates];
                if (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
                    closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1]) {
                    closedCoords.push(closedCoords[0]);
                }
                geometry = {
                    type: 'Polygon',
                    coordinates: [closedCoords]
                };
            } else {
                // LineString for linear structures
                geometry = {
                    type: 'LineString',
                    coordinates: coordinates
                };
            }
            
            if (tags.man_made === 'bridge') {
                features.bridges.push({
                    type: 'Feature',
                    geometry: geometry,
                    properties: tags
                });
            } else if (tags.man_made === 'tunnel') {
                features.tunnels.push({
                    type: 'Feature',
                    geometry: geometry,
                    properties: tags
                });
            } else if (tags.man_made === 'tower') {
                features.towers.push({
                    type: 'Feature',
                    geometry: geometry,
                    properties: tags
                });
            } else if (tags.man_made === 'mast') {
                features.masts.push({
                    type: 'Feature',
                    geometry: geometry,
                    properties: tags
                });
            } else if (tags.man_made === 'pier') {
                features.piers.push({
                    type: 'Feature',
                    geometry: geometry,
                    properties: tags
                });
            } else if (tags.man_made === 'breakwater') {
                features.breakwaters.push({
                    type: 'Feature',
                    geometry: geometry,
                    properties: tags
                });
            }
        }
    }
    
    processRelation(relation, nodes, features) {
        const tags = relation.tags || {};
        
        // Handle man-made structure relations
        if (tags.man_made === 'bridge' || tags.man_made === 'tunnel') {
            // For now, create a representative point from the first member
            if (relation.members && relation.members.length > 0) {
                const firstMember = relation.members[0];
                if (firstMember.type === 'node' && nodes.has(firstMember.ref)) {
                    const node = nodes.get(firstMember.ref);
                    
                    if (tags.man_made === 'bridge') {
                        features.bridges.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [node.lon, node.lat]
                            },
                            properties: { ...tags, _relation: true }
                        });
                    } else if (tags.man_made === 'tunnel') {
                        features.tunnels.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [node.lon, node.lat]
                            },
                            properties: { ...tags, _relation: true }
                        });
                    }
                }
            }
        }
        
        // Handle other relation types for historic features that might have complex geometries
        if (tags.historic) {
            if (relation.members && relation.members.length > 0) {
                const firstMember = relation.members[0];
                if (firstMember.type === 'node' && nodes.has(firstMember.ref)) {
                    const node = nodes.get(firstMember.ref);
                    
                    if (tags.historic === 'monument') {
                        features.monuments.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [node.lon, node.lat]
                            },
                            properties: { ...tags, _relation: true }
                        });
                    } else if (tags.historic === 'memorial') {
                        features.memorials.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [node.lon, node.lat]
                            },
                            properties: { ...tags, _relation: true }
                        });
                    } else if (tags.historic === 'archaeological_site') {
                        features.archaeologicalSites.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [node.lon, node.lat]
                            },
                            properties: { ...tags, _relation: true }
                        });
                    } else if (tags.historic === 'castle') {
                        features.castles.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [node.lon, node.lat]
                            },
                            properties: { ...tags, _relation: true }
                        });
                    } else if (tags.historic === 'ruins') {
                        features.ruins.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [node.lon, node.lat]
                            },
                            properties: { ...tags, _relation: true }
                        });
                    }
                }
            }
        }
    }
    
    getBoundsFromView(center, zoom, width, height) {
        // Calculate bounds from center, zoom, and viewport size
        const scale = Math.pow(2, zoom);
        const worldWidth = 256 * scale;
        
        const dx = width / 2 / worldWidth * 360;
        const dy = height / 2 / worldWidth * 180;
        
        return {
            north: Math.min(85, center.lat + dy),
            south: Math.max(-85, center.lat - dy),
            east: center.lng + dx,
            west: center.lng - dx
        };
    }
}