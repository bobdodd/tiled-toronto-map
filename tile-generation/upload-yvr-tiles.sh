#!/bin/bash

# Upload YVR tiles to server
# This script uploads only the YVR area tiles

echo "Uploading YVR tiles to server..."

# Configuration - Using SiteGround server
SITE_HOST="u2836-nzitsxlczgyt@ssh.bobd76.sg-host.com"
SSH_PORT="18765"
SSH_KEY="~/.ssh/siteground_key"
REMOTE_PATH="/home/customer/www/bobd76.sg-host.com/public_html/maps/tiles"
LOCAL_PATH="toronto-svg-tiles/tiles/"

# YVR tiles start with 49.1 or 49.2 latitude
YVR_FILES=$(ls $LOCAL_PATH/49.1*_*.svg.gz $LOCAL_PATH/49.2*_*.svg.gz 2>/dev/null)

# Count YVR tiles
YVR_COUNT=$(echo "$YVR_FILES" | grep -c "svg.gz")

if [ $YVR_COUNT -eq 0 ]; then
    echo "No YVR tiles found to upload!"
    exit 1
fi

echo "Found $YVR_COUNT YVR tiles to upload"

# Upload YVR tiles
echo "Uploading YVR tiles..."
for file in $YVR_FILES; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo "Uploading $filename..."
        rsync -avz --progress -e "ssh -p $SSH_PORT -i $SSH_KEY" "$file" "$SITE_HOST:$REMOTE_PATH/"
    fi
done

# Also upload the updated tile index
echo "Uploading updated tile index..."
rsync -avz --progress -e "ssh -p $SSH_PORT -i $SSH_KEY" toronto-svg-tiles/tile-index.json "$SITE_HOST:$REMOTE_PATH/"

# Update the web app's tile index copy
echo "Updating web app tile index..."
cp toronto-svg-tiles/tile-index.json ../web-app/maps/tiles/

echo "YVR tiles upload complete!"

# Show summary
echo ""
echo "Summary:"
echo "- Uploaded $YVR_COUNT YVR tiles"
echo "- Updated tile index"
echo ""
echo "YVR area coverage:"
echo "- North: 49.23"
echo "- South: 49.17"
echo "- East: -123.15"
echo "- West: -123.21"
echo "- Centered on Vancouver International Airport"