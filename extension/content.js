// ChatGPT CLI Bridge - Content Script
// Monitors ChatGPT's DOM and streams responses to the WebSocket server

const WS_URL = "ws://localhost:8080";
let ws = null;
let isConnected = false;
let currentResponseText = "";
let observer = null;
let responseTimeout = null;

// Connect to WebSocket server
function connect() {
  console.log("[ChatGPT CLI Bridge] Connecting to server...");

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[ChatGPT CLI Bridge] Connected to server");
    isConnected = true;

    // Identify as extension
    ws.send(
      JSON.stringify({
        type: "identify",
        client: "extension",
      }),
    );

    // Notify that extension is ready
    ws.send(
      JSON.stringify({
        type: "ready",
        text: "Extension connected and ready",
      }),
    );

    // Start monitoring for responses
    startMonitoring();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === "query") {
        console.log("[ChatGPT CLI Bridge] Received query:", message.text);
        sendQuery(message.text);
      }
    } catch (error) {
      console.error("[ChatGPT CLI Bridge] Error processing message:", error);
    }
  };

  ws.onclose = () => {
    console.log("[ChatGPT CLI Bridge] Disconnected from server");
    isConnected = false;

    // Try to reconnect after 3 seconds
    setTimeout(connect, 3000);
  };

  ws.onerror = (error) => {
    console.error("[ChatGPT CLI Bridge] WebSocket error:", error);
  };
}

// Send a query to ChatGPT
function sendQuery(text) {
  // Check if ChatGPT is already generating a response
  const buttons = Array.from(document.querySelectorAll("button"));
  const stopButton = buttons.find((btn) => {
    const ariaLabel = btn.getAttribute("aria-label") || "";
    return ariaLabel.toLowerCase().includes("stop");
  });

  if (stopButton) {
    console.log(
      "[ChatGPT CLI Bridge] ChatGPT is busy generating. Stopping current generation first...",
    );
    stopButton.click();

    // Wait a bit for the stop to take effect, then try again
    setTimeout(() => sendQuery(text), 1000);
    return;
  }

  // Find the contenteditable div (ProseMirror editor)
  const editor = document.querySelector(
    'div[contenteditable="true"]#prompt-textarea, div[contenteditable="true"]',
  );

  if (!editor) {
    sendError("Could not find ChatGPT input editor");
    return;
  }

  console.log("[ChatGPT CLI Bridge] Found editor, setting text...");

  // Clear current response tracking and update message count
  currentResponseText = "";

  // Clear any existing completion check interval
  if (completionCheckInterval) {
    clearInterval(completionCheckInterval);
    completionCheckInterval = null;
  }

  // Count current messages before sending new query
  const currentMessages = document.querySelectorAll(
    '[data-message-author-role="assistant"]',
  );
  messageCountBeforeQuery = currentMessages.length;

  // Set the text content using execCommand (works better with contenteditable)
  editor.focus();

  // Clear existing content
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);

  // Insert the text using execCommand
  document.execCommand("insertText", false, text);

  console.log(
    "[ChatGPT CLI Bridge] Text set, waiting for send button to appear...",
  );

  // Wait for the UI to transform voice button into send button
  setTimeout(() => {
    // Wait for send button to appear and become enabled
    let attempts = 0;
    const maxAttempts = 20;

    const checkButton = setInterval(() => {
      attempts++;

      console.log(
        `[ChatGPT CLI Bridge] Checking for button (attempt ${attempts})...`,
      );

      // Look for the send button (transforms from voice button after text is entered)
      const buttons = Array.from(document.querySelectorAll("button"));
      const sendButton = buttons.find((btn) => {
        const ariaLabel = btn.getAttribute("aria-label") || "";
        const dataTestId = btn.getAttribute("data-testid") || "";

        // Send button typically has:
        // - aria-label containing "Send" or "Submit"
        // - data-testid containing "send"
        // - NOT containing "voice", "microphone", "audio"
        const isSendButton =
          ariaLabel.toLowerCase().includes("send") ||
          ariaLabel.toLowerCase().includes("submit") ||
          dataTestId.toLowerCase().includes("send");

        const isNotVoiceButton = !(
          ariaLabel.toLowerCase().includes("voice") ||
          ariaLabel.toLowerCase().includes("microphone") ||
          ariaLabel.toLowerCase().includes("audio")
        );

        const isEnabled = !btn.disabled;
        const hasIcon = btn.querySelector("svg");

        return isSendButton && isNotVoiceButton && isEnabled && hasIcon;
      });

      // Also check if we're already in a loading/waiting state (button was clicked but we missed it)
      const isLoading = document.querySelector(
        '[class*="loading"], [class*="generating"], [data-testid*="loading"]',
      );
      const stopButton = buttons.find((btn) => {
        const ariaLabel = btn.getAttribute("aria-label") || "";
        return ariaLabel.toLowerCase().includes("stop");
      });

      if (sendButton) {
        clearInterval(checkButton);
        console.log("[ChatGPT CLI Bridge] Found send button, clicking...");
        sendButton.click();
        console.log("[ChatGPT CLI Bridge] Query sent, waiting for response...");

        // Start timeout - if no response in 10 seconds, check if ChatGPT is still processing
        let timeoutAttempts = 0;
        const checkTimeout = () => {
          timeoutAttempts++;

          // Check if there's a loading indicator (growing/shrinking circle)
          const loadingIndicators = document.querySelectorAll(
            '[class*="loading"], [class*="spinner"], [class*="animate"], svg[class*="animate"]',
          );
          const isProcessing =
            loadingIndicators.length > 0 ||
            document.querySelector('button[aria-label*="Stop"]') !== null;

          if (isProcessing && timeoutAttempts < 6) {
            // Still processing, wait another 10 seconds (up to 60 seconds total)
            console.log(
              `[ChatGPT CLI Bridge] ChatGPT still processing, waiting... (${timeoutAttempts * 10}s)`,
            );
            responseTimeout = setTimeout(checkTimeout, 10000);
          } else if (!isProcessing || timeoutAttempts >= 6) {
            // No loading indicator or timeout reached, stop
            console.log(
              "[ChatGPT CLI Bridge] ChatGPT stuck or timeout reached, stopping generation...",
            );

            // Click stop button if it exists
            const buttons = Array.from(document.querySelectorAll("button"));
            const stopBtn = buttons.find((btn) => {
              const ariaLabel = btn.getAttribute("aria-label") || "";
              return ariaLabel.toLowerCase().includes("stop");
            });

            if (stopBtn) {
              stopBtn.click();
            }

            // Clear text box
            const editorToClear = document.querySelector(
              'div[contenteditable="true"]#prompt-textarea, div[contenteditable="true"]',
            );
            if (editorToClear) {
              editorToClear.innerHTML = "";
              editorToClear.blur();
            }

            sendError(
              `ChatGPT did not respond within ${timeoutAttempts * 10} seconds. Refreshing page...`,
            );

            // Refresh the page after a short delay
            setTimeout(() => {
              console.log("[ChatGPT CLI Bridge] Refreshing page...");
              window.location.reload();
            }, 1000);
          }
        };

        responseTimeout = setTimeout(checkTimeout, 10000);

        // Notify CLI that we're waiting
        if (isConnected && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "status",
              text: "Query sent, waiting for ChatGPT response...",
            }),
          );
        }
      } else if (stopButton || isLoading) {
        clearInterval(checkButton);
        console.log(
          "[ChatGPT CLI Bridge] Query already sent, ChatGPT is generating response...",
        );

        // Notify CLI that we're waiting
        if (isConnected && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "status",
              text: "Waiting for ChatGPT response...",
            }),
          );
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(checkButton);

        console.log(
          "[ChatGPT CLI Bridge] Could not find send button, clearing text box...",
        );

        // Clear the text box - re-query the editor in case it changed
        const editorToClear = document.querySelector(
          'div[contenteditable="true"]#prompt-textarea, div[contenteditable="true"]',
        );
        if (editorToClear) {
          editorToClear.innerHTML = "";
          editorToClear.blur();
        }

        sendError(
          "Could not find send button after " +
            maxAttempts +
            " attempts. Text box cleared. Please try again.",
        );

        // Debug info
        console.log("[ChatGPT CLI Bridge] Available buttons:", buttons.length);
        buttons.forEach((btn, i) => {
          console.log(`  Button ${i}:`, {
            disabled: btn.disabled,
            text: btn.textContent.trim().substring(0, 30),
            hasIcon: !!btn.querySelector("svg"),
            ariaLabel: btn.getAttribute("aria-label"),
          });
        });
      }
    }, 150);
  }, 500); // Wait 500ms for UI to transform voice button to send button
}

// Monitor for ChatGPT's streaming responses
let messageCountBeforeQuery = 0;
let completionCheckInterval = null;

function startMonitoring() {
  console.log("[ChatGPT CLI Bridge] Starting DOM monitoring...");

  // Wait for the main content area to be available
  const checkInterval = setInterval(() => {
    // Look for the main conversation container
    const container = document.querySelector(
      'main, [class*="conversation"], [role="main"]',
    );

    if (container) {
      clearInterval(checkInterval);

      // Count existing messages
      const existingMessages = document.querySelectorAll(
        '[data-message-author-role="assistant"]',
      );
      messageCountBeforeQuery = existingMessages.length;

      setupObserver(container);
      console.log("[ChatGPT CLI Bridge] Monitoring started");
    }
  }, 500);
}

// Check if response is complete by looking for Copy/Share buttons
function checkCompletion() {
  const messages = document.querySelectorAll(
    '[data-message-author-role="assistant"]',
  );

  // Only check if we have new messages
  if (messages.length <= messageCountBeforeQuery) return false;

  const latestMessage = messages[messages.length - 1];

  // The Copy/Share buttons are not inside the message element itself,
  // they're in a sibling container within the same parent article/div
  // So we need to go up to find the common parent
  let parent = latestMessage.parentElement;
  while (parent && parent.tagName !== "ARTICLE") {
    parent = parent.parentElement;
  }

  if (!parent) return false;

  // Now search for Copy/Share buttons in this parent container
  const copyButton = parent.querySelector('button[aria-label="Copy"]');
  const shareButton = parent.querySelector('button[aria-label*="Share"]');

  // return copyButton !== null || shareButton !== null;
  return false;
}

// Setup MutationObserver to watch for response changes
function setupObserver(container) {
  // Disconnect existing observer if any
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (isConnected && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "debug",
              text: node,
              done: false,
            }),
          );
        }
      }
    }

    // Find all assistant messages
    const messages = document.querySelectorAll(
      '[data-message-author-role="assistant"]',
    );

    // Only process if we have MORE messages than before the query was sent
    if (messages.length <= messageCountBeforeQuery) return;

    // Get the NEWEST message (the one we just triggered)
    const latestMessage = messages[messages.length - 1];

    // Get only the message content, excluding action buttons
    // Look for the actual message content container, not the whole message wrapper
    const messageContent =
      latestMessage.querySelector(
        '[class*="markdown"], [class*="message"], [data-message-id]',
      ) || latestMessage;

    // Clone the element to remove buttons before getting text
    const contentClone = messageContent.cloneNode(true);

    // Remove all buttons from the clone
    contentClone.querySelectorAll("button").forEach((btn) => btn.remove());

    // Get text from the cleaned content
    const messageText = contentClone.innerText || contentClone.textContent;

    // Check if Copy/Share buttons are present (indicates response is complete)
    const copyButton = latestMessage.querySelector(
      'button[aria-label*="Copy"], button[title*="Copy"]',
    );
    const shareButton = latestMessage.querySelector(
      'button[aria-label*="Share"], button[title*="Share"]',
    );
    const hasActionButtons = copyButton !== null || shareButton !== null;

    // Only send if text has changed
    if (messageText !== currentResponseText) {
      const newContent = messageText.substring(currentResponseText.length);
      currentResponseText = messageText;

      // Clear timeout since we received a response
      if (responseTimeout) {
        clearTimeout(responseTimeout);
        responseTimeout = null;
      }

      // // Start polling for completion if not already started
      // if (!completionCheckInterval && newContent.length > 0) {
      //   console.log(
      //     "[ChatGPT CLI Bridge] Starting completion check polling...",
      //   );
      //   completionCheckInterval = setInterval(() => {
      //     if (checkCompletion()) {
      //       console.log("[ChatGPT CLI Bridge] Completion detected by polling!");
      //       clearInterval(completionCheckInterval);
      //       completionCheckInterval = null;

      //       if (isConnected && ws.readyState === WebSocket.OPEN) {
      //         ws.send(
      //           JSON.stringify({
      //             type: "chunk",
      //             text: "",
      //             done: true,
      //           }),
      //         );
      //       }
      //     }
      //   }, 500);
      // }

      if (isConnected && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "chunk",
            text: newContent,
            done: false,
          }),
        );
      }

      if (hasActionButtons) {
        console.log(
          "[ChatGPT CLI Bridge] Response complete (Copy/Share buttons detected)",
        );
        // Clear polling since we're done
        if (completionCheckInterval) {
          clearInterval(completionCheckInterval);
          completionCheckInterval = null;
        }
      }
    }
  });

  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: false,
  });
}

// Send error message to server
function sendError(message) {
  console.error("[ChatGPT CLI Bridge] Error:", message);

  // Clear timeout on error
  if (responseTimeout) {
    clearTimeout(responseTimeout);
    responseTimeout = null;
  }

  if (isConnected && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "error",
        text: message,
      }),
    );
  }
}

// Initialize
console.log("[ChatGPT CLI Bridge] Content script loaded");
connect();
