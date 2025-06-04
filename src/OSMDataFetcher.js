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
                
                // Parks and recreation
                way["leisure"~"^(park|playground|garden|sports_centre|pitch)$"](${bbox});
                relation["leisure"~"^(park|playground|garden)$"](${bbox});
                
                // Address points
                node["addr:housenumber"](${bbox});
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
                addresses: []
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
            addresses: []
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
        if (tags.building) {
            features.buildings.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                },
                properties: tags
            });
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
        if (tags.leisure) {
            features.parks.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                },
                properties: tags
            });
        }
        
        // Shops (polygon)
        if (tags.shop) {
            features.shops.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                },
                properties: tags
            });
        }
        
        // Schools (polygon)
        if (tags.amenity === 'school') {
            features.schools.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                },
                properties: tags
            });
        }
        
        // Places of worship (polygon)
        if (tags.amenity === 'place_of_worship') {
            features.worship.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
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