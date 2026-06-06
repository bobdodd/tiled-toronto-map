#!/usr/bin/env python3
"""
Display YVR tiles on a map for visualization
"""

import json
import webbrowser
from pathlib import Path
import folium

def show_yvr_tiles():
    """Display YVR tiles on an interactive map"""
    
    # Load tile index
    tile_index_path = Path("toronto-svg-tiles/tile-index.json")
    
    if not tile_index_path.exists():
        print("No tile index found. Run build-yvr-tiles.py first.")
        return
    
    with open(tile_index_path, 'r') as f:
        tile_index = json.load(f)
    
    # Filter for YVR tiles (latitude 49.x)
    yvr_tiles = [
        tile for tile in tile_index['tiles'] 
        if 49.1 <= tile['lat'] <= 49.3
    ]
    
    if not yvr_tiles:
        print("No YVR tiles found in index.")
        return
    
    print(f"Found {len(yvr_tiles)} YVR tiles")
    
    # Create map centered on YVR
    yvr_center = [49.19, -123.18]
    m = folium.Map(location=yvr_center, zoom_start=13)
    
    # Add YVR marker
    folium.Marker(
        yvr_center,
        popup="Vancouver International Airport (YVR)",
        tooltip="YVR",
        icon=folium.Icon(color='red', icon='plane', prefix='fa')
    ).add_to(m)
    
    # Add tile rectangles
    for tile in yvr_tiles:
        bounds = tile['bounds']
        rect_bounds = [
            [bounds['south'], bounds['west']],
            [bounds['north'], bounds['east']]
        ]
        
        # Color based on whether file exists
        tile_path = Path(f"toronto-svg-tiles/tiles/{tile['file']}")
        color = 'green' if tile_path.exists() else 'red'
        
        folium.Rectangle(
            bounds=rect_bounds,
            color=color,
            weight=2,
            fill=True,
            fillColor=color,
            fillOpacity=0.2,
            popup=f"Tile: {tile['file']}<br>Lat: {tile['lat']}<br>Lng: {tile['lng']}",
            tooltip=f"{tile['lat']:.2f}, {tile['lng']:.2f}"
        ).add_to(m)
    
    # Add legend
    legend_html = '''
    <div style="position: fixed; 
                top: 10px; right: 10px; width: 200px; height: 90px; 
                background-color: white; z-index: 1000; 
                border:2px solid grey; border-radius: 5px; padding: 10px">
        <p style="margin: 0;"><b>YVR Tile Coverage</b></p>
        <p style="margin: 5px 0;"><span style="color: green;">■</span> Generated tile</p>
        <p style="margin: 5px 0;"><span style="color: red;">■</span> Missing tile</p>
    </div>
    '''
    m.get_root().html.add_child(folium.Element(legend_html))
    
    # Save and open map
    output_file = "yvr_tiles_map.html"
    m.save(output_file)
    print(f"Map saved to {output_file}")
    
    # Open in browser
    webbrowser.open(f"file://{Path(output_file).absolute()}")
    
    # Print statistics
    print("\nYVR Tile Statistics:")
    print(f"Total tiles: {len(yvr_tiles)}")
    existing = sum(1 for t in yvr_tiles if Path(f"toronto-svg-tiles/tiles/{t['file']}").exists())
    print(f"Generated: {existing}")
    print(f"Missing: {len(yvr_tiles) - existing}")
    
    # Print bounds
    if yvr_tiles:
        north = max(t['bounds']['north'] for t in yvr_tiles)
        south = min(t['bounds']['south'] for t in yvr_tiles)
        east = max(t['bounds']['east'] for t in yvr_tiles)
        west = min(t['bounds']['west'] for t in yvr_tiles)
        print(f"\nYVR Coverage:")
        print(f"North: {north}")
        print(f"South: {south}")
        print(f"East: {east}")
        print(f"West: {west}")
        print(f"Area: ~{(north-south)*111:.1f} km x {(east-west)*111*0.6:.1f} km")

if __name__ == "__main__":
    # Try to import folium
    try:
        import folium
    except ImportError:
        print("Installing folium for map visualization...")
        import os
        os.system("pip install folium")
        import folium
    
    show_yvr_tiles()