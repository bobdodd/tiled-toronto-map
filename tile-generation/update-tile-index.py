#!/usr/bin/env python3
"""
Update tile-index.json to include all generated tiles
"""

import json
import os
from pathlib import Path
import gzip

def update_tile_index():
    tiles_dir = Path("toronto-svg-tiles/tiles")
    index_file = Path("toronto-svg-tiles/tile-index.json")
    
    if not tiles_dir.exists():
        print(f"Error: {tiles_dir} directory not found!")
        return
    
    print("Scanning for SVG tiles...")
    
    tiles = []
    tile_files = list(tiles_dir.glob("*.svg.gz"))
    
    for tile_file in sorted(tile_files):
        # Extract coordinates from filename (e.g., "43.650_-79.380.svg.gz")
        filename = tile_file.stem.replace('.svg', '')  # Remove .svg.gz
        parts = filename.split('_')
        
        if len(parts) == 2:
            try:
                lat = float(parts[0])
                lng = float(parts[1])
                
                # Get file size
                file_size = tile_file.stat().st_size
                
                # Count features by reading the gzipped file
                feature_count = 0
                try:
                    with gzip.open(tile_file, 'rt', encoding='utf-8') as f:
                        content = f.read()
                        # Count various feature types
                        feature_count += content.count('<polygon')
                        feature_count += content.count('<polyline')
                        feature_count += content.count('<circle')
                        feature_count += content.count('<path')
                except Exception as e:
                    print(f"Warning: Could not read {tile_file.name}: {e}")
                
                tile_info = {
                    "id": filename,
                    "lat": lat,
                    "lng": lng,
                    "bounds": {
                        "north": lat + 0.01,
                        "south": lat,
                        "east": lng + 0.01,
                        "west": lng
                    },
                    "features": feature_count,
                    "size": file_size
                }
                
                tiles.append(tile_info)
                print(f"  Added {filename} ({feature_count} features, {file_size:,} bytes)")
                
            except ValueError:
                print(f"Warning: Skipping invalid filename: {filename}")
    
    # Create the index
    index = {
        "version": "1.0",
        "generated": str(Path.cwd() / tiles_dir),
        "tile_count": len(tiles),
        "bounds": {
            "north": max(t["lat"] for t in tiles) + 0.01 if tiles else 0,
            "south": min(t["lat"] for t in tiles) if tiles else 0,
            "east": max(t["lng"] for t in tiles) + 0.01 if tiles else 0,
            "west": min(t["lng"] for t in tiles) if tiles else 0
        },
        "tiles": tiles
    }
    
    # Write the index file
    print(f"\nWriting index with {len(tiles)} tiles to {index_file}")
    with open(index_file, 'w') as f:
        json.dump(index, f, indent=2)
    
    print(f"\n✅ Tile index updated successfully!")
    print(f"   Total tiles: {len(tiles)}")
    print(f"   Coverage: {index['bounds']['south']}° to {index['bounds']['north']}° N")
    print(f"            {index['bounds']['west']}° to {index['bounds']['east']}° E")
    
    # Also update the web app's local copy if it exists
    web_app_index = Path("../web-app/maps/tiles/tile-index.json")
    if web_app_index.parent.exists():
        print(f"\nUpdating web app's tile index...")
        web_app_index.parent.mkdir(exist_ok=True)
        with open(web_app_index, 'w') as f:
            json.dump(index, f, indent=2)
        print(f"✅ Updated {web_app_index}")

if __name__ == "__main__":
    update_tile_index()