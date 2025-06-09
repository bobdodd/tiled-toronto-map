#!/bin/bash

# Upload Toronto SVG Tiles to SiteGround
# Usage: ./upload-tiles.sh

SITE_HOST="u2836-nzitsxlczgyt@ssh.bobd76.sg-host.com"
SSH_PORT="18765"
SSH_KEY="~/.ssh/siteground_key"
REMOTE_PATH="/home/customer/www/bobd76.sg-host.com/public_html"
LOCAL_TILES="toronto-svg-tiles"

echo "🚀 Uploading Toronto SVG tiles to SiteGround..."

# Check if tiles directory exists
if [ ! -d "$LOCAL_TILES" ]; then
    echo "❌ Error: $LOCAL_TILES directory not found"
    echo "Run 'python build-toronto-tiles.py' first to generate tiles"
    exit 1
fi

# Test SSH connection
echo "🔐 Testing SSH connection..."
echo "Note: You may be prompted for your SSH key password"
if ! ssh -i "$SSH_KEY" -p "$SSH_PORT" -o ConnectTimeout=10 -o BatchMode=no "$SITE_HOST" "echo 'SSH connection successful'"; then
    echo "❌ Error: SSH connection failed"
    echo "Check your SSH key and host settings"
    exit 1
fi

# Create maps directory on server
echo "📁 Creating maps directory on server..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SITE_HOST" "mkdir -p $REMOTE_PATH/maps"

# Upload tiles with rsync (excluding large data files)
echo "📤 Uploading SVG tiles (expecting ~36 tiles)..."
echo "This may take a few minutes depending on your connection speed..."
rsync -avz --progress \
    --exclude='data/' \
    --exclude='*.osm.pbf' \
    --exclude='*.osm' \
    -e "ssh -i $SSH_KEY -p $SSH_PORT" \
    "$LOCAL_TILES/" \
    "$SITE_HOST:$REMOTE_PATH/maps/tiles/"

if [ $? -eq 0 ]; then
    echo "✅ Upload successful!"
    echo ""
    echo "📍 Tiles are now available at:"
    echo "   https://bobd76.sg-host.com/maps/tiles/"
    echo ""
    echo "🔧 Next steps:"
    echo "   1. Update your web app to use: https://bobd76.sg-host.com/maps/tiles/"
    echo "   2. Test a sample tile: https://bobd76.sg-host.com/maps/tiles/tiles/43.650_-79.380.svg.gz"
    echo "   3. Check tile index: https://bobd76.sg-host.com/maps/tiles/tile-index.json"
else
    echo "❌ Upload failed"
    exit 1
fi