export class FeatureRenderer {
    constructor(mapRenderer) {
        this.mapRenderer = mapRenderer;
        this.SVG_NS = 'http://www.w3.org/2000/svg';
    }
    
    renderFeatures(features) {
        const featuresGroup = document.querySelector('#map-features');
        
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
        this.renderShops(features.shops, groups.shops);
        this.renderSchools(features.schools, groups.schools);
        this.renderWorship(features.worship, groups.worship);
        this.renderParks(features.parks, groups.parks);
        this.renderAddresses(features.addresses, groups.addresses);
    }
    
    createGroup(id, label) {
        const group = document.createElementNS(this.SVG_NS, 'g');
        group.setAttribute('id', id);
        group.setAttribute('aria-label', label);
        return group;
    }
    
    renderBuildings(buildings, group) {
        buildings.forEach(feature => {
            const polygon = this.createPolygon(feature, 'building');
            const label = this.generateBuildingLabel(feature.properties);
            polygon.setAttribute('aria-label', label);
            polygon.setAttribute('fill', '#d4d4d4');
            polygon.setAttribute('stroke', '#999');
            polygon.setAttribute('stroke-width', '1');
            group.appendChild(polygon);
        });
    }
    
    renderRoads(roads, group) {
        roads.forEach(feature => {
            const polyline = this.createPolyline(feature, 'road');
            const label = this.generateRoadLabel(feature.properties);
            polyline.setAttribute('aria-label', label);
            polyline.setAttribute('fill', 'none');
            polyline.setAttribute('stroke', '#333');
            polyline.setAttribute('stroke-width', this.getRoadWidth(feature.properties.highway));
            group.appendChild(polyline);
        });
    }
    
    renderTransitStops(stops, group) {
        stops.forEach(feature => {
            const circle = this.createCircle(feature, 'transit-stop');
            const label = this.generateTransitLabel(feature.properties);
            circle.setAttribute('aria-label', label);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', '#ff9800');
            circle.setAttribute('stroke-width', '3');
            circle.setAttribute('r', '8');
            group.appendChild(circle);
        });
    }
    
    renderShops(shops, group) {
        shops.forEach(feature => {
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'shop');
                const label = this.generateShopLabel(feature.properties);
                circle.setAttribute('aria-label', label);
                circle.setAttribute('fill', 'none');
                circle.setAttribute('stroke', '#e91e63');
                circle.setAttribute('stroke-width', '3');
                circle.setAttribute('r', '6');
                group.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'shop');
                const label = this.generateShopLabel(feature.properties);
                polygon.setAttribute('aria-label', label);
                polygon.setAttribute('fill', '#fce4ec');
                polygon.setAttribute('stroke', '#e91e63');
                polygon.setAttribute('stroke-width', '2');
                group.appendChild(polygon);
            }
        });
    }
    
    renderSchools(schools, group) {
        schools.forEach(feature => {
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'school');
                const label = this.generateSchoolLabel(feature.properties);
                circle.setAttribute('aria-label', label);
                circle.setAttribute('fill', '#3f51b5');
                circle.setAttribute('r', '8');
                group.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'school');
                const label = this.generateSchoolLabel(feature.properties);
                polygon.setAttribute('aria-label', label);
                polygon.setAttribute('fill', '#e8eaf6');
                polygon.setAttribute('stroke', '#3f51b5');
                polygon.setAttribute('stroke-width', '2');
                group.appendChild(polygon);
            }
        });
    }
    
    renderWorship(places, group) {
        places.forEach(feature => {
            if (feature.geometry.type === 'Point') {
                const circle = this.createCircle(feature, 'worship');
                const label = this.generateWorshipLabel(feature.properties);
                circle.setAttribute('aria-label', label);
                circle.setAttribute('fill', '#9c27b0');
                circle.setAttribute('r', '7');
                group.appendChild(circle);
            } else {
                const polygon = this.createPolygon(feature, 'worship');
                const label = this.generateWorshipLabel(feature.properties);
                polygon.setAttribute('aria-label', label);
                polygon.setAttribute('fill', '#f3e5f5');
                polygon.setAttribute('stroke', '#9c27b0');
                polygon.setAttribute('stroke-width', '2');
                group.appendChild(polygon);
            }
        });
    }
    
    renderParks(parks, group) {
        parks.forEach(feature => {
            const polygon = this.createPolygon(feature, 'park');
            const label = this.generateParkLabel(feature.properties);
            polygon.setAttribute('aria-label', label);
            polygon.setAttribute('fill', '#c8e6c9');
            polygon.setAttribute('stroke', '#4caf50');
            polygon.setAttribute('stroke-width', '1');
            group.appendChild(polygon);
        });
    }
    
    renderAddresses(addresses, group) {
        addresses.forEach(feature => {
            const circle = this.createCircle(feature, 'address');
            const label = this.generateAddressLabel(feature.properties);
            circle.setAttribute('aria-label', label);
            circle.setAttribute('fill', '#2196f3');
            circle.setAttribute('r', '4');
            group.appendChild(circle);
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
            primary: '4',
            secondary: '3',
            tertiary: '2.5',
            residential: '2',
            service: '1.5',
            footway: '1',
            pedestrian: '2'
        };
        
        return widths[roadType] || '2';
    }
}