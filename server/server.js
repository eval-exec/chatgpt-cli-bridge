#!/usr/bin/env node

const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

// Track connected clients
let extensionClient = null;
const cliClients = new Set();

console.log(`WebSocket server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  console.log('New connection established');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      // Handle client identification
      if (message.type === 'identify') {
        if (message.client === 'extension') {
          extensionClient = ws;
          console.log('Chrome extension connected');
          ws.clientType = 'extension';
        } else if (message.client === 'cli') {
          cliClients.add(ws);
          console.log('CLI client connected');
          ws.clientType = 'cli';
        }
        return;
      }

      // Route messages based on sender
      if (ws.clientType === 'cli') {
        // CLI -> Extension (send query)
        if (message.type === 'query' && extensionClient) {
          console.log(`Query from CLI: "${message.text.substring(0, 50)}..."`);
          extensionClient.send(JSON.stringify(message));
        } else if (!extensionClient) {
          ws.send(JSON.stringify({
            type: 'error',
            text: 'Chrome extension not connected. Please open ChatGPT in Chrome with the extension installed.'
          }));
        }
      } else if (ws.clientType === 'extension') {
        // Extension -> CLI clients (stream response chunks)
        if (message.type === 'chunk' || message.type === 'error' || message.type === 'ready') {
          cliClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
            }
          });

          if (message.type === 'chunk') {
            const preview = message.text.substring(0, 30).replace(/\n/g, ' ');
            console.log(`Chunk: "${preview}..." (done: ${message.done})`);
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (ws.clientType === 'extension') {
      console.log('Chrome extension disconnected');
      extensionClient = null;

      // Notify CLI clients that extension disconnected
      cliClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'error',
            text: 'Chrome extension disconnected'
          }));
        }
      });
    } else if (ws.clientType === 'cli') {
      console.log('CLI client disconnected');
      cliClients.delete(ws);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log('Waiting for connections...');
console.log('- Chrome extension should connect from chat.openai.com');
console.log('- CLI clients can connect to send queries');
