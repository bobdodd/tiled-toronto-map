# Accessible Maps with SVG Tiles

An accessible web mapping application using pre-rendered SVG tiles from OpenStreetMap data, optimized for screen readers and low-end devices.

## Project Structure

```
/
├── web-app/              # Web application
│   ├── src/             # JavaScript modules
│   ├── styles/          # CSS stylesheets  
│   ├── index.html       # Main application
│   └── server.py        # Development server
├── regions.json         # Source of truth for regions (bounds, paths, sources)
├── tile-generation/     # SVG tile generation pipeline
│   ├── build-tiles.py          # Per-region tile + search-index builder
│   ├── combine-map.py          # Merge regions into one combined tile index
│   ├── brotli-tiles.sh         # Brotli-compress tiles for serving
│   ├── setup-tile-builder.sh   # Environment setup
│   └── requirements.txt        # Python dependencies
├── tile-studio/         # Electron GUI to generate + publish a region
├── <region>-svg-tiles/  # Generated tiles per region (large - see .gitignore)
│   ├── tiles/, lod12…/  # Compressed SVG tiles, per LOD band
│   ├── search/          # map-features.ndjson for the OpenSearch index
│   └── tile-index.json  # Per-region tile metadata
├── docs/               # Documentation
├── archive/            # Old files and demos
└── tests/             # Test files
```

## Quick Start

### Web Application
```bash
cd web-app
python server.py
```

### Generate Tiles
```bash
./tile-generation/setup-tile-builder.sh                       # one-time env setup
./venv/bin/python tile-generation/build-tiles.py --region <id>
```
Regions (bounds, OSM source, output paths) are defined in `regions.json`.

### Deploy
Tiles are rsync'd into the shared base on the OVH VPS (served by Caddy) and the
region's features are upserted into OpenSearch. See
[`docs/TILE_GENERATION.md`](docs/TILE_GENERATION.md) for the full process.

## Architecture

This project uses a **pre-rendered SVG tile approach** instead of real-time API queries for:
- Better performance on low-end devices
- Improved accessibility with pre-built ARIA labels
- Reduced server dependency
- Faster filter operations using CSS

See `docs/SVG_TILE_ARCHITECTURE.md` for detailed technical information.

## Key Features

- ♿ Screen reader optimized
- 🚀 Fast performance on older devices  
- 🗺️ SVG-based rendering for crisp graphics
- 🎯 Advanced filtering system
- 📱 Mobile-friendly interface
- 🔌 Works offline after initial load