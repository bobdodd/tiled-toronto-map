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
            addresses: this.createGroup('addresses-group', 'Addresses')
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
}