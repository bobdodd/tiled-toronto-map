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
├── tile-generation/     # SVG tile generation pipeline
│   ├── build-toronto-tiles.py  # Main tile builder
│   ├── upload-tiles.sh         # Upload script for SiteGround
│   ├── setup-tile-builder.sh   # Environment setup
│   └── requirements.txt        # Python dependencies
├── toronto-svg-tiles/   # Generated SVG tiles (large - see .gitignore)
│   ├── tiles/          # Compressed SVG tile files
│   ├── styles/         # Shared CSS for tiles
│   └── tile-index.json # Tile metadata
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
cd tile-generation
pip install -r requirements.txt
python build-toronto-tiles.py
```

### Upload to SiteGround
```bash
cd tile-generation
./upload-tiles.sh
```

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