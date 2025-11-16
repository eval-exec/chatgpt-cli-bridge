#!/usr/bin/env node

const CDP = require('chrome-remote-interface');

async function reloadExtension() {
  let client;

  try {
    console.log('Connecting to Chrome DevTools Protocol...');
    client = await CDP({ port: 9222 });

    const { Extensions } = client;

    console.log('Getting installed extensions...');

    // Enable Extensions domain
    await Extensions.enable?.() || Promise.resolve();

    // Get list of extensions
    const targets = await CDP.List({ port: 9222 });

    // Find our extension
    const extensionTarget = targets.find(t =>
      t.title && t.title.includes('ChatGPT CLI Bridge')
    );

    if (!extensionTarget) {
      console.log('Extension not found. Available targets:');
      targets.forEach(t => console.log(`  - ${t.title || t.type} (${t.url})`));
      console.log('\nMake sure Chrome was launched with: npm run launch');
      process.exit(1);
    }

    console.log(`Found extension: ${extensionTarget.title}`);
    console.log(`Extension ID: ${extensionTarget.id}`);

    // Extract extension ID from URL (format: chrome-extension://ID/...)
    const match = extensionTarget.url.match(/chrome-extension:\/\/([a-z]+)\//);
    const extensionId = match ? match[1] : null;

    if (!extensionId) {
      console.error('Could not extract extension ID');
      process.exit(1);
    }

    // Connect to the extension's service worker or background page
    const extensionClient = await CDP({
      port: 9222,
      target: extensionTarget.id
    });

    const { Runtime } = extensionClient;

    console.log('Reloading extension...');

    // Execute chrome.runtime.reload() in the extension context
    await Runtime.evaluate({
      expression: 'chrome.runtime.reload()',
      awaitPromise: true
    });

    console.log('Extension reloaded successfully!');

    await extensionClient.close();

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('Error: Could not connect to Chrome.');
      console.error('Make sure Chrome is running with remote debugging:');
      console.error('  npm run launch');
    } else {
      console.error('Error reloading extension:', error.message);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

reloadExtension();
