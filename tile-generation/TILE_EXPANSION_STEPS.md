# Expanding Tile Generation to 36 Tiles

## What's Changed

The tile generation has been expanded from 9 tiles (3x3 grid) to 36 tiles (6x6 grid) to provide a larger area for exploring different map features.

### Old Coverage (9 tiles)
- North: 43.66, South: 43.63
- East: -79.36, West: -79.39
- Area: ~3km x 3km

### New Coverage (36 tiles)
- North: 43.68, South: 43.62
- East: -79.34, West: -79.40
- Area: ~6.7km x 4.7km

## Steps to Generate and Deploy New Tiles

1. **Generate the new tiles**:
   ```bash
   cd /Users/bob3/Desktop/Maps/tile-generation
   python3 build-toronto-tiles.py
   ```
   This will:
   - Download Toronto OSM data (if not already present)
   - Generate 36 SVG tiles with all accessibility features
   - Create gzipped versions for efficient transfer
   - Generate a tile index JSON file

2. **Upload tiles to SiteGround**:
   ```bash
   ./upload-tiles.sh
   ```
   This will:
   - Connect to SiteGround via SSH
   - Upload all 36 tiles using rsync
   - Skip the large OSM data files

3. **Verify deployment**:
   - Check a sample tile: https://bobd76.sg-host.com/maps/tiles/tiles/43.650_-79.380.svg.gz
   - Check tile index: https://bobd76.sg-host.com/maps/tiles/tile-index.json

## What This Gives You

With 36 tiles covering a larger area, you'll be able to:
- Explore more diverse neighborhoods
- See different types of features (parks, shopping areas, residential, etc.)
- Test accessibility features across varied urban environments
- Navigate longer distances within the tile coverage
- Better test the avatar positioning and map navigation

## Notes

- Each tile is approximately 1km x 1km
- The center of the map (43.645, -79.375) remains the same
- The web app will automatically load tiles as needed when panning
- Tile generation may take 5-10 minutes depending on your system
- Upload may take a few minutes depending on connection speed