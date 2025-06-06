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
                barriers: []
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
            barriers: []
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
                // Handle relations if needed
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