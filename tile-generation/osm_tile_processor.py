#!/usr/bin/env python3
"""
OSM Tile Processor.

Collects OSM features (nodes/ways/areas) and classifies each through the
taxonomy engine (taxonomy.json). Every collected feature carries its layered
classification — a `base` match that renders the geometry, plus any `poi` /
`accessibility` matches as filterable overlays. This replaces the former
hard-coded per-category tag whitelists; the taxonomy is now the single source
of truth for what is collected and how it is classed.

`self.features` is a flat list of:
    { 'geometry': shapely geometry,
      'properties': {**osm_tags, 'osm_id': id},
      'classification': { 'base': {...}|None, 'overlays': [...], 'primary': {...} } }
"""

import osmium
from shapely.geometry import Point
from shapely.wkb import loads

from taxonomy_engine import Taxonomy


class OSMHandler(osmium.SimpleHandler):
    def __init__(self, bounds, taxonomy=None):
        super().__init__()
        self.bounds = bounds
        self.taxonomy = taxonomy or Taxonomy.load()
        self.wkb = osmium.geom.WKBFactory()
        self.features = []

    def is_in_bounds(self, lat, lon):
        return (self.bounds['south'] <= lat <= self.bounds['north'] and
                self.bounds['west'] <= lon <= self.bounds['east'])

    def _bbox_overlaps(self, geom):
        """True if the geometry's bbox overlaps the tile bounds (a line/area can
        cross a tile without any node inside it)."""
        minx, miny, maxx, maxy = geom.bounds
        b = self.bounds
        return (minx <= b['east'] and maxx >= b['west'] and
                miny <= b['north'] and maxy >= b['south'])

    def _collect(self, geom, tags, osm_id, geometry_kind):
        result = self.taxonomy.classify_all(tags, geometry_kind)
        if result:
            self.features.append({
                'geometry': geom,
                'properties': {**tags, 'osm_id': osm_id},
                'classification': result,
            })

    # -- handlers: points, lines, areas -----------------------------------
    def node(self, n):
        if not self.is_in_bounds(n.location.lat, n.location.lon):
            return
        tags = {t.k: t.v for t in n.tags}
        if not tags:
            return
        self._collect(Point(n.location.lon, n.location.lat), tags, n.id, 'node')

    def way(self, w):
        # Linear features only — closed area-ways are assembled into areas and
        # handled by area() below, so they are not double-collected here.
        if len(w.nodes) < 2:
            return
        tags = {t.k: t.v for t in w.tags}
        if not tags:
            return
        try:
            line = loads(self.wkb.create_linestring(w), hex=True)
        except Exception:
            return
        if not self._bbox_overlaps(line):
            return
        self._collect(line, tags, w.id, 'way')

    def area(self, a):
        tags = {t.k: t.v for t in a.tags}
        if not tags:
            return
        try:
            poly = loads(self.wkb.create_multipolygon(a), hex=True)
        except Exception:
            return
        if not self._bbox_overlaps(poly):
            return
        self._collect(poly, tags, a.id, 'area')
