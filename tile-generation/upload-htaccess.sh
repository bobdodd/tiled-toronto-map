#!/bin/bash

# Upload .htaccess for proper gzip handling
# Usage: ./upload-htaccess.sh

SITE_HOST="u2836-nzitsxlczgyt@ssh.bobd76.sg-host.com"
SSH_PORT="18765"
SSH_KEY="~/.ssh/siteground_key"
REMOTE_PATH="/home/customer/www/bobd76.sg-host.com/public_html"

echo "📤 Uploading .htaccess file for gzip configuration..."

# Upload .htaccess to the tiles directory
scp -i "$SSH_KEY" -P "$SSH_PORT" \
    .htaccess \
    "$SITE_HOST:$REMOTE_PATH/maps/tiles/tiles/"

if [ $? -eq 0 ]; then
    echo "✅ .htaccess uploaded successfully!"
    echo ""
    echo "The server will now properly serve .svg.gz files with:"
    echo "  - Content-Type: image/svg+xml"
    echo "  - Content-Encoding: gzip"
    echo ""
    echo "This allows browsers to automatically decompress the files."
else
    echo "❌ Upload failed"
    exit 1
fi