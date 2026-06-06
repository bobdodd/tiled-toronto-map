#!/bin/bash

# Download YVR area OSM data
# This downloads British Columbia data and extracts the YVR area

echo "Downloading YVR area OSM data..."

DATA_DIR="toronto-svg-tiles/data"
BC_FILE="$DATA_DIR/british-columbia.osm.pbf"
YVR_FILE="$DATA_DIR/yvr-area.osm.pbf"

# YVR bounding box
NORTH="49.23"
SOUTH="49.17"
EAST="-123.15"
WEST="-123.21"
BBOX="$WEST,$SOUTH,$EAST,$NORTH"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Check if YVR data already exists
if [ -f "$YVR_FILE" ]; then
    echo "YVR data already exists at $YVR_FILE"
    echo "Delete it first if you want to re-download"
    echo ""
    echo "To force re-download:"
    echo "  rm $YVR_FILE"
    echo "  rm $DATA_DIR/yvr-area-cleaned.osm.pbf"
    echo "  rm $DATA_DIR/yvr-area-sorted.osm.pbf"
    echo "  ./download-yvr-data.sh"
    exit 0
fi

# Download BC data if not present
if [ ! -f "$BC_FILE" ]; then
    echo "Downloading British Columbia OSM data..."
    echo "This is about 200MB and may take a few minutes..."
    curl -L -o "$BC_FILE" "https://download.geofabrik.de/north-america/canada/british-columbia-latest.osm.pbf"
    
    if [ $? -ne 0 ]; then
        echo "Failed to download BC data"
        exit 1
    fi
else
    echo "Using existing BC data: $BC_FILE"
fi

# Extract YVR area with proper flags to ensure clean data
echo "Extracting YVR area from BC data..."
echo "Bounding box: North=$NORTH, South=$SOUTH, East=$EAST, West=$WEST"

# Use osmium extract with strategy=complete_ways to get clean boundaries
osmium extract -b "$BBOX" "$BC_FILE" -o "$YVR_FILE" --overwrite --strategy=complete_ways

if [ $? -eq 0 ]; then
    echo "Successfully extracted YVR area to $YVR_FILE"
    
    # Sort the file immediately to ensure it's clean
    echo "Sorting the extracted data..."
    TEMP_FILE="$DATA_DIR/yvr-area-temp.osm.pbf"
    osmium sort "$YVR_FILE" -o "$TEMP_FILE" --overwrite
    
    if [ $? -eq 0 ]; then
        mv "$TEMP_FILE" "$YVR_FILE"
        echo "Successfully sorted YVR data"
    else
        echo "Warning: Could not sort data, but extraction was successful"
        rm -f "$TEMP_FILE"
    fi
    
    echo ""
    echo "File size: $(ls -lh "$YVR_FILE" | awk '{print $5}')"
    echo ""
    echo "You can now run ./build-yvr-tiles.py to generate tiles"
else
    echo "Failed to extract YVR area"
    exit 1
fi