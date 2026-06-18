#!/usr/bin/env python3
"""
Taxonomy engine — the thin interpreter for taxonomy.json.

Given a feature's OSM tags and geometry, returns the matching taxonomy entry
(category, subtype, svg class, label, ui group, status) by evaluating the
manifest's declarative `match` rules in order. This is what the tile generator
classifies through, replacing hard-coded per-category matching.

Run directly to execute the self-test:  python taxonomy_engine.py
"""

import re
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TAXONOMY_FILE = PROJECT_ROOT / "taxonomy.json"

_NUM_RE = re.compile(r"\s*(-?\d+(?:\.\d+)?)")


def _num(value):
    """Leading number from values like '8%', '0.9', '3 cm' -> float, else None."""
    m = _NUM_RE.match(str(value))
    return float(m.group(1)) if m else None


def _condition_ok(tags, key, cond):
    present = key in tags
    val = tags.get(key)

    if cond is True:                     # presence: key exists, any value
        return present
    if isinstance(cond, str):            # equality
        return val == cond
    if isinstance(cond, list):           # value in set
        return val in cond
    if isinstance(cond, dict):           # numeric thresholds / negation
        if not present:
            return False
        for op, operand in cond.items():
            if op == "not":
                if val == operand:
                    return False
                continue
            n = _num(val)
            if n is None:
                return False
            if op == ">" and not (n > operand):
                return False
            if op == ">=" and not (n >= operand):
                return False
            if op == "<" and not (n < operand):
                return False
            if op == "<=" and not (n <= operand):
                return False
        return True
    return False


def _rule_ok(tags, rule):
    """A rule object = AND of its conditions."""
    return all(_condition_ok(tags, k, c) for k, c in rule.items())


def _match_ok(tags, match):
    """match = object (AND) or array of objects (OR)."""
    if isinstance(match, list):
        return any(_rule_ok(tags, r) for r in match)
    return _rule_ok(tags, match)


class Taxonomy:
    def __init__(self, data):
        self.categories = data.get("categories", {})
        self.features = data.get("features", [])

    @classmethod
    def load(cls, path=TAXONOMY_FILE):
        return cls(json.loads(Path(path).read_text()))

    def _subtype(self, feature, tags):
        if "subtype" in feature:
            return feature["subtype"]
        if "subtypeFrom" in feature:
            return tags.get(feature["subtypeFrom"])
        return feature["id"]

    def _enrich(self, feature, tags):
        category = feature["category"]
        subtype = self._subtype(feature, tags)
        svg_class = f"{category} {category}-{subtype}" if subtype else category
        return {
            "id": feature["id"],
            "category": category,
            "subtype": subtype,
            "svgClass": svg_class,
            "layer": self.categories.get(category, {}).get("layer", "base"),
            "label": feature.get("label"),
            "ui": feature.get("ui", {}),
            "status": feature.get("status"),
        }

    def classify(self, tags, geometry):
        """First matching feature (enriched), or None — single-class convenience.

        geometry is one of 'node' | 'way' | 'area'.
        """
        for feature in self.features:
            if geometry not in feature.get("geometry", ["node", "way", "area"]):
                continue
            if _match_ok(tags, feature["match"]):
                return self._enrich(feature, tags)
        return None

    def classify_all(self, tags, geometry):
        """All matches, split for the multi-aspect layering model:

          base     — the first 'base'-layer match; renders the feature's geometry.
          overlays — every 'poi'/'accessibility' match; carried as filterable
                     classes/data on the SAME element (nothing dropped).
          primary  — base, or the first overlay when there's no base (a POI node).

        Returns None if nothing matches.
        """
        base = None
        overlays = []
        for feature in self.features:
            if geometry not in feature.get("geometry", ["node", "way", "area"]):
                continue
            if not _match_ok(tags, feature["match"]):
                continue
            entry = self._enrich(feature, tags)
            if entry["layer"] == "base":
                if base is None:
                    base = entry
            else:
                overlays.append(entry)
        if base is None and not overlays:
            return None
        return {"base": base, "overlays": overlays, "primary": base or overlays[0]}


# A fixed fixture so the self-test exercises the ENGINE, independent of the
# live taxonomy.json content (which evolves).
_FIXTURE = {"features": [
    {"id": "accessible-parking", "category": "accessibility",
     "match": {"amenity": "parking", "wheelchair": "yes"}, "subtype": "parking",
     "geometry": ["node", "area"]},
    {"id": "parking", "category": "parking",
     "match": {"amenity": ["parking", "bicycle_parking", "motorcycle_parking"]},
     "subtypeFrom": "amenity", "geometry": ["node", "area"]},
    {"id": "restaurant", "category": "amenity", "match": {"amenity": "restaurant"},
     "subtypeFrom": "amenity", "geometry": ["node", "area"]},
    {"id": "bank", "category": "amenity", "match": {"amenity": "bank"},
     "subtypeFrom": "amenity", "geometry": ["node", "area"]},
    {"id": "museum", "category": "tourism", "match": {"tourism": "museum"},
     "subtypeFrom": "tourism", "geometry": ["node", "area"]},
    {"id": "building", "category": "building", "match": {"building": True},
     "subtypeFrom": "building", "geometry": ["area"]},
    {"id": "road", "category": "road",
     "match": {"highway": ["motorway", "trunk", "primary", "secondary", "tertiary",
                            "residential", "service", "footway", "cycleway", "path", "steps"]},
     "subtypeFrom": "highway", "geometry": ["way"]},
    {"id": "steep-incline", "category": "facility", "match": {"incline": {">": 8}},
     "subtype": "steep_incline", "geometry": ["node", "way"]},
    {"id": "gentle-incline", "category": "facility", "match": {"incline": {"<=": 5}},
     "subtype": "gentle_incline", "geometry": ["node", "way"]},
    {"id": "tactile-paving", "category": "sensory", "match": {"tactile_paving": "yes"},
     "subtype": "tactile_paving", "geometry": ["node", "way"]},
]}


def _self_test():
    tax = Taxonomy(_FIXTURE)
    cases = [
        # tags, geometry, expected svgClass (or None)
        ({"amenity": "restaurant"}, "node", "amenity amenity-restaurant"),
        ({"amenity": "bank"}, "node", "amenity amenity-bank"),                 # planned, still classifies
        ({"tourism": "museum"}, "node", "tourism tourism-museum"),            # new category
        ({"building": "house"}, "area", "building building-house"),           # presence + subtypeFrom
        ({"building": "yes"}, "area", "building building-yes"),
        ({"highway": "footway"}, "way", "road road-footway"),                 # value set
        ({"highway": "motorway"}, "way", "road road-motorway"),
        ({"amenity": "parking", "wheelchair": "yes"}, "node",
            "accessibility accessibility-parking"),                            # compound AND, priority
        ({"amenity": "parking"}, "node", "parking parking-parking"),          # falls through to generic parking
        ({"amenity": "bicycle_parking"}, "node", "parking parking-bicycle_parking"),
        ({"incline": "8.5%"}, "way", "facility facility-steep_incline"),      # threshold > with unit
        ({"incline": "3%"}, "way", "facility facility-gentle_incline"),       # threshold <=
        ({"tactile_paving": "yes"}, "node", "sensory sensory-tactile_paving"),
        ({"shop": "bakery"}, "node", None),                                    # not in slice -> no match
        ({"building": "house"}, "node", None),                                # building is area-only
    ]
    passed = 0
    for tags, geom, expected in cases:
        result = tax.classify(tags, geom)
        got = result["svgClass"] if result else None
        ok = got == expected
        passed += ok
        flag = "ok  " if ok else "FAIL"
        print(f"  [{flag}] {geom:4} {tags}  ->  {got}")
        if not ok:
            print(f"         expected: {expected}")
    print(f"\n{passed}/{len(cases)} cases passed")
    return passed == len(cases)


if __name__ == "__main__":
    import sys
    sys.exit(0 if _self_test() else 1)
