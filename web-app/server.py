#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 8001
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TILES_DIRECTORY = os.path.join(os.path.dirname(DIRECTORY), 'toronto-svg-tiles')

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        # Handle local tile requests
        if self.path.startswith('/maps/tiles/'):
            self.serve_local_tiles()
        else:
            # Handle local files normally
            super().do_GET()
    
    def serve_local_tiles(self):
        # Remove /maps/tiles/ prefix to get the actual file path
        tile_path = self.path[12:]  # Remove "/maps/tiles/"
        local_file_path = os.path.join(TILES_DIRECTORY, tile_path)
        
        try:
            if os.path.exists(local_file_path) and os.path.isfile(local_file_path):
                # Determine content type
                if tile_path.endswith('.json'):
                    content_type = 'application/json'
                elif tile_path.endswith('.svg.gz'):
                    content_type = 'image/svg+xml'
                elif tile_path.endswith('.svg'):
                    content_type = 'image/svg+xml'
                elif tile_path.endswith('.css'):
                    content_type = 'text/css'
                else:
                    content_type = 'application/octet-stream'
                
                # Read and serve the file
                with open(local_file_path, 'rb') as f:
                    content = f.read()
                
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(content)))
                
                # Add gzip encoding header for .gz files
                if tile_path.endswith('.gz'):
                    self.send_header('Content-Encoding', 'gzip')
                
                self.end_headers()
                self.wfile.write(content)
                
                print(f"Served local tile: {tile_path}")
            else:
                print(f"Tile not found: {local_file_path}")
                self.send_error(404, f"Tile not found: {tile_path}")
                
        except Exception as e:
            print(f"Error serving tile {tile_path}: {e}")
            self.send_error(500, f"Error serving tile: {e}")

print(f"Starting server at http://localhost:{PORT}")
print(f"Serving web app from: {DIRECTORY}")
print(f"Serving tiles from: {TILES_DIRECTORY}")
print("\nTo test the map:")
print(f"  1. Regular mode: http://localhost:{PORT}")
print(f"  2. Debug mode: http://localhost:{PORT}?debug=true")
print("\nNote: Using local tiles for development")
print("Press Ctrl+C to stop the server")

with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")