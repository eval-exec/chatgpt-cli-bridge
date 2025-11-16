#!/bin/bash

# Simple launcher that directly spawns Chrome without chrome-launcher

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_PATH="$SCRIPT_DIR/../extension"

echo "Launching Chrome with extension..."
echo "Extension path: $EXTENSION_PATH"
echo ""

# Find Chrome executable
if command -v google-chrome &> /dev/null; then
    CHROME="google-chrome"
elif command -v chromium &> /dev/null; then
    CHROME="chromium"
elif command -v chromium-browser &> /dev/null; then
    CHROME="chromium-browser"
elif command -v google-chrome-stable &> /dev/null; then
    CHROME="google-chrome-stable"
else
    echo "Error: Chrome/Chromium not found"
    exit 1
fi

echo "Using: $CHROME"
echo ""

# Launch Chrome with extension
$CHROME \
  --load-extension="$EXTENSION_PATH" \
  --auto-open-devtools-for-tabs \
  --remote-debugging-port=9222 \
  --disable-features=DialMediaRouteProvider \
  --user-data-dir="/tmp/chrome-chatgpt-cli-$$" \
  "https://chat.openai.com" \
  &

CHROME_PID=$!

echo "Chrome launched!"
echo "PID: $CHROME_PID"
echo "Remote debugging: localhost:9222"
echo ""
echo "Chrome is running in the background."
echo ""
echo "Commands:"
echo "  ./ext reload    - Reload the extension"
echo "  kill $CHROME_PID      - Stop Chrome"
echo ""

# Save PID
echo "$CHROME_PID" > "$SCRIPT_DIR/.chrome-pid"

echo "Tip: Run './ext reload' after making changes to the extension"
