#!/usr/bin/env node

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:8080';

// Get query from command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: chatgpt <query>');
  console.error('Example: chatgpt "explain quantum computing"');
  process.exit(1);
}

const query = args.join(' ');

// Connect to WebSocket server
const ws = new WebSocket(WS_URL);

let hasReceivedResponse = false;

ws.on('open', () => {
  // Identify as CLI client
  ws.send(JSON.stringify({
    type: 'identify',
    client: 'cli'
  }));

  // Send the query
  ws.send(JSON.stringify({
    type: 'query',
    text: query
  }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data);

    if (message.type === 'chunk') {
      hasReceivedResponse = true;

      // Write chunk to stdout (no newline)
      process.stdout.write(message.text);

      // If done, add final newline and close
      if (message.done) {
        process.stdout.write('\n');
        ws.close();
        process.exit(0);
      }
    } else if (message.type === 'error') {
      console.error(`\nError: ${message.text}`);
      ws.close();
      process.exit(1);
    } else if (message.type === 'status') {
      // Status update from extension (e.g., "waiting for response...")
      process.stderr.write(`[${message.text}]\n`);
    } else if (message.type === 'ready') {
      // Extension is ready, just ignore
    }
  } catch (error) {
    console.error('Error processing response:', error);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (error) => {
  if (error.code === 'ECONNREFUSED') {
    console.error('Error: Could not connect to bridge server.');
    console.error('Please start the server with: cd server && npm start');
  } else {
    console.error('WebSocket error:', error.message);
  }
  process.exit(1);
});

ws.on('close', () => {
  if (!hasReceivedResponse) {
    console.error('Connection closed without receiving response');
    process.exit(1);
  }
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nInterrupted');
  ws.close();
  process.exit(0);
});
