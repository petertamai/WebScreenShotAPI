#!/bin/bash

# Install Chromium on Ubuntu Server 22.04
# This script installs Chromium and required dependencies for the screenshot service

set -e

echo "🚀 Installing Chromium and dependencies for Screenshot Service..."

# Update package list
echo "📦 Updating package list..."
sudo apt-get update

# Install Chromium and dependencies
echo "🌐 Installing Chromium browser..."
sudo apt-get install -y \
    chromium-browser \
    ca-certificates \
    fonts-liberation \
    fonts-dejavu-core \
    libappindicator1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libxinerama1 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

# Install additional dependencies for image processing
echo "🖼️  Installing image processing dependencies..."
sudo apt-get install -y \
    libvips-dev \
    build-essential \
    python3

# Verify Chromium installation
echo "✅ Verifying Chromium installation..."
if command -v chromium-browser &> /dev/null; then
    CHROMIUM_VERSION=$(chromium-browser --version)
    echo "✅ Chromium installed successfully: $CHROMIUM_VERSION"
    echo "📍 Chromium path: $(which chromium-browser)"
else
    echo "❌ Chromium installation failed!"
    exit 1
fi

# Test Chromium in headless mode
echo "🧪 Testing Chromium in headless mode..."
if chromium-browser --headless --disable-gpu --dump-dom --virtual-time-budget=1000 https://example.com > /dev/null 2>&1; then
    echo "✅ Chromium headless test passed!"
else
    echo "⚠️  Chromium headless test failed, but installation completed."
fi

# Create optimized environment configuration
echo "⚙️  Creating optimized configuration..."
cat > .env.chromium << EOF
# Chromium Configuration for Ubuntu Server
CHROMIUM_PATH=/usr/bin/chromium-browser

# Performance optimizations for server deployment
MAX_BROWSERS=2
MAX_CONCURRENT_REQUESTS=3
BROWSER_TIMEOUT_MS=60000
BLOCKED_RESOURCES=font,media,other,image

# Memory optimizations
MEMORY_THRESHOLD=0.80
CPU_THRESHOLD=0.85
EOF

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Copy .env.chromium settings to your .env file:"
echo "   cat .env.chromium >> .env"
echo ""
echo "2. Start your screenshot service:"
echo "   npm start"
echo ""
echo "3. Test the service:"
echo "   curl http://localhost:3000/health"
echo ""
echo "💡 Chromium executable path: /usr/bin/chromium-browser"
echo "💡 For EasyPanel deployment, use the standard Dockerfile"