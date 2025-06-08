# Technical Architecture: Accessible Map Implementation

## Data Flow Architecture

```
OpenStreetMap API
      ↓
OSM Data Fetcher
      ↓
Feature Parser
      ↓
SVG Renderer
      ↓
Accessibility Manager (tabindex, aria-labels)
      ↓
User Interface (keyboard, screen reader)
```

## Module Structure

### 1. OSMDataFetcher.js
Responsible for fetching OpenStreetMap data for the visible area.

```javascript
class OSMDataFetcher {
    async fetchArea(bounds) {
        // Overpass API query for features in bounds
        const query = `
            [out:json][timeout:25];
            (
                way["building"](${bounds});
                way["highway"](${bounds});
                node["amenity"](${bounds});
                node["shop"](${bounds});
                // ... more queries
            );
            out body;
            >;
            out skel qt;
        `;
        // Return parsed GeoJSON
    }
}
```

### 2. FeatureRenderer.js
Converts GeoJSON features to accessible SVG elements.

```javascript
class FeatureRenderer {
    renderBuilding(feature) {
        const polygon = document.createElementNS(SVG_NS, 'polygon');
        polygon.setAttribute('points', this.coordsToPoints(feature.geometry));
        polygon.setAttribute('class', 'building');
        polygon.setAttribute('aria-label', this.generateBuildingLabel(feature));
        return polygon;
    }
    
    generateBuildingLabel(feature) {
        // Create descriptive label from feature properties
        // e.g., "Office building, 5 stories, Main Street"
    }
}
```

### 3. AccessibilityManager.js
Manages dynamic tabindex and focus behavior.

```javascript
class AccessibilityManager {
    constructor() {
        this.currentRotor = 'none';
        this.featureSelectors = {
            'transit': '.transit-stop',
            'shops': '.shop',
            'schools': '.school',
            // ...
        };
    }
    
    setRotor(value) {
        this.currentRotor = value;
        this.updateTabOrder();
        this.announceRotorChange(value);
    }
    
    updateTabOrder() {
        // Remove all tabindex
        // Add tabindex based on rotor
    }
}
```

### 4. FilterManager.js
Handles visibility toggling for different feature types.

```javascript
class FilterManager {
    constructor() {
        this.filters = {
            buildings: true,
            roads: true,
            transitStops: true,
            shops: false,
            // ...
        };
    }
    
    toggleFilter(featureType, enabled) {
        this.filters[featureType] = enabled;
        this.updateVisibility(featureType, enabled);
        this.announceFilterChange(featureType, enabled);
    }
}
```

## API Integration

### Overpass API Query Example
```
[out:json][timeout:25];
(
  // Buildings
  way["building"]({{bbox}});
  relation["building"]({{bbox}});
  
  // Roads
  way["highway"~"^(primary|secondary|tertiary|residential|service)$"]({{bbox}});
  
  // Transit stops
  node["highway"="bus_stop"]({{bbox}});
  node["railway"="tram_stop"]({{bbox}});
  node["railway"="station"]({{bbox}});
  
  // Shops
  node["shop"]({{bbox}});
  way["shop"]({{bbox}});
  
  // Schools
  node["amenity"="school"]({{bbox}});
  way["amenity"="school"]({{bbox}});
  
  // Places of worship
  node["amenity"="place_of_worship"]({{bbox}});
  way["amenity"="place_of_worship"]({{bbox}});
  
  // Parks
  way["leisure"~"^(park|playground|garden)$"]({{bbox}});
);
out body;
>;
out skel qt;
```

## Coordinate System

### Projection
- Use Web Mercator projection for tile alignment
- Convert lat/lng to screen coordinates
- Handle zoom level scaling

### Optimization
- Simplify geometries at lower zoom levels
- Cluster nearby points at low zoom
- Load features progressively

## Accessibility Features

### Screen Reader Announcements
1. **Live Region Structure**
   ```html
   <div id="map-announcements" aria-live="polite" aria-atomic="true" class="screen-reader-only"></div>
   ```

2. **Announcement Types**
   - Filter changes: "Buildings added to map"
   - Rotor changes: "Now navigating transit stops only"
   - Feature count: "15 transit stops available"
   - Navigation: "Focused on bus stop: Main Street, has shelter"

### Keyboard Navigation Flow
1. Tab to map container
2. Use arrow keys to pan
3. Tab through filtered elements based on rotor
4. Enter/Space for element details (future feature)

### Focus Management
- Maintain focus position when filters change
- Announce number of available elements
- Logical tab order (left-to-right, top-to-bottom)

## Performance Considerations

### Rendering Strategy
1. **Viewport Culling**: Only render features in visible area
2. **Level of Detail**: Reduce detail at lower zoom levels
3. **Debouncing**: Delay re-rendering during rapid pan/zoom

### Caching Strategy
1. **Tile-based Caching**: Cache features by tile coordinates
2. **Memory Management**: Remove features outside viewport
3. **Local Storage**: Persist recent data for offline use

### Progressive Loading
1. Load and render tiles first
2. Load major features (buildings, roads)
3. Load minor features (shops, amenities)
4. Add accessibility attributes last

## Error Handling

### Network Errors
- Fallback to cached data
- Show user-friendly error messages
- Retry with exponential backoff

### Data Errors
- Validate GeoJSON structure
- Handle missing properties gracefully
- Log errors for debugging

## Future Enhancements

### Planned Features
1. **Detail Panels**: Show more info when element is activated
2. **Search**: Find specific locations or features
3. **Routing**: Integration with navigation system
4. **Offline Mode**: Full offline capability with downloaded regions
5. **Custom Landmarks**: User-defined points of interest

### Accessibility Improvements
1. **Sonification**: Audio cues for different feature types
2. **Haptic Feedback**: Vibration patterns on mobile
3. **Voice Commands**: Control map with voice
4. **Braille Display Support**: Optimize for refreshable braille displays