#!/usr/bin/env python3
"""
SVG Tile Generator
Builds accessible SVG map tiles for a region defined in regions.json.
Run: python build-tiles.py --region <id>   (default: regions.json activeRegion).
"""

import os
import sys
import json
import argparse
import gzip
import math
import copy
import hashlib
import requests
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

try:
    import osmium
    from shapely.geometry import Point, LineString, Polygon, box
    from shapely.ops import transform
    import pyproj
except ImportError:
    print("Installing required packages...")
    os.system("pip install osmium-tool shapely pyproj requests")
    import osmium
    from shapely.geometry import Point, LineString, Polygon, box
    from shapely.ops import transform
    import pyproj

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REGIONS_FILE = PROJECT_ROOT / "regions.json"


def resolve_region(region_id=None):
    """Look up a region in regions.json by id (default: its activeRegion)."""
    if not REGIONS_FILE.exists():
        sys.exit(f"regions.json not found at {REGIONS_FILE}")
    data = json.loads(REGIONS_FILE.read_text())
    by_id = {r["id"]: r for r in data.get("regions", [])}
    if not by_id:
        sys.exit("regions.json defines no regions.")
    rid = region_id or data.get("activeRegion") or next(iter(by_id))
    if rid not in by_id:
        sys.exit(f"Unknown region '{rid}'. Available: {', '.join(by_id)}")
    return by_id[rid]


class TileBuilder:
    def __init__(self, region):
        self.region = region
        # All geography and paths come from the region (regions.json) — nothing
        # city-specific is baked into this builder.
        self.output_dir = PROJECT_ROOT / region["localDir"]
        self.tiles_dir = self.output_dir / "tiles"
        self.data_dir = self.output_dir / "data"
        self.bounds = region["bounds"]
        self.source = (PROJECT_ROOT / region["source"]) if region.get("source") else None

        # Tile size in degrees (roughly 1km squares)
        self.tile_size = region.get("tileSize", 0.01)

        # SVG viewport size
        self.svg_size = 1000

        # Create directories
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.tiles_dir.mkdir(exist_ok=True)
        self.data_dir.mkdir(exist_ok=True)
        
        # Feature categories for accessibility
        self.feature_types = {
            'buildings': {
                'tags': {'building': True},
                'styles': {
                    # Residential buildings
                    'house': {'fill': '#d4c5b9', 'stroke': '#a69b8c', 'stroke_width': 1},
                    'residential': {'fill': '#d4c5b9', 'stroke': '#a69b8c', 'stroke_width': 1},
                    'apartments': {'fill': '#d4c5b9', 'stroke': '#a69b8c', 'stroke_width': 1},
                    'detached': {'fill': '#d4c5b9', 'stroke': '#a69b8c', 'stroke_width': 1},
                    'semidetached_house': {'fill': '#d4c5b9', 'stroke': '#a69b8c', 'stroke_width': 1},
                    'terrace': {'fill': '#d4c5b9', 'stroke': '#a69b8c', 'stroke_width': 1},
                    'dormitory': {'fill': '#dcc5b9', 'stroke': '#b3a08c', 'stroke_width': 1},
                    'bungalow': {'fill': '#d4c5b9', 'stroke': '#a69b8c', 'stroke_width': 1},
                    'cabin': {'fill': '#c4b5a9', 'stroke': '#96897c', 'stroke_width': 1},
                    
                    # Commercial buildings
                    'commercial': {'fill': '#e6cccc', 'stroke': '#cc9999', 'stroke_width': 1},
                    'office': {'fill': '#d9d0c9', 'stroke': '#b3a69c', 'stroke_width': 1},
                    'industrial': {'fill': '#dcd5cc', 'stroke': '#b3a999', 'stroke_width': 1},
                    'retail': {'fill': '#e6cccc', 'stroke': '#cc9999', 'stroke_width': 1},
                    'warehouse': {'fill': '#e5ddd5', 'stroke': '#ccbbaa', 'stroke_width': 1},
                    'supermarket': {'fill': '#ffcccc', 'stroke': '#ff9999', 'stroke_width': 1.5},
                    'hotel': {'fill': '#e6d5cc', 'stroke': '#ccaa99', 'stroke_width': 1.5},
                    'kiosk': {'fill': '#dcc5b9', 'stroke': '#b3a08c', 'stroke_width': 1},
                    
                    # Public buildings
                    'civic': {'fill': '#d4d5e8', 'stroke': '#a9aac4', 'stroke_width': 2},
                    'government': {'fill': '#d4d5e8', 'stroke': '#a9aac4', 'stroke_width': 2},
                    'hospital': {'fill': '#fdd', 'stroke': '#da8', 'stroke_width': 2},
                    'school': {'fill': '#f0e5d8', 'stroke': '#ccb399', 'stroke_width': 2},
                    'university': {'fill': '#f0e5d8', 'stroke': '#ccb399', 'stroke_width': 2},
                    'college': {'fill': '#f0e5d8', 'stroke': '#ccb399', 'stroke_width': 2},
                    'kindergarten': {'fill': '#ffe5cc', 'stroke': '#ffcc99', 'stroke_width': 1.5},
                    'public': {'fill': '#d4d5e8', 'stroke': '#a9aac4', 'stroke_width': 1.5},
                    'train_station': {'fill': '#d4c5e8', 'stroke': '#a99bc4', 'stroke_width': 2},
                    'transportation': {'fill': '#d4c5e8', 'stroke': '#a99bc4', 'stroke_width': 1.5},
                    'terminal': {'fill': '#d4a373', 'stroke': '#8b6914', 'stroke_width': 2.5},
                    
                    # Special structures (some already in religious)
                    'barn': {'fill': '#d4a76a', 'stroke': '#b58652', 'stroke_width': 1},
                    'bridge': {'fill': '#b8b8b8', 'stroke': '#888', 'stroke_width': 2},
                    'bunker': {'fill': '#999', 'stroke': '#666', 'stroke_width': 2},
                    'carport': {'fill': '#ddd', 'stroke': '#aaa', 'stroke_width': 1},
                    'conservatory': {'fill': '#eeffee', 'stroke': '#aaccaa', 'stroke_width': 1},
                    'construction': {'fill': '#ffcc99', 'stroke': '#ff9966', 'stroke_width': 1, 'dasharray': '5,3'},
                    'garage': {'fill': '#ddd', 'stroke': '#aaa', 'stroke_width': 1},
                    'garages': {'fill': '#ddd', 'stroke': '#aaa', 'stroke_width': 1},
                    'greenhouse': {'fill': '#eeffee', 'stroke': '#aaccaa', 'stroke_width': 1},
                    'hangar': {'fill': '#d5d5e8', 'stroke': '#aaaac4', 'stroke_width': 1.5},
                    'hut': {'fill': '#c4b5a9', 'stroke': '#96897c', 'stroke_width': 1},
                    'roof': {'fill': '#ddd', 'stroke': '#aaa', 'stroke_width': 0.5},
                    'shed': {'fill': '#c4b5a9', 'stroke': '#96897c', 'stroke_width': 1},
                    
                    # Default building style
                    'yes': {'fill': '#8e9aaf', 'stroke': '#5d6674', 'stroke_width': 1},
                    'default': {'fill': '#8e9aaf', 'stroke': '#5d6674', 'stroke_width': 1}
                }
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
            },
            'parking': {
                'tags': {
                    'amenity': ['parking', 'bicycle_parking', 'motorcycle_parking'],
                    'parking': ['surface', 'underground', 'multi-storey', 'rooftop', 'lane', 
                               'street_side', 'carports', 'garage_boxes', 'layby', 'sheds']
                },
                'styles': {
                    # General parking
                    'surface': {'fill': '#e6e6e6', 'stroke': '#999999', 'stroke_width': 1},
                    'underground': {'fill': '#d0d0d0', 'stroke': '#808080', 'stroke_width': 1, 'dasharray': '3,2'},
                    'multi-storey': {'fill': '#cccccc', 'stroke': '#666666', 'stroke_width': 1.5},
                    'rooftop': {'fill': '#e0e0e0', 'stroke': '#999999', 'stroke_width': 1, 'dasharray': '5,3'},
                    'street_side': {'fill': '#f0f0f0', 'stroke': '#a0a0a0', 'stroke_width': 0.5},
                    'garage_boxes': {'fill': '#d9d9d9', 'stroke': '#808080', 'stroke_width': 1},
                    # Bicycle parking
                    'bicycle_parking': {'fill': '#b3d9ff', 'stroke': '#4d94ff', 'stroke_width': 1},
                    # Motorcycle parking
                    'motorcycle_parking': {'fill': '#ffccb3', 'stroke': '#ff8c4d', 'stroke_width': 1},
                    # Default parking style
                    'default': {'fill': '#e6e6e6', 'stroke': '#999999', 'stroke_width': 1}
                }
            },
            'sensory_accessibility': {
                'tags': {
                    'tactile_paving': ['yes', 'no'],
                    'traffic_signals:sound': ['yes'],
                    'traffic_signals:vibration': ['yes'],
                    'acoustic': ['voice_description'],
                    'braille': ['yes'],
                    'audio_loop': ['yes'],
                    'sign_language': ['yes']
                },
                'styles': {
                    # Tactile paving
                    'tactile_paving': {'fill': '#ffeb3b', 'stroke': '#f57f17', 'stroke_width': 2},
                    'no_tactile_paving': {'fill': '#ffccbc', 'stroke': '#ff5722', 'stroke_width': 1, 'dasharray': '2,2'},
                    # Audio signals
                    'audio_signals': {'fill': '#4fc3f7', 'stroke': '#0288d1', 'stroke_width': 2},
                    'vibration_signals': {'fill': '#ce93d8', 'stroke': '#7b1fa2', 'stroke_width': 2},
                    # Communication aids
                    'voice_description': {'fill': '#a5d6a7', 'stroke': '#388e3c', 'stroke_width': 2},
                    'braille': {'fill': '#90caf9', 'stroke': '#1565c0', 'stroke_width': 2},
                    'audio_loop': {'fill': '#ffcc80', 'stroke': '#ef6c00', 'stroke_width': 2},
                    'sign_language': {'fill': '#f48fb1', 'stroke': '#c2185b', 'stroke_width': 2},
                    # Default
                    'default': {'fill': '#81c784', 'stroke': '#388e3c', 'stroke_width': 1.5}
                }
            },
            'mobility_access': {
                'tags': {
                    'wheelchair': ['yes', 'no', 'limited', 'designated'],
                    'ramp': ['yes'],
                    'ramp:wheelchair': ['yes'],
                    'ramp:stroller': ['yes'],
                    'ramp:bicycle': ['yes'],
                    'step_count': True,  # Any value
                    'handrail': ['yes'],
                    'handrail:center': ['yes'],
                    'handrail:left': ['yes'],
                    'handrail:right': ['yes']
                },
                'styles': {
                    'wheelchair_yes': {'fill': '#4CAF50', 'stroke': '#2E7D32', 'stroke_width': 2},
                    'wheelchair_no': {'fill': '#F44336', 'stroke': '#B71C1C', 'stroke_width': 2},
                    'wheelchair_limited': {'fill': '#FF9800', 'stroke': '#E65100', 'stroke_width': 2},
                    'wheelchair_designated': {'fill': '#2196F3', 'stroke': '#0D47A1', 'stroke_width': 2},
                    'ramp': {'fill': '#00BCD4', 'stroke': '#006064', 'stroke_width': 2},
                    'wheelchair_ramp': {'fill': '#00ACC1', 'stroke': '#006064', 'stroke_width': 2},
                    'stroller_ramp': {'fill': '#26C6DA', 'stroke': '#00838F', 'stroke_width': 2},
                    'bicycle_ramp': {'fill': '#4DD0E1', 'stroke': '#0097A7', 'stroke_width': 2},
                    'steps': {'fill': '#795548', 'stroke': '#3E2723', 'stroke_width': 2},
                    'handrail': {'fill': '#9E9E9E', 'stroke': '#424242', 'stroke_width': 2},
                    'handrail_center': {'fill': '#757575', 'stroke': '#212121', 'stroke_width': 2},
                    'handrail_left': {'fill': '#BDBDBD', 'stroke': '#616161', 'stroke_width': 2},
                    'handrail_right': {'fill': '#E0E0E0', 'stroke': '#757575', 'stroke_width': 2}
                }
            },
            'accessible_transport': {
                'tags': {
                    'capacity:disabled': True,  # Any value
                    'parking:disabled': ['yes'],
                    'priority': ['disabled'],
                    'bus:wheelchair': ['yes'],
                    'subway:wheelchair': ['yes'],
                    'tram:wheelchair': ['yes'],
                    'train:wheelchair': ['yes']
                },
                'styles': {
                    # Parking
                    'disabled_parking': {'fill': '#2196F3', 'stroke': '#0D47A1', 'stroke_width': 2},
                    'priority_access': {'fill': '#3F51B5', 'stroke': '#1A237E', 'stroke_width': 2},
                    # Transit
                    'accessible_bus': {'fill': '#4CAF50', 'stroke': '#2E7D32', 'stroke_width': 2},
                    'accessible_subway': {'fill': '#9C27B0', 'stroke': '#6A1B9A', 'stroke_width': 2},
                    'accessible_tram': {'fill': '#FF9800', 'stroke': '#E65100', 'stroke_width': 2},
                    'accessible_train': {'fill': '#795548', 'stroke': '#3E2723', 'stroke_width': 2},
                    # Default
                    'default': {'fill': '#00BCD4', 'stroke': '#006064', 'stroke_width': 1.5}
                }
            },
            'accessible_facilities': {
                'tags': {
                    'toilets:wheelchair': ['yes'],
                    'changing_table': ['yes'],
                    'changing_table:location': True,  # Any value
                    'elevator': ['yes'],
                    'escalator': ['yes'],
                    'conveying': ['yes', 'moving_walkway'],
                    'automatic_door': ['yes'],
                    'door:width': True,  # Any value
                    'kerb:height': True,  # Any value
                    'incline': True,  # Any value
                    'highway': ['elevator', 'escalator']
                },
                'styles': {
                    # Toilets and changing facilities
                    'accessible_toilet': {'fill': '#e1f5fe', 'stroke': '#0288d1', 'stroke_width': 2},
                    'changing_table': {'fill': '#f3e5f5', 'stroke': '#7b1fa2', 'stroke_width': 2},
                    # Vertical access
                    'elevator': {'fill': '#c5e1a5', 'stroke': '#689f38', 'stroke_width': 2},
                    'escalator': {'fill': '#ffccbc', 'stroke': '#ff5722', 'stroke_width': 2},
                    'moving_walkway': {'fill': '#d7ccc8', 'stroke': '#795548', 'stroke_width': 2},
                    # Doors and entrances
                    'automatic_door': {'fill': '#b2dfdb', 'stroke': '#00796b', 'stroke_width': 2},
                    'wide_door': {'fill': '#c5cae9', 'stroke': '#3f51b5', 'stroke_width': 2},
                    # Curbs and ramps
                    'low_kerb': {'fill': '#fff9c4', 'stroke': '#f9a825', 'stroke_width': 2},
                    'steep_incline': {'fill': '#ffccbc', 'stroke': '#ff5722', 'stroke_width': 2, 'dasharray': '5,2'},
                    'gentle_incline': {'fill': '#dcedc8', 'stroke': '#7cb342', 'stroke_width': 2},
                    # Default
                    'default': {'fill': '#64b5f6', 'stroke': '#1976d2', 'stroke_width': 1.5}
                }
            },
            'aeroway': {
                'tags': {
                    'aeroway': ['aerodrome', 'apron', 'gate', 'hangar', 'helipad', 'heliport',
                               'holding_position', 'jet_bridge', 'navigationaid', 'parking_position', 
                               'runway', 'taxilane', 'taxiway', 'terminal', 'windsock']
                },
                'styles': {
                    # Airport infrastructure
                    'aerodrome': {'fill': '#e8e8e8', 'stroke': '#999999', 'stroke_width': 2},
                    'terminal': {'fill': '#d4a373', 'stroke': '#8b6914', 'stroke_width': 2},
                    'hangar': {'fill': '#d9d0c9', 'stroke': '#b8b0a9', 'stroke_width': 1.5},
                    
                    # Runways and taxiways
                    'runway': {'fill': '#333333', 'stroke': '#000000', 'stroke_width': 2},
                    'taxiway': {'fill': '#666666', 'stroke': '#333333', 'stroke_width': 1.5},
                    'taxilane': {'fill': '#808080', 'stroke': '#666666', 'stroke_width': 1},
                    'apron': {'fill': '#cccccc', 'stroke': '#999999', 'stroke_width': 1},
                    
                    # Aircraft positions
                    'parking_position': {'fill': '#e0e0e0', 'stroke': '#999999', 'stroke_width': 1, 'dasharray': '5,2'},
                    'holding_position': {'fill': '#ffeb3b', 'stroke': '#f57f17', 'stroke_width': 2},
                    
                    # Gates and terminals
                    'gate': {'fill': '#ff6b6b', 'stroke': '#cc0000', 'stroke_width': 2},
                    'jet_bridge': {'fill': '#b0bec5', 'stroke': '#607d8b', 'stroke_width': 2},
                    
                    # Helipads
                    'helipad': {'fill': '#ff9800', 'stroke': '#e65100', 'stroke_width': 2},
                    'heliport': {'fill': '#ff5722', 'stroke': '#bf360c', 'stroke_width': 2},
                    
                    # Navigation aids
                    'navigationaid': {'fill': '#2196f3', 'stroke': '#0d47a1', 'stroke_width': 2},
                    'windsock': {'fill': '#f44336', 'stroke': '#b71c1c', 'stroke_width': 1.5},
                    
                    # Default style
                    'default': {'fill': '#cccccc', 'stroke': '#999999', 'stroke_width': 1}
                }
            },
            'indoor': {
                'tags': {
                    'indoor': ['area', 'corridor', 'room', 'wall', 'level', 'yes'],
                    'room': ['gate_area', 'security', 'shop', 'restaurant', 'waiting_area', 'office']
                },
                'styles': {
                    # Indoor areas
                    'area': {'fill': '#f5f5f5', 'stroke': '#cccccc', 'stroke_width': 1},
                    'corridor': {'fill': '#fffbf0', 'stroke': '#d9d0c1', 'stroke_width': 1},
                    'room': {'fill': '#f0f0f0', 'stroke': '#c0c0c0', 'stroke_width': 1},
                    'wall': {'fill': '#666666', 'stroke': '#333333', 'stroke_width': 2},
                    'level': {'fill': '#e8e8e8', 'stroke': '#b8b8b8', 'stroke_width': 1},
                    
                    # Specific room types
                    'gate_area': {'fill': '#ffe0b2', 'stroke': '#ffb74d', 'stroke_width': 1.5},
                    'security': {'fill': '#ffcdd2', 'stroke': '#ef5350', 'stroke_width': 1.5},
                    'waiting_area': {'fill': '#e1f5fe', 'stroke': '#4fc3f7', 'stroke_width': 1},
                    
                    # Default indoor style
                    'yes': {'fill': '#f8f8f8', 'stroke': '#d0d0d0', 'stroke_width': 1},
                    'default': {'fill': '#f8f8f8', 'stroke': '#d0d0d0', 'stroke_width': 1}
                }
            },
            'amenity': {
                'tags': {
                    'amenity': ['seating', 'bench', 'waiting_area', 'shelter', 'check_in', 'baggage_drop', 
                               'security_check', 'customs', 'immigration', 'lounge', 'baggage_claim',
                               'lost_property', 'information', 'currency_exchange', 'toilets', 'shower',
                               'nursing_room', 'prayer_room', 'smoking_area', 'wheelchair_rental',
                               'animal_relief_area', 'taxi', 'car_rental', 'bus_station', 'parking',
                               'valet_parking', 'restaurant', 'fast_food', 'cafe', 'bar', 'vending_machine']
                },
                'styles': {
                    # Seating and waiting
                    'seating': {'fill': '#81c784', 'stroke': '#4caf50', 'stroke_width': 1.5},
                    'bench': {'fill': '#a5d6a7', 'stroke': '#66bb6a', 'stroke_width': 1},
                    'waiting_area': {'fill': '#c5e1a5', 'stroke': '#9ccc65', 'stroke_width': 1.5},
                    'shelter': {'fill': '#dce775', 'stroke': '#cddc39', 'stroke_width': 1.5},
                    # Check-in and security
                    'check_in': {'fill': '#90caf9', 'stroke': '#2196f3', 'stroke_width': 2},
                    'baggage_drop': {'fill': '#a1887f', 'stroke': '#6d4c41', 'stroke_width': 2},
                    'security_check': {'fill': '#ffcdd2', 'stroke': '#d32f2f', 'stroke_width': 2},
                    'customs': {'fill': '#e1bee7', 'stroke': '#8e24aa', 'stroke_width': 2},
                    'immigration': {'fill': '#ffe0b2', 'stroke': '#ef6c00', 'stroke_width': 2},
                    # Terminal services
                    'lounge': {'fill': '#9c27b0', 'stroke': '#6a1b9a', 'stroke_width': 2},
                    'baggage_claim': {'fill': '#795548', 'stroke': '#5d4037', 'stroke_width': 2},
                    'lost_property': {'fill': '#607d8b', 'stroke': '#455a64', 'stroke_width': 2},
                    'information': {'fill': '#03a9f4', 'stroke': '#0288d1', 'stroke_width': 2},
                    'currency_exchange': {'fill': '#4caf50', 'stroke': '#388e3c', 'stroke_width': 2},
                    # Terminal amenities
                    'toilets': {'fill': '#e3f2fd', 'stroke': '#1976d2', 'stroke_width': 1.5},
                    'shower': {'fill': '#b3e5fc', 'stroke': '#0288d1', 'stroke_width': 1.5},
                    'nursing_room': {'fill': '#fce4ec', 'stroke': '#c2185b', 'stroke_width': 1.5},
                    'prayer_room': {'fill': '#f3e5f5', 'stroke': '#7b1fa2', 'stroke_width': 1.5},
                    'smoking_area': {'fill': '#efebe9', 'stroke': '#5d4037', 'stroke_width': 1.5},
                    # Accessibility features
                    'wheelchair_rental': {'fill': '#1976d2', 'stroke': '#0d47a1', 'stroke_width': 2},
                    'animal_relief_area': {'fill': '#a5d6a7', 'stroke': '#4caf50', 'stroke_width': 1.5},
                    # Transportation connections
                    'taxi': {'fill': '#fdd835', 'stroke': '#f57f17', 'stroke_width': 2},
                    'car_rental': {'fill': '#ff6f00', 'stroke': '#e65100', 'stroke_width': 2},
                    'bus_station': {'fill': '#673ab7', 'stroke': '#4527a0', 'stroke_width': 2},
                    'parking': {'fill': '#757575', 'stroke': '#424242', 'stroke_width': 1.5},
                    'valet_parking': {'fill': '#546e7a', 'stroke': '#37474f', 'stroke_width': 2},
                    # Food & beverage
                    'restaurant': {'fill': '#ff5722', 'stroke': '#d84315', 'stroke_width': 2},
                    'fast_food': {'fill': '#ff9800', 'stroke': '#e65100', 'stroke_width': 2},
                    'cafe': {'fill': '#795548', 'stroke': '#4e342e', 'stroke_width': 2},
                    'bar': {'fill': '#9c27b0', 'stroke': '#6a1b9a', 'stroke_width': 2},
                    'vending_machine': {'fill': '#00acc1', 'stroke': '#00838f', 'stroke_width': 1.5},
                    'default': {'fill': '#aed581', 'stroke': '#8bc34a', 'stroke_width': 1}
                }
            },
            'barrier': {
                'tags': {
                    'barrier': ['checkpoint', 'gate', 'turnstile', 'full-height_turnstile']
                },
                'styles': {
                    'checkpoint': {'fill': '#ff9999', 'stroke': '#cc0000', 'stroke_width': 2.5},
                    'gate': {'fill': '#cccccc', 'stroke': '#666666', 'stroke_width': 2},
                    'turnstile': {'fill': '#b0b0b0', 'stroke': '#606060', 'stroke_width': 1.5},
                    'full-height_turnstile': {'fill': '#a0a0a0', 'stroke': '#505050', 'stroke_width': 2},
                    'default': {'fill': '#cccccc', 'stroke': '#666666', 'stroke_width': 1.5}
                }
            },
            'shop': {
                'tags': {
                    'shop': ['duty_free', 'convenience']
                },
                'styles': {
                    'duty_free': {'fill': '#ff9800', 'stroke': '#e65100', 'stroke_width': 2},
                    'convenience': {'fill': '#4fc3f7', 'stroke': '#0288d1', 'stroke_width': 1.5},
                    'default': {'fill': '#ffa726', 'stroke': '#ef6c00', 'stroke_width': 1.5}
                }
            },
            'railway': {
                'tags': {
                    'railway': ['station'],
                    'station': ['airport']
                },
                'styles': {
                    'airport_station': {'fill': '#3f51b5', 'stroke': '#1a237e', 'stroke_width': 2.5},
                    'station': {'fill': '#5c6bc0', 'stroke': '#283593', 'stroke_width': 2},
                    'default': {'fill': '#7986cb', 'stroke': '#3949ab', 'stroke_width': 1.5}
                }
            }
        }

    def get_region_pbf(self):
        """Return the OSM extract for this region, building it if needed.

        Fast path: the region's "source" extract already exists (the common
        case). Otherwise, if the region defines "osmSource" (a larger .osm.pbf
        to carve the bounds out of), extract it with osmium; else explain what
        to provide.
        """
        if self.source and self.source.exists():
            print(f"Using region extract: {self.source}")
            return self.source

        target = self.source or (self.data_dir / f"{self.region['id']}-area.osm.pbf")
        osm_source = self.region.get("osmSource")
        if not osm_source:
            sys.exit(
                f"No OSM data for region '{self.region['id']}'.\n"
                f"  Either place an extract at: {target}\n"
                f"  or set \"osmSource\" in regions.json (path to a larger "
                f".osm.pbf to extract the region bounds from)."
            )

        big = Path(osm_source)
        if not big.is_absolute():
            big = PROJECT_ROOT / big
        if not big.exists():
            sys.exit(f"osmSource not found: {big}")

        b = self.bounds
        bbox = f"{b['west']},{b['south']},{b['east']},{b['north']}"
        cmd = f"osmium extract --overwrite -b {bbox} {big} -o {target}"
        print(f"Extracting region bounds: {cmd}")
        if os.system(cmd) != 0:
            sys.exit("Error: osmium extract failed (install osmium-tool).")
        print(f"Extracted to {target}")
        return target

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
            # A single trailing underscore is Python's escape for reserved words
            # (class_ -> class); strip it before hyphenating the rest
            # (stroke_width -> stroke-width). Previously this emitted "class-".
            attr = key[:-1] if key.endswith('_') else key
            element.set(attr.replace('_', '-'), str(value))
        return element

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
        
        # Add a clip path to ensure features don't overflow the tile bounds. The
        # id is TILE-UNIQUE so the combined viewer DOM never has clip-path id
        # clashes — the viewer used to rename every id at load to avoid them; now
        # it doesn't have to (a hot-path saving on every pan/zoom).
        clip_id = f"clip-{tile_lat:.3f}_{tile_lng:.3f}"
        defs = self.create_svg_element('defs')
        clipPath = self.create_svg_element('clipPath', id=clip_id)
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
        
        # Group features into per-base-category layers, rendering each through
        # its taxonomy classification (base geometry + filterable overlays).
        layers = {}
        casing_layers = {}

        def layer_for(category):
            if category not in layers:
                # No id on the layer group: it was the category name (e.g.
                # "building"), which collided across tiles and nothing references.
                g = self.create_svg_element(
                    'g', class_='layer', clip_path=f'url(#{clip_id})')
                layers[category] = g
                svg.append(g)
            return layers[category]

        def casings_for(category):
            # A visual-only sub-layer holding every casing for this category,
            # inserted UNDER all the fills so e.g. road intersections stay
            # seamless. aria-hidden + pointer-events:none so it never steals the
            # name or the hover target from the per-feature fill groups.
            if category not in casing_layers:
                cg = self.create_svg_element('g', class_=f'{category}-casings')
                cg.set('aria-hidden', 'true')
                cg.set('pointer-events', 'none')
                layer_for(category).insert(0, cg)
                casing_layers[category] = cg
            return casing_layers[category]

        feature_count = 0
        for feature in features:  # flat list from the processor
            element, casing = self.render_feature(feature, bounds)
            if element is None:
                continue
            cls = feature['classification']
            category = (cls['base'] or cls['primary'])['category']
            if casing is not None:
                casings_for(category).append(casing)
            layer_for(category).append(element)
            feature_count += 1

        if feature_count == 0:
            return None  # Don't create empty tiles

        return svg

    # Category token -> the feature_types styling bucket (still keyed by the old
    # plural/underscore names). Styling stays in the generator for now.
    _CAT2BUCKET = {
        'building': 'buildings', 'road': 'roads', 'park': 'parks',
        'sensory': 'sensory_accessibility', 'facility': 'accessible_facilities',
        'mobility': 'mobility_access', 'transport': 'accessible_transport',
    }

    def _style_for(self, category, subtype):
        styles = self.feature_types.get(self._CAT2BUCKET.get(category, category), {}).get('styles', {})
        return (styles.get(subtype) or styles.get('default')
                or {'fill': '#d9d9d9', 'stroke': '#999999', 'stroke_width': 1})

    def _svg_points(self, coords, bounds):
        # shapely coords are (lon, lat); coord_to_svg takes (lat, lng)
        return ' '.join(f"{x},{y}" for x, y in
                        (self.coord_to_svg(c[1], c[0], bounds) for c in coords))

    def _polygon_path(self, polygon, bounds):
        segments = []
        for ring in [polygon.exterior] + list(polygon.interiors):
            pts = [self.coord_to_svg(c[1], c[0], bounds) for c in ring.coords]
            if len(pts) < 3:
                continue
            segments.append(f"M {pts[0][0]},{pts[0][1]} "
                            + ' '.join(f"L {x},{y}" for x, y in pts[1:]) + " Z")
        return ' '.join(segments)

    def _geometry_element(self, geom, bounds):
        gtype = geom.geom_type
        if gtype == 'Point':
            x, y = self.coord_to_svg(geom.y, geom.x, bounds)
            return self.create_svg_element('circle', cx=x, cy=y, r=5)
        if gtype == 'LineString':
            pts = self._svg_points(geom.coords, bounds)
            return self.create_svg_element('polyline', points=pts, fill='none') if pts else None
        if gtype == 'MultiLineString':
            segs = []
            for line in geom.geoms:
                pts = [self.coord_to_svg(c[1], c[0], bounds) for c in line.coords]
                if len(pts) >= 2:
                    segs.append(f"M {pts[0][0]},{pts[0][1]} "
                                + ' '.join(f"L {x},{y}" for x, y in pts[1:]))
            d = ' '.join(segs)
            return self.create_svg_element('path', d=d, fill='none') if d else None
        if gtype == 'Polygon':
            pts = self._svg_points(geom.exterior.coords, bounds)
            return self.create_svg_element('polygon', points=pts) if pts else None
        if gtype == 'MultiPolygon':
            d = ' '.join(filter(None, (self._polygon_path(p, bounds) for p in geom.geoms)))
            return self.create_svg_element('path', d=d) if d else None
        return None

    def render_feature(self, feature, bounds):
        """Render one classified feature: its base geometry + style, wrapped in
        a group carrying the primary class plus every overlay class (so the
        path/footprint stays itself AND is filterable by each overlay), an img
        role, and an accessible label that includes the overlay attributes."""
        cls = feature['classification']
        primary = cls['primary']
        if primary is None:
            return None, None
        # Clip the geometry to this tile (+ a small margin so strokes that cross a
        # boundary stay continuous; the viewer trims the margin). Each tile then
        # carries only its own slice of a feature instead of the feature's full
        # extent — a large node-count reduction, and it's what makes huge features
        # (e.g. Lake Ontario) affordable instead of bloating every tile they touch.
        margin = 0.0005
        clip_box = box(bounds['west'] - margin, bounds['south'] - margin,
                       bounds['east'] + margin, bounds['north'] + margin)
        geom = feature['geometry'].intersection(clip_box)
        if geom.is_empty:
            return None, None
        shape = self._geometry_element(geom, bounds)
        if shape is None:
            return None, None

        style = self._style_for(primary['category'], primary['subtype'])
        # Two styling schemas. Line features (roads, paths, footways, cycleways,
        # rail) use color/width/casing/dasharray and are stroked, optionally over
        # a wider casing drawn underneath. Area/point features use fill/stroke/
        # stroke-width. The casing (returned separately) goes in a sub-layer under
        # ALL the fills so road intersections stay seamless.
        casing = None
        is_line = shape.tag in ('polyline', 'path') and ('color' in style or 'casing' in style)
        if is_line:
            color = style.get('color', style.get('stroke', '#ffffff'))
            width = style.get('width', style.get('stroke_width', 2))
            if style.get('casing'):
                casing = copy.deepcopy(shape)
                casing.set('fill', 'none')
                casing.set('stroke', style['casing'])
                casing.set('stroke-width', str(style.get('casing_width', width + 2)))
                casing.set('stroke-linecap', 'round')
                casing.set('stroke-linejoin', 'round')
            shape.set('fill', 'none')
            shape.set('stroke', color)
            shape.set('stroke-width', str(width))
            shape.set('stroke-linecap', 'round')
            shape.set('stroke-linejoin', 'round')
            if style.get('dasharray'):
                shape.set('stroke-dasharray', style['dasharray'])
        else:
            if shape.get('fill') != 'none' and style.get('fill') is not None:
                shape.set('fill', style['fill'])
            if style.get('stroke') is not None:
                shape.set('stroke', style['stroke'])
            if style.get('stroke_width') is not None:
                shape.set('stroke-width', str(style['stroke_width']))
            if style.get('dasharray'):
                shape.set('stroke-dasharray', style['dasharray'])

        props = feature['properties']
        # primary class + every overlay class, flattened + de-duplicated
        tokens = []
        for sc in [primary['svgClass']] + [o['svgClass'] for o in cls['overlays']]:
            for tok in sc.split():
                if tok not in tokens:
                    tokens.append(tok)
        # Accessible name = OSM name + the taxonomy's (subtype-specific) type
        # label + address, then the overlay attribute labels. The type wording is
        # the manifest's subtypeLabels (applied by the engine) — one source of
        # truth, no parallel hand-coded label tables.
        name = props.get('name')
        # The type word should say what the feature IS — its base geometry, or
        # failing that a real place POI — NOT an accessibility attribute it merely
        # carries. So a pizzeria with an accessible toilet reads "Blaze Pizza, Fast
        # food, ... Accessible toilets", not typed as a toilet. (The address marker
        # isn't a type.) Accessibility/other attributes follow as overlay labels.
        type_source = (cls.get('base')
                       or next((o for o in cls['overlays']
                                if o.get('layer') == 'poi' and o.get('subtype') != 'address'), None)
                       or primary)
        type_label = type_source.get('label') or type_source['category'].replace('-', ' ').title()
        addr = ' '.join(filter(None, (props.get('addr:housenumber'), props.get('addr:street'))))
        base_parts = [p for p in (name, type_label) if p]
        if addr:
            base_parts.append(f"at {addr}")
        base_label = ', '.join(base_parts) or type_label
        # Drop the type source from the overlay list so its label isn't spoken
        # twice (for a base-less POI node the type source is one of the overlays).
        overlay_labels = [o['label'] for o in cls['overlays']
                          if o.get('label') and o is not type_source]
        aria = f"{base_label}. {', '.join(overlay_labels)}" if overlay_labels else base_label

        group = self.create_svg_element('g', class_=' '.join(tokens), role='img', aria_label=aria)
        group.set('data-osm-id', str(props.get('osm_id', '')))
        if cls['overlays']:
            group.set('data-overlays', ' '.join(o['id'] for o in cls['overlays']))
        group.append(shape)
        return group, casing

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

    # Accessibility-relevant OSM tags, indexed as filterable search fields.
    _A11Y_KEYS = (
        'wheelchair', 'wheelchair:description', 'toilets:wheelchair',
        'tactile_paving', 'tactile_writing', 'braille',
        'ramp', 'ramp:wheelchair', 'handrail', 'incline', 'kerb', 'step_count',
        'automatic_door', 'door', 'entrance',
        'hearing_loop', 'audio_loop', 'induction_loop', 'blind', 'deaf',
    )
    # Categories whose features are findable even without a name (POIs).
    _SEARCH_POI_CATS = frozenset({
        'amenity', 'shop', 'facility', 'sensory', 'mobility', 'transport',
        'transit', 'historic', 'tourism', 'religious', 'man_made', 'park',
    })

    def write_search_index(self, features):
        """Emit one NDJSON search document per findable feature — named things,
        POIs (washrooms, post boxes, benches...) and addresses — for bulk-loading
        into OpenSearch. OSM accessibility tags are indexed as filterable fields
        and a geo_point is included for distance/sort. Built from the same single
        parse as the tiles, so search and map can never drift apart."""
        search_dir = self.output_dir / 'search'
        search_dir.mkdir(exist_ok=True)
        out = search_dir / 'map-features.ndjson'
        n = 0
        with open(out, 'w', encoding='utf-8') as fh:
            for f in features:
                props = f['properties']
                cls = f['classification']
                primary = cls.get('primary')
                overlays = cls.get('overlays', [])
                name = props.get('name')
                addr = {k[5:]: v for k, v in props.items() if k.startswith('addr:')}
                cats = {primary['category'] if primary else None} | {o['category'] for o in overlays}
                is_poi = bool(cats & self._SEARCH_POI_CATS)
                if not (name or addr.get('housenumber') or addr.get('street') or is_poi):
                    continue  # generic unnamed base geometry — not findable
                c = f['geometry'].centroid
                if c.is_empty:
                    continue
                # Prefer a real "place" POI for display/category; failing that a
                # mobility marker (wheelchair status) — which is at least a reason
                # the point is findable — over the bare primary, which for an
                # attribute-only node would be a terrain overlay (a surface/incline
                # label is a poor name for a searchable feature).
                lead = (next((o for o in overlays
                              if o['category'] in self._SEARCH_POI_CATS and o['category'] != 'mobility'), None)
                        or next((o for o in overlays if o['category'] == 'mobility'), None)
                        or primary)
                # Deduplicate labels (a POI node's primary IS its first overlay).
                labels = list(dict.fromkeys(
                    e['label'] for e in ([primary] + overlays) if e and e.get('label')))
                addr_str = ' '.join(filter(None, (addr.get('housenumber'), addr.get('street'))))
                access = {k.replace(':', '_'): props[k] for k in self._A11Y_KEYS if k in props}
                doc = {
                    'osm_id': props.get('osm_id'),
                    'name': name,
                    'display': name or (lead.get('label') if lead else None) or addr_str or 'Feature',
                    'category': lead['category'] if lead else None,
                    'subtype': lead.get('subtype') if lead else None,
                    'types': labels,
                    'text': ' '.join(filter(None, [name, addr_str] + labels)),
                    'lat': round(c.y, 6),
                    'lng': round(c.x, 6),
                    'location': {'lat': round(c.y, 6), 'lon': round(c.x, 6)},
                }
                if addr:
                    doc['address'] = addr
                if access:
                    doc['access'] = access
                fh.write(json.dumps(doc, ensure_ascii=False) + '\n')
                n += 1
        print(f"Search index: wrote {n} documents -> {out}", flush=True)
        return n

    def process_osm_data(self, osm_file):
        """Process the OSM extract into tiles.

        The extract is parsed ONCE for the whole region (it used to be re-parsed
        per tile — ~80x slower); features are then bucketed into the tiles their
        bounding box overlaps, and each tile renders from its own list.
        """
        from collections import defaultdict
        from osm_tile_processor import OSMHandler
        from taxonomy_engine import Taxonomy

        taxonomy = Taxonomy.load()
        print("Parsing OSM extract once for the whole region...", flush=True)
        handler = OSMHandler(self.bounds, taxonomy)
        handler.apply_file(str(osm_file), locations=True)
        features = handler.features
        print(f"Collected {len(features)} features; bucketing into tiles...", flush=True)

        # Build the search index from the SAME parse (named things, POIs and
        # addresses; accessibility tags as filterable fields) so it can never
        # drift from the rendered map.
        self.write_search_index(features)

        size = self.tile_size
        south, west = self.bounds['south'], self.bounds['west']
        n_lat = max(1, round((self.bounds['north'] - south) / size))
        n_lng = max(1, round((self.bounds['east'] - west) / size))

        # One pass: assign each feature to every tile its bbox overlaps. Inclusive
        # floor with a small epsilon — lat/0.01 can land just below an integer in
        # floating point, so a bare floor would under-include the top edge tile and
        # leave a one-feature gap; over-including a tile a feature merely touches is
        # harmless (the generation clip trims it).
        buckets = defaultdict(list)
        for f in features:
            minlon, minlat, maxlon, maxlat = f['geometry'].bounds
            i0 = int(math.floor((minlat - south) / size - 1e-6))
            i1 = int(math.floor((maxlat - south) / size + 1e-6))
            j0 = int(math.floor((minlon - west) / size - 1e-6))
            j1 = int(math.floor((maxlon - west) / size + 1e-6))
            for i in range(max(i0, 0), min(i1, n_lat - 1) + 1):
                for j in range(max(j0, 0), min(j1, n_lng - 1) + 1):
                    buckets[(i, j)].append(f)

        # Per-feature appears-at-zoom (the m-rule): a tangible SHAPE is shown only
        # at zooms where it renders at least as big as a readable "m" (M_FLOOR_PX,
        # the tooltip font). min_zoom = 18 + log2(floor / extent_at_z18). POIs /
        # points have no shape to perceive by size — they always show (their
        # density is a separate design pass). See docs/RENDERING_AT_SCALE.md.
        M_FLOOR_PX = 13.0
        px_per_deg = self.svg_size / size
        for f in features:
            if (f.get('classification') or {}).get('base') is None:
                f['min_zoom'] = 0.0
                continue
            try:
                mnx, mny, mxx, mxy = f['geometry'].bounds
                extent_px = max(mxx - mnx, mxy - mny) * px_per_deg
            except Exception:
                extent_px = 0.0
            f['min_zoom'] = (18 + math.log2(M_FLOOR_PX / extent_px)) if extent_px > 0 else 99.0

        # LOD bands: the full set (served at zoom >= 18) plus coarser sets that drop
        # features below the "m" floor for that zoom. Coarser bands skip tiles that
        # come out empty, so zooming out fetches fewer AND lighter tiles. Each band
        # is a self-contained {tiles/, tile-index.json} unit; the full band stays at
        # the root so the existing URL keeps working.
        full_tiles_dir = self.tiles_dir
        bands = [(None, None), ('lod17', 17), ('lod16', 16), ('lod15', 15)]
        total_created = 0
        for band_name, max_z in bands:
            self.tiles_dir = (full_tiles_dir if band_name is None
                              else self.output_dir / band_name / 'tiles')
            self.tiles_dir.mkdir(parents=True, exist_ok=True)
            created = 0
            for (i, j), tile_features in buckets.items():
                feats = (tile_features if max_z is None
                         else [f for f in tile_features if f.get('min_zoom', 0) <= max_z])
                if not feats:
                    continue
                lat = round(south + i * size, 4)
                lng = round(west + j * size, 4)
                svg = self.create_tile_svg(lat, lng, feats)
                if svg is not None:
                    self.save_svg_tile(svg, lat, lng)
                    created += 1
            print(f"\nBand '{band_name or 'full'}': {created} tiles", flush=True)
            if band_name is not None:
                self.create_tile_index()   # full band is indexed by the caller
            total_created += created

        self.tiles_dir = full_tiles_dir    # restore for the caller's full-band index
        return total_created

    def create_tile_index(self):
        """Create index of available tiles"""
        print("Creating tile index...")
        
        tiles = list(self.tiles_dir.glob("*.svg.gz"))
        
        index = {
            'bounds': self.bounds,
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
        
        # Content-derived version: a short hash of the tile set (names + sizes).
        # The viewer appends it to tile URLs (?v=…) so a republish with changed
        # tiles busts the browser cache, while identical rebuilds keep the same
        # version (tiles stay cached). Changes only when tile content changes.
        sig = ''.join(f"{t['file']}:{t['size_bytes']};"
                      for t in sorted(index['tiles'], key=lambda x: x['file']))
        index['version'] = hashlib.md5(sig.encode()).hexdigest()[:12]

        # Save index next to its tile dir (full band -> output_dir/tile-index.json;
        # an LOD band -> output_dir/<band>/tile-index.json).
        index_file = self.tiles_dir.parent / "tile-index.json"
        with open(index_file, 'w') as f:
            json.dump(index, f, indent=2)

        print(f"Created tile index: {index_file} (version {index['version']})")
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
        print(f"Building SVG tiles for region: {self.region['label']} ({self.region['id']})")

        # Step 1: get the region's OSM extract
        region_pbf = self.get_region_pbf()

        # Step 2: Process into tiles
        tile_count = self.process_osm_data(region_pbf)

        # Step 3: Create index
        index = self.create_tile_index()

        # Step 4: Generate CSS
        self.generate_sample_css()

        print(f"\n✅ Build complete!")
        print(f"Generated {tile_count} SVG tiles")
        print(f"Total size: {sum(f.stat().st_size for f in self.tiles_dir.glob('*.svg.gz')) / 1024 / 1024:.1f} MB")
        print(f"Output directory: {self.output_dir}")

        return self.output_dir


def main():
    parser = argparse.ArgumentParser(
        description="Build accessible SVG map tiles for a region defined in regions.json.")
    parser.add_argument("--region", help="Region id from regions.json (default: its activeRegion).")
    parser.add_argument("--check", action="store_true",
                        help="Resolve the region and print its config, without building.")
    args = parser.parse_args()

    region = resolve_region(args.region)

    if args.check:
        b = region["bounds"]
        src = (PROJECT_ROOT / region["source"]) if region.get("source") else "(none)"
        print(f"Region:    {region['label']} ({region['id']})")
        print(f"Output:    {PROJECT_ROOT / region['localDir']}")
        print(f"Source:    {src}")
        print(f"Bounds:    N {b['north']}  S {b['south']}  E {b['east']}  W {b['west']}")
        print(f"Tile size: {region.get('tileSize', 0.01)}")
        return

    builder = TileBuilder(region)
    output_dir = builder.build_tiles()

    print(f"\nNext: publish '{output_dir.name}' with Tile Studio (Publish pane).")


if __name__ == "__main__":
    main()