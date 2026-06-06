#!/usr/bin/env python3
"""Show which tiles will be generated with the new bounds"""

# New bounds from build-toronto-tiles.py (shifted north to avoid lake)
gta_bounds = {
    'north': 43.69,  # 4 tiles north of 43.65
    'south': 43.63,  # 2 tiles south of 43.65
    'east': -79.34,  # 4 tiles east of -79.38
    'west': -79.40   # 2 tiles west of -79.38
}

tile_size = 0.01

print("New tile generation will create tiles for:")
print(f"Bounds: North={gta_bounds['north']}, South={gta_bounds['south']}, East={gta_bounds['east']}, West={gta_bounds['west']}")
print(f"Tile size: {tile_size} degrees (~1km)")
print()

tiles = []
lat = gta_bounds['south']
while lat < gta_bounds['north']:
    lng = gta_bounds['west']
    while lng < gta_bounds['east']:
        tile_name = f"{lat:.3f}_{lng:.3f}"
        tiles.append(tile_name)
        lng = round(lng + tile_size, 3)
    lat = round(lat + tile_size, 3)

print(f"Total tiles to generate: {len(tiles)}")
print()
print("Tile list:")
for i, tile in enumerate(tiles):
    print(f"{i+1:2d}. {tile}")

# Show area coverage
lat_range = gta_bounds['north'] - gta_bounds['south']
lng_range = gta_bounds['east'] - gta_bounds['west']
print()
print(f"Area coverage: {lat_range:.2f}° x {lng_range:.2f}° = approximately {lat_range*111:.1f}km x {lng_range*111*0.7:.1f}km")