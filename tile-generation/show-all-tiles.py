#!/usr/bin/env python3
"""Show complete tile coverage from both build scripts"""

# Main tile bounds (shifted north)
main_bounds = {
    'north': 43.69,
    'south': 43.63,
    'east': -79.34,
    'west': -79.40
}

# Eastern extension bounds
east_bounds = {
    'north': 43.69,
    'south': 43.63,
    'east': -79.26,
    'west': -79.34
}

tile_size = 0.01

print("Complete Tile Coverage (Main + Eastern Extension)")
print("=" * 60)

# Calculate main tiles
main_tiles = []
lat = main_bounds['south']
while lat < main_bounds['north']:
    lng = main_bounds['west']
    while lng < main_bounds['east']:
        main_tiles.append(f"{lat:.3f}_{lng:.3f}")
        lng = round(lng + tile_size, 3)
    lat = round(lat + tile_size, 3)

# Calculate eastern tiles
east_tiles = []
lat = east_bounds['south']
while lat < east_bounds['north']:
    lng = east_bounds['west']
    while lng < east_bounds['east']:
        east_tiles.append(f"{lat:.3f}_{lng:.3f}")
        lng = round(lng + tile_size, 3)
    lat = round(lat + tile_size, 3)

print(f"\nMain tiles (build-toronto-tiles.py):")
print(f"  Coverage: {main_bounds['south']}° to {main_bounds['north']}° N, "
      f"{main_bounds['west']}° to {main_bounds['east']}° E")
print(f"  Tiles: {len(main_tiles)} tiles")
print(f"  Area: ~{(main_bounds['north']-main_bounds['south'])*111:.1f}km x "
      f"{(main_bounds['east']-main_bounds['west'])*111*0.7:.1f}km")

print(f"\nEastern extension (build-toronto-tiles-east.py):")
print(f"  Coverage: {east_bounds['south']}° to {east_bounds['north']}° N, "
      f"{east_bounds['west']}° to {east_bounds['east']}° E")
print(f"  Tiles: {len(east_tiles)} tiles")
print(f"  Area: ~{(east_bounds['north']-east_bounds['south'])*111:.1f}km x "
      f"{(east_bounds['east']-east_bounds['west'])*111*0.7:.1f}km")

print(f"\nTotal coverage:")
print(f"  Total tiles: {len(main_tiles) + len(east_tiles)} tiles")
print(f"  Total area: ~{(main_bounds['north']-main_bounds['south'])*111:.1f}km x "
      f"{(east_bounds['east']-main_bounds['west'])*111*0.7:.1f}km")

# Show some interesting tiles from the eastern extension
print(f"\nSample tiles from eastern extension:")
for i, tile in enumerate(east_tiles[:10]):
    print(f"  {i+1}. {tile}")
if len(east_tiles) > 10:
    print(f"  ... and {len(east_tiles)-10} more")

# Create a visual ASCII map
print("\nVisual representation of tile coverage:")
print("  W <- - - - - - - - - - - - - - -> E")
print("  -79.40    -79.37    -79.34    -79.31    -79.28    -79.26")
print("N +-----------------------------------------------+")
print("  |         MAIN        |    EASTERN EXTENSION    | 43.69")
print("  |      (6x6 grid)     |       (8x6 grid)        |")
print("  |    ~42 tiles        |      ~48 tiles          |")
print("  |                     |                         |")
print("S +-----------------------------------------------+ 43.63")
print("           Total: ~14km east-west coverage")