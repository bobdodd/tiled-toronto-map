# SVG Tile Architecture Plan

## Overview
Transition from real-time OSM API queries to pre-rendered SVG tiles for better performance on low-end devices and reduced server dependency.

## Current Issues with API Approach
- Slow response times from public Overpass API
- Complex queries causing timeouts
- Poor performance on older devices
- Network dependency for every pan/zoom
- Rate limiting issues

## New SVG Tile Solution

### Architecture
```
OSM Data → Processing Pipeline → SVG Tiles → Shared Base on OVH VPS (Caddy) → Web App
```

### Key Benefits
1. **Performance**: No JSON parsing, coordinate conversion, or rendering calculations
2. **Accessibility**: ARIA labels and tabindex pre-built into SVG
3. **Compression**: SVG compresses better than GeoJSON (~50% smaller)
4. **Offline-ready**: Static files can be cached
5. **Low-end device friendly**: Minimal JavaScript processing needed

### File Structure
```
/toronto-svg-tiles/
  /tiles/
    43.650_-79.380.svg.gz  # Individual geographic tiles
    43.651_-79.380.svg.gz
    43.650_-79.381.svg.gz
  /styles/
    map-styles.css         # Shared styling for all tiles
  /metadata/
    tile-index.json        # Tile availability and bounds
    feature-counts.json    # Feature statistics per tile
```

### SVG Tile Format
```xml
<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
  <g id="buildings" class="layer">
    <polygon class="building residential" 
             points="234,567 245,567 245,589 234,589"
             tabindex="-1" 
             role="img" 
             aria-label="Residential building, 3 floors"
             data-feature-id="way-123456"/>
  </g>
  
  <g id="roads" class="layer">
    <polyline class="road primary" 
              points="0,500 1000,500"
              tabindex="-1"
              role="img" 
              aria-label="Queen Street West, primary road"
              data-feature-id="way-789012"/>
  </g>
  
  <g id="accessibility" class="layer">
    <circle class="accessible-parking" 
            cx="300" cy="400" r="5"
            tabindex="-1" 
            role="img" 
            aria-label="Accessible parking space"
            data-feature-id="node-345678"/>
  </g>
</svg>
```

### Storage Requirements
- **Greater Toronto Area**: ~150-200MB compressed SVG tiles
- **Individual tile**: ~500KB-2MB compressed
- **Total tiles needed**: ~100-200 tiles for full coverage

### Client Implementation
```javascript
class SVGTileManager {
  async loadTile(lat, lng) {
    const tileId = this.coordsToTileId(lat, lng);
    const response = await fetch(`/tiles/${tileId}.svg.gz`);
    const svgText = await response.text();
    return this.insertTileIntoDOM(svgText, lat, lng);
  }
  
  applyFilters(activeFilters) {
    // Pure CSS - extremely fast
    Object.keys(this.filters).forEach(filterType => {
      const elements = document.querySelectorAll(`.${filterType}`);
      elements.forEach(el => {
        el.style.display = activeFilters[filterType] ? 'block' : 'none';
      });
    });
  }
}
```

## Implementation Plan

### Phase 1: Data Processing Pipeline
1. Download Toronto OSM data from Geofabrik
2. Process into geographic grid (0.01° squares ≈ 1km²)
3. Convert each tile to optimized SVG with accessibility features
4. Compress (gzip + brotli) and rsync into the shared tile base on the VPS

### Phase 2: Client Refactoring
1. Replace OSMDataFetcher with SVGTileManager
2. Simplify FeatureRenderer to just handle tile positioning
3. Update FilterManager for CSS-based filtering
4. Enhance AccessibilityManager for pre-built ARIA

### Phase 3: Progressive Enhancement
1. Add tile preloading for adjacent areas
2. Implement smooth transitions between tiles
3. Add detail level management (show/hide features by zoom)
4. Optimize for screen readers and keyboard navigation

## Next Steps
1. Create new repository: `accessible-maps-svg-tiles`
2. Build OSM data processing pipeline
3. Generate initial Toronto tile set
4. Create proof-of-concept client

## Performance Expectations
- **Initial load**: 2-3s → 0.5s
- **Pan to new area**: 1-2s → 0.3s  
- **Filter toggle**: 500ms → 50ms
- **Memory usage**: 100MB → 30MB
- **Works offline**: After initial tile cache