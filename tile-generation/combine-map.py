#!/usr/bin/env python3
"""Combine several LOCATION tile sets into ONE map.

Each location is generated independently (build-tiles.py --region <id>) into its
own localDir, but they all land on the SAME global 0.01-degree grid (build-tiles
snaps the tiling origin to the grid), so they SNAP TOGETHER: one map can hold
Toronto, Trent Lakes and future places with empty cells between them.

This tool merges, PER BAND (root + lodNN), every location's tile-index into one
unified index — union of the `tiles` lists, union of `bounds`, a fresh content
`version`. The unified indexes are written to a staging dir; deploy then pushes
them to the shared served base alongside all locations' tile files. The viewer
loads the one index, requests only tiles that exist (existingTileIds), and leaves
the gaps blank.

The PUBLISHED index is SLIM: `tiles` is a bare array of filenames. The viewer
reads only the filename (its exists-set), `version`, and `regions`; per-entry
lat/lng/bounds are derivable from the filename + tile_size, and size_bytes is
read by nothing — at whole-city scale (21,760 entries per band) the fat entries
made the index the dominant first-load cost. The per-REGION indexes that feed
this tool stay fat (build-tiles.py unchanged): size_bytes still feeds the
content `version` hash here, and lat/lng/bounds remain available to any build
tooling. The viewer accepts both shapes.

To ADD a location: build it, append its dir to LOCATIONS, re-run, redeploy.

Usage: combine-map.py <out-dir> <location-dir> [<location-dir> ...]
       (first location is the PRIMARY — its index meta/tile_size is the template)
"""
import json, glob, os, sys, hashlib


def band_rel_paths(primary):
    """Relative tile-index.json paths for every band present in the primary."""
    rels = ["tile-index.json"]  # root band (z18 / 'full')
    for p in sorted(glob.glob(os.path.join(primary, "lod*", "tile-index.json"))):
        rels.append(os.path.relpath(p, primary))
    return rels


def merge_band(rel, locations):
    tiles = {}          # file -> entry (dedup by file; locations are disjoint)
    bounds = None
    for loc in locations:
        path = os.path.join(loc, rel)
        if not os.path.exists(path):
            continue
        idx = json.load(open(path))
        for t in idx.get("tiles", []):
            tiles[t["file"]] = t
        b = idx.get("bounds")
        if b:
            if bounds is None:
                bounds = dict(b)
            else:
                bounds["north"] = max(bounds["north"], b["north"])
                bounds["south"] = min(bounds["south"], b["south"])
                bounds["east"] = max(bounds["east"], b["east"])
                bounds["west"] = min(bounds["west"], b["west"])
    ordered = sorted(tiles.values(), key=lambda t: t["file"])
    # Version must change when tile CONTENT changes, not just the file set — the
    # viewer cache-busts tiles with ?v=<version>, so include each tile's byte size
    # (a re-render that adds/removes features changes the size).
    version = hashlib.sha1(
        (rel + "|" + "|".join(f"{t['file']}:{t.get('size_bytes', '')}" for t in ordered)).encode()
    ).hexdigest()[:12]
    return ordered, bounds, version


def collect_regions(locations):
    """Per-region coverage rectangles for the viewer's 'outside the mapped area' test.

    The merged `bounds` is one UNION rectangle spanning every region (Calgary to
    Niagara) — useless as a coverage test. Each region's own tile-index `bounds` is
    its real bbox, and because a build fills its whole bbox (no holes), point-in-this-
    rectangle is exactly 'a tile exists there'. Publishing the list lets the viewer
    test a location against the regions without any per-tile lookup or extra fetch.
    """
    regions = []
    for loc in locations:
        path = os.path.join(loc, "tile-index.json")  # root band carries the region bbox
        if not os.path.exists(path):
            continue
        b = (json.load(open(path)) or {}).get("bounds")
        if not b:
            continue
        regions.append({"bounds": {k: b[k] for k in ("north", "south", "east", "west")}})
    return regions


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: combine-map.py <out-dir> <location-dir> [<location-dir> ...]")
    out = sys.argv[1]
    locations = sys.argv[2:]
    primary = locations[0]
    regions = collect_regions(locations)
    print(f"primary: {primary}")
    print(f"locations: {len(locations)} -> {[os.path.basename(l) for l in locations]}")
    print(f"regions:   {len(regions)} coverage rectangles")
    for rel in band_rel_paths(primary):
        tiles, bounds, version = merge_band(rel, locations)
        meta = json.load(open(os.path.join(primary, rel)))  # template
        # Slim published form: filenames only. The version above was computed
        # from the fat entries (size_bytes included) BEFORE this discards them.
        meta["tiles"] = [t["file"] for t in tiles]
        meta["total_tiles"] = len(tiles)
        meta["bounds"] = bounds
        meta["version"] = version
        meta["regions"] = regions  # per-region coverage rectangles (same for every band)
        dest = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dest) or out, exist_ok=True)
        json.dump(meta, open(dest, "w"))
        band = os.path.dirname(rel) or "root"
        print(f"  {band:8} {len(tiles):5} tiles  ver {version}  bounds "
              f"N{bounds['north']:.3f} S{bounds['south']:.3f} "
              f"E{bounds['east']:.3f} W{bounds['west']:.3f}")


if __name__ == "__main__":
    main()
