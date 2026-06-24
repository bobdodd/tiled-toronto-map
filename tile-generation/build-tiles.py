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
import re
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
            # man_made structures. Without this bucket _style_for returns {} and they
            # render invisibly (Bob: "we're not rendering man-made objects"). Lines/
            # ways (pier, breakwater, dyke, groyne) use color/width; areas + nodes
            # (tower, mast, storage_tank, silo, water_tower) use fill/stroke.
            'man_made': {
                'styles': {
                    'pier':        {'color': '#9a8f7a', 'width': 2.5, 'fill': '#cfc7b5', 'stroke': '#9a8f7a', 'stroke_width': 1},
                    'breakwater':  {'color': '#9a8f7a', 'width': 2.5},
                    'groyne':      {'color': '#9a8f7a', 'width': 2},
                    'dyke':        {'color': '#b3a994', 'width': 2.5, 'fill': '#cfc7b5', 'stroke': '#9c917b', 'stroke_width': 1},
                    'embankment':  {'color': '#b3a994', 'width': 2},
                    'tower':       {'fill': '#9a9a9a', 'stroke': '#6a6a6a', 'stroke_width': 1.5},
                    'mast':        {'fill': '#9a9a9a', 'stroke': '#6a6a6a', 'stroke_width': 1.5},
                    'water_tower': {'fill': '#c4c4c4', 'stroke': '#8f8f8f', 'stroke_width': 1},
                    'storage_tank':{'fill': '#c4c4c4', 'stroke': '#8f8f8f', 'stroke_width': 1},
                    'silo':        {'fill': '#c4c4c4', 'stroke': '#8f8f8f', 'stroke_width': 1},
                    'default':     {'fill': '#b8b8b8', 'stroke': '#888888', 'stroke_width': 1},
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

        # PROTOTYPE styling for in-road street labels so a standalone tile renders
        # correctly (qlmanage / direct view). Dark text + white halo (paint-order)
        # for AAA contrast over the soft map fills, centred on the path. For
        # production this moves to the viewer CSS with a constant-screen-size var.
        style = self.create_svg_element('style')
        style.text = ("text.road-label{font-weight:600;font-size:var(--label-size,13px);"
                      "font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;"
                      "fill:#1a1a1a;paint-order:stroke;stroke:#ffffff;stroke-width:3px;"
                      "vector-effect:non-scaling-stroke;stroke-linejoin:round;"
                      "text-anchor:middle;pointer-events:none;}"
                      # Region (container-area) name, centred in the boundary.
                      "text.region-label{font-weight:600;font-size:var(--label-size,13px);"
                      "font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;"
                      "fill:#3c4043;paint-order:stroke;stroke:#ffffff;stroke-width:3px;"
                      "vector-effect:non-scaling-stroke;stroke-linejoin:round;"
                      "text-anchor:middle;dominant-baseline:middle;pointer-events:none;}"
                      ".region-area{fill:#9aa0a6;fill-opacity:.10;stroke:#5f6368;"
                      "stroke-width:2px;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;}")
        svg.append(style)

        # Add tile metadata
        svg.set('data-tile-lat', str(tile_lat))
        svg.set('data-tile-lng', str(tile_lng))
        svg.set('data-bounds', json.dumps(bounds))
        
        # Group features into per-category layers, rendering each through its
        # taxonomy classification (base geometry + filterable overlays). The layer
        # groups are appended to the svg in explicit TIER order (region < base <
        # poi < accessibility), NOT OSM encounter order — so container areas (a
        # campus) can never paint over their own contents, and POIs always sit on
        # top of the base map. Within a tier, first-encounter order is preserved.
        layers = {}            # category key -> <g>
        casing_layers = {}
        layer_meta = {}        # category key -> (tier, encounter_index)
        cat_geom_rank = {}     # category key -> 0 area / 1 line / 2 point (min over its feats)
        order = [0]

        def layer_for(category, tier):
            if category not in layers:
                # No id on the layer group: it was the category name (e.g.
                # "building"), which collided across tiles and nothing references.
                g = self.create_svg_element(
                    'g', class_='layer', clip_path=f'url(#{clip_id})')
                layers[category] = g
                layer_meta[category] = (tier, order[0])
                order[0] += 1
                # NOT appended here — appended in tier order after the loop.
            return layers[category]

        def casings_for(category, tier):
            # A visual-only sub-layer holding every casing for this category,
            # inserted UNDER all the fills so e.g. road intersections stay
            # seamless. aria-hidden + pointer-events:none so it never steals the
            # name or the hover target from the per-feature fill groups.
            if category not in casing_layers:
                cg = self.create_svg_element('g', class_=f'{category}-casings')
                cg.set('aria-hidden', 'true')
                cg.set('pointer-events', 'none')
                layer_for(category, tier).insert(0, cg)
                casing_layers[category] = cg
            return casing_layers[category]

        level_subs = {}

        def level_deco_layer(kind):
            # Pooled sub-layers inside the 'levels' layer: ALL halos under ALL casings
            # under ALL the feature lines, so an overlay (the Gardiner, the PATH) stays
            # CONTIGUOUS — a later segment's white halo can never paint over an earlier
            # segment's coloured line (which broke it into fragments). Built lazily and
            # inserted at the FRONT of the levels layer (halos lowest).
            if not level_subs:
                lv = layer_for('levels', self._LAYER_TIER['levels'])
                casings_sg = self.create_svg_element('g', class_='levels-casings')
                halos_sg = self.create_svg_element('g', class_='levels-halos')
                for sg in (casings_sg, halos_sg):
                    sg.set('aria-hidden', 'true')
                    sg.set('pointer-events', 'none')
                lv.insert(0, casings_sg)   # -> [casings, ...existing groups]
                lv.insert(0, halos_sg)     # -> [halos, casings, ...]
                level_subs['halo'] = halos_sg
                level_subs['casing'] = casings_sg
            return level_subs[kind]

        feature_count = 0
        for feature in features:  # flat list from the processor
            element, casing, level_deco = self.render_feature(feature, bounds)
            if element is None:
                continue
            cls = feature['classification']
            prim = cls['base'] or cls['primary']
            if feature.get('_is_region'):
                category, tier = 'region', self._LAYER_TIER['region']
            elif feature.get('_plane') and feature['_plane'] != 'surface':
                # Off-surface planes share ONE top-tier overlay layer; which one is
                # visible is the viewer's data-active-plane (CSS), so they can live
                # together here without z-fighting.
                category, tier = 'levels', self._LAYER_TIER['levels']
            else:
                category = prim['category']
                tier = self._LAYER_TIER.get(prim.get('layer', 'base'), 1)
            # Within a tier, AREAS paint under LINES under POINTS, so a landuse / woods
            # / water fill can never cover a road that shares the tier.
            gt = feature['geometry'].geom_type
            gr = 0 if gt in ('Polygon', 'MultiPolygon') else (1 if gt in ('LineString', 'MultiLineString') else 2)
            cat_geom_rank[category] = min(cat_geom_rank.get(category, 9), gr)
            if casing is not None:
                casings_for(category, tier).append(casing)
            if level_deco:                                    # [halo, casing]
                level_deco_layer('halo').append(level_deco[0])
                level_deco_layer('casing').append(level_deco[1])
            layer_for(category, tier).append(element)
            feature_count += 1

        if feature_count == 0:
            return None  # Don't create empty tiles

        # Paint order: TIER first, then within a tier AREAS (polygons) under LINES
        # (roads) under POINTS — so a landuse / woods / water fill can never cover a
        # road — then first-encounter order.
        for category in sorted(layers,
                               key=lambda c: (layer_meta[c][0], cat_geom_rank.get(c, 9), layer_meta[c][1])):
            svg.append(layers[category])

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

    # Explicit PAINT-ORDER tiers (low = drawn first = underneath). Z-order used to
    # be accidental — create_tile_svg appended each category layer in OSM
    # encounter order, so a "container" area (a campus) could land ON TOP of its
    # own streets. Now layers sort by tier, derived from the taxonomy `layer`
    # field, with a REGION tier below everything for container areas.
    # 'levels' is the TOP tier: an active off-surface plane (PATH / subway / Gardiner)
    # must paint OVER the dimmed street level so its clear-space halo clears the base
    # beneath it. Off-surface features are hidden until their plane is selected, so
    # sitting on top costs nothing in the default street-level view.
    _LAYER_TIER = {'region': 0, 'base': 1, 'poi': 2, 'accessibility': 3, 'levels': 4}

    # Container AREAS — a campus / grounds is a named *region*, not an opaque
    # sheet. They're amenity-layer polygons that today paint over the streets and
    # buildings inside them (parity loss). Routed to the region tier and styled as
    # a labelled boundary + faint fill drawn UNDER their contents (facet C). A
    # single BUILDING (building=university) is NOT a region — only the amenity AREA.
    _REGION_SUBTYPES = {'university', 'college', 'school', 'hospital'}

    def _is_region(self, feature):
        # A container region is a BASE-LESS AREA (the campus/grounds boundary has
        # no building/landuse geometry of its own) that carries an amenity
        # university/college/school/hospital classification ANYWHERE — primary OR
        # overlay. Checking only `primary` was wrong: a campus tagged wheelchair=yes
        # gets an accessibility/mobility PRIMARY, pushing amenity into an overlay
        # (this is exactly how TMU is mapped, so it was missed and stayed an opaque
        # blob). Requiring base is None excludes university BUILDINGS (they have a
        # base) that merely also carry an amenity=university tag.
        cls = feature.get('classification') or {}
        if cls.get('base') is not None:
            return False
        g = feature.get('geometry')
        if g is None or g.geom_type not in ('Polygon', 'MultiPolygon'):
            return False
        for e in [cls.get('primary')] + (cls.get('overlays') or []):
            if e and e.get('category') == 'amenity' and e.get('subtype') in self._REGION_SUBTYPES:
                return True
        return False

    # ---- Spatial-containment hierarchy (the information model) --------------
    # OSM almost never groups a school's buildings/track/etc. under the school (only
    # ~40 type=site relations city-wide, ~none for schools) — the relationship is
    # IMPLICIT in geometry. So we DERIVE it: each feature's parent is the SMALLEST
    # container that strictly contains it, computed PER PLANE (Bob: a surface
    # school's children are surface features; never cross planes). Containers NEST —
    # an entrance inside a building inside a campus — so the pass builds a containment
    # FOREST and each feature carries the chain of its NAMED ancestors (nearest ->
    # outermost), feeding the explore descriptions, the search context, and the
    # keyboard hierarchy nav.
    #
    # Container ELIGIBILITY is by TAGS (not the rendered classification: a school is
    # often amenity=school AND landuse=education, so it has a landuse base and isn't a
    # "region"). Two tiers (Bob, 2026-06-23):
    #  - NAMED grounds/complexes: institutional grounds, parks, sports complexes,
    #    places of worship, station areas. A NAME is required — an unnamed one can't
    #    give "in <place>" context.
    #  - STRUCTURAL rings: buildings, parking, pitches. Eligible WITHOUT a name —
    #    they nest entrances/POIs/accessible bays and are labelled by type for
    #    keyboard nav, voicing the nearest NAMED ancestor. There are ~524k buildings
    #    but only ~8k named, so requiring a name would drop the building ring for
    #    almost every indoor POI. Bob's gate — a structural ring "earns it only if it
    #    contains something" — is enforced for FREE by smallest-container selection:
    #    an empty shell is never chosen as anyone's parent, so no pruning pass needed.
    _CONTAINER_AMENITY = {'school', 'university', 'college', 'hospital',
                          'kindergarten', 'place_of_worship'}
    _CONTAINER_LANDUSE = {'education', 'institutional'}
    _CONTAINER_LEISURE_NAMED = {'park', 'sports_centre', 'stadium'}
    _CONTAINER_LEISURE_STRUCT = {'pitch'}

    def _container_eligible(self, feature):
        """Can this feature's TYPE be a container node? (Whether it actually BECOMES
        a parent is decided geometrically — an empty shell parents nothing.)"""
        g = feature.get('geometry')
        if g is None or g.geom_type not in ('Polygon', 'MultiPolygon'):
            return False
        p = feature.get('properties') or {}
        # Structural rings — no name required.
        if ((p.get('building') and p.get('building') != 'no')
                or p.get('amenity') == 'parking'
                or p.get('leisure') in self._CONTAINER_LEISURE_STRUCT):
            return True
        # Named grounds / complexes / station areas — name required.
        if not p.get('name'):
            return False
        return (p.get('amenity') in self._CONTAINER_AMENITY
                or p.get('landuse') in self._CONTAINER_LANDUSE
                or p.get('leisure') in self._CONTAINER_LEISURE_NAMED
                or p.get('railway') == 'station'
                or p.get('public_transport') == 'station'
                or p.get('station') == 'subway')

    _GROUND_AMENITY = {'school', 'university', 'college', 'hospital', 'kindergarten'}

    def _container_rank(self, props):
        """Containment RANK so a child's parent must have rank >= its own: GROUND
        grounds (landuse / parks / institution campuses) = 2 are the OUTER rings;
        STRUCTURAL rings (building / parking / pitch / place of worship / station) =
        1 sit INSIDE grounds; non-containers = 0. This stops pure geometry from
        nesting a courtyard 'park' inside the elevated building above it (a building
        never becomes a park's parent), while still letting a building nest in a
        school ground and a park nest in a bigger park."""
        p = props or {}
        if (p.get('landuse') in self._CONTAINER_LANDUSE
                or p.get('leisure') in self._CONTAINER_LEISURE_NAMED
                or p.get('amenity') in self._GROUND_AMENITY):
            return 2
        if ((p.get('building') and p.get('building') != 'no')
                or p.get('amenity') in ('parking', 'place_of_worship')
                or p.get('leisure') in self._CONTAINER_LEISURE_STRUCT
                or p.get('railway') == 'station'
                or p.get('public_transport') == 'station'
                or p.get('station') == 'subway'):
            return 1
        return 0

    def assign_parents(self, features):
        """Build the per-plane containment FOREST: stamp each feature with its direct
        parent (smallest container strictly larger that holds it) and its chain of
        NAMED ancestors (nearest -> outermost). Recursive — containers nest inside
        containers — and strictly per plane (a surface feature never gets a transit
        parent)."""
        try:
            from shapely import STRtree
        except Exception:
            from shapely.strtree import STRtree
        for f in features:
            if '_plane' not in f:
                f['_plane'] = self._plane_for(f)
        # eligible containers grouped by plane -> per-plane STRtree (+ area list)
        trees = {}
        for plane in {f['_plane'] for f in features}:
            conts = [f for f in features
                     if f['_plane'] == plane and self._container_eligible(f)]
            if conts:
                trees[plane] = (STRtree([c['geometry'] for c in conts]), conts,
                                [c['geometry'].area for c in conts],
                                [self._container_rank(c.get('properties')) for c in conts])
        # Pass 1: direct parent = smallest container STRICTLY LARGER than f that
        # contains its representative point AND has rank >= f's own (grounds contain
        # buildings, not vice versa). "Strictly larger" lets containers nest without
        # picking themselves or a coincident twin, and makes a cycle impossible (area
        # strictly decreases down the chain).
        for f in features:
            info = trees.get(f['_plane'])
            if not info:
                continue
            tree, conts, areas, ranks = info
            g = f['geometry']
            try:
                pt = g.representative_point()
            except Exception:
                continue
            f_area = g.area if g.geom_type in ('Polygon', 'MultiPolygon') else 0.0
            f_rank = self._container_rank(f.get('properties'))
            best, best_area = None, None
            for i in tree.query(pt):
                if conts[i] is f or areas[i] <= f_area or ranks[i] < f_rank:
                    continue
                if conts[i]['geometry'].contains(pt) and (best is None or areas[i] < best_area):
                    best, best_area = conts[i], areas[i]
            if best is not None:
                f['_parent'] = (best.get('properties') or {}).get('osm_id')
        # Pass 2: walk the parent pointers to collect each feature's NAMED ancestor
        # chain (nearest -> outermost), skipping unnamed structural rings. _parent
        # stays the DIRECT parent (the ring you "enter" in keyboard nav, named or
        # not); _ancestor_names + _named_parent_id carry the named context for the
        # description and search.
        by_id = {}
        for f in features:
            oid = (f.get('properties') or {}).get('osm_id')
            if oid is not None and oid not in by_id:
                by_id[oid] = f
        n = 0
        for f in features:
            if f.get('_parent') is not None:
                n += 1
            names, ids, seen, cur, depth = [], [], set(), f, 0
            while depth < 16:
                pid = cur.get('_parent')
                if pid is None or pid in seen:
                    break
                seen.add(pid)
                par = by_id.get(pid)
                if par is None:
                    break
                pp = par.get('properties') or {}
                if pp.get('name'):
                    names.append(pp.get('name'))
                    ids.append(pp.get('osm_id'))
                cur, depth = par, depth + 1
            if names:
                f['_ancestor_names'] = names
                f['_parent_name'] = names[0]       # nearest NAMED ancestor
                f['_named_parent_id'] = ids[0]
        return n

    # ---- Multi-level model (facet 1) — the vertical stack -----------------
    # Bob's ordering (top -> bottom): Gardiner (elevated road) ABOVE surface ABOVE
    # PATH (underground pedestrian) ABOVE subway/LRT tunnel. So four ordered planes;
    # SURFACE is the pedestrian-primary default. The split is by PEDESTRIAN
    # RELEVANCE + feature TYPE, NOT the raw OSM `layer` integer: a car-only elevated
    # deck (the Gardiner) goes ABOVE, but a walkable footbridge at the same layer
    # stays SURFACE; underground PEDESTRIAN ways are the PATH (-1), underground RAIL
    # is the subway (-2). Real Toronto signals (verified in the PBF):
    #   subway   : railway=subway/light_rail + tunnel=yes (layer -2/-3)
    #   PATH     : highway=footway/corridor  + tunnel=yes / layer<0 / level<0
    #   Gardiner : highway=motorway(_link)   + bridge=yes / layer>=1
    _PLANE_ORDER = {'transit': -2, 'path': -1, 'surface': 0, 'above': 1}
    _PLANE_LABEL = {'transit': 'Rail transit (subway / streetcar / LRT)',
                    'path': 'Underground walkway (PATH)',
                    'surface': 'Street level',
                    'above': 'Elevated road'}
    _ELEVATED_CAR = {'motorway', 'motorway_link', 'trunk', 'trunk_link'}
    _PED_WAYS = {'footway', 'path', 'steps', 'corridor', 'pedestrian',
                 'sidewalk', 'living_street'}

    @staticmethod
    def _as_int(v):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None

    def _plane_for(self, feature):
        """Map a feature to one of the four vertical planes (see _PLANE_ORDER).
        Default is 'surface' — most of the map, and what loads first."""
        p = feature.get('properties') or {}

        # PATH plane — the Toronto PATH is a branded pedestrian NETWORK, identified
        # by membership in its route=foot relation (authoritative — also carries the
        # PATH's entrances and amenity POIs) or by name=PATH on a segment. It is NOT
        # "any underground footway": the PATH spans tunnels, at-grade links AND
        # elevated skywalks, while station UNDERPASSES (underground footways that
        # are not the PATH) must stay on the surface. So we key off network identity,
        # never depth. (Bob, 2026-06-21 — this replaced an underground heuristic that
        # wrongly grabbed underpasses and missed at-grade PATH.)
        if feature.get('_path_member') or p.get('name') == 'PATH':
            return 'path'

        highway = p.get('highway')
        railway = p.get('railway')
        layer = self._as_int(p.get('layer'))

        # RAIL TRANSIT — subway, streetcar (tram) and LRT are ONE FLAT overlay
        # regardless of depth (Bob, 2026-06-23): subways aren't all underground,
        # streetcar is mostly at grade, LRT is a mix. So all rail-transit LINES and
        # their STATIONS / STOPS / ENTRANCES / PLATFORMS go on the 'transit' plane,
        # never split by tunnel/level. Heavy rail (GO/VIA, railway=rail) is included as
        # the rail-transit network too; only BUS stops stay on the street.
        bus = (highway == 'bus_stop' or p.get('bus') == 'yes')
        if (railway in ('subway', 'light_rail', 'tram', 'rail', 'monorail',
                        'narrow_gauge', 'funicular', 'subway_entrance', 'tram_stop',
                        'station', 'halt', 'stop', 'platform')
                or p.get('station') in ('subway', 'light_rail', 'train')
                or (p.get('public_transport') in ('platform', 'stop_position', 'station')
                    and not bus)):
            return 'transit'

        # ABOVE — a CAR-ONLY elevated deck (the Gardiner). A walkable bridge
        # (footway/cycleway/ordinary street carrying sidewalks) does NOT match here,
        # so it stays SURFACE — pedestrian relevance, per Bob.
        elevated = (p.get('bridge') in ('yes', 'viaduct')
                    or (layer is not None and layer >= 1))
        if highway in self._ELEVATED_CAR and elevated:
            return 'above'
        return 'surface'

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
            return None, None, None
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
            return None, None, None
        shape = self._geometry_element(geom, bounds)
        if shape is None:
            return None, None, None

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
        elif feature.get('_is_region'):
            # Container region (campus / grounds): a FAINT fill so the streets and
            # buildings inside show through + a STRONG GREY dashed boundary, drawn
            # under everything (tier 0). Replaces the opaque amenity fill that used
            # to obscure the contents. Invert-safe: the non-text contrast is carried
            # on the grey luminance boundary, not a coloured edge. The .region-area
            # class lets the viewer CSS own the dark-mode treatment (and is excluded
            # from the dark catch-alls, like .road-hit). Attrs are baked too so a
            # standalone tile (Chrome / qlmanage) renders the same.
            shape.set('class', 'region-area')
            shape.set('fill', '#9aa0a6')
            shape.set('fill-opacity', '0.10')
            shape.set('stroke', '#5f6368')
            shape.set('stroke-width', '2')
            shape.set('stroke-dasharray', '6,4')
            shape.set('vector-effect', 'non-scaling-stroke')
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
        # Vertical plane (aggregation may have stamped it). Computed here so the
        # underpass annotation can be stripped from the PATH (which is its own plane).
        plane = feature.get('_plane') or self._plane_for(feature)
        feature['_plane'] = plane     # read by create_tile_svg for the z-tier
        # 'underpasses' is an ANNOTATION overlay on a non-PATH underground pedestrian
        # way (so it shows by default + has its own filter). The PATH is its OWN
        # plane, never an underpass, so strip the overlay from any non-surface
        # feature — it won't be styled dotted, filtered as an underpass, or so named.
        overlays = cls['overlays']
        is_underpass = (plane == 'surface'
                        and any(o.get('id') == 'underpasses' for o in overlays))
        if plane != 'surface':
            overlays = [o for o in overlays if o.get('id') != 'underpasses']
        if is_underpass:
            # Tag the visible line so the dotted style owns its colour in both themes
            # (the .underpass group class drives the hide/show filter; this drives
            # the look). Same pattern as .level-line / .region-area.
            shape.set('class', (shape.get('class', '') + ' underpass-line').strip())
        if (cls.get('base') or {}).get('category') == 'underground_parking':
            # Underground car parking: tag the shape for its distinct dotted-fill
            # style (the .underground_parking group class drives the off-by-default
            # hide/show filter; this drives the look + the catch-all carve-outs).
            shape.set('class', (shape.get('class', '') + ' ugparking').strip())
        # primary class + every (effective) overlay class, flattened + de-duplicated
        tokens = []
        for sc in [primary['svgClass']] + [o['svgClass'] for o in overlays]:
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
                       or next((o for o in overlays
                                if o.get('layer') == 'poi' and o.get('subtype') != 'address'), None)
                       or primary)
        type_label = type_source.get('label') or type_source['category'].replace('-', ' ').title()
        addr = ' '.join(filter(None, (props.get('addr:housenumber'), props.get('addr:street'))))
        if self._is_address(type_source):
            # An address IS its number + street — the "Addresses" type word and the
            # "at" are noise ("Addresses, at 54 Hayden Street" → "54 Hayden Street").
            base_label = ', '.join(p for p in (name, addr) if p) or type_label
        else:
            base_parts = [p for p in (name, type_label) if p]
            if addr:
                base_parts.append(f"at {addr}")
            base_label = ', '.join(base_parts) or type_label
        # Drop the type source from the overlay list so its label isn't spoken
        # twice (for a base-less POI node the type source is one of the overlays).
        # Also drop the "Addresses" overlay label: when a feature carries an
        # address it's already stated ("… at 505 University Avenue"), so the extra
        # "Addresses" word is noise. The address CLASS stays, so it's still
        # filterable — only the redundant spoken label goes.
        overlay_labels = [o['label'] for o in overlays
                          if o.get('label') and o is not type_source
                          and o.get('subtype') != 'address' and o.get('id') != 'addresses']
        aria = f"{base_label}. {', '.join(overlay_labels)}" if overlay_labels else base_label
        # An aggregate marker (POI declutter) carries its own ready-made name
        # ("5 Benches") — use it verbatim, not the per-feature name assembly.
        if feature.get('_aggregate_label'):
            aria = feature['_aggregate_label']
        # Hierarchy CONTEXT (the information model): if this feature sits inside one
        # or more NAMED containers (a school's track, a campus building, a hospital
        # wing), append "in <place>" so explore-by-touch announces the relationship a
        # sighted user reads from the map. We voice the NEAREST named ring and the
        # OUTERMOST named one — "Entrance, in Smith Hall, in King Edward School" —
        # giving the specific + the landmark while skipping unnamed structural rings
        # and middle rings so the announcement stays short. Skipped for aggregates
        # and for a ring that just repeats this feature's own name.
        named = feature.get('_ancestor_names')
        if named and not feature.get('_aggregate_label'):
            rings = list(dict.fromkeys([named[0], named[-1]]))  # nearest + outermost
            for r in rings:
                if r and r != base_label:
                    aria = f"{aria}, in {r}"

        group = self.create_svg_element('g', class_=' '.join(tokens), role='img', aria_label=aria)
        group.set('data-osm-id', str(props.get('osm_id', '')))
        if feature.get('_parent') is not None:
            # The container's osm_id — the hook for keyboard hierarchy navigation
            # (tab containers, enter, tab the children that point back here).
            group.set('data-parent', str(feature['_parent']))
        if overlays:
            group.set('data-overlays', ' '.join(o['id'] for o in overlays))
        if feature.get('_aggregate_count'):
            group.set('data-aggregate', str(feature['_aggregate_count']))
        # Multi-level model (facet 1): tag the feature's vertical plane (computed
        # above) so the viewer can show one plane at a time. SURFACE (the default,
        # ~97%) is left UNTAGGED — absence means surface — so the common case adds no
        # bytes; only the sparse below/above features carry the attribute.
        if plane != 'surface':
            group.set('data-level', plane)
        group.append(shape)
        # Active-plane PROMINENCE (facet 1): when its plane is selected, an
        # off-surface feature must read as a BOLD CASED ROUTE floating over the
        # dimmed street level — a thin underground footway is invisible otherwise
        # (Bob, on the PATH). For LINES, stack a wide light HALO (a clear-space moat
        # that punches through the ghosted base) + a dark CASING beneath the main
        # line; for AREAS, flag a solid fill + outline. Widths/colours are
        # constant-screen via the .level-* CSS and only paint when the plane is
        # active (the whole group is hidden otherwise). The feature also rides the
        # top z-tier (see create_tile_svg) so the halo clears the base beneath it.
        # Level decorations (halo + casing) are POOLED, not nested in the group:
        # create_tile_svg lays ALL halos under ALL casings under ALL lines, so a later
        # segment's white halo never paints over an earlier segment's coloured line
        # (that broke the Gardiner into disconnected fragments). Returned for pooling.
        level_deco = []
        if plane != 'surface':
            gt = geom.geom_type
            if gt in ('LineString', 'MultiLineString'):
                for cls_name in ('level-halo', 'level-casing'):   # -> [halo, casing]
                    deco = copy.deepcopy(shape)
                    deco.set('class', cls_name)
                    deco.set('fill', 'none')
                    deco.set('pointer-events', 'none')
                    deco.attrib.pop('stroke-dasharray', None)     # halo/casing are solid
                    # Carry the plane: pooled OUTSIDE the data-level group, the halo/
                    # casing need their own data-level so the plane show/hide CSS
                    # hides them off their plane (else they'd leak onto the surface).
                    deco.set('data-level', plane)
                    level_deco.append(deco)
                shape.set('class', (shape.get('class', '') + ' level-line').strip())
                # Off-surface lines that AREN'T category 'road' (rail-transit lines
                # class as 'railway'; the Gardiner used to class as a bridge) won't get
                # a hit-corridor from the road pass below — so without this the wide
                # halo is just pointer-events:none and hover falls through to whatever
                # is beneath. Add the corridor here so the overlay line is hoverable
                # and names itself (the group carries role=img + aria-label).
                if primary.get('category') != 'road':
                    shape.set('pointer-events', 'none')
                    hit = copy.deepcopy(shape)
                    hit.set('class', 'road-hit')
                    hit.set('stroke', 'transparent')
                    hit.set('fill', 'none')
                    hit.set('pointer-events', 'stroke')
                    hit.attrib.pop('stroke-dasharray', None)
                    group.append(hit)
            elif gt in ('Polygon', 'MultiPolygon'):
                shape.set('class', (shape.get('class', '') + ' level-area').strip())
        # Roads get two extras (Bob's road-rendering pass):
        #  * a transparent ~24px-SCREEN HIT-CORRIDOR (WCAG 2.5.8 target size) so the
        #    whole road is hittable regardless of its thin visible stroke — width
        #    comes from CSS (.road-hit, vector-effect non-scaling-stroke);
        #  * the in-road street NAME along the centreline, but only at bands where
        #    the road's class is prominent (label density self-thins by zoom). The
        #    visible text is aria-hidden — the group already announces the name —
        #    but it's a parity win for residual-vision / magnification users.
        if is_line and primary.get('category') == 'road':
            shape.set('pointer-events', 'none')      # the corridor is the target
            hit = copy.deepcopy(shape)
            hit.set('class', 'road-hit')
            hit.set('stroke', 'transparent')
            hit.set('fill', 'none')
            hit.set('pointer-events', 'stroke')
            group.append(hit)
            nm = props.get('name')
            bz = getattr(self, '_band_zoom', None)
            if nm and bz is not None and bz >= self._road_label_min_zoom(props.get('highway')):
                lbl = self._road_label(geom, nm, bounds)
                if lbl:
                    group.append(lbl[0])
                    group.append(lbl[1])
            # Bridge deck: a SURFACE road carrying bridge=yes gets a darker, wider
            # casing so it reads as an elevated structure with edges (the standard
            # bridge look). Off-surface elevated roads (the Gardiner) are already
            # handled by the plane system.
            if casing is not None and props.get('bridge') == 'yes' and plane == 'surface':
                casing.set('class', (casing.get('class', '') + ' bridge-deck').strip())
                casing.set('stroke', '#5a5a5a')
                casing.set('stroke-width', str(float(style.get('casing_width', width + 2)) + 4))
        # A container region gets its NAME drawn inside the boundary, once, in the
        # tile that holds the FULL geometry's representative point (guaranteed
        # inside the polygon) — so a campus spanning many tiles is labelled exactly
        # once, no cross-tile dedup needed. aria-hidden (the group already announces
        # the name); constant-screen size via --label-size, white halo for contrast.
        if feature.get('_is_region') and props.get('name'):
            try:
                pt = feature['geometry'].representative_point()
                if (bounds['west'] <= pt.x <= bounds['east']
                        and bounds['south'] <= pt.y <= bounds['north']):
                    lx, ly = self.coord_to_svg(pt.y, pt.x, bounds)
                    txt = self.create_svg_element(
                        'text', x=lx, y=ly, class_='region-label')
                    txt.set('aria-hidden', 'true')
                    txt.text = props['name']
                    group.append(txt)
            except Exception:
                pass
        # An underpass is a light dotted annotation — drop the road casing so it
        # reads as dots, not a cased route (the dotted style is in main.css).
        if is_underpass:
            casing = None
        return group, casing, level_deco

    # Label-density rule (Bob 2026-06-20): a road's name appears only from the zoom
    # where its CLASS is prominent — arterials early (low zoom), residential late
    # (high zoom) — so labels self-thin per viewport like every other layer.
    _ROAD_LABEL_MIN_ZOOM = {
        'motorway': 13, 'trunk': 13, 'motorway_link': 14, 'trunk_link': 14,
        'primary': 14, 'primary_link': 15,
        'secondary': 15, 'secondary_link': 16,
        'tertiary': 16, 'tertiary_link': 16,
        'residential': 17, 'unclassified': 17, 'living_street': 17, 'pedestrian': 17,
        'service': 18, 'footway': 18, 'path': 18, 'cycleway': 18,
    }

    def _road_label_min_zoom(self, highway):
        return self._ROAD_LABEL_MIN_ZOOM.get(highway, 18)   # default: only at max detail

    def _road_label(self, geom, name, bounds):
        # The label rides the road centreline via SVG textPath. Pick the longest
        # sub-line, skip if there's no room for the name, and reverse right-to-left
        # runs so the text never reads upside-down.
        try:
            if geom.geom_type == 'LineString':
                line = geom
            elif geom.geom_type == 'MultiLineString':
                line = max(geom.geoms, key=lambda g: g.length)
            else:
                return None
            pts = [self.coord_to_svg(c[1], c[0], bounds) for c in line.coords]
        except Exception:
            return None
        if len(pts) < 2:
            return None
        if pts[-1][0] < pts[0][0]:        # keep text left-to-right
            pts = pts[::-1]
        length = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                     for i in range(len(pts) - 1))
        if length < max(40.0, len(name) * 7.5):   # no room for the name -> skip
            return None
        self._label_seq = getattr(self, '_label_seq', 0) + 1
        pid = f"rl{self._label_seq}"
        d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        path = self.create_svg_element('path', d=d, fill='none', stroke='none', id=pid)
        path.set('aria-hidden', 'true')
        text = self.create_svg_element('text', class_='road-label')
        text.set('aria-hidden', 'true')
        tp = self.create_svg_element('textPath')
        tp.set('startOffset', '50%')
        tp.set('href', f'#{pid}')
        # Nudge the glyphs perpendicular to the path so the text sits CENTRED on the
        # road band, not riding the centreline (default baseline-on-path). ~0.35em
        # down ≈ half the cap height — the reliable, well-supported way (dominant-
        # baseline isn't honoured for text-on-path in many renderers, incl. Quick
        # Look). Paths are normalised left-to-right, so +dy is downward.
        tp.set('dy', '0.35em')
        tp.text = name
        text.append(tp)
        return path, text

    # ----- POI declutter (the "m-rule" for points) -------------------------
    # Same-type points closer together than a readable "m" can't be told apart,
    # so they're decluttered per LOD band (RENDERING_AT_SCALE.md). Two different
    # treatments, because they answer to different truths:
    #   * general POIs (benches, cafes, …) AGGREGATE into one marker at the
    #     cluster centroid, named "N <plural>" ("5 Benches"). Clustered by FULL
    #     classification (primary + overlay set) so accessible variants stay
    #     distinct — "3 Accessible toilets" never merges into "8 Toilets".
    #   * ADDRESSES can't be summarised that way: OSM carries them sparsely and
    #     non-consecutively (odd/even sides, representative points only), so a
    #     range or a count would be a false claim. Instead ONE real address — the
    #     MEDIAN house number, which by definition exists in the cluster — is
    #     kept at its own location and the rest drop. (You find a specific
    #     address by searching, which frames the zoom to show it.)
    # Clustering is a grid declutter (cell ~ one "m"): O(n), and for "collapse
    # points within an m of each other" it yields the same spaced-out set as the
    # pairwise iterate-to-convergence, far cheaper. Threshold is in degrees (the
    # "m" height as a ground distance at the band's zoom).
    def aggregate_pois(self, pois, threshold):
        if not pois or threshold <= 0:
            return pois
        from collections import defaultdict
        groups = defaultdict(list)
        keep_aside = []
        for p in pois:
            cls = p.get('classification') or {}
            prim = cls.get('primary') or {}
            # PLANE is part of the key: a PATH-level POI must NEVER merge with a
            # street-level POI sitting at the same spot but a different depth — that
            # would re-flatten exactly the vertical ambiguity the level model exists
            # to remove. Same type + same cell + same plane → one marker.
            plane = self._plane_for(p)
            try:
                c = p['geometry'].centroid
                cx, cy = c.x, c.y
            except Exception:
                keep_aside.append(p)   # no usable point — keep rather than risk a drop
                continue
            cell = (math.floor(cx / threshold), math.floor(cy / threshold))
            if self._is_address(prim):
                key = ('addr', (p.get('properties') or {}).get('addr:street', ''), plane, cell)
            else:
                key = ('poi', prim.get('id'),
                       frozenset(o['id'] for o in cls.get('overlays', [])), plane, cell)
            groups[key].append((p, cx, cy))
        out = list(keep_aside)
        for key, members in groups.items():
            if len(members) == 1:
                out.append(members[0][0])
            elif key[0] == 'addr':
                out.append(self._median_address([m[0] for m in members]))
            else:
                marker = self._aggregate_marker(members)
                # Carry the cluster's plane so the synthetic marker (empty
                # properties) stays on its level instead of resolving to surface.
                marker['_plane'] = self._plane_for(members[0][0])
                out.append(marker)
        return out

    def _is_address(self, prim):
        return prim.get('id') == 'addresses' or prim.get('subtype') == 'address'

    def _median_address(self, addrs):
        # The median by house number — a real address that EXISTS in the cluster
        # (never an average, which could invent a number nobody lives at).
        def num(a):
            m = re.match(r'\s*(\d+)', str((a.get('properties') or {}).get('addr:housenumber', '')))
            return int(m.group(1)) if m else 0
        s = sorted(addrs, key=num)
        return s[len(s) // 2]

    def _aggregate_marker(self, members):
        feats = [m[0] for m in members]
        n = len(feats)
        cx = sum(m[1] for m in members) / n   # count-weighted centroid (each member = 1)
        cy = sum(m[2] for m in members) / n
        cls = feats[0]['classification']
        return {
            'geometry': Point(cx, cy),
            'properties': {},
            'classification': cls,            # keep type + overlay classes so it stays filterable
            'min_zoom': 0.0,
            '_aggregate_label': f"{n} {self._aggregate_type_phrase(cls)}",
            '_aggregate_count': n,
        }

    def _aggregate_type_phrase(self, cls):
        # The aggregate's type wording MIRRORS render_feature's per-feature naming
        # (minus the name/address an aggregate has none of): the TYPE it IS — its
        # base geometry or a real-place POI overlay, never an accessibility
        # attribute it merely carries — pluralised, then the attribute labels. So a
        # wheelchair-accessible restaurant aggregates "type first" as "Restaurants.
        # Wheelchair accessible locations" exactly as one reads, and accessible
        # toilets stay "Toilets. Accessible toilets", distinct from plain "Toilets".
        type_source = (cls.get('base')
                       or next((o for o in cls['overlays']
                                if o.get('layer') == 'poi' and o.get('subtype') != 'address'), None)
                       or cls['primary'])
        type_label = type_source.get('label') or type_source['category'].replace('-', ' ').title()
        phrase = self._pluralise(type_label)
        # An aggregate has no single address, so the per-feature "Addresses"
        # overlay is meaningless noise here ("5 Restaurants. Addresses") — drop it.
        overlay_labels = [o['label'] for o in cls['overlays']
                          if o.get('label') and o is not type_source
                          and o.get('subtype') != 'address' and o.get('id') != 'addresses']
        if overlay_labels:
            phrase += '. ' + ', '.join(overlay_labels)
        return phrase

    def _pluralise(self, phrase):
        # "typically a pluralisation" (Bob). Pluralise the final word; leave
        # already-plural (ends -s) and " of " compounds ("Places of worship").
        p = (phrase or '').strip()
        if not p:
            return 'features'
        if ' of ' in p.lower():
            return p
        head, _, last = p.rpartition(' ')
        ll = last.lower()
        if ll.endswith('s'):
            plural = last
        elif ll.endswith(('x', 'z', 'ch', 'sh')):
            plural = last + 'es'
        elif ll.endswith('y') and len(last) > 1 and last[-2].lower() not in 'aeiou':
            plural = last[:-1] + 'ies'
        else:
            plural = last + 's'
        return (head + ' ' + plural) if head else plural

    # ----- POI declutter, STAGE 2: cross-type proximity (coarse bands only) ----
    # After stage 1 (same-type), nearby points of DIFFERENT types still stack
    # within one "m" of each other — at a downtown intersection a z15 viewport can
    # carry dozens of distinct tooltips a fraction of a millimetre apart. For
    # explore-by-touch / pointer, and anyone with limited mobility or tremor,
    # that's an impossible target. So a second pass merges the surviving markers
    # by PROXIMITY ALONE (the same m-distance, blind to type) into ONE marker with
    # an ACCESSIBILITY-FIRST summary tooltip (Bob's choice 2026-06-20): the access
    # features a disabled traveller needs lead, then a coarse roll-up of the rest.
    # Runs only on the coarse bands, so z18 keeps every individual and "zoom in to
    # separate them" has a real endpoint. As you zoom out the m-distance grows and
    # the clusters coarsen — the generalisation the doc anticipated, now serving
    # target acquisition. Grid declutter (cell ~ one "m"), O(n), as stage 1.
    _WHEELCHAIR_FLAGS = {'wheelchair_yes', 'wheelchair_no', 'wheelchair_limited'}

    def cluster_proximity(self, features, threshold):
        if not features or threshold <= 0:
            return features
        from collections import defaultdict
        cells = defaultdict(list)
        keep_aside = []
        for f in features:
            try:
                c = f['geometry'].centroid
                cx, cy = c.x, c.y
            except Exception:
                keep_aside.append(f)
                continue
            # Plane is part of the cell key here too — proximity clustering must stay
            # within one vertical plane (a PATH cluster never absorbs a street POI).
            plane = f.get('_plane') or self._plane_for(f)
            cells[(plane, math.floor(cx / threshold), math.floor(cy / threshold))].append((f, cx, cy))
        out = list(keep_aside)
        for members in cells.values():
            if len(members) == 1:
                out.append(members[0][0])
            else:
                marker = self._proximity_marker(members)
                marker['_plane'] = members[0][0].get('_plane') or self._plane_for(members[0][0])
                out.append(marker)
        return out

    def _proximity_marker(self, members):
        feats = [m[0] for m in members]
        n = len(members)
        cx = sum(m[1] for m in members) / n
        cy = sum(m[2] for m in members) / n
        total = sum(f.get('_aggregate_count', 1) for f in feats)
        return {
            'geometry': Point(cx, cy),
            'properties': {},
            # A dedicated 'cluster' class so the viewer can style it distinctly;
            # no overlays (filtering a cluster by its contents is part of the
            # deferred filters-at-low-zoom question).
            'classification': {'base': None, 'overlays': [],
                               'primary': {'id': 'cluster', 'category': 'cluster',
                                           'subtype': None, 'svgClass': 'cluster',
                                           'label': 'Cluster', 'layer': 'poi'}},
            'min_zoom': 0.0,
            '_aggregate_label': self._proximity_tooltip(feats),
            '_aggregate_count': total,
            '_cluster': True,
        }

    def _proximity_tooltip(self, feats):
        # Accessibility-first: real access FEATURES (presence — counts are fuzzy
        # once carried as overlays) lead; then a coarse roll-up of the rest with
        # counts; then addresses by street. The generic wheelchair=yes/no/limited
        # flags are attributes, not features, so they're left out.
        access = {}      # label -> count (count used only for ordering)
        other = {}       # coarse theme -> count
        streets = set()
        for f in feats:
            cls = f['classification']
            prim = cls['primary']
            cnt = f.get('_aggregate_count', 1)
            if self._is_address(prim):
                st = (f.get('properties') or {}).get('addr:street')
                if st:
                    streets.add(st)
                other['addresses'] = other.get('addresses', 0) + cnt
            elif prim.get('layer') == 'accessibility':
                if prim.get('subtype') not in self._WHEELCHAIR_FLAGS and prim.get('label'):
                    access[prim['label']] = access.get(prim['label'], 0) + cnt
            elif prim.get('id') != 'cluster':
                th = self._coarse_theme(prim)
                other[th] = other.get(th, 0) + cnt
            # access attributes carried as overlays on this member
            for o in cls['overlays']:
                if (o is not prim and o.get('layer') == 'accessibility'
                        and o.get('subtype') not in self._WHEELCHAIR_FLAGS
                        and o.get('label')):
                    access[o['label']] = access.get(o['label'], 0) + cnt
        return self._compose_cluster_tooltip(access, other, streets)

    def _coarse_theme(self, entry):
        # Coarsen a POI type to a short theme for the "also …" roll-up.
        cat = entry.get('category')
        lab = (entry.get('label') or '').lower()
        if cat == 'shop':
            return 'shops'
        if cat == 'transit':
            return 'transit'
        if cat == 'tourism':
            return 'attractions'
        if cat == 'historic':
            return 'historic sites'
        if any(k in lab for k in ('food', 'restaurant', 'cafe', 'bar', 'pub', 'bistro', 'diner', 'eatery')):
            return 'food'
        if any(k in lab for k in ('bank', 'atm', 'bureau')):
            return 'banks'
        if 'bench' in lab or 'rest area' in lab:
            return 'seating'
        return entry.get('label') or (cat or 'features')

    def _compose_cluster_tooltip(self, access, other, streets):
        def lc(s):
            return (s[0].lower() + s[1:]) if s else s
        parts = []
        if access:
            items = [lc(t) for t, _ in sorted(access.items(), key=lambda x: -x[1])]
            parts.append("Accessible features here: " + ", ".join(items))
        addr_n = other.pop('addresses', 0)
        rest = [(f"{c} {lc(t)}" if c > 1 else lc(t))
                for t, c in sorted(other.items(), key=lambda x: -x[1])]
        seg = ", ".join(rest)
        if addr_n:
            sl = sorted(streets)
            if not sl:
                aseg = "addresses"
            elif len(sl) == 1:
                aseg = f"addresses on {sl[0]}"
            elif len(sl) <= 3:
                aseg = "addresses on " + ", ".join(sl[:-1]) + " and " + sl[-1]
            else:
                aseg = f"addresses on {len(sl)} streets"
            seg = (seg + ", " + aseg) if seg else aseg
        if seg:
            parts.append(("Also " if access else "Here: ") + seg)
        return ". ".join(parts) + ". Zoom in to separate them."

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

    def _sample_geo_points(self, geom, max_pts=80, step_deg=0.0005):
        """Geo points for the `location` field — sampled ALONG the geometry, not just
        its centroid. OpenSearch geo_distance over a multi-point field takes the
        MINIMUM, so this measures to the NEAREST point of a road / river / outline
        (you can stand 20 m from a long road whose centroid is 600 m away). Spacing
        ~0.0005° ≈ 55 m, capped at max_pts so a long way can't bloat the doc."""
        gt = geom.geom_type

        def line_pts(line):
            length = line.length
            if length == 0:
                p = line.interpolate(0)
                return [{'lat': round(p.y, 6), 'lon': round(p.x, 6)}]
            step = max(step_deg, length / max_pts)
            out, d = [], 0.0
            while d < length:
                p = line.interpolate(d)
                out.append({'lat': round(p.y, 6), 'lon': round(p.x, 6)})
                d += step
            pe = line.interpolate(length)
            out.append({'lat': round(pe.y, 6), 'lon': round(pe.x, 6)})
            return out

        pts = []
        try:
            if gt == 'Point':
                pts = [{'lat': round(geom.y, 6), 'lon': round(geom.x, 6)}]
            elif gt == 'LineString':
                pts = line_pts(geom)
            elif gt == 'MultiLineString':
                for ln in geom.geoms:
                    pts += line_pts(ln)
            elif gt == 'Polygon':
                pts = line_pts(geom.exterior)
                rp = geom.representative_point()
                pts.append({'lat': round(rp.y, 6), 'lon': round(rp.x, 6)})
            elif gt == 'MultiPolygon':
                for poly in geom.geoms:
                    pts += line_pts(poly.exterior)
                rp = geom.representative_point()
                pts.append({'lat': round(rp.y, 6), 'lon': round(rp.x, 6)})
        except Exception:
            pass
        if not pts:
            c = geom.centroid
            pts = [{'lat': round(c.y, 6), 'lon': round(c.x, 6)}]
        if len(pts) > max_pts:
            stride = max(1, len(pts) // max_pts)
            pts = pts[::stride]
        return pts

    def _geom_for_search(self, geom):
        """Compact raw geometry (vertices, [lon,lat]) stored on the search doc so the
        API can compute the EXACT point-to-line distance AND the nearest point — what
        a blind user actually navigates by. Only for non-point features; points are
        already exact from lat/lng. Lines store vertices (sparse — a straight road is
        two points), polygons store the exterior ring."""
        gt = geom.geom_type
        r = lambda seq: [[round(x, 6), round(y, 6)] for x, y in seq]
        try:
            if gt == 'LineString':
                return {'t': 'L', 'c': [r(geom.coords)]}
            if gt == 'MultiLineString':
                return {'t': 'L', 'c': [r(ln.coords) for ln in geom.geoms]}
            if gt == 'Polygon':
                return {'t': 'L', 'c': [r(geom.exterior.coords)]}
            if gt == 'MultiPolygon':
                return {'t': 'L', 'c': [r(p.exterior.coords) for p in geom.geoms]}
        except Exception:
            pass
        return None

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
                # Hierarchy CONTEXT (the information model): the NAMED containers this
                # feature nests inside (a campus building inside a school inside...).
                # ALL named ancestors go into `text` so searching ANY of them surfaces
                # a feature levels down; the displayed `parent` is the NEAREST named
                # one ("Running track — King Edward School") for clean disambiguation.
                ancestors = f.get('_ancestor_names') or []
                parent_name = ancestors[0] if ancestors else None
                doc = {
                    'osm_id': props.get('osm_id'),
                    'name': name,
                    'display': name or (lead.get('label') if lead else None) or addr_str or 'Feature',
                    'category': lead['category'] if lead else None,
                    'subtype': lead.get('subtype') if lead else None,
                    'types': labels,
                    'text': ' '.join(filter(None, [name, addr_str] + labels + ancestors)),
                    'lat': round(c.y, 6),
                    'lng': round(c.x, 6),
                    # Multi-point along the geometry so geo_distance finds the NEAREST
                    # point (lat/lng above stay the centroid, for display/jump-to).
                    'location': self._sample_geo_points(f['geometry']),
                }
                geom = self._geom_for_search(f['geometry'])
                if geom is not None:
                    doc['geom'] = geom   # raw vertices for EXACT nearest-point in the API
                if parent_name and parent_name != name:
                    doc['parent'] = parent_name
                    doc['parent_id'] = f.get('_named_parent_id')
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
        handler.mark_path_members()    # flag PATH route-relation members (the PATH plane)
        features = handler.features
        print(f"  PATH relation members: {len(handler.path_way_ids)} ways, "
              f"{len(handler.path_node_ids)} nodes", flush=True)
        print(f"Collected {len(features)} features; bucketing into tiles...", flush=True)

        # Derive the spatial-containment hierarchy (per plane) BEFORE the search index
        # and tiling, so the parent context flows into both.
        parented = self.assign_parents(features)
        print(f"  Containment: {parented} features assigned a parent container", flush=True)

        # Build the search index from the SAME parse (named things, POIs and
        # addresses; accessibility tags as filterable fields) so it can never
        # drift from the rendered map.
        self.write_search_index(features)

        size = self.tile_size
        # Snap the tiling ORIGIN down to the GLOBAL grid (aligned to 0,0), matching
        # the viewer's coordsToTileId (floor(coord/size)). Every region then lands on
        # the SAME worldwide grid, so locations SNAP TOGETHER on one map — Toronto,
        # Trent Lakes and future places coexist with empty cells between. A region
        # whose bounds aren't grid-aligned (e.g. 44.655) would otherwise produce
        # offset tiles (44.655_…) the viewer — which only ever requests grid cells
        # (44.650_…) — could never match, so the map would show blank there. Count
        # rounds UP so the north/east edge cells survive the origin moving down.
        south = math.floor(self.bounds['south'] / size) * size
        west = math.floor(self.bounds['west'] / size) * size
        n_lat = max(1, int(math.ceil((self.bounds['north'] - south) / size - 1e-9)))
        n_lng = max(1, int(math.ceil((self.bounds['east'] - west) / size - 1e-9)))

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

        # Per-feature appears-at-zoom. The floor is the WCAG TARGET-SIZE px
        # (target_px): every map feature here is an interactive target, so the
        # binding floor is "can you HIT it", not just "can you read it" — the
        # interaction floor supersedes the old readable-"m" perception floor
        # (24 > 13). A tangible SHAPE shows only at zooms where it renders at least
        # target_px across (= a hittable target); below that it culls and only
        # returns as you zoom in. min_zoom = 18 + log2(floor / extent_at_z18).
        # Points always show here; their target SPACING is enforced below.
        # 24 = WCAG 2.5.8 AA (with spacing exception); 44 = 2.5.5 AAA. Env-tunable.
        # See docs/RENDERING_AT_SCALE.md "Target size".
        target_px = float(os.environ.get('TARGET_PX', '24'))
        px_per_deg = self.svg_size / size
        for f in features:
            # Tag container AREAS once (campus / grounds) — they render directly in
            # the region tier, NOT through POI aggregation, and get a real
            # extent-based min_zoom like any tangible (a big campus shows at every
            # band; a small school-grounds culls when zoomed right out).
            f['_is_region'] = self._is_region(f)
            if (f.get('classification') or {}).get('base') is None and not f['_is_region']:
                f['min_zoom'] = 0.0
                continue
            # Linear features (roads, rivers, paths, rail) are CONTINUOUS but split into
            # many OSM ways — length-culling a SHORT segment by its extent leaves GAPS
            # in the line (a long road fragments; rural roads, split at every curve, are
            # the worst). Never extent-cull lines; they show at every band (importance/
            # label thinning is handled separately). Only AREA tangibles + points cull.
            if f['geometry'].geom_type in ('LineString', 'MultiLineString'):
                f['min_zoom'] = 0.0
                continue
            try:
                mnx, mny, mxx, mxy = f['geometry'].bounds
                extent_px = max(mxx - mnx, mxy - mny) * px_per_deg
            except Exception:
                extent_px = 0.0
            if extent_px > 0:
                f['min_zoom'] = 18 + math.log2(target_px / extent_px)
            elif (f['geometry'].geom_type == 'Point'
                  and (f['classification'].get('base') or {}).get('category') in ('underground_parking', 'man_made')):
                # Underground parking is 97% NODES; as a base-layer point it has zero
                # extent and would size-cull to nothing. It's a legitimate marker, so
                # always show it. (Scoped to this category on purpose — other base
                # points, e.g. natural=tree nodes, stay culled so they don't flood.)
                f['min_zoom'] = 0.0
            else:
                f['min_zoom'] = 99.0

        # LOD bands: the full set (served at zoom >= 18) plus coarser sets that drop
        # features below the "m" floor for that zoom. Coarser bands skip tiles that
        # come out empty, so zooming out fetches fewer AND lighter tiles. Each band
        # is a self-contained {tiles/, tile-index.json} unit; the full band stays at
        # the root so the existing URL keeps working.
        #
        # Per band, TANGIBLE shapes cull below the target-size floor (min_zoom <=
        # the band's zoom) and POINTS are decluttered (aggregate_pois + proximity)
        # at the same TARGET-SIZE SPACING for that zoom — markers merge until the
        # survivors are at least target_px apart on screen (the WCAG target-size
        # spacing). So shapes and points share ONE interaction threshold and thin
        # out together. (Was the 8 px readable-"m" height; raised to the hit floor.)
        # Full pyramid z22..z12. With a single 24 px target-size floor and stage 2
        # at EVERY band, the aggregation level is now purely a function of zoom:
        # zoom IN past z18 and the floor covers less ground, so features stop
        # merging (z22 ≈ individuals, full inspection); zoom OUT and they merge
        # toward a regional skeleton (z12 ≈ whole metro). z18 stays the root URL
        # for back-compat. Every band (z18 included) culls tangibles below the
        # target floor — a shape shows only where it renders >= a hittable target.
        full_tiles_dir = self.tiles_dir
        bands = [('lod22', 22), ('lod21', 21), ('lod20', 20), ('lod19', 19),
                 (None, 18),
                 ('lod17', 17), ('lod16', 16), ('lod15', 15),
                 ('lod14', 14), ('lod13', 13), ('lod12', 12)]
        total_created = 0
        self._label_seq = 0      # unique textPath ids for in-road street labels
        for band_name, band_zoom in bands:
            max_z = band_zoom    # every band culls tangibles below the target floor
            threshold_deg = target_px / (px_per_deg * (2 ** (band_zoom - 18)))
            do_proximity = True  # stage 2 (cross-type) at every band; at high zoom
            #                      the tiny threshold merges ~nothing -> individuals
            self._band_zoom = band_zoom    # in-road label density keys off this
            self.tiles_dir = (full_tiles_dir if band_name is None
                              else self.output_dir / band_name / 'tiles')
            self.tiles_dir.mkdir(parents=True, exist_ok=True)
            created = 0
            for (i, j), tile_features in buckets.items():
                # tangibles AND container regions render directly (subject to the
                # target-size cull); regions are NOT fed to POI aggregation.
                tangible = [f for f in tile_features
                            if (f.get('_is_region')
                                or (f.get('classification') or {}).get('base') is not None)
                            and (max_z is None or f.get('min_zoom', 0) <= max_z)]
                # stage 1: same-type aggregation (all bands) — points only, regions excluded
                pois = self.aggregate_pois(
                    [f for f in tile_features
                     if (f.get('classification') or {}).get('base') is None
                     and not f.get('_is_region')],
                    threshold_deg)
                # stage 2: cross-type proximity clustering (coarse bands only)
                if do_proximity:
                    pois = self.cluster_proximity(pois, threshold_deg)
                feats = tangible + pois
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