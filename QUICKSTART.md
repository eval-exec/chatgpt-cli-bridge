# Quick Start Guide

Get ChatGPT CLI Bridge running in 5 minutes.

## Prerequisites

- Node.js installed (v14 or later)
- Google Chrome browser
- Active ChatGPT subscription

## Installation

```bash
# 1. Install all dependencies
cd server && npm install && cd ..
cd cli && npm install && cd ..
cd scripts && npm install && cd ..
```

## Running

### Terminal 1: Start Server

```bash
cd server
npm start
```

Leave this running. You should see:
```
WebSocket server running on ws://localhost:8080
Waiting for connections...
```

### Terminal 2: Launch Chrome with Extension

```bash
cd scripts
./ext launch
```

This opens Chrome with:
- Extension pre-loaded
- ChatGPT page opened
- DevTools visible

**Login to ChatGPT** if not already logged in.

Check the DevTools Console - you should see:
```
[ChatGPT CLI Bridge] Connected to server
```

### Terminal 3: Use the CLI

```bash
cd cli
node chatgpt-cli.js "what is the meaning of life?"
```

You should see the response streaming in real-time!

## Optional: Install CLI Globally

```bash
cd cli
npm link
```

Now you can use `chatgpt` from anywhere:

```bash
chatgpt "explain quantum computing"
```

## Development Workflow

After making changes to the extension code:

```bash
# Terminal 2
cd scripts
./ext reload

# Then refresh the ChatGPT page in Chrome
```

## Common Issues

**"Could not connect to bridge server"**
- Make sure Terminal 1 (server) is running

**"Extension not connected"**
- Make sure you're on chat.openai.com
- Check DevTools console for errors
- Try refreshing the page

**Extension reload not working**
- Make sure Chrome was launched with `./ext launch`
- Can reload manually at `chrome://extensions/`

## Next Steps

- See [README.md](README.md) for full documentation
- Check "Extension Management" section for development tips
- Read "How It Works" to understand the architecture

## That's it!

You're now controlling ChatGPT from your terminal with real-time streaming responses.
