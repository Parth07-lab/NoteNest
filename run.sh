#!/usr/bin/env bash
# NoteNest Multi-Device Launcher for macOS & Linux
cd "$(dirname "$0")"

echo "============================================================="
echo "               📝 NoteNest Run Interface                     "
echo "============================================================="

# 1. Check for Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed."
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

# 2. Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "Installing required dependencies (first run only)..."
    npm install
fi

# 3. Ensure .env exists
if [ ! -f ".env" ]; then
    cp .env.example .env
fi

# 4. Run the interactive interface
node launcher.js
