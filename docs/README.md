# Accessible Interactive Map

A fully accessible web-based interactive map application built with SVG rendering, GPS tracking, and keyboard navigation support.

## Features

- **SVG-based rendering** for full accessibility
- **OpenStreetMap tiles** for map display
- **Real-time GPS tracking** with location updates
- **GPS spoofing** for testing
- **Keyboard navigation** (arrow keys, +/-, H to center)
- **Screen reader support** with ARIA labels and live regions
- **High contrast mode** for visual accessibility
- **Responsive design** for mobile devices

## Getting Started

1. Start the local server:
   ```bash
   python3 server.py
   ```

2. Open your web browser to:
   - Regular mode: http://localhost:8000
   - Debug mode: http://localhost:8000?debug=true

## Controls

### Mouse/Touch Controls
- **Zoom In/Out**: Click the +/- buttons
- **Center on Location**: Click the ⊙ button
- **Track Location**: Toggle GPS tracking
- **High Contrast**: Toggle high contrast mode

### Keyboard Controls
- **Arrow Keys**: Pan the map
- **Shift + Arrow Keys**: Pan faster
- **+ or =**: Zoom in
- **- or _**: Zoom out
- **H**: Center on current location
- **Tab**: Navigate through controls

## Testing with GPS Spoofing

1. Open the map with `?debug=true` parameter
2. The debug panel will appear in the bottom right
3. Enter latitude and longitude values
4. Click "Set Location" to simulate GPS position

## Accessibility Features

- Skip link for keyboard navigation
- ARIA labels on all interactive elements
- Live region announcements for status updates
- High contrast mode for users with visual impairments
- Keyboard-navigable map with clear focus indicators
- Screen reader compatible SVG structure

## Browser Requirements

- Modern browser with JavaScript enabled
- Location services permission (for GPS tracking)
- Internet connection (for map tiles)

## Notes

- The map uses OpenStreetMap tiles (usage policy applies)
- GPS accuracy depends on device capabilities
- Debug mode allows testing without actual GPS