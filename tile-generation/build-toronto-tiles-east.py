#!/usr/bin/env python3
"""
Build Toronto SVG tiles - Eastern Extension
Extends the tile grid 8 tiles east of the main coverage area
"""

import os
import sys

# Import the main tile builder
# Since the filename has hyphens, we need to import it differently
import importlib.util
spec = importlib.util.spec_from_file_location("build_toronto_tiles", "build-toronto-tiles.py")
build_toronto_tiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_toronto_tiles)
TorontoTileBuilder = build_toronto_tiles.TorontoTileBuilder

class TorontoTileBuilderEast(TorontoTileBuilder):
    def __init__(self):
        super().__init__()
        
        # Override the bounds to cover area east of main tiles
        # Main tiles go from -79.40 to -79.34
        # This extends from -79.34 to -79.26 (8 tiles east)
        self.gta_bounds = {
            'north': 43.69,  # Same northern boundary
            'south': 43.63,  # Same southern boundary  
            'east': -79.26,  # 8 tiles east of -79.34
            'west': -79.34   # Start where main tiles end
        }
        
        print("Eastern Extension Tile Builder")
        print(f"Coverage: {self.gta_bounds['south']}° to {self.gta_bounds['north']}° N")
        print(f"         {self.gta_bounds['west']}° to {self.gta_bounds['east']}° E")
        print(f"This will generate approximately 48 additional tiles (8x6 grid)")
        print()

if __name__ == "__main__":
    print("=" * 60)
    print("Building Eastern Extension Tiles for Toronto")
    print("=" * 60)
    print()
    
    builder = TorontoTileBuilderEast()
    output_dir = builder.build_tiles()
    
    print(f"\nNext steps:")
    print(f"1. Upload {output_dir} to your SiteGround hosting")
    print(f"2. These tiles extend the map coverage eastward")
    print(f"3. Total coverage with both scripts: ~10.5km x 4.7km")