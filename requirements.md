# Mapping Application Requirements

## Core Features
- Fully working interactive map similar to Google Maps/OpenStreetMap
- Fully accessible design with ALL map elements keyboard focusable
- Real-time navigation with turn-by-turn directions
- GPS location tracking with automatic updates
- GPS location spoofing for testing purposes

## Technical Requirements
- SVG-based rendering (NO canvas elements)
- Use OpenStreetMap data
- Dynamic tile downloading and rendering
- Real-time position updates during navigation
- Every geographical element must be an accessible SVG element

## Data Sources
- OpenStreetMap tiles for map rendering
- GeoJSON/OSM data for features (roads, buildings, amenities, etc.)
- GPS/geolocation API for position tracking

## Accessibility Requirements
- EVERY map element must be keyboard focusable with tabindex
- EVERY element must have an accessible name (aria-label)
- Rotor control (like iOS VoiceOver) to select what content type is focusable
- Filter checkboxes to show/hide different map features
- Dynamic tabindex management based on rotor selection
- Screen reader compatible
- Keyboard navigation through all map elements
- High contrast options
- Clear audio directions for navigation
- Live regions for status announcements

## UI Controls
- Filters (checkboxes): Show/hide different feature types (buildings, roads, shops, etc.)
- Rotor (radio buttons): Select which feature type is keyboard navigable at one time
- Only selected feature type in rotor gets tabindex attributes
- Tab key moves through filtered elements in logical order