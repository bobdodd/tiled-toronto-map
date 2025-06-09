# Gzip Decompression Implementation

## Overview
The SVG map tiles are stored as gzipped files (.svg.gz) to reduce bandwidth and storage. We've implemented a robust cross-browser decompression system with multiple fallbacks.

## Implementation Details

### Server Configuration (server.py)
- Serves .svg.gz files with `Content-Type: image/svg+xml`
- Sets `Content-Encoding: gzip` header to enable browser auto-decompression
- CORS headers allow cross-origin requests

### Client-Side Implementation (SVGTileManager.js)

#### Decompression Strategy
1. **First attempt**: Try to read response as text
   - If browser auto-decompressed, we'll get valid SVG
   - Check for `<svg` tag to verify

2. **Fallback 1**: DecompressionStream API
   - Available in modern browsers (Chrome 80+, Edge 80+, Safari 16.4+)
   - Native browser API for decompression

3. **Fallback 2**: Pako.js library
   - JavaScript implementation of zlib
   - Works in all browsers
   - Loaded from CDN in index.html

### Browser Compatibility
- **Chrome/Edge**: Usually auto-decompresses or uses DecompressionStream
- **Firefox**: May require manual decompression
- **Safari**: Newer versions support DecompressionStream
- **Older browsers**: Fall back to pako.js

### Testing
Use `test-gzip-decompression.html` to verify decompression in different browsers:
```bash
open http://localhost:8001/test-gzip-decompression.html
```

### Error Handling
- Validates decompressed content contains valid SVG
- Logs warnings when falling back between methods
- Returns null for invalid tiles rather than crashing

## Performance Considerations
- Tiles are cached after decompression (maxCacheSize: 20)
- Active requests are tracked to prevent duplicate fetches
- Decompression happens asynchronously to avoid blocking UI

## File Size Benefits
Example compression ratios:
- Original SVG: ~500KB
- Gzipped: ~130KB (74% reduction)
- Bandwidth savings are significant for mobile users