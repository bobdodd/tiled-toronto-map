#!/bin/bash

# Deploy Web App to SiteGround
# Usage: ./deploy.sh

SITE_HOST="u2836-nzitsxlczgyt@ssh.bobd76.sg-host.com"
SSH_PORT="18765"
SSH_KEY="~/.ssh/siteground_key"
REMOTE_PATH="/home/customer/www/bobd76.sg-host.com/public_html"
LOCAL_APP="."

echo "🚀 Deploying Accessible Maps web app to SiteGround..."

# Check if web app files exist
if [ ! -f "index.html" ]; then
    echo "❌ Error: index.html not found"
    echo "Run this script from the web-app directory"
    exit 1
fi

# Set up SSH agent if not running
if [ -z "$SSH_AUTH_SOCK" ]; then
    echo "🔑 Starting SSH agent..."
    eval "$(ssh-agent -s)"
fi

# Add SSH key to agent
echo "🔑 Adding SSH key to agent..."
ssh-add ~/.ssh/siteground_key

# Test SSH connection
echo "🔐 Testing SSH connection..."
echo "Note: You may be prompted for your SSH key password"
if ! ssh -i "$SSH_KEY" -p "$SSH_PORT" -o ConnectTimeout=10 -o BatchMode=no "$SITE_HOST" "echo 'SSH connection successful'"; then
    echo "❌ Error: SSH connection failed"
    echo "Check your SSH key and host settings"
    exit 1
fi

# Create web app directory on server
echo "📁 Creating web app directory on server..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SITE_HOST" "mkdir -p $REMOTE_PATH/app $REMOTE_PATH/app/maps/tiles"

# Upload web app files
echo "📤 Uploading web app files..."
rsync -avz --progress \
    --exclude='deploy.sh' \
    --exclude='server.py' \
    --exclude='favicon.ico' \
    --exclude='.DS_Store' \
    -e "ssh -i $SSH_KEY -p $SSH_PORT" \
    "$LOCAL_APP/" \
    "$SITE_HOST:$REMOTE_PATH/app/"

# Verify deployment
echo "🔧 Verifying deployment..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SITE_HOST" "
cd $REMOTE_PATH/app
echo 'Web app deployed successfully'
ls -la
"

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "📍 Web app is now available at:"
    echo "   https://bobd76.sg-host.com/app/"
    echo ""
    echo "🔧 Next steps:"
    echo "   1. Test the app: https://bobd76.sg-host.com/app/"
    echo "   2. Check tiles load: https://bobd76.sg-host.com/maps/tiles/"
    echo "   3. Debug mode: https://bobd76.sg-host.com/app/?debug=true"
else
    echo "❌ Deployment failed"
    exit 1
fi