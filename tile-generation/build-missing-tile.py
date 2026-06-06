#!/usr/bin/env python3
"""
Build a specific missing tile
"""

import sys
import importlib.util

# Import the main tile builder
spec = importlib.util.spec_from_file_location("build_toronto_tiles", "build-toronto-tiles.py")
build_toronto_tiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_toronto_tiles)

class SingleTileBuilder(build_toronto_tiles.TorontoTileBuilder):
    def __init__(self, lat, lng):
        super().__init__()
        self.single_lat = lat
        self.single_lng = lng
        
        # Override bounds to just this tile
        self.gta_bounds = {
            'north': lat + 0.01,
            'south': lat,
            'east': lng + 0.01,
            'west': lng
        }
        
        print(f"Building single tile: {lat:.3f}_{lng:.3f}")

if __name__ == "__main__":
    # Build the missing tile at 43.630, -79.370
    builder = SingleTileBuilder(43.630, -79.370)
    
    print("=" * 60)
    print("Building Missing Tile")
    print("=" * 60)
    print()
    
    output_dir = builder.build_tiles()
    
    print(f"\nDone! Check if {output_dir}/tiles/43.630_-79.370.svg.gz was created")
    print("If the tile is empty, it may have been skipped because there are no features in that area.")