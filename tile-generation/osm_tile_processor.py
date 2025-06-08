#!/usr/bin/env python3
"""
OSM Tile Processor - Extracts real OSM data for SVG tiles
"""

import osmium
from shapely.geometry import Point, LineString, Polygon
from shapely.wkb import loads

class OSMHandler(osmium.SimpleHandler):
    def __init__(self, bounds):
        super().__init__()
        self.bounds = bounds
        self.features = {
            'buildings': [],
            'roads': [],
            'accessibility': [],
            'pedestrian_areas': [],
            'transit': [],
            'water': [],
            'parks': [],
            'landuse': [],
            'vegetation': [],
            'religious': [],
            'parking': [],
            'sensory_accessibility': [],
            'accessible_facilities': []
        }
        
    def is_in_bounds(self, lat, lon):
        """Check if coordinate is within tile bounds"""
        return (self.bounds['south'] <= lat <= self.bounds['north'] and
                self.bounds['west'] <= lon <= self.bounds['east'])
    
    def node(self, n):
        """Process node features"""
        if not self.is_in_bounds(n.location.lat, n.location.lon):
            return
            
        tags = {t.k: t.v for t in n.tags}
        
        # Transit stops
        if tags.get('highway') == 'bus_stop' or tags.get('railway') in ['station', 'subway_entrance']:
            self.features['transit'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
        
        # Accessibility features
        if tags.get('amenity') == 'parking' and tags.get('wheelchair') == 'yes':
            self.features['accessibility'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
            
        # Water features (fountains)
        if tags.get('amenity') == 'fountain':
            self.features['water'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
            
        # Park amenities (playgrounds)
        if tags.get('amenity') == 'playground':
            self.features['parks'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
            
        # Individual trees
        if tags.get('natural') == 'tree':
            self.features['vegetation'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
            
        # Religious places (nodes)
        if tags.get('amenity') == 'place_of_worship':
            self.features['religious'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
            
        # Parking (nodes - bicycle/motorcycle parking stands)
        if tags.get('amenity') in ['parking', 'bicycle_parking', 'motorcycle_parking']:
            # Skip if it's wheelchair parking (handled by accessibility)
            if not (tags.get('amenity') == 'parking' and tags.get('wheelchair') == 'yes'):
                self.features['parking'].append({
                    'geometry': Point(n.location.lon, n.location.lat),
                    'properties': {**tags, 'osm_id': n.id}
                })
        
        # Sensory accessibility features
        if (tags.get('tactile_paving') in ['yes', 'no'] or
            tags.get('traffic_signals:sound') == 'yes' or
            tags.get('traffic_signals:vibration') == 'yes' or
            tags.get('acoustic') == 'voice_description' or
            tags.get('braille') == 'yes' or
            tags.get('audio_loop') == 'yes' or
            tags.get('sign_language') == 'yes'):
            self.features['sensory_accessibility'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
            
        # Accessible facilities features
        if (tags.get('toilets:wheelchair') in ['yes', 'no'] or
            tags.get('changing_table') in ['yes', 'no'] or
            tags.get('elevator') in ['yes', 'no'] or
            tags.get('escalator') in ['yes', 'no'] or
            tags.get('conveying') in ['yes', 'no'] or
            tags.get('automatic_door') in ['yes', 'no'] or
            'door:width' in tags or
            'kerb:height' in tags or
            'incline' in tags or
            tags.get('highway') == 'elevator' or
            tags.get('highway') == 'escalator'):
            self.features['accessible_facilities'].append({
                'geometry': Point(n.location.lon, n.location.lat),
                'properties': {**tags, 'osm_id': n.id}
            })
    
    def way(self, w):
        """Process way features"""
        if len(w.nodes) < 2:
            return
            
        # Get node locations
        try:
            wkb = osmium.geom.WKBFactory()
            geom = wkb.create_linestring(w)
            line = loads(geom, hex=True)
            
            # Check if the line intersects with the tile bounds
            # A line can pass through a tile even if no nodes are within it
            tile_bounds = (self.bounds['west'], self.bounds['south'], 
                          self.bounds['east'], self.bounds['north'])
            line_bounds = line.bounds  # (minx, miny, maxx, maxy)
            
            # Check if bounding boxes overlap
            if not (line_bounds[0] <= tile_bounds[2] and line_bounds[2] >= tile_bounds[0] and
                    line_bounds[1] <= tile_bounds[3] and line_bounds[3] >= tile_bounds[1]):
                return
                
        except Exception:
            return
        
        tags = {t.k: t.v for t in w.tags}
        
        # Buildings
        if 'building' in tags:
            try:
                # Try to create polygon if closed way
                if w.is_closed():
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['buildings'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
            except Exception:
                pass
        
        # Roads
        elif tags.get('highway') in ['motorway', 'trunk', 'primary', 'secondary', 
                                      'tertiary', 'residential', 'service', 'unclassified',
                                      'pedestrian', 'footway', 'cycleway', 'path', 
                                      'living_street', 'track', 'bus_guideway', 'escape',
                                      'raceway', 'road', 'busway', 'motorway_link',
                                      'trunk_link', 'primary_link', 'secondary_link',
                                      'tertiary_link', 'bridleway', 'steps', 'corridor',
                                      'sidewalk']:
            self.features['roads'].append({
                'geometry': line,
                'properties': {**tags, 'osm_id': w.id}
            })
            
            # Also add to pedestrian_areas if it's a pedestrian-friendly road
            if tags.get('highway') in ['pedestrian', 'living_street', 'footway', 
                                       'sidewalk', 'steps', 'corridor', 'path']:
                self.features['pedestrian_areas'].append({
                    'geometry': line,
                    'properties': {**tags, 'osm_id': w.id}
                })
                
        # Water areas and waterways
        elif (tags.get('natural') in ['water', 'coastline', 'bay', 'beach', 'wetland'] or
              tags.get('waterway') in ['river', 'stream', 'canal', 'drain', 'ditch', 
                                       'rapids', 'waterfall', 'dam', 'weir', 'lock_gate',
                                       'dock', 'boatyard', 'fuel', 'turning_point'] or
              tags.get('landuse') in ['reservoir', 'basin', 'salt_pond', 'aquaculture'] or
              tags.get('leisure') in ['swimming_pool', 'swimming_area'] or
              'water' in tags):
            
            # Water areas (closed ways forming polygons)
            if w.is_closed() and tags.get('waterway') not in ['river', 'stream', 'canal', 'drain', 'ditch']:
                try:
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['water'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
                except Exception:
                    pass
            else:
                # Linear waterways
                self.features['water'].append({
                    'geometry': line,
                    'properties': {**tags, 'osm_id': w.id}
                })
                
        # Land use areas
        elif tags.get('landuse') in ['residential', 'commercial', 'industrial', 'retail', 
                                     'construction', 'brownfield', 'cemetery', 'quarry',
                                     'landfill', 'railway', 'port', 'depot', 'garages',
                                     'religious', 'education', 'institutional', 'military']:
            if w.is_closed():
                try:
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['landuse'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
                except Exception:
                    pass
                    
        # Vegetation and natural areas
        elif (tags.get('natural') in ['wood', 'tree_row', 'scrub', 'heath', 'grassland', 
                                      'fell', 'bare_rock', 'scree', 'shingle', 'sand', 'mud',
                                      'wetland', 'marsh', 'swamp', 'bog', 'fen'] or
              tags.get('landuse') in ['forest', 'meadow', 'grass', 'greenfield', 'conservation',
                                      'orchard', 'vineyard', 'allotments', 'farmland', 'farmyard',
                                      'greenhouse_horticulture', 'plant_nursery', 'flowerbed'] or
              tags.get('leisure') == 'nature_reserve' or
              tags.get('boundary') in ['national_park', 'protected_area']):
            
            # Check if it's a linear feature (tree row) or area
            if tags.get('natural') == 'tree_row' or not w.is_closed():
                # Linear vegetation feature
                self.features['vegetation'].append({
                    'geometry': line,
                    'properties': {**tags, 'osm_id': w.id}
                })
            else:
                # Area vegetation feature
                try:
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['vegetation'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
                except Exception:
                    pass
                    
        # Parks and recreation areas
        elif (tags.get('leisure') in ['park', 'garden', 'playground', 'dog_park',
                                      'recreation_ground', 'common', 'fitness_centre', 'fitness_station',
                                      'sports_centre', 'stadium', 'track', 'pitch', 'golf_course',
                                      'miniature_golf', 'disc_golf_course', 'swimming_pool', 'water_park',
                                      'marina', 'slipway', 'beach_resort'] or
              tags.get('landuse') in ['recreation_ground', 'village_green'] or
              tags.get('amenity') == 'playground' or
              'sport' in tags):
            
            # Park areas (closed ways forming polygons)
            if w.is_closed():
                try:
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['parks'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
                except Exception:
                    pass
            else:
                # Linear park features (tree rows, paths, etc.)
                self.features['parks'].append({
                    'geometry': line,
                    'properties': {**tags, 'osm_id': w.id}
                })
                
        # Religious places (ways)
        elif (tags.get('amenity') == 'place_of_worship' or
              tags.get('building') in ['church', 'mosque', 'temple', 'synagogue', 'chapel', 
                                      'cathedral', 'shrine', 'monastery']):
            # Religious buildings (closed ways forming polygons)
            if w.is_closed():
                try:
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['religious'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
                except Exception:
                    pass
                    
        # Parking areas (ways)
        elif (tags.get('amenity') in ['parking', 'bicycle_parking', 'motorcycle_parking'] or
              'parking' in tags):
            # Skip if it's wheelchair parking (handled by accessibility)
            if not (tags.get('amenity') == 'parking' and tags.get('wheelchair') == 'yes'):
                # Parking areas (closed ways forming polygons)
                if w.is_closed():
                    try:
                        geom = wkb.create_polygon(w)
                        poly = loads(geom, hex=True)
                        self.features['parking'].append({
                            'geometry': poly,
                            'properties': {**tags, 'osm_id': w.id}
                        })
                    except Exception:
                        pass
                        
        # Sensory accessibility features (ways - tactile paving along paths)
        elif (tags.get('tactile_paving') in ['yes', 'no'] or
              tags.get('traffic_signals:sound') == 'yes' or
              tags.get('traffic_signals:vibration') == 'yes' or
              tags.get('acoustic') == 'voice_description' or
              tags.get('braille') == 'yes' or
              tags.get('audio_loop') == 'yes' or
              tags.get('sign_language') == 'yes'):
            # Can be lines (tactile paving along a path) or areas
            if w.is_closed():
                try:
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['sensory_accessibility'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
                except Exception:
                    pass
            else:
                # Linear feature (tactile paving along path)
                self.features['sensory_accessibility'].append({
                    'geometry': line,
                    'properties': {**tags, 'osm_id': w.id}
                })
                
        # Accessible facilities features (ways)
        elif (tags.get('toilets:wheelchair') in ['yes', 'no'] or
              tags.get('changing_table') in ['yes', 'no'] or
              tags.get('elevator') in ['yes', 'no'] or
              tags.get('escalator') in ['yes', 'no'] or
              tags.get('conveying') in ['yes', 'no'] or
              tags.get('automatic_door') in ['yes', 'no'] or
              'door:width' in tags or
              'kerb:height' in tags or
              'incline' in tags or
              tags.get('highway') == 'elevator' or
              tags.get('highway') == 'escalator'):
            # Can be lines (inclines) or areas (elevator shafts)
            if w.is_closed():
                try:
                    geom = wkb.create_polygon(w)
                    poly = loads(geom, hex=True)
                    self.features['accessible_facilities'].append({
                        'geometry': poly,
                        'properties': {**tags, 'osm_id': w.id}
                    })
                except Exception:
                    pass
            else:
                # Linear feature (inclined path, kerb)
                self.features['accessible_facilities'].append({
                    'geometry': line,
                    'properties': {**tags, 'osm_id': w.id}
                })
    
    def area(self, a):
        """Process area features (multipolygons)"""
        tags = {t.k: t.v for t in a.tags}
        
        # Buildings from relations
        if 'building' in tags:
            try:
                wkb = osmium.geom.WKBFactory()
                geom = wkb.create_multipolygon(a)
                multipoly = loads(geom, hex=True)
                
                # Check if any polygon intersects with tile bounds
                bounds_check = False
                tile_bounds = (self.bounds['west'], self.bounds['south'], 
                              self.bounds['east'], self.bounds['north'])
                
                for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                    poly_bounds = poly.bounds
                    # Check if bounding boxes overlap
                    if (poly_bounds[0] <= tile_bounds[2] and poly_bounds[2] >= tile_bounds[0] and
                        poly_bounds[1] <= tile_bounds[3] and poly_bounds[3] >= tile_bounds[1]):
                        bounds_check = True
                        break
                
                if bounds_check:
                    # Convert multipolygon to individual polygons
                    if hasattr(multipoly, 'geoms'):
                        for poly in multipoly.geoms:
                            self.features['buildings'].append({
                                'geometry': poly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                    else:
                        self.features['buildings'].append({
                            'geometry': multipoly,
                            'properties': {**tags, 'osm_id': a.id}
                        })
            except Exception:
                pass
                
        # Water areas from relations
        elif (tags.get('natural') in ['water', 'coastline', 'bay', 'beach', 'wetland'] or
              tags.get('waterway') in ['riverbank'] or
              tags.get('landuse') in ['reservoir', 'basin', 'salt_pond', 'aquaculture'] or
              tags.get('leisure') in ['swimming_pool', 'swimming_area'] or
              'water' in tags):
            try:
                wkb = osmium.geom.WKBFactory()
                geom = wkb.create_multipolygon(a)
                multipoly = loads(geom, hex=True)
                
                # Check if any part is in bounds
                bounds_check = False
                for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                    if any(self.is_in_bounds(lat, lon) for lon, lat in poly.exterior.coords):
                        bounds_check = True
                        break
                
                if bounds_check:
                    # Convert multipolygon to individual polygons
                    if hasattr(multipoly, 'geoms'):
                        for poly in multipoly.geoms:
                            self.features['water'].append({
                                'geometry': poly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                    else:
                        self.features['water'].append({
                            'geometry': multipoly,
                            'properties': {**tags, 'osm_id': a.id}
                        })
            except Exception:
                pass
                
        # Land use areas from relations
        elif tags.get('landuse') in ['residential', 'commercial', 'industrial', 'retail', 
                                     'construction', 'brownfield', 'cemetery', 'quarry',
                                     'landfill', 'railway', 'port', 'depot', 'garages',
                                     'religious', 'education', 'institutional', 'military']:
            try:
                wkb = osmium.geom.WKBFactory()
                geom = wkb.create_multipolygon(a)
                multipoly = loads(geom, hex=True)
                
                # Check if any polygon intersects with tile bounds
                bounds_check = False
                tile_bounds = (self.bounds['west'], self.bounds['south'], 
                              self.bounds['east'], self.bounds['north'])
                
                for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                    poly_bounds = poly.bounds
                    # Check if bounding boxes overlap
                    if (poly_bounds[0] <= tile_bounds[2] and poly_bounds[2] >= tile_bounds[0] and
                        poly_bounds[1] <= tile_bounds[3] and poly_bounds[3] >= tile_bounds[1]):
                        bounds_check = True
                        break
                
                if bounds_check:
                    # Convert multipolygon to individual polygons
                    if hasattr(multipoly, 'geoms'):
                        for poly in multipoly.geoms:
                            self.features['landuse'].append({
                                'geometry': poly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                    else:
                        self.features['landuse'].append({
                            'geometry': multipoly,
                            'properties': {**tags, 'osm_id': a.id}
                        })
            except Exception:
                pass
                
        # Vegetation areas from relations
        elif (tags.get('natural') in ['wood', 'tree_row', 'scrub', 'heath', 'grassland', 
                                      'fell', 'bare_rock', 'scree', 'shingle', 'sand', 'mud',
                                      'wetland', 'marsh', 'swamp', 'bog', 'fen'] or
              tags.get('landuse') in ['forest', 'meadow', 'grass', 'greenfield', 'conservation',
                                      'orchard', 'vineyard', 'allotments', 'farmland', 'farmyard',
                                      'greenhouse_horticulture', 'plant_nursery', 'flowerbed'] or
              tags.get('leisure') == 'nature_reserve' or
              tags.get('boundary') in ['national_park', 'protected_area']):
            try:
                wkb = osmium.geom.WKBFactory()
                geom = wkb.create_multipolygon(a)
                multipoly = loads(geom, hex=True)
                
                # Check if any polygon intersects with tile bounds
                bounds_check = False
                tile_bounds = (self.bounds['west'], self.bounds['south'], 
                              self.bounds['east'], self.bounds['north'])
                
                for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                    poly_bounds = poly.bounds
                    # Check if bounding boxes overlap
                    if (poly_bounds[0] <= tile_bounds[2] and poly_bounds[2] >= tile_bounds[0] and
                        poly_bounds[1] <= tile_bounds[3] and poly_bounds[3] >= tile_bounds[1]):
                        bounds_check = True
                        break
                
                if bounds_check:
                    # Convert multipolygon to individual polygons
                    if hasattr(multipoly, 'geoms'):
                        for poly in multipoly.geoms:
                            self.features['vegetation'].append({
                                'geometry': poly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                    else:
                        self.features['vegetation'].append({
                            'geometry': multipoly,
                            'properties': {**tags, 'osm_id': a.id}
                        })
            except Exception:
                pass
                
        # Parks and recreation areas from relations
        elif (tags.get('leisure') in ['park', 'garden', 'playground', 'dog_park',
                                      'recreation_ground', 'common', 'fitness_centre', 'fitness_station',
                                      'sports_centre', 'stadium', 'track', 'pitch', 'golf_course',
                                      'miniature_golf', 'disc_golf_course', 'swimming_pool', 'water_park',
                                      'marina', 'slipway', 'beach_resort'] or
              tags.get('landuse') in ['recreation_ground', 'village_green'] or
              tags.get('amenity') == 'playground' or
              'sport' in tags):
            try:
                wkb = osmium.geom.WKBFactory()
                geom = wkb.create_multipolygon(a)
                multipoly = loads(geom, hex=True)
                
                # Check if any polygon intersects with tile bounds
                bounds_check = False
                tile_bounds = (self.bounds['west'], self.bounds['south'], 
                              self.bounds['east'], self.bounds['north'])
                
                for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                    poly_bounds = poly.bounds
                    # Check if bounding boxes overlap
                    if (poly_bounds[0] <= tile_bounds[2] and poly_bounds[2] >= tile_bounds[0] and
                        poly_bounds[1] <= tile_bounds[3] and poly_bounds[3] >= tile_bounds[1]):
                        bounds_check = True
                        break
                
                if bounds_check:
                    # Convert multipolygon to individual polygons
                    if hasattr(multipoly, 'geoms'):
                        for poly in multipoly.geoms:
                            self.features['parks'].append({
                                'geometry': poly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                    else:
                        self.features['parks'].append({
                            'geometry': multipoly,
                            'properties': {**tags, 'osm_id': a.id}
                        })
            except Exception:
                pass
                
        # Religious places from relations
        elif (tags.get('amenity') == 'place_of_worship' or
              tags.get('building') in ['church', 'mosque', 'temple', 'synagogue', 'chapel', 
                                      'cathedral', 'shrine', 'monastery']):
            try:
                wkb = osmium.geom.WKBFactory()
                geom = wkb.create_multipolygon(a)
                multipoly = loads(geom, hex=True)
                
                # Check if any polygon intersects with tile bounds
                bounds_check = False
                tile_bounds = (self.bounds['west'], self.bounds['south'], 
                              self.bounds['east'], self.bounds['north'])
                
                for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                    poly_bounds = poly.bounds
                    # Check if bounding boxes overlap
                    if (poly_bounds[0] <= tile_bounds[2] and poly_bounds[2] >= tile_bounds[0] and
                        poly_bounds[1] <= tile_bounds[3] and poly_bounds[3] >= tile_bounds[1]):
                        bounds_check = True
                        break
                
                if bounds_check:
                    # Convert multipolygon to individual polygons
                    if hasattr(multipoly, 'geoms'):
                        for poly in multipoly.geoms:
                            self.features['religious'].append({
                                'geometry': poly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                    else:
                        self.features['religious'].append({
                            'geometry': multipoly,
                            'properties': {**tags, 'osm_id': a.id}
                        })
            except Exception:
                pass
                
        # Parking areas from relations
        elif (tags.get('amenity') in ['parking', 'bicycle_parking', 'motorcycle_parking'] or
              'parking' in tags):
            # Skip if it's wheelchair parking (handled by accessibility)
            if not (tags.get('amenity') == 'parking' and tags.get('wheelchair') == 'yes'):
                try:
                    wkb = osmium.geom.WKBFactory()
                    geom = wkb.create_multipolygon(a)
                    multipoly = loads(geom, hex=True)
                    
                    # Check if any polygon intersects with tile bounds
                    bounds_check = False
                    tile_bounds = (self.bounds['west'], self.bounds['south'], 
                                  self.bounds['east'], self.bounds['north'])
                    
                    for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                        poly_bounds = poly.bounds
                        # Check if bounding boxes overlap
                        if (poly_bounds[0] <= tile_bounds[2] and poly_bounds[2] >= tile_bounds[0] and
                            poly_bounds[1] <= tile_bounds[3] and poly_bounds[3] >= tile_bounds[1]):
                            bounds_check = True
                            break
                    
                    if bounds_check:
                        # Convert multipolygon to individual polygons
                        if hasattr(multipoly, 'geoms'):
                            for poly in multipoly.geoms:
                                self.features['parking'].append({
                                    'geometry': poly,
                                    'properties': {**tags, 'osm_id': a.id}
                                })
                        else:
                            self.features['parking'].append({
                                'geometry': multipoly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                except Exception:
                    pass
                    
        # Accessible facilities from relations
        elif (tags.get('toilets:wheelchair') in ['yes', 'no'] or
              tags.get('changing_table') in ['yes', 'no'] or
              tags.get('elevator') in ['yes', 'no'] or
              tags.get('escalator') in ['yes', 'no'] or
              tags.get('conveying') in ['yes', 'no'] or
              tags.get('automatic_door') in ['yes', 'no'] or
              'door:width' in tags or
              'kerb:height' in tags or
              'incline' in tags):
            try:
                wkb = osmium.geom.WKBFactory()
                geom = wkb.create_multipolygon(a)
                multipoly = loads(geom, hex=True)
                
                # Check if any polygon intersects with tile bounds
                bounds_check = False
                tile_bounds = (self.bounds['west'], self.bounds['south'], 
                              self.bounds['east'], self.bounds['north'])
                
                for poly in multipoly.geoms if hasattr(multipoly, 'geoms') else [multipoly]:
                    poly_bounds = poly.bounds
                    # Check if bounding boxes overlap
                    if (poly_bounds[0] <= tile_bounds[2] and poly_bounds[2] >= tile_bounds[0] and
                        poly_bounds[1] <= tile_bounds[3] and poly_bounds[3] >= tile_bounds[1]):
                        bounds_check = True
                        break
                
                if bounds_check:
                    # Convert multipolygon to individual polygons
                    if hasattr(multipoly, 'geoms'):
                        for poly in multipoly.geoms:
                            self.features['accessible_facilities'].append({
                                'geometry': poly,
                                'properties': {**tags, 'osm_id': a.id}
                            })
                    else:
                        self.features['accessible_facilities'].append({
                            'geometry': multipoly,
                            'properties': {**tags, 'osm_id': a.id}
                        })
            except Exception:
                pass