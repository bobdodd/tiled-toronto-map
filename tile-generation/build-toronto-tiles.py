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
        
        # Just the 9 tiles around our center (43.645, -79.375)
        # Center tile is 43.640_-79.380
        self.gta_bounds = {
            'north': 43.66,  # 2 tiles north of 43.64
            'south': 43.63,  # 1 tile south of 43.64
            'east': -79.36,  # 2 tiles east of -79.38
            'west': -79.39   # 1 tile west of -79.38
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
            'landuse': {
                'tags': {
                    'landuse': ['residential', 'commercial', 'industrial', 'retail', 
                               'construction', 'brownfield', 'cemetery', 'quarry',
                               'landfill', 'railway', 'port', 'depot', 'garages',
                               'religious', 'education', 'institutional', 'military'],
                    'military': ['airfield', 'barracks', 'bunker', 'checkpoint', 'danger_area',
                                'naval_base', 'obstacle_course', 'range', 'training_area']
                },
                'styles': {
                    # Urban land use
                    'residential': {'fill': '#f0f0f0', 'stroke': '#d9d9d9', 'stroke_width': 0.5},
                    'commercial': {'fill': '#ffd9d9', 'stroke': '#ffb3b3', 'stroke_width': 0.5},
                    'industrial': {'fill': '#dfd9ff', 'stroke': '#c2b3ff', 'stroke_width': 0.5},
                    'retail': {'fill': '#ffd9e6', 'stroke': '#ffb3cc', 'stroke_width': 0.5},
                    # Development sites
                    'construction': {'fill': '#ffcc99', 'stroke': '#ff9966', 'stroke_width': 1, 'dasharray': '5,3'},
                    'brownfield': {'fill': '#b8a386', 'stroke': '#9c8a70', 'stroke_width': 1},
                    # Special use
                    'cemetery': {'fill': '#d4e6d4', 'stroke': '#a5c6a5', 'stroke_width': 1},
                    'quarry': {'fill': '#c5c3c0', 'stroke': '#9c9a97', 'stroke_width': 1},
                    'landfill': {'fill': '#b3a598', 'stroke': '#9c8e81', 'stroke_width': 1},
                    # Transportation
                    'railway': {'fill': '#dcdcdc', 'stroke': '#b3b3b3', 'stroke_width': 0.5},
                    'port': {'fill': '#d9e5ff', 'stroke': '#b3ccff', 'stroke_width': 1},
                    'depot': {'fill': '#e0e0e0', 'stroke': '#b3b3b3', 'stroke_width': 0.5},
                    'garages': {'fill': '#e6e6e6', 'stroke': '#cccccc', 'stroke_width': 0.5},
                    # Institutional
                    'religious': {'fill': '#e6d9ff', 'stroke': '#ccb3ff', 'stroke_width': 0.5},
                    'education': {'fill': '#fff0d9', 'stroke': '#ffcc99', 'stroke_width': 0.5},
                    'institutional': {'fill': '#f0e6ff', 'stroke': '#daccff', 'stroke_width': 0.5},
                    'military': {'fill': '#ffd9d9', 'stroke': '#ff9999', 'stroke_width': 1, 'dasharray': '8,4'},
                    # Default
                    'default': {'fill': '#f5f5f5', 'stroke': '#e0e0e0', 'stroke_width': 0.5}
                }
            },
            'roads': {
                'tags': {'highway': ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 
                                     'residential', 'service', 'unclassified', 'pedestrian', 
                                     'footway', 'cycleway', 'path', 'living_street', 'track',
                                     'bus_guideway', 'escape', 'raceway', 'road', 'busway',
                                     'motorway_link', 'trunk_link', 'primary_link', 
                                     'secondary_link', 'tertiary_link', 'bridleway', 'steps',
                                     'corridor', 'sidewalk']},
                'styles': {
                    # Major roads
                    'motorway': {'width': 8, 'color': '#e892a2', 'casing': '#dc2a67', 'casing_width': 10},
                    'trunk': {'width': 7, 'color': '#f9b29c', 'casing': '#e06d5f', 'casing_width': 9},
                    'primary': {'width': 6, 'color': '#fcd6a4', 'casing': '#e5c278', 'casing_width': 8},
                    'secondary': {'width': 5, 'color': '#f7fabf', 'casing': '#d4d486', 'casing_width': 7},
                    'tertiary': {'width': 4, 'color': '#ffffff', 'casing': '#bbb', 'casing_width': 6},
                    # Links/ramps
                    'motorway_link': {'width': 4, 'color': '#e892a2', 'casing': '#dc2a67', 'casing_width': 5},
                    'trunk_link': {'width': 4, 'color': '#f9b29c', 'casing': '#e06d5f', 'casing_width': 5},
                    'primary_link': {'width': 4, 'color': '#fcd6a4', 'casing': '#e5c278', 'casing_width': 5},
                    'secondary_link': {'width': 3, 'color': '#f7fabf', 'casing': '#d4d486', 'casing_width': 4},
                    'tertiary_link': {'width': 3, 'color': '#ffffff', 'casing': '#bbb', 'casing_width': 4},
                    # Streets
                    'residential': {'width': 3, 'color': '#ffffff', 'casing': '#999', 'casing_width': 5},
                    'living_street': {'width': 3, 'color': '#f0f0f0', 'casing': '#999', 'casing_width': 5, 'dasharray': '10,3'},
                    'service': {'width': 2, 'color': '#ffffff', 'casing': '#aaa', 'casing_width': 3},
                    'unclassified': {'width': 3, 'color': '#ffffff', 'casing': '#999', 'casing_width': 5},
                    'road': {'width': 2, 'color': '#dddddd', 'casing': '#999', 'casing_width': 3},
                    # Pedestrian/bike
                    'pedestrian': {'width': 3, 'color': '#ededed', 'casing': '#ccc', 'casing_width': 4},
                    'footway': {'width': 1.5, 'color': '#faa', 'casing': '#f88', 'casing_width': 2, 'dasharray': '2,3'},
                    'sidewalk': {'width': 1.5, 'color': '#faa', 'casing': '#f88', 'casing_width': 2},
                    'cycleway': {'width': 1.5, 'color': '#aaf', 'casing': '#88f', 'casing_width': 2, 'dasharray': '2,3'},
                    'path': {'width': 1, 'color': '#ccc', 'casing': '#aaa', 'casing_width': 1.5, 'dasharray': '2,2'},
                    'bridleway': {'width': 2, 'color': '#d4a76a', 'casing': '#b58652', 'casing_width': 3, 'dasharray': '4,2'},
                    'steps': {'width': 3, 'color': '#faa', 'casing': '#f88', 'casing_width': 4, 'dasharray': '1,1'},
                    'corridor': {'width': 2, 'color': '#ffcccc', 'casing': '#ff9999', 'casing_width': 3},
                    # Special purpose
                    'track': {'width': 2, 'color': '#dfb', 'casing': '#9d7', 'casing_width': 3, 'dasharray': '3,3'},
                    'bus_guideway': {'width': 4, 'color': '#6682ff', 'casing': '#4666ff', 'casing_width': 5},
                    'busway': {'width': 4, 'color': '#6682ff', 'casing': '#4666ff', 'casing_width': 5},
                    'escape': {'width': 3, 'color': '#ff9999', 'casing': '#ff6666', 'casing_width': 4, 'dasharray': '5,5'},
                    'raceway': {'width': 4, 'color': '#ffcccc', 'casing': '#ff9999', 'casing_width': 5}
                }
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
            'pedestrian_areas': {
                'tags': {
                    'highway': ['pedestrian', 'living_street', 'footway', 'sidewalk', 
                               'steps', 'corridor', 'path']
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
            },
            'water': {
                'tags': {
                    'natural': ['water', 'coastline', 'bay', 'beach', 'wetland', 'strait', 
                               'reef', 'hot_spring', 'geyser', 'glacier'],
                    'water': ['lake', 'river', 'pond', 'reservoir', 'basin', 'canal', 
                             'stream', 'lagoon', 'pool', 'reflecting_pool', 'moat', 
                             'wastewater', 'oxbow'],
                    'waterway': ['river', 'stream', 'canal', 'drain', 'ditch', 'rapids', 
                                'waterfall', 'dam', 'weir', 'lock_gate', 'turning_point',
                                'boatyard', 'fuel', 'riverbank', 'dock'],
                    'landuse': ['reservoir', 'basin', 'salt_pond', 'aquaculture'],
                    'leisure': ['swimming_pool', 'swimming_area'],
                    'amenity': ['fountain']
                },
                'styles': {
                    # Natural water bodies
                    'lake': {'fill': '#aad3df', 'stroke': '#4d90c4', 'stroke_width': 1},
                    'river': {'fill': '#aad3df', 'stroke': '#4d90c4', 'stroke_width': 2},
                    'pond': {'fill': '#aad3df', 'stroke': '#4d90c4', 'stroke_width': 1},
                    'ocean': {'fill': '#a0c8f0', 'stroke': '#4d90c4', 'stroke_width': 2},
                    'bay': {'fill': '#a0c8f0', 'stroke': '#4d90c4', 'stroke_width': 2},
                    'beach': {'fill': '#fff1ba', 'stroke': '#f5e5a1', 'stroke_width': 1},
                    'wetland': {'fill': '#d0e6d0', 'stroke': '#91b891', 'stroke_width': 1, 'pattern': 'wetland'},
                    # Waterways
                    'stream': {'stroke': '#aad3df', 'stroke_width': 1.5},
                    'canal': {'stroke': '#aad3df', 'stroke_width': 3},
                    'drain': {'stroke': '#aad3df', 'stroke_width': 1, 'dasharray': '2,2'},
                    'ditch': {'stroke': '#aad3df', 'stroke_width': 0.5, 'dasharray': '1,1'},
                    'rapids': {'stroke': '#6eb5ff', 'stroke_width': 3, 'dasharray': '3,1'},
                    'waterfall': {'stroke': '#6eb5ff', 'stroke_width': 2},
                    # Man-made water
                    'reservoir': {'fill': '#b5d0d7', 'stroke': '#4d90c4', 'stroke_width': 2},
                    'basin': {'fill': '#b5d0d7', 'stroke': '#4d90c4', 'stroke_width': 1},
                    'swimming_pool': {'fill': '#b5e0ff', 'stroke': '#6eb5ff', 'stroke_width': 1},
                    'fountain': {'fill': '#b5e0ff', 'stroke': '#6eb5ff', 'stroke_width': 1},
                    # Water infrastructure
                    'dam': {'fill': '#888', 'stroke': '#444', 'stroke_width': 2},
                    'weir': {'fill': '#888', 'stroke': '#444', 'stroke_width': 1},
                    'lock_gate': {'fill': '#888', 'stroke': '#444', 'stroke_width': 2},
                    # Default style
                    'default': {'fill': '#aad3df', 'stroke': '#4d90c4', 'stroke_width': 1}
                }
            },
            'vegetation': {
                'tags': {
                    'natural': ['wood', 'tree_row', 'tree', 'scrub', 'heath', 'grassland', 
                               'fell', 'bare_rock', 'scree', 'shingle', 'sand', 'mud',
                               'wetland', 'marsh', 'swamp', 'bog', 'fen'],
                    'landuse': ['forest', 'meadow', 'grass', 'greenfield', 'conservation',
                               'orchard', 'vineyard', 'allotments', 'farmland', 'farmyard',
                               'greenhouse_horticulture', 'plant_nursery', 'flowerbed'],
                    'leisure': ['nature_reserve'],
                    'boundary': ['national_park', 'protected_area']
                },
                'styles': {
                    # Forests and woods
                    'forest': {'fill': '#72b566', 'stroke': '#4a8c3f', 'stroke_width': 1},
                    'wood': {'fill': '#7ab56d', 'stroke': '#4a8c3f', 'stroke_width': 1},
                    'tree_row': {'stroke': '#4a8c3f', 'stroke_width': 3},
                    'tree': {'fill': '#4a8c3f', 'stroke': '#2e5a29', 'stroke_width': 1},
                    # Shrubland
                    'scrub': {'fill': '#b8d6b3', 'stroke': '#8bc34a', 'stroke_width': 1, 'dasharray': '2,2'},
                    'heath': {'fill': '#d4e6c8', 'stroke': '#9ccc65', 'stroke_width': 1},
                    # Grasslands
                    'grass': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'meadow': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'grassland': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'greenfield': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'fell': {'fill': '#f0f4c3', 'stroke': '#c5ce6a', 'stroke_width': 1},
                    # Barren
                    'bare_rock': {'fill': '#d4d4d4', 'stroke': '#999999', 'stroke_width': 1},
                    'scree': {'fill': '#e0e0e0', 'stroke': '#b3b3b3', 'stroke_width': 1, 'pattern': 'scree'},
                    'shingle': {'fill': '#e6d9cc', 'stroke': '#ccb399', 'stroke_width': 1, 'pattern': 'shingle'},
                    'sand': {'fill': '#ffecb3', 'stroke': '#ffd54f', 'stroke_width': 0.5},
                    'mud': {'fill': '#cbb299', 'stroke': '#a68b66', 'stroke_width': 0.5},
                    # Wetlands
                    'wetland': {'fill': '#d0e6d0', 'stroke': '#91b891', 'stroke_width': 1, 'pattern': 'wetland'},
                    'marsh': {'fill': '#d0e6d0', 'stroke': '#91b891', 'stroke_width': 1, 'pattern': 'marsh'},
                    'swamp': {'fill': '#c5d9c5', 'stroke': '#86a686', 'stroke_width': 1, 'pattern': 'swamp'},
                    'bog': {'fill': '#d9e6d9', 'stroke': '#a6c6a6', 'stroke_width': 1, 'pattern': 'bog'},
                    'fen': {'fill': '#e0f0e0', 'stroke': '#b3d9b3', 'stroke_width': 1, 'pattern': 'fen'},
                    # Agricultural
                    'farmland': {'fill': '#f0e68c', 'stroke': '#d4c86a', 'stroke_width': 0.5},
                    'farmyard': {'fill': '#ddbf8c', 'stroke': '#b39c6a', 'stroke_width': 1},
                    'orchard': {'fill': '#aedfa3', 'stroke': '#8bc34a', 'stroke_width': 1, 'pattern': 'orchard'},
                    'vineyard': {'fill': '#b39ddb', 'stroke': '#7e57c2', 'stroke_width': 1, 'pattern': 'vineyard'},
                    'allotments': {'fill': '#efd999', 'stroke': '#d4c86a', 'stroke_width': 1, 'dasharray': '3,1'},
                    'greenhouse_horticulture': {'fill': '#f0f0ff', 'stroke': '#ccccff', 'stroke_width': 1},
                    'plant_nursery': {'fill': '#cce6cc', 'stroke': '#99cc99', 'stroke_width': 1},
                    'flowerbed': {'fill': '#ffccff', 'stroke': '#ff99ff', 'stroke_width': 0.5},
                    # Conservation
                    'conservation': {'fill': '#81c784', 'stroke': '#4caf50', 'stroke_width': 2, 'dasharray': '5,3'},
                    'nature_reserve': {'fill': '#a5d6a7', 'stroke': '#66bb6a', 'stroke_width': 2},
                    'national_park': {'fill': '#90c890', 'stroke': '#5a9c5a', 'stroke_width': 2, 'dasharray': '10,5'},
                    'protected_area': {'fill': '#a5d6a7', 'stroke': '#66bb6a', 'stroke_width': 2, 'dasharray': '8,4'},
                    # Default
                    'default': {'fill': '#c8e6b8', 'stroke': '#8bc34a', 'stroke_width': 1}
                }
            },
            'parks': {
                'tags': {
                    'leisure': ['park', 'garden', 'playground', 'dog_park', 
                               'recreation_ground', 'common', 'fitness_centre', 'fitness_station',
                               'sports_centre', 'stadium', 'track', 'pitch', 'golf_course',
                               'miniature_golf', 'disc_golf_course', 'swimming_pool', 'water_park',
                               'marina', 'slipway', 'beach_resort'],
                    'landuse': ['recreation_ground', 'village_green'],
                    'amenity': ['playground'],
                    'sport': ['soccer', 'tennis', 'basketball', 'baseball', 'cricket', 'rugby',
                             'american_football', 'canadian_football', 'australian_football',
                             'field_hockey', 'ice_hockey', 'volleyball', 'handball']
                },
                'styles': {
                    # Parks and gardens
                    'park': {'fill': '#c8e6b8', 'stroke': '#8bc34a', 'stroke_width': 1},
                    'garden': {'fill': '#d4e6c8', 'stroke': '#9ccc65', 'stroke_width': 1},
                    'playground': {'fill': '#ffd54f', 'stroke': '#ffb300', 'stroke_width': 1},
                    'dog_park': {'fill': '#c5e1a5', 'stroke': '#8bc34a', 'stroke_width': 1, 'dasharray': '5,2'},
                    'nature_reserve': {'fill': '#a5d6a7', 'stroke': '#66bb6a', 'stroke_width': 2},
                    'recreation_ground': {'fill': '#c8e6b8', 'stroke': '#8bc34a', 'stroke_width': 1},
                    # Forests and woods
                    'forest': {'fill': '#72b566', 'stroke': '#4a8c3f', 'stroke_width': 1},
                    'wood': {'fill': '#7ab56d', 'stroke': '#4a8c3f', 'stroke_width': 1},
                    'tree_row': {'stroke': '#4a8c3f', 'stroke_width': 3},
                    'scrub': {'fill': '#b8d6b3', 'stroke': '#8bc34a', 'stroke_width': 1, 'dasharray': '2,2'},
                    'heath': {'fill': '#d4e6c8', 'stroke': '#9ccc65', 'stroke_width': 1},
                    # Grasslands
                    'grass': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'meadow': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'grassland': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'greenfield': {'fill': '#e8f5e9', 'stroke': '#a5d6a7', 'stroke_width': 0.5},
                    'village_green': {'fill': '#c8e6b8', 'stroke': '#8bc34a', 'stroke_width': 1},
                    # Sports facilities
                    'sports_centre': {'fill': '#64b5f6', 'stroke': '#1976d2', 'stroke_width': 2},
                    'stadium': {'fill': '#5c6bc0', 'stroke': '#3949ab', 'stroke_width': 2},
                    'track': {'fill': '#ef5350', 'stroke': '#c62828', 'stroke_width': 1},
                    'pitch': {'fill': '#81c784', 'stroke': '#4caf50', 'stroke_width': 1},
                    'golf_course': {'fill': '#a5d6a7', 'stroke': '#66bb6a', 'stroke_width': 1},
                    'swimming_pool': {'fill': '#4fc3f7', 'stroke': '#0288d1', 'stroke_width': 1},
                    # Agricultural
                    'farmland': {'fill': '#f0e68c', 'stroke': '#d4c86a', 'stroke_width': 0.5},
                    'farmyard': {'fill': '#ddbf8c', 'stroke': '#b39c6a', 'stroke_width': 1},
                    'orchard': {'fill': '#aedfa3', 'stroke': '#8bc34a', 'stroke_width': 1, 'pattern': 'orchard'},
                    'vineyard': {'fill': '#b39ddb', 'stroke': '#7e57c2', 'stroke_width': 1, 'pattern': 'vineyard'},
                    'allotments': {'fill': '#efd999', 'stroke': '#d4c86a', 'stroke_width': 1, 'dasharray': '3,1'},
                    # Conservation
                    'conservation': {'fill': '#81c784', 'stroke': '#4caf50', 'stroke_width': 2, 'dasharray': '5,3'},
                    # Default
                    'default': {'fill': '#c8e6b8', 'stroke': '#8bc34a', 'stroke_width': 1}
                }
            },
            'religious': {
                'tags': {
                    'amenity': ['place_of_worship'],
                    'building': ['church', 'mosque', 'temple', 'synagogue', 'chapel', 
                                'cathedral', 'shrine', 'monastery']
                },
                'styles': {
                    # Christian
                    'christian': {'fill': '#e6d9ff', 'stroke': '#b399ff', 'stroke_width': 1},
                    'church': {'fill': '#e6d9ff', 'stroke': '#b399ff', 'stroke_width': 1},
                    'cathedral': {'fill': '#daccff', 'stroke': '#a880ff', 'stroke_width': 2},
                    'chapel': {'fill': '#f0e6ff', 'stroke': '#ccb3ff', 'stroke_width': 1},
                    # Islamic
                    'muslim': {'fill': '#d9f2e6', 'stroke': '#66cc99', 'stroke_width': 1},
                    'mosque': {'fill': '#d9f2e6', 'stroke': '#66cc99', 'stroke_width': 1},
                    # Jewish
                    'jewish': {'fill': '#e6f0ff', 'stroke': '#99c2ff', 'stroke_width': 1},
                    'synagogue': {'fill': '#e6f0ff', 'stroke': '#99c2ff', 'stroke_width': 1},
                    # Hindu
                    'hindu': {'fill': '#ffe6cc', 'stroke': '#ff9933', 'stroke_width': 1},
                    'temple': {'fill': '#ffe6cc', 'stroke': '#ff9933', 'stroke_width': 1},
                    # Buddhist
                    'buddhist': {'fill': '#fff0cc', 'stroke': '#ffcc33', 'stroke_width': 1},
                    # Sikh
                    'sikh': {'fill': '#ffcccc', 'stroke': '#ff6666', 'stroke_width': 1},
                    # Other
                    'monastery': {'fill': '#e0d4cc', 'stroke': '#b39980', 'stroke_width': 1},
                    'shrine': {'fill': '#f0e0ff', 'stroke': '#d9b3ff', 'stroke_width': 1},
                    # Default
                    'default': {'fill': '#e6d9ff', 'stroke': '#ccb3ff', 'stroke_width': 1}
                }
            }
        }

    def download_toronto_data(self):
        """Download Toronto OSM data from Geofabrik"""
        print("Checking for Toronto OSM data...")
        
        # Use the existing toronto-svg-tiles directory
        existing_data_dir = Path("/Users/bob3/Desktop/Maps/toronto-svg-tiles/data")
        osm_file = existing_data_dir / "toronto.osm.pbf"
        
        if osm_file.exists():
            print(f"Using existing {osm_file}")
            return osm_file
        
        # Fallback to downloading if needed
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
        
        # Check existing location first
        existing_data_dir = Path("/Users/bob3/Desktop/Maps/toronto-svg-tiles/data")
        toronto_file = existing_data_dir / "toronto-area.osm.pbf"
        
        if toronto_file.exists():
            print(f"Using existing {toronto_file}")
            return toronto_file
            
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
        
        # Don't clamp coordinates - allow features to extend beyond tile bounds
        # This ensures partial features are rendered correctly
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
            # Handle different feature types
            if feature_type == 'water':
                water_type = self.determine_water_type(properties)
                style = self.feature_types['water']['styles'].get(water_type, 
                        self.feature_types['water']['styles']['default'])
                element = self.create_svg_element(
                    'circle',
                    cx=x, cy=y, r=5,
                    class_=f'water water-{water_type}',
                    fill=style['fill'],
                    stroke=style['stroke']
                )
            elif feature_type == 'parks':
                parks_type = self.determine_parks_type(properties)
                style = self.feature_types['parks']['styles'].get(parks_type, 
                        self.feature_types['parks']['styles']['default'])
                element = self.create_svg_element(
                    'circle',
                    cx=x, cy=y, r=5,
                    class_=f'park park-{parks_type}',
                    fill=style['fill'],
                    stroke=style['stroke']
                )
            elif feature_type == 'vegetation':
                # Individual trees or other point vegetation
                vegetation_type = self.determine_vegetation_type(properties)
                style = self.feature_types['vegetation']['styles'].get(vegetation_type, 
                        self.feature_types['vegetation']['styles']['default'])
                radius = 8 if vegetation_type == 'tree' else 5
                element = self.create_svg_element(
                    'circle',
                    cx=x, cy=y, r=radius,
                    class_=f'vegetation vegetation-{vegetation_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
            elif feature_type == 'religious':
                religious_type = self.determine_religious_type(properties)
                style = self.feature_types['religious']['styles'].get(religious_type, 
                        self.feature_types['religious']['styles']['default'])
                element = self.create_svg_element(
                    'circle',
                    cx=x, cy=y, r=8,
                    class_=f'religious religious-{religious_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
            else:
                element = self.create_svg_element(
                    'circle',
                    cx=x, cy=y, r=3,
                    class_=feature_type,
                    fill=self.feature_types[feature_type].get('color', '#999'),
                    stroke=self.feature_types[feature_type].get('stroke', '#666')
                )
            
        elif isinstance(geometry, LineString):
            points = []
            for coord in geometry.coords:
                x, y = self.coord_to_svg(coord[1], coord[0], bounds)
                points.append(f"{x},{y}")
            
            # Special handling for roads with casing
            if feature_type == 'roads':
                highway_type = properties.get('highway', 'residential')
                style = self.feature_types['roads']['styles'].get(highway_type, 
                        self.feature_types['roads']['styles']['residential'])
                
                # Create a group to hold both casing and road
                element = self.create_svg_element('g', class_='road-group')
                
                # Add casing (wider line underneath)
                casing = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_='road-casing',
                    fill="none",
                    stroke=style['casing'],
                    stroke_width=style['casing_width'],
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                element.append(casing)
                
                # Add road surface
                road = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'road road-{highway_type}',
                    fill="none",
                    stroke=style['color'],
                    stroke_width=style['width'],
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                # Add dash array for paths
                if 'dasharray' in style:
                    road.set('stroke-dasharray', style['dasharray'])
                    
                element.append(road)
            elif feature_type == 'water':
                # Linear water features (rivers, streams, etc.)
                water_type = self.determine_water_type(properties)
                style = self.feature_types['water']['styles'].get(water_type, 
                        self.feature_types['water']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'water waterway-{water_type}',
                    fill="none",
                    stroke=style.get('stroke', '#aad3df'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'parks':
                # Linear park features (tree rows, paths in parks, etc.)
                parks_type = self.determine_parks_type(properties)
                style = self.feature_types['parks']['styles'].get(parks_type, 
                        self.feature_types['parks']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'park park-{parks_type}',
                    fill="none",
                    stroke=style.get('stroke', '#8bc34a'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'vegetation':
                # Linear vegetation features (tree rows, hedges, etc.)
                vegetation_type = self.determine_vegetation_type(properties)
                style = self.feature_types['vegetation']['styles'].get(vegetation_type, 
                        self.feature_types['vegetation']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'vegetation vegetation-{vegetation_type}',
                    fill="none",
                    stroke=style.get('stroke', '#4a8c3f'),
                    stroke_width=style.get('stroke_width', 3),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            else:
                # Default line rendering for non-roads
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=feature_type,
                    fill="none",
                    stroke=self.feature_types[feature_type].get('stroke', '#666'),
                    stroke_width=2
                )
            
        elif isinstance(geometry, Polygon):
            exterior_points = []
            for coord in geometry.exterior.coords:
                x, y = self.coord_to_svg(coord[1], coord[0], bounds)
                exterior_points.append(f"{x},{y}")
            
            # Special handling for water features
            if feature_type == 'water':
                water_type = self.determine_water_type(properties)
                style = self.feature_types['water']['styles'].get(water_type, 
                        self.feature_types['water']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'water water-{water_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
            elif feature_type == 'parks':
                parks_type = self.determine_parks_type(properties)
                style = self.feature_types['parks']['styles'].get(parks_type, 
                        self.feature_types['parks']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'park park-{parks_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
            elif feature_type == 'landuse':
                landuse_type = self.determine_landuse_type(properties)
                style = self.feature_types['landuse']['styles'].get(landuse_type, 
                        self.feature_types['landuse']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'landuse landuse-{landuse_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'vegetation':
                vegetation_type = self.determine_vegetation_type(properties)
                style = self.feature_types['vegetation']['styles'].get(vegetation_type, 
                        self.feature_types['vegetation']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'vegetation vegetation-{vegetation_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'religious':
                religious_type = self.determine_religious_type(properties)
                style = self.feature_types['religious']['styles'].get(religious_type, 
                        self.feature_types['religious']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'religious religious-{religious_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
            else:
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=feature_type,
                    fill=self.feature_types[feature_type].get('color', '#999'),
                    stroke=self.feature_types[feature_type].get('stroke', '#666'),
                    stroke_width=1
                )
        else:
            return None
        
        # Add accessibility attributes (skip for road groups as they'll be on children)
        if feature_type != 'roads' or not isinstance(element, Element) or element.tag != 'g':
            element.set('tabindex', '-1')
            element.set('role', 'img')
            
            # Generate aria-label
            label = self.generate_aria_label(feature_type, properties)
            element.set('aria-label', label)
            # Add SVG title element for tooltips
            title_element = self.create_svg_element('title')
            title_element.text = label
            element.insert(0, title_element)  # Insert as first child
        else:
            # For road groups, add attributes to the road surface element
            # Find the road surface polyline (the second one, after casing)
            road_elements = element.findall(".//polyline")
            label = self.generate_aria_label(feature_type, properties)
            
            # Add title to both casing and road for better hover experience
            for idx, road_element in enumerate(road_elements):
                # Add SVG title element for tooltips
                title_element = self.create_svg_element('title')
                title_element.text = label
                road_element.insert(0, title_element)  # Insert as first child
                
                if idx == 1:  # The surface element is the second polyline
                    road_element.set('tabindex', '-1')
                    road_element.set('role', 'img')
                    road_element.set('aria-label', label)
        
        # Add data attributes for features
        if 'osm_id' in properties:
            element.set('data-osm-id', str(properties['osm_id']))
        
        return element

    def determine_landuse_type(self, properties):
        """Determine specific land use type from tags"""
        # Check landuse tag first
        if 'landuse' in properties:
            return properties['landuse']
        
        # Check military tag
        if 'military' in properties:
            return 'military'
            
        return 'default'  # Generic land use
    
    def determine_vegetation_type(self, properties):
        """Determine specific vegetation type from tags"""
        # Check natural tag first
        if 'natural' in properties:
            return properties['natural']
        
        # Check landuse tag
        if 'landuse' in properties:
            landuse = properties['landuse']
            if landuse in ['forest', 'meadow', 'grass', 'greenfield', 'conservation',
                          'orchard', 'vineyard', 'allotments', 'farmland', 'farmyard',
                          'greenhouse_horticulture', 'plant_nursery', 'flowerbed']:
                return landuse
        
        # Check leisure tag
        if properties.get('leisure') == 'nature_reserve':
            return 'nature_reserve'
        
        # Check boundary tag
        if 'boundary' in properties:
            if properties['boundary'] == 'national_park':
                return 'national_park'
            elif properties['boundary'] == 'protected_area':
                return 'protected_area'
                
        return 'default'  # Generic vegetation

    def determine_parks_type(self, properties):
        """Determine specific park/recreation type from tags"""
        # Check leisure tag first
        if 'leisure' in properties:
            return properties['leisure']
        
        # Check landuse tag
        if 'landuse' in properties and properties['landuse'] in ['recreation_ground', 'village_green']:
            return properties['landuse']
        
        # Check amenity tag
        if properties.get('amenity') == 'playground':
            return 'playground'
        
        # Check sport tag for sports facilities
        if 'sport' in properties:
            return 'pitch'  # Generic sports pitch
            
        return 'park'  # Generic park
    
    def determine_water_type(self, properties):
        """Determine specific water type from tags"""
        # Check water=* tag first
        if 'water' in properties:
            return properties['water']
        
        # Check waterway type
        if 'waterway' in properties:
            return properties['waterway']
        
        # Check natural type
        if properties.get('natural') == 'water':
            # Try to infer from other tags
            if properties.get('tidal') == 'yes':
                return 'ocean'
            return 'lake'  # Default for natural=water
        elif properties.get('natural') in ['beach', 'bay', 'wetland']:
            return properties['natural']
        
        # Check landuse
        if properties.get('landuse') in ['reservoir', 'basin']:
            return properties['landuse']
        
        # Check leisure
        if properties.get('leisure') == 'swimming_pool':
            return 'swimming_pool'
        
        # Check amenity
        if properties.get('amenity') == 'fountain':
            return 'fountain'
            
        return 'water'  # Generic water
    
    def determine_religious_type(self, properties):
        """Determine specific religious type from tags"""
        # Check religion tag first
        if 'religion' in properties:
            return properties['religion']
        
        # Check building type
        if 'building' in properties:
            building_type = properties['building']
            if building_type in ['church', 'mosque', 'temple', 'synagogue', 'chapel', 
                               'cathedral', 'shrine', 'monastery']:
                return building_type
        
        # Check denomination for more specific Christian types
        if properties.get('denomination'):
            return 'christian'
            
        # Try to infer from name
        name = properties.get('name', '').lower()
        if 'church' in name or 'cathedral' in name or 'chapel' in name:
            return 'christian'
        elif 'mosque' in name or 'masjid' in name:
            return 'muslim'
        elif 'synagogue' in name or 'temple beth' in name:
            return 'jewish'
        elif 'temple' in name and ('hindu' in name or 'mandir' in name):
            return 'hindu'
        elif 'temple' in name and 'buddhist' in name:
            return 'buddhist'
        elif 'gurdwara' in name:
            return 'sikh'
            
        return 'default'  # Generic place of worship
    
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
            road_types = {
                'motorway': 'Highway',
                'trunk': 'Major road',
                'primary': 'Primary road',
                'secondary': 'Secondary road',
                'tertiary': 'Tertiary road',
                'motorway_link': 'Highway ramp',
                'trunk_link': 'Major road ramp',
                'primary_link': 'Primary road link',
                'secondary_link': 'Secondary road link',
                'tertiary_link': 'Tertiary road link',
                'residential': 'Residential street',
                'living_street': 'Living street',
                'service': 'Service road',
                'unclassified': 'Minor road',
                'road': 'Road',
                'pedestrian': 'Pedestrian street',
                'footway': 'Footpath',
                'sidewalk': 'Sidewalk',
                'cycleway': 'Bike path',
                'path': 'Path',
                'bridleway': 'Bridle path',
                'steps': 'Steps',
                'corridor': 'Indoor corridor',
                'track': 'Track',
                'bus_guideway': 'Bus guideway',
                'busway': 'Bus-only road',
                'escape': 'Emergency escape ramp',
                'raceway': 'Racetrack'
            }
            road_label = road_types.get(highway_type, f"{highway_type.title()} road")
            
            # Add street name if available
            if properties.get('name'):
                label_parts.append(properties['name'])
                label_parts.append(f"({road_label})")
            else:
                label_parts.append(road_label)
            
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
                
        elif feature_type == 'water':
            water_type = self.determine_water_type(properties)
            water_labels = {
                'lake': 'Lake',
                'river': 'River',
                'pond': 'Pond',
                'ocean': 'Ocean',
                'bay': 'Bay',
                'beach': 'Beach',
                'wetland': 'Wetland',
                'stream': 'Stream',
                'canal': 'Canal',
                'drain': 'Drainage channel',
                'ditch': 'Ditch',
                'reservoir': 'Reservoir',
                'basin': 'Basin',
                'swimming_pool': 'Swimming pool',
                'fountain': 'Fountain',
                'waterfall': 'Waterfall',
                'rapids': 'Rapids',
                'dam': 'Dam',
                'weir': 'Weir',
                'lock_gate': 'Lock gate'
            }
            label_parts.append(water_labels.get(water_type, 'Water feature'))
            
        elif feature_type == 'landuse':
            landuse_type = self.determine_landuse_type(properties)
            landuse_labels = {
                'residential': 'Residential area',
                'commercial': 'Commercial area',
                'industrial': 'Industrial area',
                'retail': 'Retail area',
                'construction': 'Construction site',
                'brownfield': 'Brownfield site',
                'cemetery': 'Cemetery',
                'quarry': 'Quarry',
                'landfill': 'Landfill',
                'railway': 'Railway area',
                'port': 'Port area',
                'depot': 'Depot',
                'garages': 'Garages',
                'religious': 'Religious grounds',
                'education': 'Educational institution',
                'institutional': 'Institutional area',
                'military': 'Military area'
            }
            label_parts.append(landuse_labels.get(landuse_type, 'Land use area'))
            
        elif feature_type == 'vegetation':
            vegetation_type = self.determine_vegetation_type(properties)
            vegetation_labels = {
                'forest': 'Forest',
                'wood': 'Woods',
                'tree_row': 'Tree line',
                'tree': 'Tree',
                'scrub': 'Scrubland',
                'heath': 'Heathland',
                'grass': 'Grass area',
                'meadow': 'Meadow',
                'grassland': 'Grassland',
                'greenfield': 'Green field',
                'fell': 'Fell',
                'bare_rock': 'Bare rock',
                'scree': 'Scree',
                'shingle': 'Shingle',
                'sand': 'Sand',
                'mud': 'Mud',
                'wetland': 'Wetland',
                'marsh': 'Marsh',
                'swamp': 'Swamp',
                'bog': 'Bog',
                'fen': 'Fen',
                'farmland': 'Farmland',
                'farmyard': 'Farmyard',
                'orchard': 'Orchard',
                'vineyard': 'Vineyard',
                'allotments': 'Allotments',
                'greenhouse_horticulture': 'Greenhouse horticulture',
                'plant_nursery': 'Plant nursery',
                'flowerbed': 'Flowerbed',
                'conservation': 'Conservation area',
                'nature_reserve': 'Nature reserve',
                'national_park': 'National park',
                'protected_area': 'Protected area'
            }
            label_parts.append(vegetation_labels.get(vegetation_type, 'Vegetation'))
            
        elif feature_type == 'parks':
            parks_type = self.determine_parks_type(properties)
            parks_labels = {
                'park': 'Park',
                'garden': 'Garden',
                'playground': 'Playground',
                'dog_park': 'Dog park',
                'recreation_ground': 'Recreation ground',
                'common': 'Common land',
                'fitness_centre': 'Fitness centre',
                'fitness_station': 'Outdoor fitness station',
                'sports_centre': 'Sports centre',
                'stadium': 'Stadium',
                'track': 'Running track',
                'pitch': 'Sports pitch',
                'golf_course': 'Golf course',
                'miniature_golf': 'Miniature golf',
                'disc_golf_course': 'Disc golf course',
                'swimming_pool': 'Swimming pool',
                'water_park': 'Water park',
                'marina': 'Marina',
                'slipway': 'Boat slipway',
                'beach_resort': 'Beach resort',
                'village_green': 'Village green'
            }
            label_parts.append(parks_labels.get(parks_type, 'Park area'))
            
        elif feature_type == 'religious':
            religious_type = self.determine_religious_type(properties)
            religious_labels = {
                'christian': 'Christian place of worship',
                'church': 'Church',
                'cathedral': 'Cathedral',
                'chapel': 'Chapel',
                'muslim': 'Islamic place of worship',
                'mosque': 'Mosque',
                'jewish': 'Jewish place of worship',
                'synagogue': 'Synagogue',
                'hindu': 'Hindu temple',
                'temple': 'Temple',
                'buddhist': 'Buddhist temple',
                'sikh': 'Sikh gurdwara',
                'monastery': 'Monastery',
                'shrine': 'Shrine',
                'default': 'Place of worship'
            }
            label_parts.append(religious_labels.get(religious_type, 'Place of worship'))
        
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
        
        # Add OSM ID for debugging
        if properties.get('osm_id'):
            label_parts.append(f"[OSM ID: {properties['osm_id']}]")
        
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
        
        # Add a clip path to ensure features don't overflow the tile bounds
        defs = self.create_svg_element('defs')
        clipPath = self.create_svg_element('clipPath', id='tile-clip')
        clipRect = self.create_svg_element(
            'rect',
            x=0, y=0,
            width=self.svg_size,
            height=self.svg_size
        )
        clipPath.append(clipRect)
        defs.append(clipPath)
        svg.append(defs)
        
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
                class_='layer',
                clip_path='url(#tile-clip)'
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
        
        # Import our OSM processor
        from osm_tile_processor import OSMHandler
        
        tiles_created = 0
        tiles_skipped = 0
        
        # Generate tile grid
        lat = self.gta_bounds['south']
        while lat < self.gta_bounds['north']:
            lng = self.gta_bounds['west']
            while lng < self.gta_bounds['east']:
                
                # Get bounds for this tile
                tile_bounds = self.get_tile_bounds(lat, lng)
                
                # Process OSM data for this tile
                handler = OSMHandler(tile_bounds)
                handler.apply_file(str(osm_file), locations=True)
                
                # Check if we have any features
                total_features = sum(len(features) for features in handler.features.values())
                
                if total_features > 0:
                    svg = self.create_tile_svg(lat, lng, handler.features)
                    if svg:
                        gz_file = self.save_svg_tile(svg, lat, lng)
                        tiles_created += 1
                        print(f"\rCreated tile {tiles_created}: {gz_file.name} ({total_features} features)", end='')
                else:
                    tiles_skipped += 1
                
                lng += self.tile_size
            lat += self.tile_size
        
        print(f"\nGenerated {tiles_created} SVG tiles (skipped {tiles_skipped} empty tiles)")
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