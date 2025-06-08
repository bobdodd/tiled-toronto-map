# Implementation Plan: Accessible Map Features

## Overview
Transform the current map implementation to follow the webinar's accessibility pattern where EVERY geographical element is an accessible SVG element that can be keyboard navigated.

## 1. UI Controls Structure

### Filter Controls (Checkboxes)
Located in the header navigation, filters will show/hide different map features:
- Buildings (default: checked)
- Roads (default: checked)
- Transit Stops (default: checked)
- Shops (default: unchecked)
- Schools (default: unchecked)
- Places of Worship (default: unchecked)
- Parks & Recreation (default: unchecked)
- Addresses (default: unchecked)

Each filter will:
- Toggle visibility of corresponding SVG elements
- Announce changes via live region ("Buildings added to map" / "Buildings removed from map")
- Use CSS class-based visibility toggling

### Rotor Control (Radio Buttons)
A dropdown/panel with radio buttons to select which feature type is keyboard focusable:
- None (default) - No map elements are focusable
- Transit - Only transit stops are focusable
- Shops - Only shops are focusable
- Schools - Only schools are focusable
- Places of Worship - Only religious buildings are focusable
- Parks - Only parks and recreation areas are focusable
- Everything - ALL visible elements are focusable (equivalent to "dragon mode")

## 2. Map Feature Rendering

### Data Sources
Instead of just rendering tiles, we need to:
1. Fetch OpenStreetMap data for the visible area
2. Parse and render individual features as SVG elements
3. Group features by type in SVG `<g>` elements

### SVG Structure
```xml
<svg id="map-svg">
    <g id="map-tiles" aria-label="Map tiles"></g>
    <g id="buildings" class="feature-group" aria-label="Buildings">
        <polygon class="building" aria-label="School building" points="..."/>
        <polygon class="building" aria-label="Residential building" points="..."/>
    </g>
    <g id="roads" class="feature-group" aria-label="Roads">
        <polyline class="road" aria-label="Main Street" points="..."/>
    </g>
    <g id="transit-stops" class="feature-group" aria-label="Transit stops">
        <circle class="transit-stop" aria-label="Bus stop: Downtown Station, has shelter" cx="" cy="" r=""/>
    </g>
    <!-- More feature groups -->
</svg>
```

### Feature Classes
Each feature type will have specific CSS classes:
- `.building` - All buildings
- `.road` - All roads
- `.transit-stop` - Bus stops, tram stops, subway stations
- `.shop` - Retail locations
- `.school` - Educational institutions
- `.worship` - Religious buildings
- `.park` - Parks and recreation areas
- `.address` - Address points

## 3. Accessibility Implementation

### Dynamic tabindex Management
```javascript
function setTabOrder() {
    const selectedRotor = document.querySelector('input[name="rotor"]:checked').value;
    
    // First, remove all tabindex from map features
    document.querySelectorAll('.building, .road, .transit-stop, .shop, .school, .worship, .park, .address')
        .forEach(elem => {
            elem.removeAttribute('tabindex');
            elem.removeAttribute('role');
        });
    
    // Then add tabindex based on rotor selection
    let tabIdx = 100;
    switch (selectedRotor) {
        case 'transit':
            document.querySelectorAll('.transit-stop').forEach(elem => {
                elem.setAttribute('tabindex', tabIdx++);
            });
            break;
        // ... other cases
    }
}
```

### aria-label Generation
Each feature must have a descriptive aria-label containing:
- Feature type (building, road, etc.)
- Name (if available)
- Additional properties (shelter, wheelchair access, etc.)
- Address or location info

Example labels:
- "School building, Lincoln Elementary"
- "Bus stop: Main & 5th, has shelter, wheelchair accessible"
- "Restaurant: Pizza Palace, open until 10pm"
- "Main Street, 4-lane road with bike lane"

### Keyboard Interaction
- Tab/Shift+Tab: Navigate through focusable elements
- Enter/Space: Activate element (future: show details)
- Arrow keys: Pan the map (existing functionality)

## 4. Live Regions
Add live regions for:
- Filter changes ("Buildings added to map")
- Rotor changes ("Now navigating transit stops")
- Location updates (existing)
- Map view changes (existing)

## 5. Implementation Steps

### Phase 1: UI Controls
1. Add filter checkboxes to header
2. Add rotor radio buttons
3. Style controls to match existing design
4. Add live region for announcements

### Phase 2: Data Loading
1. Create OSM data fetcher for visible bounds
2. Parse OSM data to extract features
3. Convert features to appropriate SVG elements

### Phase 3: Rendering
1. Render features as SVG elements with proper classes
2. Add comprehensive aria-labels
3. Group features by type

### Phase 4: Accessibility
1. Implement setTabOrder() function
2. Connect rotor changes to tabindex updates
3. Connect filters to visibility toggling
4. Test with screen readers

## 6. Technical Considerations

### Performance
- Only render features in visible area
- Use requestAnimationFrame for smooth updates
- Consider clustering for dense areas

### Data Management
- Cache loaded features
- Update when map view changes significantly
- Handle different zoom levels appropriately

### Progressive Enhancement
- Map remains functional without JavaScript
- Features load progressively
- Graceful degradation for older browsers

## 7. Testing Requirements
- Keyboard-only navigation
- Screen reader testing (NVDA, JAWS, VoiceOver)
- High contrast mode
- Mobile accessibility
- Performance with many features