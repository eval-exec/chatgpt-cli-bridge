# ChatGPT CLI Bridge

Control ChatGPT's web interface from your terminal using a Chrome extension and WebSocket bridge.

## Architecture

```
CLI Client ←→ WebSocket Server ←→ Chrome Extension ←→ ChatGPT Web UI
```

- **Chrome Extension**: Monitors ChatGPT's DOM and streams responses in real-time
- **WebSocket Server**: Routes messages between CLI and extension
- **CLI Client**: Send queries and receive streaming responses in your terminal

## Features

- Real-time streaming responses (text appears as ChatGPT types)
- Uses your existing ChatGPT subscription
- Simple CLI interface
- Automatic reconnection handling

## Setup

### 1. Install Dependencies

Install Node.js dependencies for the server:

```bash
cd server
npm install
```

Install Node.js dependencies for the CLI:

```bash
cd cli
npm install
```

Install dependencies for extension management scripts (optional but recommended):

```bash
cd scripts
npm install
```

### 2. Install Chrome Extension

**Option A: Automated (Recommended for development)**

```bash
cd scripts
./ext launch
```

This will:
- Launch Chrome with the extension pre-loaded
- Open ChatGPT automatically
- Enable remote debugging for easy reload
- Auto-open DevTools

**Option B: Manual**

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `extension` directory from this project
5. The extension should now appear in your extensions list

### 3. Start the WebSocket Server

```bash
cd server
npm start
```

You should see:
```
WebSocket server running on ws://localhost:8080
Waiting for connections...
```

### 4. Open ChatGPT in Chrome

1. Navigate to https://chat.openai.com or https://chatgpt.com
2. Log in with your ChatGPT account
3. Open Chrome DevTools (F12) and check the Console
4. You should see: `[ChatGPT CLI Bridge] Connected to server`

The server terminal should show: `Chrome extension connected`

### 5. Use the CLI

From the `cli` directory:

```bash
# Direct usage
node chatgpt-cli.js "explain quantum computing"

# Or install globally (recommended)
npm link
chatgpt "explain quantum computing"
```

## Usage Examples

```bash
# Simple query
chatgpt "what is the capital of France?"

# Multi-word queries
chatgpt "explain how neural networks work in simple terms"

# Longer queries
chatgpt "write a bash script that backs up my home directory"
```

## Extension Management (CLI)

Managing the Chrome extension from the CLI is useful during development when you need to frequently reload after code changes.

### Quick Reference

```bash
cd scripts

# Launch Chrome with extension (first time or after restart)
./ext launch

# Reload extension after code changes (Chrome must be running)
./ext reload

# Stop Chrome
./ext stop

# Show help
./ext help
```

### Typical Development Workflow

1. **Start everything:**
```bash
# Terminal 1: Start the WebSocket server
cd server && npm start

# Terminal 2: Launch Chrome with extension
cd scripts && ./ext launch
```

2. **Make changes to extension code** (edit `extension/content.js`)

3. **Reload the extension:**
```bash
cd scripts && ./ext reload
```

4. **Refresh ChatGPT page** in Chrome to see changes

### Why use CLI management?

- **Faster iteration**: Reload extension without clicking through Chrome UI
- **Reproducible setup**: Same Chrome flags every time
- **Automation ready**: Can be integrated into build scripts
- **Remote debugging**: Always enabled for advanced debugging

### Manual Reload (Alternative)

If you prefer not to use the scripts:

1. Go to `chrome://extensions/`
2. Find "ChatGPT CLI Bridge"
3. Click the reload icon (circular arrow)
4. Refresh the ChatGPT page

## How It Works

1. **CLI sends query**: `chatgpt "your question"` connects to WebSocket server
2. **Server routes to extension**: Forwards query to Chrome extension
3. **Extension controls ChatGPT**: Injects text into textarea and clicks send button
4. **Extension monitors response**: Uses `MutationObserver` to watch DOM changes
5. **Streaming chunks sent back**: As ChatGPT types, chunks flow back through server to CLI
6. **CLI displays in real-time**: Text appears immediately in your terminal

## Troubleshooting

### Server won't start
- Make sure port 8080 is not in use: `lsof -i :8080`
- Check if `ws` package is installed: `cd server && npm install`

### Extension not connecting
- Check Chrome DevTools console for errors
- Verify you're on chat.openai.com or chatgpt.com
- Reload the page after installing the extension
- Make sure the server is running

### CLI shows "Could not connect to bridge server"
- Start the server: `cd server && npm start`
- Check if server is listening: `netstat -an | grep 8080`

### No response from ChatGPT
- Make sure you're logged into ChatGPT
- Check that the extension found the textarea (DevTools console)
- Verify ChatGPT is not rate-limiting you
- Try sending a query directly in the web UI first

### Extension reload not working
- Make sure Chrome was launched with: `cd scripts && ./ext launch`
- Check that Chrome is running with remote debugging: `lsof -i :9222`
- If using manual Chrome, you need to reload manually at `chrome://extensions/`
- After reloading extension, refresh the ChatGPT page

## Project Structure

```
chatgpt-cli-bridge/
├── extension/
│   ├── manifest.json       # Chrome extension manifest
│   └── content.js         # Content script (monitors ChatGPT DOM)
├── server/
│   ├── package.json
│   └── server.js          # WebSocket server
├── cli/
│   ├── package.json
│   └── chatgpt-cli.js     # CLI client
├── scripts/
│   ├── package.json
│   ├── ext                # Extension manager CLI
│   ├── launch-chrome.js   # Launch Chrome with extension
│   └── reload-extension.js # Reload extension via CDP
└── README.md
```

## Protocol

### CLI → Server → Extension
```json
{"type": "query", "text": "your question here"}
```

### Extension → Server → CLI
```json
{"type": "chunk", "text": "response text", "done": false}
{"type": "chunk", "text": " more text", "done": true}
```

### Error Messages
```json
{"type": "error", "text": "error description"}
```

## Limitations

- Requires Chrome browser with extension installed
- Requires active ChatGPT session (must be logged in)
- Subject to ChatGPT's rate limits and usage policies
- Extension needs to be on a ChatGPT page to work
- No conversation history management (uses current chat in browser)

## Future Enhancements

- [ ] Support for multiple concurrent queries
- [ ] Conversation history management
- [ ] Support for image inputs
- [ ] Support for code interpreter / advanced features
- [ ] Configuration file for server port and URL
- [ ] Better error handling and recovery
- [ ] Session persistence

## License

MIT
