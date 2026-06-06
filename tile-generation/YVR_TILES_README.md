# YVR (Vancouver International Airport) Tile Generation

This document describes how to generate map tiles for Vancouver International Airport and the surrounding area.

## Overview

The YVR tile generation extends our existing tile system to cover Vancouver International Airport. It uses the same infrastructure as the Toronto tiles but with YVR-specific data.

## Coordinates

YVR is located at approximately:
- Latitude: 49.19°N
- Longitude: 123.18°W

The tile coverage area (6x6 grid):
- North: 49.23° (4 tiles north of YVR)
- South: 49.17° (2 tiles south of YVR)
- East: -123.15° (3 tiles east of YVR)
- West: -123.21° (3 tiles west of YVR)

This creates a ~6.6km x 4km area centered on the airport.

## Prerequisites

1. Ensure you have osmium-tool installed:
   ```bash
   brew install osmium-tool  # macOS
   # or
   apt-get install osmium-tool  # Linux
   ```

2. YVR OSM data file must exist at:
   ```
   toronto-svg-tiles/data/yvr-area.osm.pbf
   ```

## Usage

### 1. Download YVR OSM Data (if needed)

If the YVR data doesn't exist:

```bash
cd tile-generation
./download-yvr-data.sh
```

This will:
- Download the British Columbia OSM extract (~200MB)
- Extract just the YVR area
- Save it as `toronto-svg-tiles/data/yvr-area.osm.pbf`

### 2. Generate YVR Tiles

```bash
./build-yvr-tiles.py
```

This will:
- Load the YVR OSM data
- Generate 36 SVG tiles (6x6 grid)
- Process all OSM features (roads, buildings, water, etc.)
- Compress tiles with gzip
- Update the tile index

**Note:** Each tile takes several minutes to process, so the full generation may take 1-2 hours.

### 3. Upload YVR Tiles

To upload only the YVR tiles:

```bash
./upload-yvr-tiles.sh
```

Or to upload all tiles:

```bash
./upload-tiles.sh
```

## Features Included

The YVR tiles include all standard OSM features:
- **Airport Infrastructure**: Runways, taxiways, terminals, gates
- **Transportation**: Roads, highways, Canada Line stations
- **Water**: Fraser River, ocean
- **Buildings**: All mapped buildings in the area
- **Land Use**: Parks, industrial areas, residential
- **Amenities**: Shops, restaurants, parking

## File Structure

YVR tiles are integrated into the existing system:
```
toronto-svg-tiles/
├── data/
│   ├── toronto-area.osm.pbf
│   ├── toronto.osm.pbf
│   └── yvr-area.osm.pbf       # YVR OSM data
├── tiles/
│   ├── 43.xxx_-79.xxx.svg.gz  # Toronto tiles
│   └── 49.xxx_-123.xxx.svg.gz # YVR tiles
└── tile-index.json             # Combined index
```

## Tile Naming

YVR tiles follow the same naming convention:
- Format: `{latitude}_{longitude}.svg.gz`
- Example: `49.190_-123.180.svg.gz`

YVR tiles can be identified by:
- Latitude starting with `49.1` or `49.2`
- Longitude starting with `-123.1` or `-123.2`

## Integration

The YVR tiles work seamlessly with the existing system:
- Same tile size (0.01° x 0.01°, ~1km x 1km)
- Same SVG format and styling
- Same compression (gzip)
- Shared tile index
- Compatible with the web app

## Troubleshooting

If tile generation fails:
1. Check that `yvr-area.osm.pbf` exists
2. Ensure osmium-tool is installed
3. Check available disk space (need ~1GB free)
4. Look for error messages in the output

If tiles appear empty:
- The YVR area might have less mapped data than Toronto
- Check the OSM file isn't corrupted
- Try re-downloading the data

## Future Enhancements

Possible improvements:
- Add more tiles north to include more of Richmond
- Add tiles west to include UBC
- Special rendering for airport features
- Real-time flight data integration