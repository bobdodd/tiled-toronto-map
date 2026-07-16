#!/usr/bin/env python3
"""Surgically merge ONE freshly rebuilt region into the LIVE combined tile
indexes — the scripted version of the 2026-07-14 Trent Lakes hand merge.

Why not combine-map.py: it merges from ALL regions' LOCAL tile trees, and the
other regions' trees are long since cleaned from disk (the .pbf is source of
truth). The live slim indexes ARE the current combined state, so the honest
merge is: fetch each band's live index, drop the entries that fall inside the
rebuilt region's bbox (filenames carry their grid coordinates), union in the
region's fresh tile list, recompute the version, and replace the region's
coverage rectangle. Every other region's entries pass through untouched.

Usage: merge-live-index.py <region-id> <region-localDir> <staging-dir>
       [--base https://tiles.a11ybob.com/toronto]

Writes <staging-dir>/<band>/tile-index.json for every band the REGION has.
Bands the region doesn't build are left alone (their live indexes stand).
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGIONS_FILE = os.path.join(PROJECT_ROOT, "regions.json")

FNAME = re.compile(r"^(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)\.svg(?:\.gz)?$")


def tile_origin(fname):
    m = FNAME.match(fname)
    return (float(m.group(1)), float(m.group(2))) if m else None


def inside(fname, b, tile_size):
    """Does this tile CELL belong to the region? The filename carries the
    cell's south-west origin; a region builds exactly the cells whose whole
    extent lies inside its bbox, so the same test (with a float-edge epsilon)
    identifies its entries in the combined index. Abutting regions stay
    disjoint: the cell starting ON a shared boundary belongs to the region
    east/north of it, matching how the builds bucket."""
    ll = tile_origin(fname)
    if ll is None:
        return False
    lat, lng = ll
    eps = tile_size * 0.01
    return (b["south"] - eps <= lat <= b["north"] - tile_size + eps
            and b["west"] - eps <= lng <= b["east"] - tile_size + eps)


def region_bounds(region_id):
    regs = json.load(open(REGIONS_FILE))["regions"]
    for r in regs:
        if r["id"] == region_id:
            return r["bounds"]
    sys.exit(f"region '{region_id}' not in regions.json")


def fetch_live(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("region_id")
    ap.add_argument("local_dir")
    ap.add_argument("staging_dir")
    ap.add_argument("--base", default="https://tiles.a11ybob.com/toronto")
    args = ap.parse_args()

    rb = region_bounds(args.region_id)

    # Bands the region built: the root plus each lodNN present locally.
    bands = ["."]
    for name in sorted(os.listdir(args.local_dir)):
        if re.match(r"^lod\d+$", name) and \
                os.path.exists(os.path.join(args.local_dir, name, "tile-index.json")):
            bands.append(name)

    for band in bands:
        local_path = os.path.join(args.local_dir, band, "tile-index.json") \
            if band != "." else os.path.join(args.local_dir, "tile-index.json")
        if not os.path.exists(local_path):
            continue
        fat = json.load(open(local_path))
        tile_size = fat.get("tile_size", 0.01)
        live_url = f"{args.base}/tile-index.json" if band == "." \
            else f"{args.base}/{band}/tile-index.json"
        live = fetch_live(live_url)   # abort loudly on failure — never clobber

        live_files = live.get("tiles", [])
        # The live index may be slim (bare filenames) or fat (dict entries).
        names = [t if isinstance(t, str) else t.get("file", "") for t in live_files]
        kept = [n for n in names if not inside(n, rb, tile_size)]
        fresh = sorted(t["file"] for t in fat.get("tiles", []))
        merged = sorted(set(kept) | set(fresh))

        # Version: must change when the region's CONTENT changes. The fresh
        # region entries still carry size_bytes; the untouched remainder is
        # pinned by the previous live version.
        version = hashlib.sha1((
            band + "|" + (live.get("version") or "") + "|" +
            "|".join(f"{t['file']}:{t.get('size_bytes', '')}" for t in fat.get("tiles", []))
            + "|" + str(len(merged))
        ).encode()).hexdigest()[:12]

        # Coverage rectangles: replace the entry that exactly matches the
        # region's bbox (it was built from the same regions.json values);
        # append if this region is new to the map.
        regions = live.get("regions") or []
        replaced = False
        for entry in regions:
            if entry.get("bounds") == rb:
                replaced = True
                break
        if not replaced:
            regions.append({"bounds": rb})

        out = {
            "bounds": {
                "north": max(live["bounds"]["north"], rb["north"]),
                "south": min(live["bounds"]["south"], rb["south"]),
                "east": max(live["bounds"]["east"], rb["east"]),
                "west": min(live["bounds"]["west"], rb["west"]),
            },
            "tile_size": live.get("tile_size", tile_size),
            "svg_size": live.get("svg_size", fat.get("svg_size", 1000)),
            "total_tiles": len(merged),
            "tiles": merged,
            "version": version,
            "regions": regions,
        }
        out_dir = os.path.join(args.staging_dir, band) if band != "." else args.staging_dir
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "tile-index.json"), "w") as fh:
            json.dump(out, fh, separators=(",", ":"))
        print(f"  band {band}: live {len(names)} -> kept {len(kept)} + fresh {len(fresh)} "
              f"= {len(merged)}  (v {version})", flush=True)


if __name__ == "__main__":
    main()
