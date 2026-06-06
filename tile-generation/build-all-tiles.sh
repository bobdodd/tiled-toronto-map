#!/bin/bash

echo "Building Complete Toronto Tile Set"
echo "=================================="
echo

# Check if OSM data exists
if [ ! -f "toronto-svg-tiles/data/toronto.osm.pbf" ]; then
    echo "Note: OSM data will be downloaded on first run"
    echo
fi

# Build main tiles
echo "Step 1: Building main tile grid (6x6, ~42 tiles)..."
echo "----------------------------------------------------"
python3 build-toronto-tiles.py

if [ $? -ne 0 ]; then
    echo "Error building main tiles!"
    exit 1
fi

echo
echo "Step 2: Building eastern extension (8x6, ~48 tiles)..."
echo "-------------------------------------------------------"
python3 build-toronto-tiles-east.py

if [ $? -ne 0 ]; then
    echo "Error building eastern extension tiles!"
    exit 1
fi

echo
echo "=========================================="
echo "✅ Complete tile set built successfully!"
echo "=========================================="
echo

# Count total tiles
TILE_COUNT=$(ls toronto-svg-tiles/tiles/*.svg.gz 2>/dev/null | wc -l)
echo "Total tiles generated: $TILE_COUNT"
echo

echo "Next steps:"
echo "1. Run ./upload-tiles.sh to upload all tiles to SiteGround"
echo "2. The web app will automatically use tiles as you pan east"
echo "3. Total coverage area: ~6.7km N-S x ~10.9km E-W"