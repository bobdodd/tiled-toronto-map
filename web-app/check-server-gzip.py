#!/usr/bin/env python3
"""
Test script to verify server gzip handling
"""

import urllib.request
import urllib.error
import gzip
import json

def test_tile_endpoint():
    """Test if the server is properly serving gzipped tiles"""
    
    # Test tile URL
    base_url = "http://localhost:8001"
    tile_url = f"{base_url}/maps/tiles/tiles/43.640_-79.380.svg.gz"
    
    print(f"Testing tile URL: {tile_url}")
    print("-" * 60)
    
    # Test with different Accept-Encoding headers
    test_cases = [
        {
            "name": "No Accept-Encoding",
            "headers": {}
        },
        {
            "name": "Accept gzip encoding",
            "headers": {"Accept-Encoding": "gzip"}
        },
        {
            "name": "Accept gzip, deflate",
            "headers": {"Accept-Encoding": "gzip, deflate"}
        },
        {
            "name": "Accept identity (no compression)",
            "headers": {"Accept-Encoding": "identity"}
        }
    ]
    
    for test in test_cases:
        print(f"\nTest: {test['name']}")
        print(f"Headers: {test['headers']}")
        
        try:
            request = urllib.request.Request(tile_url)
            for key, value in test['headers'].items():
                request.add_header(key, value)
            
            with urllib.request.urlopen(request) as response:
                print(f"Status: {response.status}")
                print(f"Content-Type: {response.headers.get('Content-Type', 'Not set')}")
                print(f"Content-Encoding: {response.headers.get('Content-Encoding', 'Not set')}")
                print(f"Content-Length: {response.headers.get('Content-Length', 'Not set')}")
                
                # Check if content is already decompressed
                content = response.read()
                is_svg = b'<svg' in content[:1000]
                
                if is_svg:
                    print("✓ Content is already decompressed SVG")
                    print(f"Content preview: {content[:100].decode('utf-8', errors='ignore')}...")
                else:
                    # Try to decompress manually
                    try:
                        decompressed = gzip.decompress(content)
                        is_svg_after_decompress = b'<svg' in decompressed[:1000]
                        
                        if is_svg_after_decompress:
                            print("✓ Content is gzipped, successfully decompressed")
                            print(f"Decompressed preview: {decompressed[:100].decode('utf-8', errors='ignore')}...")
                        else:
                            print("✗ Content doesn't appear to be valid SVG after decompression")
                    except Exception as e:
                        print(f"✗ Failed to decompress: {e}")
                        print(f"Raw content preview: {content[:100]}")
        
        except urllib.error.HTTPError as e:
            print(f"✗ HTTP Error: {e.code} - {e.reason}")
        except Exception as e:
            print(f"✗ Request failed: {e}")
    
    # Also test the tile index
    print("\n" + "=" * 60)
    print("Testing tile index endpoint...")
    
    try:
        index_url = f"{base_url}/maps/tiles/tile-index.json"
        with urllib.request.urlopen(index_url) as response:
            print(f"Tile index URL: {index_url}")
            print(f"Status: {response.status}")
            
            if response.status == 200:
                index_data = json.loads(response.read().decode('utf-8'))
                print(f"✓ Tile index loaded successfully")
                print(f"Number of tiles: {len(index_data.get('tiles', []))}")
                if index_data.get('tiles'):
                    print(f"Sample tile: {index_data['tiles'][0]}")
            else:
                print(f"✗ Failed to load tile index")
    except Exception as e:
        print(f"✗ Error loading tile index: {e}")

if __name__ == "__main__":
    test_tile_endpoint()