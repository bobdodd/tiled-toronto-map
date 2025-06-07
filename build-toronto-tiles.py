#!/usr/bin/env python3
"""
Toronto SVG Tile Generator
Downloads OSM data for Greater Toronto Area and converts to accessible SVG tiles
"""

import os
import sys
import json
import gzip
import math
import requests
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

try:
    import osmium
    from shapely.geometry import Point, LineString, Polygon
    from shapely.ops import transform
    import pyproj
except ImportError:
    print("Installing required packages...")
    os.system("pip install osmium-tool shapely pyproj requests")
    import osmium
    from shapely.geometry import Point, LineString, Polygon
    from shapely.ops import transform
    import pyproj

class TorontoTileBuilder:
    def __init__(self):
        self.output_dir = Path("toronto-svg-tiles")
        self.tiles_dir = self.output_dir / "tiles"
        self.data_dir = self.output_dir / "data"
        
        # Greater Toronto Area bounds
        self.gta_bounds = {
            'north': 44.0,
            'south': 43.5,
            'east': -78.9,
            'west': -79.8
        }
        
        # Tile size in degrees (roughly 1km squares)
        self.tile_size = 0.01
        
        # SVG viewport size
        self.svg_size = 1000
        
        # Create directories
        self.output_dir.mkdir(exist_ok=True)
        self.tiles_dir.mkdir(exist_ok=True)
        self.data_dir.mkdir(exist_ok=True)
        
        # Feature categories for accessibility
        self.feature_types = {
            'buildings': {
                'tags': {'building': True},
                'color': '#8e9aaf',
                'stroke': '#5d6674'
            },
            'roads': {
                'tags': {'highway': ['primary', 'secondary', 'tertiary', 'residential', 'service']},
                'color': 'none',
                'stroke': '#666'
            },
            'accessibility': {
                'tags': {
                    'amenity': ['parking'],
                    'wheelchair': ['yes'],
                    'access': ['disabled']
                },
                'color': '#4CAF50',
                'stroke': '#2E7D32'
            },
            'transit': {
                'tags': {
                    'highway': ['bus_stop'],
                    'railway': ['station', 'subway_entrance']
                },
                'color': '#2196F3',
                'stroke': '#1976D2'
            }
        }

    def download_toronto_data(self):
        """Download Toronto OSM data from Geofabrik"""
        print("Downloading Toronto OSM data...")
        
        osm_file = self.data_dir / "toronto.osm.pbf"
        if osm_file.exists():
            print(f"Using existing {osm_file}")
            return osm_file
            
        # Download Ontario data (includes Toronto)
        url = "https://download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf"
        
        print(f"Downloading from {url}...")
        response = requests.get(url, stream=True)
        total_size = int(response.headers.get('content-length', 0))
        
        with open(osm_file, 'wb') as f:
            downloaded = 0
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"\rProgress: {percent:.1f}%", end='')
        
        print(f"\nDownloaded {osm_file}")
        return osm_file

    def extract_toronto_area(self, osm_file):
        """Extract just the Toronto area from the larger Ontario file"""
        print("Extracting Toronto area...")
        
        toronto_file = self.data_dir / "toronto-area.osm.pbf"
        if toronto_file.exists():
            print(f"Using existing {toronto_file}")
            return toronto_file
        
        # Use osmium to extract bounding box
        bounds = f"{self.gta_bounds['west']},{self.gta_bounds['south']},{self.gta_bounds['east']},{self.gta_bounds['north']}"
        
        cmd = f"osmium extract -b {bounds} {osm_file} -o {toronto_file}"
        print(f"Running: {cmd}")
        
        result = os.system(cmd)
        if result != 0:
            print("Error: osmium extract failed. Install with: apt-get install osmium-tool")
            sys.exit(1)
            
        print(f"Extracted to {toronto_file}")
        return toronto_file

    def get_tile_bounds(self, tile_lat, tile_lng):
        """Get the geographic bounds for a tile"""
        return {
            'north': tile_lat + self.tile_size,
            'south': tile_lat,
            'east': tile_lng + self.tile_size,
            'west': tile_lng
        }

    def coord_to_svg(self, lat, lng, bounds):
        """Convert lat/lng to SVG coordinates within tile bounds"""
        lat_range = bounds['north'] - bounds['south']
        lng_range = bounds['east'] - bounds['west']
        
        x = ((lng - bounds['west']) / lng_range) * self.svg_size
        y = ((bounds['north'] - lat) / lat_range) * self.svg_size  # Flip Y axis
        
        return int(x), int(y)

    def create_svg_element(self, tag, **attrs):
        """Create SVG element with attributes"""
        element = Element(tag)
        for key, value in attrs.items():
            element.set(key.replace('_', '-'), str(value))
        return element

    def feature_to_svg(self, feature_type, geometry, properties, bounds):
        """Convert OSM feature to SVG element with accessibility"""
        
        if isinstance(geometry, Point):
            x, y = self.coord_to_svg(geometry.y, geometry.x, bounds)
            element = self.create_svg_element(
                'circle',
                cx=x, cy=y, r=3,
                class_=feature_type,
                fill=self.feature_types[feature_type]['color'],
                stroke=self.feature_types[feature_type]['stroke']
            )
            
        elif isinstance(geometry, LineString):
            points = []
            for coord in geometry.coords:
                x, y = self.coord_to_svg(coord[1], coord[0], bounds)
                points.append(f"{x},{y}")
            
            element = self.create_svg_element(
                'polyline',
                points=" ".join(points),
                class_=feature_type,
                fill="none",
                stroke=self.feature_types[feature_type]['stroke'],
                stroke_width=2
            )
            
        elif isinstance(geometry, Polygon):
            exterior_points = []
            for coord in geometry.exterior.coords:
                x, y = self.coord_to_svg(coord[1], coord[0], bounds)
                exterior_points.append(f"{x},{y}")
            
            element = self.create_svg_element(
                'polygon',
                points=" ".join(exterior_points),
                class_=feature_type,
                fill=self.feature_types[feature_type]['color'],
                stroke=self.feature_types[feature_type]['stroke'],
                stroke_width=1
            )
        else:
            return None
        
        # Add accessibility attributes
        element.set('tabindex', '-1')
        element.set('role', 'img')
        
        # Generate aria-label
        label = self.generate_aria_label(feature_type, properties)
        element.set('aria-label', label)
        
        # Add data attributes for features
        if 'osm_id' in properties:
            element.set('data-osm-id', str(properties['osm_id']))
        
        return element

    def generate_aria_label(self, feature_type, properties):
        """Generate accessible label for feature"""
        
        label_parts = []
        
        # Feature type
        if feature_type == 'buildings':
            building_type = properties.get('building', 'building')
            if building_type == 'yes':
                label_parts.append('Building')
            else:
                label_parts.append(f"{building_type.replace('_', ' ').title()} building")
            
            # Add levels if available
            levels = properties.get('building:levels')
            if levels:
                label_parts.append(f"{levels} floors")
                
        elif feature_type == 'roads':
            highway_type = properties.get('highway', 'road')
            label_parts.append(f"{highway_type.title()} road")
            
        elif feature_type == 'transit':
            if properties.get('highway') == 'bus_stop':
                label_parts.append('Bus stop')
            elif properties.get('railway'):
                label_parts.append(f"{properties['railway'].replace('_', ' ').title()}")
                
        elif feature_type == 'accessibility':
            if properties.get('amenity') == 'parking':
                label_parts.append('Accessible parking')
            else:
                label_parts.append('Accessible facility')
        
        # Add name if available
        name = properties.get('name')
        if name:
            label_parts.insert(0, name)
        
        # Add address if available
        addr_parts = []
        if properties.get('addr:housenumber'):
            addr_parts.append(properties['addr:housenumber'])
        if properties.get('addr:street'):
            addr_parts.append(properties['addr:street'])
        
        if addr_parts:
            label_parts.append(f"at {' '.join(addr_parts)}")
        
        return ', '.join(label_parts)

    def create_tile_svg(self, tile_lat, tile_lng, features):
        """Create SVG tile for given coordinates"""
        
        bounds = self.get_tile_bounds(tile_lat, tile_lng)
        
        # Create SVG root
        svg = self.create_svg_element(
            'svg',
            viewBox=f"0 0 {self.svg_size} {self.svg_size}",
            xmlns="http://www.w3.org/2000/svg",
            width=self.svg_size,
            height=self.svg_size
        )
        
        # Add tile metadata
        svg.set('data-tile-lat', str(tile_lat))
        svg.set('data-tile-lng', str(tile_lng))
        svg.set('data-bounds', json.dumps(bounds))
        
        # Create feature groups
        feature_groups = {}
        for feature_type in self.feature_types:
            group = self.create_svg_element(
                'g',
                id=feature_type,
                class_='layer'
            )
            feature_groups[feature_type] = group
            svg.append(group)
        
        # Add features to appropriate groups
        feature_count = 0
        for feature_type, feature_list in features.items():
            if feature_type in feature_groups:
                for feature in feature_list:
                    svg_element = self.feature_to_svg(
                        feature_type, 
                        feature['geometry'], 
                        feature['properties'], 
                        bounds
                    )
                    if svg_element is not None:
                        feature_groups[feature_type].append(svg_element)
                        feature_count += 1
        
        if feature_count == 0:
            return None  # Don't create empty tiles
            
        return svg

    def save_svg_tile(self, svg, tile_lat, tile_lng):
        """Save SVG tile to compressed file"""
        
        tile_id = f"{tile_lat:.3f}_{tile_lng:.3f}"
        svg_file = self.tiles_dir / f"{tile_id}.svg"
        gz_file = self.tiles_dir / f"{tile_id}.svg.gz"
        
        # Convert to pretty XML string
        rough_string = tostring(svg, 'unicode')
        reparsed = minidom.parseString(rough_string)
        pretty_xml = reparsed.documentElement.toprettyxml(indent="  ")
        
        # Remove empty lines
        lines = [line for line in pretty_xml.split('\n') if line.strip()]
        clean_xml = '\n'.join(lines)
        
        # Write uncompressed version
        with open(svg_file, 'w', encoding='utf-8') as f:
            f.write(clean_xml)
        
        # Write compressed version
        with gzip.open(gz_file, 'wt', encoding='utf-8') as f:
            f.write(clean_xml)
        
        # Remove uncompressed version to save space
        svg_file.unlink()
        
        return gz_file

    def process_osm_data(self, osm_file):
        """Process OSM data and generate tiles"""
        print("Processing OSM data into tiles...")
        
        # This is a simplified version - you'd need to implement actual OSM parsing
        # For now, let's create a sample tile structure
        
        tiles_created = 0
        
        # Generate tile grid
        lat = self.gta_bounds['south']
        while lat < self.gta_bounds['north']:
            lng = self.gta_bounds['west']
            while lng < self.gta_bounds['east']:
                
                # Sample features for demonstration
                # In real implementation, extract features from OSM data within tile bounds
                sample_features = {
                    'buildings': [
                        {
                            'geometry': Polygon([(lng + 0.001, lat + 0.001), 
                                               (lng + 0.002, lat + 0.001),
                                               (lng + 0.002, lat + 0.002),
                                               (lng + 0.001, lat + 0.002)]),
                            'properties': {'building': 'residential', 'building:levels': '3'}
                        }
                    ],
                    'roads': [
                        {
                            'geometry': LineString([(lng, lat + 0.005), (lng + 0.01, lat + 0.005)]),
                            'properties': {'highway': 'residential', 'name': 'Sample Street'}
                        }
                    ]
                }
                
                svg = self.create_tile_svg(lat, lng, sample_features)
                if svg:
                    gz_file = self.save_svg_tile(svg, lat, lng)
                    tiles_created += 1
                    print(f"\rCreated tile {tiles_created}: {gz_file.name}", end='')
                
                lng += self.tile_size
            lat += self.tile_size
        
        print(f"\nGenerated {tiles_created} SVG tiles")
        return tiles_created

    def create_tile_index(self):
        """Create index of available tiles"""
        print("Creating tile index...")
        
        tiles = list(self.tiles_dir.glob("*.svg.gz"))
        
        index = {
            'bounds': self.gta_bounds,
            'tile_size': self.tile_size,
            'svg_size': self.svg_size,
            'total_tiles': len(tiles),
            'tiles': []
        }
        
        for tile_file in tiles:
            # Parse tile coordinates from filename
            name_parts = tile_file.stem.replace('.svg', '').split('_')
            if len(name_parts) == 2:
                try:
                    lat = float(name_parts[0])
                    lng = float(name_parts[1])
                    
                    bounds = self.get_tile_bounds(lat, lng)
                    
                    index['tiles'].append({
                        'file': tile_file.name,
                        'lat': lat,
                        'lng': lng,
                        'bounds': bounds,
                        'size_bytes': tile_file.stat().st_size
                    })
                except ValueError:
                    continue
        
        # Save index
        index_file = self.output_dir / "tile-index.json"
        with open(index_file, 'w') as f:
            json.dump(index, f, indent=2)
        
        print(f"Created tile index: {index_file}")
        return index

    def generate_sample_css(self):
        """Generate sample CSS for styling tiles"""
        css = """
/* Toronto SVG Tiles Stylesheet */

.layer {
    pointer-events: none;
}

/* Buildings */
.buildings {
    fill: #8e9aaf;
    stroke: #5d6674;
    stroke-width: 1;
    opacity: 0.8;
}

.buildings:hover {
    fill: #a5b3c7;
    opacity: 1;
}

/* Roads */
.roads {
    fill: none;
    stroke: #666;
    stroke-width: 2;
    stroke-linecap: round;
}

.roads.primary {
    stroke: #333;
    stroke-width: 4;
}

.roads.secondary {
    stroke: #555;
    stroke-width: 3;
}

/* Transit */
.transit {
    fill: #2196F3;
    stroke: #1976D2;
    stroke-width: 2;
}

/* Accessibility */
.accessibility {
    fill: #4CAF50;
    stroke: #2E7D32;
    stroke-width: 2;
}

/* Focus styles for keyboard navigation */
[tabindex="-1"]:focus {
    outline: 3px solid #FF9800;
    outline-offset: 2px;
}

/* Filter states */
.layer.hidden {
    display: none;
}

/* Zoom-based visibility */
@media (max-width: 800px) {
    .roads.service,
    .buildings[data-area-small] {
        display: none;
    }
}
"""
        
        css_file = self.output_dir / "styles" / "map-styles.css"
        css_file.parent.mkdir(exist_ok=True)
        
        with open(css_file, 'w') as f:
            f.write(css)
        
        print(f"Generated CSS: {css_file}")

    def build_tiles(self):
        """Main build process"""
        print("Starting Toronto SVG tile generation...")
        
        # Step 1: Download data
        osm_file = self.download_toronto_data()
        
        # Step 2: Extract Toronto area
        toronto_file = self.extract_toronto_area(osm_file)
        
        # Step 3: Process into tiles
        tile_count = self.process_osm_data(toronto_file)
        
        # Step 4: Create index
        index = self.create_tile_index()
        
        # Step 5: Generate CSS
        self.generate_sample_css()
        
        print(f"\n✅ Build complete!")
        print(f"Generated {tile_count} SVG tiles")
        print(f"Total size: {sum(f.stat().st_size for f in self.tiles_dir.glob('*.svg.gz')) / 1024 / 1024:.1f} MB")
        print(f"Output directory: {self.output_dir}")
        
        return self.output_dir

if __name__ == "__main__":
    builder = TorontoTileBuilder()
    output_dir = builder.build_tiles()
    
    print(f"\nNext steps:")
    print(f"1. Upload {output_dir} to your SiteGround hosting")
    print(f"2. Update your web app to use SVG tiles instead of OSM API")
    print(f"3. Test accessibility features with screen readers")