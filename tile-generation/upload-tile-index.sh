#!/bin/bash

# Upload just the tile-index.json to SiteGround
# Useful after updating the index without re-uploading all tiles

SITE_HOST="u2836-nzitsxlczgyt@ssh.bobd76.sg-host.com"
SSH_PORT="18765"
SSH_KEY="~/.ssh/siteground_key"
REMOTE_PATH="/home/customer/www/bobd76.sg-host.com/public_html/maps/tiles"
LOCAL_INDEX="toronto-svg-tiles/tile-index.json"

echo "📤 Uploading updated tile index to SiteGround..."

# Check if index exists
if [ ! -f "$LOCAL_INDEX" ]; then
    echo "❌ Error: $LOCAL_INDEX not found"
    echo "Run 'python3 update-tile-index.py' first"
    exit 1
fi

# Upload just the index file
scp -i "$SSH_KEY" -P "$SSH_PORT" "$LOCAL_INDEX" "$SITE_HOST:$REMOTE_PATH/tile-index.json"

if [ $? -eq 0 ]; then
    echo "✅ Tile index uploaded successfully!"
    echo ""
    echo "The web app will now see all 81 tiles"
    echo "Check: https://bobd76.sg-host.com/maps/tiles/tile-index.json"
else
    echo "❌ Upload failed"
    exit 1
fi