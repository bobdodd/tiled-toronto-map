#!/usr/bin/env python3
"""
Build YVR (Vancouver International Airport) SVG tiles
Extends the tile system to cover YVR and surrounding area
"""

import os
import sys

# Import the main tile builder
import importlib.util
spec = importlib.util.spec_from_file_location("build_toronto_tiles", "build-toronto-tiles.py")
build_toronto_tiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_toronto_tiles)
TorontoTileBuilder = build_toronto_tiles.TorontoTileBuilder

class YVRTileBuilder(TorontoTileBuilder):
    def __init__(self):
        super().__init__()
        
        # Override the bounds to cover YVR area
        # YVR is at approximately 49.19°N, 123.18°W
        # Creating a 6x6 grid centered on the airport
        self.gta_bounds = {
            'north': 49.23,   # 4 tiles north of YVR
            'south': 49.17,   # 2 tiles south of YVR  
            'east': -123.15,  # 3 tiles east of YVR
            'west': -123.21   # 3 tiles west of YVR (includes Sea Island)
        }
        
        # Override the OSM file to use YVR data
        self.osm_file = self.data_dir / "yvr-area.osm.pbf"
        
        print("YVR (Vancouver International Airport) Tile Builder")
        print(f"Coverage: {self.gta_bounds['south']}° to {self.gta_bounds['north']}° N")
        print(f"         {self.gta_bounds['west']}° to {self.gta_bounds['east']}° E")
        print(f"This will generate approximately 36 tiles (6x6 grid)")
        print(f"Using OSM data: {self.osm_file}")
        print()
        
    def download_osm_data(self):
        """Check if YVR OSM data exists"""
        if self.osm_file.exists():
            print(f"Using existing OSM data: {self.osm_file}")
            return True
        else:
            print(f"Error: YVR OSM data not found at {self.osm_file}")
            print("Please download YVR area data first.")
            print("\nTo download YVR data:")
            print("1. Go to https://www.openstreetmap.org/export")
            print("2. Navigate to YVR area")
            print("3. Select the bounding box:")
            print(f"   North: {self.gta_bounds['north']}")
            print(f"   South: {self.gta_bounds['south']}")
            print(f"   East: {self.gta_bounds['east']}")
            print(f"   West: {self.gta_bounds['west']}")
            print("4. Download via Overpass API or Geofabrik")
            print(f"5. Save as: {self.osm_file}")
            return False
    
    def download_toronto_data(self):
        """Override to use YVR data instead of Toronto data"""
        print("Checking for YVR OSM data...")
        if self.osm_file.exists():
            print(f"Using existing {self.osm_file}")
            return self.osm_file
        else:
            raise FileNotFoundError(f"YVR OSM data not found at {self.osm_file}")
    
    def extract_toronto_area(self, osm_file):
        """Override to skip extraction - we already have YVR area data"""
        print("Using YVR area data...")
        return osm_file
    
    def clean_osm_file(self, input_file):
        """Clean and sort OSM file to fix duplicate IDs and out-of-order issues"""
        import subprocess
        from pathlib import Path
        
        cleaned_file = self.data_dir / "yvr-area-cleaned.osm.pbf"
        
        # Check if cleaned file already exists and is newer than input
        if cleaned_file.exists() and cleaned_file.stat().st_mtime > input_file.stat().st_mtime:
            print("Using existing cleaned YVR data...")
            return cleaned_file
            
        print("Cleaning YVR OSM data (removing duplicates and sorting)...")
        
        try:
            # First, use osmium cat to remove duplicates and create a clean file
            # The --overwrite flag ensures we only keep the latest version of each object
            temp_file = self.data_dir / "yvr-area-temp.osm.pbf"
            
            # Step 1: Remove duplicates
            cmd1 = ['osmium', 'cat', str(input_file), '-o', str(temp_file), '--overwrite']
            result1 = subprocess.run(cmd1, capture_output=True, text=True)
            
            if result1.returncode != 0:
                print(f"Warning: Could not remove duplicates: {result1.stderr}")
                temp_file = input_file
            else:
                print("Removed duplicate objects...")
            
            # Step 2: Sort the file
            cmd2 = ['osmium', 'sort', str(temp_file), '-o', str(cleaned_file)]
            result2 = subprocess.run(cmd2, capture_output=True, text=True)
            
            # Clean up temp file
            if temp_file != input_file and temp_file.exists():
                temp_file.unlink()
            
            if result2.returncode != 0:
                print(f"Error sorting file: {result2.stderr}")
                print("Trying to use original file anyway...")
                return input_file
            
            print("Successfully cleaned and sorted YVR data")
            return cleaned_file
            
        except FileNotFoundError:
            print("Warning: osmium-tool not found. Install with: brew install osmium-tool")
            print("Attempting to use original file...")
            return input_file
    
    def build_tiles(self):
        """Override to show YVR-specific messages"""
        print("Starting YVR SVG tile generation...")
        
        # Step 1: Check data exists
        osm_file = self.download_toronto_data()
        
        # Step 2: Clean the file (remove duplicates and sort)
        cleaned_file = self.clean_osm_file(osm_file)
        
        # Step 3: Use YVR area data directly (no extraction needed)
        yvr_file = self.extract_toronto_area(cleaned_file)
        
        # Step 4: Process into tiles
        tile_count = self.process_osm_data(yvr_file)
        
        # Step 5: Create index
        index = self.create_tile_index()
        
        # Step 6: Generate CSS
        self.generate_sample_css()
        
        print(f"\n✅ Build complete!")
        print(f"Generated {tile_count} SVG tiles for YVR area")
        print(f"Total size: {sum(f.stat().st_size for f in self.tiles_dir.glob('*.svg.gz')) / 1024 / 1024:.1f} MB")
        print(f"Output directory: {self.output_dir}")
        
        return self.output_dir

if __name__ == "__main__":
    print("=" * 60)
    print("Building YVR Area Tiles")
    print("=" * 60)
    print()
    
    builder = YVRTileBuilder()
    
    # Check if OSM data exists
    if not builder.download_osm_data():
        print("\nExiting - please download OSM data first")
        sys.exit(1)
    
    # Build the tiles
    output_dir = builder.build_tiles()
    
    print(f"\nCompleted!")
    print(f"YVR tiles have been added to: {output_dir}")
    print(f"\nNext steps:")
    print(f"1. Run ./upload-yvr-tiles.sh to upload only YVR tiles")
    print(f"2. Or run ./upload-tiles.sh to upload all tiles")
    print(f"3. YVR area includes the airport, Sea Island, and parts of Richmond")