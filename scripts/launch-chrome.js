#!/usr/bin/env node

const chromeLauncher = require('chrome-launcher');
const path = require('path');

const extensionPath = path.resolve(__dirname, '../extension');

console.log('Launching Chrome with extension...');
console.log(`Extension path: ${extensionPath}`);

chromeLauncher.launch({
  startingUrl: 'https://chat.openai.com',
  chromeFlags: [
    `--load-extension=${extensionPath}`,
    '--auto-open-devtools-for-tabs',
    '--remote-debugging-port=9222'
  ]
}).then(chrome => {
  console.log(`Chrome launched on port ${chrome.port}`);
  console.log(`PID: ${chrome.pid}`);
  console.log('');
  console.log('Chrome is running with:');
  console.log('- Extension loaded');
  console.log('- DevTools auto-opened');
  console.log('- Remote debugging on port 9222');
  console.log('');
  console.log('To reload the extension, run: npm run reload');
  console.log('To kill Chrome: kill ' + chrome.pid);

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\nStopping Chrome...');
    chrome.kill();
    process.exit(0);
  });
}).catch(err => {
  console.error('Failed to launch Chrome:', err);
  process.exit(1);
});
