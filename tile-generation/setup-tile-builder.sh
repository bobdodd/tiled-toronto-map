#!/bin/bash

# Toronto SVG Tile Builder Setup Script

echo "Setting up Toronto SVG Tile Builder..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed."
    exit 1
fi

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install Python requirements
echo "Installing Python packages..."
pip install --upgrade pip
pip install -r requirements.txt

# Check for osmium-tool system dependency
if ! command -v osmium &> /dev/null; then
    echo "Installing osmium-tool..."
    
    # Try different package managers
    if command -v brew &> /dev/null; then
        echo "Using Homebrew to install osmium-tool..."
        brew install osmium-tool
    elif command -v apt-get &> /dev/null; then
        echo "Using apt to install osmium-tool..."
        sudo apt-get update
        sudo apt-get install -y osmium-tool
    elif command -v yum &> /dev/null; then
        echo "Using yum to install osmium-tool..."
        sudo yum install -y osmium-tool
    else
        echo "Warning: Could not install osmium-tool automatically."
        echo "Please install it manually for your system:"
        echo "  macOS: brew install osmium-tool"
        echo "  Ubuntu/Debian: sudo apt-get install osmium-tool"
        echo "  CentOS/RHEL: sudo yum install osmium-tool"
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To generate Toronto SVG tiles:"
echo "  1. Activate the virtual environment: source venv/bin/activate"
echo "  2. Run the tile builder: python build-toronto-tiles.py"
echo ""
echo "This will:"
echo "  - Download OSM data for Ontario (~500MB)"
echo "  - Extract Toronto area (~50MB)"
echo "  - Generate SVG tiles (~150-200MB compressed)"
echo "  - Create tile index and CSS files"
echo ""
echo "Total process time: 30-60 minutes depending on internet speed"