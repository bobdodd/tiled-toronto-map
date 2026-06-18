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
                    fill=style.get('fill', '#aad3df'),
                    stroke=style.get('stroke', '#4d90c4')
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
            elif feature_type == 'parking':
                parking_type = self.determine_parking_type(properties)
                style = self.feature_types['parking']['styles'].get(parking_type, 
                        self.feature_types['parking']['styles']['default'])
                # Different sizes for different parking types
                radius = 4 if parking_type in ['bicycle_parking', 'motorcycle_parking'] else 6
                element = self.create_svg_element(
                    'circle',
                    cx=x, cy=y, r=radius,
                    class_=f'parking parking-{parking_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
            elif feature_type == 'sensory_accessibility':
                sensory_type = self.determine_sensory_accessibility_type(properties)
                style = self.feature_types['sensory_accessibility']['styles'].get(sensory_type, 
                        self.feature_types['sensory_accessibility']['styles']['default'])
                # Use different shapes for different sensory features
                if sensory_type in ['tactile_paving', 'no_tactile_paving']:
                    # Square for tactile paving
                    element = self.create_svg_element(
                        'rect',
                        x=x-5, y=y-5, width=10, height=10,
                        class_=f'sensory-accessibility sensory-{sensory_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                else:
                    # Circle for other sensory features
                    element = self.create_svg_element(
                        'circle',
                        cx=x, cy=y, r=6,
                        class_=f'sensory-accessibility sensory-{sensory_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
            elif feature_type == 'accessible_facilities':
                facility_type = self.determine_accessible_facility_type(properties)
                style = self.feature_types['accessible_facilities']['styles'].get(facility_type, 
                        self.feature_types['accessible_facilities']['styles']['default'])
                # Use different shapes for different facility types
                if facility_type in ['elevator', 'escalator']:
                    # Triangle for vertical access
                    points = f"{x},{y-8} {x-7},{y+6} {x+7},{y+6}"
                    element = self.create_svg_element(
                        'polygon',
                        points=points,
                        class_=f'accessible-facility facility-{facility_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                elif facility_type in ['accessible_toilet', 'changing_table']:
                    # Square for facilities
                    element = self.create_svg_element(
                        'rect',
                        x=x-6, y=y-6, width=12, height=12,
                        class_=f'accessible-facility facility-{facility_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                else:
                    # Circle for other facilities
                    element = self.create_svg_element(
                        'circle',
                        cx=x, cy=y, r=7,
                        class_=f'accessible-facility facility-{facility_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
            elif feature_type == 'mobility_access':
                mobility_type = self.determine_mobility_access_type(properties)
                style = self.feature_types['mobility_access']['styles'].get(mobility_type, 
                        self.feature_types['mobility_access']['styles']['wheelchair_yes'])
                # Use different shapes for different mobility features
                if mobility_type.startswith('wheelchair'):
                    # Diamond for wheelchair access levels
                    element = self.create_svg_element(
                        'polygon',
                        points=f"{x},{y-8} {x+8},{y} {x},{y+8} {x-8},{y}",
                        class_=f'mobility-access mobility-{mobility_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                elif mobility_type.endswith('_ramp') or mobility_type == 'ramp':
                    # Triangle pointing up for ramps
                    points = f"{x},{y-8} {x-7},{y+6} {x+7},{y+6}"
                    element = self.create_svg_element(
                        'polygon',
                        points=points,
                        class_=f'mobility-access mobility-{mobility_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                elif mobility_type == 'steps':
                    # Rectangle for steps
                    element = self.create_svg_element(
                        'rect',
                        x=x-6, y=y-6, width=12, height=12,
                        class_=f'mobility-access mobility-{mobility_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                else:
                    # Circle for handrails and other
                    element = self.create_svg_element(
                        'circle',
                        cx=x, cy=y, r=6,
                        class_=f'mobility-access mobility-{mobility_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
            elif feature_type == 'accessible_transport':
                transport_type = self.determine_accessible_transport_type(properties)
                style = self.feature_types['accessible_transport']['styles'].get(transport_type, 
                        self.feature_types['accessible_transport']['styles']['default'])
                # Use different shapes for different transport features
                if transport_type in ['disabled_parking', 'priority_access']:
                    # Pentagon for parking/priority
                    r = 8
                    points = []
                    for i in range(5):
                        angle = (i * 72 - 90) * math.pi / 180
                        px = x + r * math.cos(angle)
                        py = y + r * math.sin(angle)
                        points.append(f"{px},{py}")
                    element = self.create_svg_element(
                        'polygon',
                        points=" ".join(points),
                        class_=f'accessible-transport transport-{transport_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                elif transport_type in ['accessible_bus', 'accessible_subway', 'accessible_tram', 'accessible_train']:
                    # Star for transit
                    element = self.create_svg_element(
                        'polygon',
                        points=f"{x},{y-10} {x+3},{y-3} {x+10},{y-2} {x+4},{y+3} {x+6},{y+10} {x},{y+5} {x-6},{y+10} {x-4},{y+3} {x-10},{y-2} {x-3},{y-3}",
                        class_=f'accessible-transport transport-{transport_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                else:
                    # Circle for other
                    element = self.create_svg_element(
                        'circle',
                        cx=x, cy=y, r=7,
                        class_=f'accessible-transport transport-{transport_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
            elif feature_type == 'aeroway':
                aeroway_type = self.determine_aeroway_type(properties)
                style = self.feature_types['aeroway']['styles'].get(aeroway_type, 
                        self.feature_types['aeroway']['styles']['default'])
                
                # Use different shapes for different aeroway features
                if aeroway_type == 'gate':
                    # Square for gates
                    size = 8
                    element = self.create_svg_element(
                        'rect',
                        x=x-size, y=y-size, width=size*2, height=size*2,
                        class_=f'aeroway aeroway-{aeroway_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 2)
                    )
                elif aeroway_type in ['navigationaid', 'windsock']:
                    # Triangle for navigation aids
                    element = self.create_svg_element(
                        'polygon',
                        points=f"{x},{y-10} {x+8},{y+8} {x-8},{y+8}",
                        class_=f'aeroway aeroway-{aeroway_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1.5)
                    )
                elif aeroway_type == 'helipad':
                    # Circle with H for helipads
                    element = self.create_svg_element(
                        'circle',
                        cx=x, cy=y, r=12,
                        class_=f'aeroway aeroway-{aeroway_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 2)
                    )
                else:
                    # Circle for other aeroway features
                    element = self.create_svg_element(
                        'circle',
                        cx=x, cy=y, r=8,
                        class_=f'aeroway aeroway-{aeroway_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
            elif feature_type == 'amenity':
                # Amenity points (seating, benches, etc.)
                amenity_type = properties.get('amenity', 'default')
                style = self.feature_types['amenity']['styles'].get(amenity_type, 
                        self.feature_types['amenity']['styles']['default'])
                
                if amenity_type == 'seating':
                    # Rectangle for seating areas
                    element = self.create_svg_element(
                        'rect',
                        x=x-8, y=y-5, width=16, height=10,
                        class_=f'amenity amenity-{amenity_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1.5),
                        rx=2, ry=2
                    )
                elif amenity_type == 'bench':
                    # Small rectangle for benches
                    element = self.create_svg_element(
                        'rect',
                        x=x-6, y=y-3, width=12, height=6,
                        class_=f'amenity amenity-{amenity_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
                else:
                    # Circle for other amenities
                    element = self.create_svg_element(
                        'circle',
                        cx=x, cy=y, r=6,
                        class_=f'amenity amenity-{amenity_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 1)
                    )
            elif feature_type == 'barrier':
                # Barrier points (checkpoints, gates, turnstiles)
                barrier_type = self.determine_barrier_type(properties)
                style = self.feature_types['barrier']['styles'].get(barrier_type, 
                        self.feature_types['barrier']['styles']['default'])
                
                if barrier_type == 'checkpoint':
                    # Diamond shape for checkpoints
                    element = self.create_svg_element(
                        'polygon',
                        points=f"{x},{y-10} {x+10},{y} {x},{y+10} {x-10},{y}",
                        class_=f'barrier barrier-{barrier_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 2.5)
                    )
                elif barrier_type == 'turnstile':
                    # Cross shape for turnstiles
                    element = self.create_svg_element(
                        'path',
                        d=f"M{x-8},{y} L{x+8},{y} M{x},{y-8} L{x},{y+8}",
                        class_=f'barrier barrier-{barrier_type}',
                        fill="none",
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 2)
                    )
                else:
                    # Square for gates and other barriers
                    element = self.create_svg_element(
                        'rect',
                        x=x-6, y=y-6, width=12, height=12,
                        class_=f'barrier barrier-{barrier_type}',
                        fill=style['fill'],
                        stroke=style['stroke'],
                        stroke_width=style.get('stroke_width', 2)
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
            elif feature_type == 'sensory_accessibility':
                # Linear sensory features (tactile paving along paths)
                sensory_type = self.determine_sensory_accessibility_type(properties)
                style = self.feature_types['sensory_accessibility']['styles'].get(sensory_type, 
                        self.feature_types['sensory_accessibility']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'sensory-accessibility sensory-{sensory_type}',
                    fill="none",
                    stroke=style.get('stroke', '#388e3c'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'accessible_facilities':
                # Linear accessible features (ramps, paths with inclines)
                facility_type = self.determine_accessible_facility_type(properties)
                style = self.feature_types['accessible_facilities']['styles'].get(facility_type, 
                        self.feature_types['accessible_facilities']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'accessible-facility facility-{facility_type}',
                    fill="none",
                    stroke=style.get('stroke', '#1976d2'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'mobility_access':
                # Linear mobility features (ramps, handrails along paths)
                mobility_type = self.determine_mobility_access_type(properties)
                style = self.feature_types['mobility_access']['styles'].get(mobility_type, 
                        self.feature_types['mobility_access']['styles']['wheelchair_yes'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'mobility-access mobility-{mobility_type}',
                    fill="none",
                    stroke=style.get('stroke', '#2E7D32'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'accessible_transport':
                # Linear transport features (accessible routes)
                transport_type = self.determine_accessible_transport_type(properties)
                style = self.feature_types['accessible_transport']['styles'].get(transport_type, 
                        self.feature_types['accessible_transport']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'accessible-transport transport-{transport_type}',
                    fill="none",
                    stroke=style.get('stroke', '#006064'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'aeroway':
                # Linear aeroway features (taxiways, taxilanes)
                aeroway_type = self.determine_aeroway_type(properties)
                style = self.feature_types['aeroway']['styles'].get(aeroway_type, 
                        self.feature_types['aeroway']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'aeroway aeroway-{aeroway_type}',
                    fill="none",
                    stroke=style.get('stroke', '#999999'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'indoor':
                # Linear indoor features (corridors, walls)
                indoor_type = self.determine_indoor_type(properties)
                style = self.feature_types['indoor']['styles'].get(indoor_type, 
                        self.feature_types['indoor']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'indoor indoor-{indoor_type}',
                    fill="none",
                    stroke=style.get('stroke', '#cccccc'),
                    stroke_width=style.get('stroke_width', 2),
                    stroke_linecap="round",
                    stroke_linejoin="round"
                )
                
                # Add level information if available
                if 'level' in properties:
                    element.set('data-level', str(properties['level']))
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'barrier':
                # Linear barrier features (fences, walls)
                barrier_type = self.determine_barrier_type(properties)
                style = self.feature_types['barrier']['styles'].get(barrier_type, 
                        self.feature_types['barrier']['styles']['default'])
                
                element = self.create_svg_element(
                    'polyline',
                    points=" ".join(points),
                    class_=f'barrier barrier-{barrier_type}',
                    fill="none",
                    stroke=style.get('stroke', '#666666'),
                    stroke_width=style.get('stroke_width', 2),
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
                    fill=style.get('fill', '#aad3df'),
                    stroke=style.get('stroke', '#4d90c4'),
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
            elif feature_type == 'parking':
                parking_type = self.determine_parking_type(properties)
                style = self.feature_types['parking']['styles'].get(parking_type, 
                        self.feature_types['parking']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'parking parking-{parking_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'sensory_accessibility':
                # Areas with sensory accessibility features
                sensory_type = self.determine_sensory_accessibility_type(properties)
                style = self.feature_types['sensory_accessibility']['styles'].get(sensory_type, 
                        self.feature_types['sensory_accessibility']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'sensory-accessibility sensory-{sensory_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1.5)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'accessible_facilities':
                # Areas with accessible facilities
                facility_type = self.determine_accessible_facility_type(properties)
                style = self.feature_types['accessible_facilities']['styles'].get(facility_type, 
                        self.feature_types['accessible_facilities']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'accessible-facility facility-{facility_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1.5)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'mobility_access':
                # Areas with mobility access features
                mobility_type = self.determine_mobility_access_type(properties)
                style = self.feature_types['mobility_access']['styles'].get(mobility_type, 
                        self.feature_types['mobility_access']['styles']['wheelchair_yes'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'mobility-access mobility-{mobility_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1.5)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'accessible_transport':
                # Areas with accessible transport features (parking areas, stations)
                transport_type = self.determine_accessible_transport_type(properties)
                style = self.feature_types['accessible_transport']['styles'].get(transport_type, 
                        self.feature_types['accessible_transport']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'accessible-transport transport-{transport_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1.5)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'aeroway':
                # Areas with aeroway features (runways, aprons, terminals)
                aeroway_type = self.determine_aeroway_type(properties)
                style = self.feature_types['aeroway']['styles'].get(aeroway_type, 
                        self.feature_types['aeroway']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'aeroway aeroway-{aeroway_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1.5)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'indoor':
                # Indoor areas (corridors, rooms, etc.)
                indoor_type = self.determine_indoor_type(properties)
                style = self.feature_types['indoor']['styles'].get(indoor_type, 
                        self.feature_types['indoor']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'indoor indoor-{indoor_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
                
                # Add level information if available
                if 'level' in properties:
                    element.set('data-level', str(properties['level']))
                    
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'amenity':
                # Amenity areas (seating areas, waiting areas)
                amenity_type = properties.get('amenity', 'default')
                style = self.feature_types['amenity']['styles'].get(amenity_type, 
                        self.feature_types['amenity']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'amenity amenity-{amenity_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'barrier':
                # Barrier areas (checkpoint areas, turnstile zones)
                barrier_type = self.determine_barrier_type(properties)
                style = self.feature_types['barrier']['styles'].get(barrier_type, 
                        self.feature_types['barrier']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'barrier barrier-{barrier_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1.5)
                )
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
            elif feature_type == 'buildings':
                building_type = self.determine_building_type(properties)
                style = self.feature_types['buildings']['styles'].get(building_type, 
                        self.feature_types['buildings']['styles']['default'])
                
                element = self.create_svg_element(
                    'polygon',
                    points=" ".join(exterior_points),
                    class_=f'building building-{building_type}',
                    fill=style['fill'],
                    stroke=style['stroke'],
                    stroke_width=style.get('stroke_width', 1)
                )
                
                # Add level information if available (for multi-level terminals)
                if 'level' in properties:
                    element.set('data-level', str(properties['level']))
                # For terminals specifically, check aeroway=terminal with level
                if building_type == 'terminal' and properties.get('aeroway') == 'terminal':
                    if 'level' in properties:
                        element.set('data-terminal-level', str(properties['level']))
                
                if 'dasharray' in style:
                    element.set('stroke-dasharray', style['dasharray'])
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
    
    def determine_building_type(self, properties):
        """Determine specific building type from tags"""
        # Check building tag
        if 'building' in properties:
            building_type = properties['building']
            # Return the building type if it's in our styles
            if building_type in self.feature_types['buildings']['styles']:
                return building_type
        
        # Check if it's a hospital, school, etc. from amenity tags
        amenity = properties.get('amenity')
        if amenity == 'hospital':
            return 'hospital'
        elif amenity == 'school':
            return 'school'
        elif amenity == 'university':
            return 'university'
        elif amenity == 'college':
            return 'college'
        elif amenity == 'kindergarten':
            return 'kindergarten'
        
        # Check office tag for government buildings
        if properties.get('office') == 'government':
            return 'government'
            
        # Check if it's a train station
        if properties.get('railway') == 'station':
            return 'train_station'
            
        # Default to 'yes' for generic buildings
        return properties.get('building', 'yes')
    
    def determine_parking_type(self, properties):
        """Determine specific parking type from tags"""
        # Check amenity tag first
        amenity = properties.get('amenity')
        if amenity == 'bicycle_parking':
            return 'bicycle_parking'
        elif amenity == 'motorcycle_parking':
            return 'motorcycle_parking'
        
        # Check parking tag for specific type
        parking_type = properties.get('parking')
        if parking_type in ['surface', 'underground', 'multi-storey', 'rooftop', 
                           'street_side', 'garage_boxes']:
            return parking_type
        
        # Check if it's accessible parking
        if properties.get('wheelchair') == 'yes' or properties.get('access') == 'disabled':
            return 'surface'  # Default to surface for accessible parking
            
        # Check capacity to infer type
        capacity = properties.get('capacity')
        if capacity:
            try:
                if int(capacity) > 100:
                    return 'multi-storey'
                elif int(capacity) < 10:
                    return 'street_side'
            except:
                pass
                
        return 'surface'  # Default to surface parking
    
    def determine_sensory_accessibility_type(self, properties):
        """Determine specific sensory accessibility type from tags"""
        # Check for tactile paving
        if 'tactile_paving' in properties:
            if properties['tactile_paving'] == 'yes':
                return 'tactile_paving'
            elif properties['tactile_paving'] == 'no':
                return 'no_tactile_paving'
        
        # Check for audio signals at crossings
        if properties.get('traffic_signals:sound') == 'yes':
            return 'audio_signals'
        
        # Check for vibration signals
        if properties.get('traffic_signals:vibration') == 'yes':
            return 'vibration_signals'
        
        # Check for voice descriptions
        if properties.get('acoustic') == 'voice_description':
            return 'voice_description'
        
        # Check for braille
        if properties.get('braille') == 'yes':
            return 'braille'
        
        # Check for audio loop systems
        if properties.get('audio_loop') == 'yes':
            return 'audio_loop'
        
        # Check for sign language support
        if properties.get('sign_language') == 'yes':
            return 'sign_language'
            
        return 'default'  # Generic sensory accessibility feature
    
    def determine_accessible_facility_type(self, properties):
        """Determine specific accessible facility type from tags"""
        # Check for accessible toilets
        if properties.get('toilets:wheelchair') == 'yes' or (
            properties.get('amenity') == 'toilets' and properties.get('wheelchair') == 'yes'):
            return 'accessible_toilet'
        
        # Check for changing tables
        if properties.get('changing_table') == 'yes':
            return 'changing_table'
        
        # Check for elevators
        if properties.get('elevator') == 'yes' or properties.get('highway') == 'elevator':
            return 'elevator'
        
        # Check for escalators
        if properties.get('escalator') == 'yes' or properties.get('highway') == 'escalator':
            return 'escalator'
        
        # Check for moving walkways
        if properties.get('conveying') == 'yes':
            return 'moving_walkway'
        
        # Check for automatic doors
        if properties.get('automatic_door') == 'yes':
            return 'automatic_door'
        
        # Check for door width
        if 'door:width' in properties:
            try:
                width = float(properties['door:width'])
                if width >= 0.9:  # 90cm or wider is considered accessible
                    return 'wide_door'
            except:
                pass
        
        # Check for kerb height
        if 'kerb:height' in properties:
            try:
                height = float(properties.get('kerb:height', '0').replace('m', '').replace('cm', ''))
                if properties.get('kerb:height', '').endswith('cm'):
                    height = height / 100  # Convert cm to m
                if height <= 0.03:  # 3cm or less is considered low
                    return 'low_kerb'
            except:
                pass
        
        # Check for incline
        if 'incline' in properties:
            try:
                incline_str = properties['incline'].replace('%', '').replace('°', '')
                if 'up' in incline_str or 'down' in incline_str:
                    incline_str = incline_str.replace('up', '').replace('down', '').strip()
                incline = abs(float(incline_str))
                if incline > 8:  # Greater than 8% is steep
                    return 'steep_incline'
                elif incline <= 5:  # 5% or less is gentle
                    return 'gentle_incline'
            except:
                pass
            
        return 'default'  # Generic accessible facility
    
    def determine_mobility_access_type(self, properties):
        """Determine specific mobility access type from tags"""
        # Check wheelchair accessibility
        wheelchair = properties.get('wheelchair', '')
        if wheelchair == 'yes':
            return 'wheelchair_yes'
        elif wheelchair == 'no':
            return 'wheelchair_no'
        elif wheelchair == 'limited':
            return 'wheelchair_limited'
        elif wheelchair == 'designated':
            return 'wheelchair_designated'
        
        # Check for ramps
        if properties.get('ramp') == 'yes':
            return 'ramp'
        if properties.get('ramp:wheelchair') == 'yes':
            return 'wheelchair_ramp'
        if properties.get('ramp:stroller') == 'yes':
            return 'stroller_ramp'
        if properties.get('ramp:bicycle') == 'yes':
            return 'bicycle_ramp'
        
        # Check for steps
        if 'step_count' in properties:
            return 'steps'
        
        # Check for handrails
        if properties.get('handrail:center') == 'yes':
            return 'handrail_center'
        elif properties.get('handrail:left') == 'yes':
            return 'handrail_left'
        elif properties.get('handrail:right') == 'yes':
            return 'handrail_right'
        elif properties.get('handrail') == 'yes':
            return 'handrail'
            
        return 'wheelchair_yes'  # Default to accessible
    
    def determine_accessible_transport_type(self, properties):
        """Determine specific accessible transport type from tags"""
        # Check for disabled parking
        if 'capacity:disabled' in properties or properties.get('parking:disabled') == 'yes':
            return 'disabled_parking'
        
        # Check for priority access
        if properties.get('priority') == 'disabled':
            return 'priority_access'
        
        # Check for accessible transit
        if properties.get('bus:wheelchair') == 'yes':
            return 'accessible_bus'
        if properties.get('subway:wheelchair') == 'yes':
            return 'accessible_subway'
        if properties.get('tram:wheelchair') == 'yes':
            return 'accessible_tram'
        if properties.get('train:wheelchair') == 'yes':
            return 'accessible_train'
            
        return 'default'  # Generic accessible transport
    
    def determine_aeroway_type(self, properties):
        """Determine specific type of aeroway feature"""
        aeroway = properties.get('aeroway')
        
        if not aeroway:
            return 'default'
            
        # Direct mapping of aeroway values
        if aeroway in ['aerodrome', 'apron', 'gate', 'hangar', 'helipad', 'heliport',
                       'holding_position', 'jet_bridge', 'navigationaid', 'parking_position', 
                       'runway', 'taxilane', 'taxiway', 'terminal', 'windsock']:
            return aeroway
            
        return 'default'
    
    def determine_indoor_type(self, properties):
        """Determine specific type of indoor feature"""
        indoor = properties.get('indoor')
        
        # Check for specific room types first
        room_type = properties.get('room')
        if room_type:
            if room_type == 'gate_area':
                return 'gate_area'
            elif room_type == 'security':
                return 'security'
            elif room_type == 'waiting_area':
                return 'waiting_area'
            elif indoor == 'room':
                return 'room'
        
        if not indoor:
            return 'default'
            
        # Direct mapping of indoor values
        if indoor in ['area', 'corridor', 'room', 'wall', 'level', 'yes']:
            return indoor
            
        return 'default'
    
    def determine_amenity_type(self, properties):
        """Determine specific amenity type from tags"""
        amenity = properties.get('amenity')
        if amenity in ['seating', 'bench', 'waiting_area', 'shelter', 
                      'check_in', 'baggage_drop', 'security_check', 
                      'customs', 'immigration', 'lounge', 'baggage_claim',
                      'lost_property', 'information', 'currency_exchange', 
                      'toilets', 'shower', 'nursing_room', 'prayer_room', 
                      'smoking_area', 'wheelchair_rental', 'animal_relief_area',
                      'taxi', 'car_rental', 'bus_station', 'parking',
                      'valet_parking', 'restaurant', 'fast_food', 'cafe', 
                      'bar', 'vending_machine']:
            return amenity
        return 'default'
    
    def determine_barrier_type(self, properties):
        """Determine specific barrier type from tags"""
        barrier = properties.get('barrier')
        if barrier in ['checkpoint', 'gate', 'turnstile', 'full-height_turnstile']:
            return barrier
        return 'default'
    
    def determine_shop_type(self, properties):
        """Determine specific shop type from tags"""
        shop = properties.get('shop')
        if shop in ['duty_free', 'convenience']:
            return shop
        return 'default'
    
    def determine_railway_type(self, properties):
        """Determine specific railway type from tags"""
        railway = properties.get('railway')
        station = properties.get('station')
        
        if railway == 'station' and station == 'airport':
            return 'airport_station'
        elif railway == 'station':
            return 'station'
        
        return 'default'
    
    def generate_aria_label(self, feature_type, properties):
        """Generate accessible label for feature"""
        
        label_parts = []
        
        # Feature type
        if feature_type == 'buildings':
            building_type = self.determine_building_type(properties)
            building_labels = {
                'house': 'House',
                'residential': 'Residential building',
                'apartments': 'Apartment building',
                'detached': 'Detached house',
                'semidetached_house': 'Semi-detached house',
                'terrace': 'Row house',
                'dormitory': 'Dormitory',
                'bungalow': 'Bungalow',
                'cabin': 'Cabin',
                'commercial': 'Commercial building',
                'office': 'Office building',
                'industrial': 'Industrial building',
                'retail': 'Retail building',
                'warehouse': 'Warehouse',
                'supermarket': 'Supermarket',
                'hotel': 'Hotel',
                'kiosk': 'Kiosk',
                'civic': 'Civic building',
                'government': 'Government building',
                'hospital': 'Hospital',
                'school': 'School',
                'university': 'University',
                'college': 'College',
                'kindergarten': 'Kindergarten',
                'public': 'Public building',
                'train_station': 'Train station',
                'transportation': 'Transportation building',
                'terminal': 'Terminal building',
                'barn': 'Barn',
                'bridge': 'Bridge structure',
                'bunker': 'Bunker',
                'carport': 'Carport',
                'conservatory': 'Conservatory',
                'construction': 'Building under construction',
                'garage': 'Garage',
                'garages': 'Garages',
                'greenhouse': 'Greenhouse',
                'hangar': 'Hangar',
                'hut': 'Hut',
                'roof': 'Roofed area',
                'shed': 'Shed',
                'yes': 'Building',
                'default': 'Building'
            }
            label_parts.append(building_labels.get(building_type, 'Building'))
            
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
            
        elif feature_type == 'parking':
            parking_type = self.determine_parking_type(properties)
            parking_labels = {
                'surface': 'Surface parking',
                'underground': 'Underground parking',
                'multi-storey': 'Multi-storey parking',
                'rooftop': 'Rooftop parking',
                'street_side': 'Street-side parking',
                'garage_boxes': 'Garage boxes',
                'bicycle_parking': 'Bicycle parking',
                'motorcycle_parking': 'Motorcycle parking',
                'default': 'Parking'
            }
            label_parts.append(parking_labels.get(parking_type, 'Parking'))
            
            # Add capacity if available
            capacity = properties.get('capacity')
            if capacity:
                label_parts.append(f"{capacity} spaces")
            
            # Add fee information if available
            fee = properties.get('fee')
            if fee == 'yes':
                label_parts.append('paid')
            elif fee == 'no':
                label_parts.append('free')
            
            # Add access restrictions if available
            if properties.get('wheelchair') == 'yes':
                label_parts.append('wheelchair accessible')
            if properties.get('access') == 'disabled':
                label_parts.append('disabled parking only')
        
        elif feature_type == 'sensory_accessibility':
            sensory_type = self.determine_sensory_accessibility_type(properties)
            sensory_labels = {
                'tactile_paving': 'Tactile paving',
                'no_tactile_paving': 'No tactile paving',
                'audio_signals': 'Audio crossing signals',
                'vibration_signals': 'Vibrating crossing signals',
                'voice_description': 'Voice description available',
                'braille': 'Braille signage',
                'audio_loop': 'Hearing loop system',
                'sign_language': 'Sign language support',
                'default': 'Sensory accessibility feature'
            }
            label_parts.append(sensory_labels.get(sensory_type, 'Sensory accessibility feature'))
            
            # Add location context if available
            if properties.get('highway') == 'crossing':
                label_parts.append('at pedestrian crossing')
            elif properties.get('railway') == 'platform':
                label_parts.append('at platform')
            elif properties.get('building'):
                label_parts.append('at building entrance')
            
            # Add specific details
            if sensory_type == 'tactile_paving':
                if properties.get('surface'):
                    label_parts.append(f"surface: {properties['surface']}")
            elif sensory_type == 'audio_signals':
                if properties.get('button_operated') == 'yes':
                    label_parts.append('button operated')
        
        elif feature_type == 'accessible_facilities':
            facility_type = self.determine_accessible_facility_type(properties)
            facility_labels = {
                'accessible_toilet': 'Wheelchair accessible toilet',
                'changing_table': 'Baby changing table',
                'elevator': 'Elevator',
                'escalator': 'Escalator',
                'moving_walkway': 'Moving walkway',
                'automatic_door': 'Automatic door',
                'wide_door': 'Wide accessible door',
                'low_kerb': 'Low curb',
                'steep_incline': 'Steep incline',
                'gentle_incline': 'Gentle incline',
                'default': 'Accessible facility'
            }
            label_parts.append(facility_labels.get(facility_type, 'Accessible facility'))
            
            # Add specific details
            if facility_type == 'changing_table':
                location = properties.get('changing_table:location')
                if location:
                    label_parts.append(f"location: {location}")
            elif facility_type == 'wide_door':
                width = properties.get('door:width')
                if width:
                    label_parts.append(f"width: {width}")
            elif facility_type == 'low_kerb':
                height = properties.get('kerb:height')
                if height:
                    label_parts.append(f"height: {height}")
            elif facility_type in ['steep_incline', 'gentle_incline']:
                incline = properties.get('incline')
                if incline:
                    label_parts.append(f"grade: {incline}")
                    
            # Add operational details
            if properties.get('access') == 'yes':
                label_parts.append('public access')
            elif properties.get('access') == 'customers':
                label_parts.append('customers only')
            
            # Add level information
            level = properties.get('level')
            if level:
                label_parts.append(f"level {level}")
        
        elif feature_type == 'mobility_access':
            mobility_type = self.determine_mobility_access_type(properties)
            mobility_labels = {
                'wheelchair_yes': 'Wheelchair accessible',
                'wheelchair_no': 'Not wheelchair accessible',
                'wheelchair_limited': 'Limited wheelchair accessibility',
                'wheelchair_designated': 'Designated wheelchair accessible',
                'ramp': 'Ramp',
                'wheelchair_ramp': 'Wheelchair ramp',
                'stroller_ramp': 'Stroller ramp',
                'bicycle_ramp': 'Bicycle ramp',
                'steps': 'Steps',
                'handrail': 'Handrail',
                'handrail_center': 'Center handrail',
                'handrail_left': 'Left handrail',
                'handrail_right': 'Right handrail'
            }
            label_parts.append(mobility_labels.get(mobility_type, 'Mobility access feature'))
            
            # Add step count if available
            if mobility_type == 'steps' and 'step_count' in properties:
                count = properties.get('step_count')
                label_parts.append(f"{count} steps")
            
            # Add ramp details
            if mobility_type.endswith('_ramp') or mobility_type == 'ramp':
                if properties.get('incline'):
                    label_parts.append(f"incline: {properties['incline']}")
                if properties.get('surface'):
                    label_parts.append(f"surface: {properties['surface']}")
            
            # Add wheelchair details
            if mobility_type.startswith('wheelchair'):
                if properties.get('description'):
                    label_parts.append(properties['description'])
                    
            # Add handrail details
            if mobility_type.startswith('handrail'):
                if properties.get('material'):
                    label_parts.append(f"material: {properties['material']}")
        
        elif feature_type == 'accessible_transport':
            transport_type = self.determine_accessible_transport_type(properties)
            transport_labels = {
                'disabled_parking': 'Disabled parking',
                'priority_access': 'Priority access',
                'accessible_bus': 'Wheelchair accessible bus stop',
                'accessible_subway': 'Wheelchair accessible subway',
                'accessible_tram': 'Wheelchair accessible tram',
                'accessible_train': 'Wheelchair accessible train',
                'default': 'Accessible transport'
            }
            label_parts.append(transport_labels.get(transport_type, 'Accessible transport'))
            
            # Add capacity for disabled parking
            if transport_type == 'disabled_parking' and 'capacity:disabled' in properties:
                capacity = properties.get('capacity:disabled')
                label_parts.append(f"{capacity} disabled spaces")
            
            # Add route information for transit
            if transport_type.startswith('accessible_'):
                if properties.get('name'):
                    # Name is added separately below
                    pass
                if properties.get('ref'):
                    label_parts.append(f"route {properties['ref']}")
                if properties.get('operator'):
                    label_parts.append(f"operated by {properties['operator']}")
            
            # Add platform information
            if properties.get('platform'):
                label_parts.append(f"platform {properties['platform']}")
                
            # Add level information
            if properties.get('level'):
                label_parts.append(f"level {properties['level']}")
        elif feature_type == 'aeroway':
            aeroway_type = self.determine_aeroway_type(properties)
            aeroway_labels = {
                'aerodrome': 'Airport',
                'apron': 'Aircraft apron',
                'gate': 'Airport gate',
                'hangar': 'Aircraft hangar',
                'helipad': 'Helipad',
                'heliport': 'Heliport',
                'holding_position': 'Aircraft holding position',
                'jet_bridge': 'Jet bridge',
                'navigationaid': 'Navigation aid',
                'parking_position': 'Aircraft parking position',
                'runway': 'Runway',
                'taxilane': 'Taxilane',
                'taxiway': 'Taxiway',
                'terminal': 'Airport terminal',
                'windsock': 'Windsock',
                'default': 'Airport feature'
            }
            label_parts.append(aeroway_labels.get(aeroway_type, 'Airport feature'))
            
            # Add gate number
            if aeroway_type == 'gate' and properties.get('ref'):
                label_parts.append(f"Gate {properties['ref']}")
            
            # Add gate type (jet bridge, bus, walk)
            if aeroway_type == 'gate' and properties.get('gate:type'):
                gate_type = properties['gate:type']
                if gate_type == 'jet_bridge':
                    label_parts.append('Jet bridge gate')
                elif gate_type == 'bus':
                    label_parts.append('Bus gate')
                elif gate_type == 'walk':
                    label_parts.append('Walk-out gate')
            
            # Add wheelchair accessibility for gates
            if aeroway_type == 'gate' and 'wheelchair' in properties:
                if properties['wheelchair'] == 'yes':
                    label_parts.append('Wheelchair accessible')
                elif properties['wheelchair'] == 'no':
                    label_parts.append('Not wheelchair accessible')
                elif properties['wheelchair'] == 'limited':
                    label_parts.append('Limited wheelchair access')
            
            # Add runway information
            if aeroway_type == 'runway' and properties.get('ref'):
                label_parts.append(f"Runway {properties['ref']}")
            
            # Add terminal information
            if aeroway_type == 'terminal':
                if properties.get('building') == 'terminal':
                    label_parts.append('Terminal building')
                if properties.get('aerodrome:terminal'):
                    label_parts.append(f"Terminal {properties['aerodrome:terminal']}")
            
            # Add airline information for gates
            if aeroway_type == 'gate' and properties.get('airline'):
                label_parts.append(f"Airline: {properties['airline']}")
            
            # Add IATA/ICAO codes for airports
            if aeroway_type == 'aerodrome':
                if properties.get('iata'):
                    label_parts.append(f"IATA: {properties['iata']}")
                if properties.get('icao'):
                    label_parts.append(f"ICAO: {properties['icao']}")
        elif feature_type == 'indoor':
            indoor_type = self.determine_indoor_type(properties)
            indoor_labels = {
                'area': 'Indoor area',
                'corridor': 'Indoor corridor',
                'room': 'Room',
                'wall': 'Indoor wall',
                'level': 'Indoor level',
                'gate_area': 'Gate waiting area',
                'security': 'Security area',
                'waiting_area': 'Waiting area',
                'yes': 'Indoor space',
                'default': 'Indoor feature'
            }
            label_parts.append(indoor_labels.get(indoor_type, 'Indoor feature'))
            
            # Add room information
            if properties.get('room'):
                label_parts.append(f"Room type: {properties['room']}")
            if properties.get('ref'):
                label_parts.append(f"Room {properties['ref']}")
            
            # Add level information
            if properties.get('level'):
                level = properties['level']
                if level == '0':
                    label_parts.append('Ground floor')
                elif level == '-1':
                    label_parts.append('Basement')
                elif level.startswith('-'):
                    label_parts.append(f"Basement level {level[1:]}")
                else:
                    label_parts.append(f"Floor {level}")
            
            # Add specific room types
            if properties.get('room') == 'gate_area':
                label_parts.append('Gate waiting area')
            elif properties.get('room') == 'security':
                label_parts.append('Security checkpoint')
            elif properties.get('room') == 'shop':
                label_parts.append('Shop')
            elif properties.get('room') == 'restaurant':
                label_parts.append('Restaurant')
        elif feature_type == 'amenity':
            amenity_type = properties.get('amenity', 'default')
            amenity_labels = {
                'seating': 'Seating area',
                'bench': 'Bench',
                'waiting_area': 'Waiting area',
                'shelter': 'Shelter',
                'check_in': 'Check-in counter',
                'baggage_drop': 'Baggage drop-off',
                'security_check': 'Security checkpoint',
                'customs': 'Customs area',
                'immigration': 'Immigration control',
                'lounge': 'Airport lounge',
                'baggage_claim': 'Baggage claim area',
                'lost_property': 'Lost and found',
                'information': 'Information desk',
                'currency_exchange': 'Currency exchange',
                'toilets': 'Restrooms',
                'shower': 'Shower facilities',
                'nursing_room': 'Nursing room',
                'prayer_room': 'Prayer room',
                'smoking_area': 'Smoking area',
                'wheelchair_rental': 'Wheelchair rental',
                'animal_relief_area': 'Service animal relief area',
                'taxi': 'Taxi stand',
                'car_rental': 'Car rental counter',
                'bus_station': 'Bus terminal',
                'parking': 'Parking area',
                'valet_parking': 'Valet parking',
                'restaurant': 'Restaurant',
                'fast_food': 'Fast food outlet',
                'cafe': 'Cafe',
                'bar': 'Bar',
                'vending_machine': 'Vending machine',
                'default': 'Amenity'
            }
            label_parts.append(amenity_labels.get(amenity_type, 'Amenity'))
            
            # Add capacity information if available
            if properties.get('capacity'):
                label_parts.append(f"Capacity: {properties['capacity']}")
            
            # Add wheelchair accessibility
            if properties.get('wheelchair') == 'yes':
                label_parts.append('Wheelchair accessible')
            elif properties.get('wheelchair') == 'no':
                label_parts.append('Not wheelchair accessible')
            elif properties.get('wheelchair') == 'limited':
                label_parts.append('Limited wheelchair access')
            
            # Add covered information
            if properties.get('covered') == 'yes':
                label_parts.append('Covered')
            
            # Add material information for benches
            if amenity_type == 'bench' and properties.get('material'):
                label_parts.append(f"Material: {properties['material']}")
        elif feature_type == 'barrier':
            barrier_type = properties.get('barrier', 'default')
            barrier_labels = {
                'checkpoint': 'Security checkpoint',
                'gate': 'Gate',
                'turnstile': 'Turnstile',
                'full-height_turnstile': 'Full-height turnstile',
                'default': 'Barrier'
            }
            label_parts.append(barrier_labels.get(barrier_type, 'Barrier'))
            
            # Add access information
            if properties.get('access'):
                label_parts.append(f"Access: {properties['access']}")
        elif feature_type == 'shop':
            shop_type = properties.get('shop', 'default')
            shop_labels = {
                'duty_free': 'Duty-free shop',
                'convenience': 'Convenience store',
                'default': 'Shop'
            }
            label_parts.append(shop_labels.get(shop_type, 'Shop'))
        elif feature_type == 'railway':
            railway_type = self.determine_railway_type(properties)
            railway_labels = {
                'airport_station': 'Airport train station',
                'station': 'Train station',
                'default': 'Railway facility'
            }
            label_parts.append(railway_labels.get(railway_type, 'Railway facility'))
            
            # Add station information
            if properties.get('network'):
                label_parts.append(f"Network: {properties['network']}")
            if properties.get('operator'):
                label_parts.append(f"Operator: {properties['operator']}")
        
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
        lat = self.bounds['south']
        while lat < self.bounds['north']:
            lng = self.bounds['west']
            while lng < self.bounds['east']:
                
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