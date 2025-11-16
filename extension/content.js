// ChatGPT CLI Bridge - Content Script
// Monitors ChatGPT's DOM and streams responses to the WebSocket server

const WS_URL = "ws://localhost:8080";
let ws = null;
let isConnected = false;
let currentResponseText = "";
let observer = null;
let responseTimeout = null;
const DEBUG_TEXT_LIMIT = 200;

function normalizeNodeText(text = "") {
  return text.replace(/\s+/g, " ").trim().slice(0, DEBUG_TEXT_LIMIT);
}

function serializeNode(node) {
  if (!node) {
    return { kind: "unknown" };
  }

  const nodeType = node.nodeType;

  if (nodeType === Node.TEXT_NODE) {
    return {
      kind: "text",
      nodeType,
      text: normalizeNodeText(node.textContent || ""),
    };
  }

  if (nodeType === Node.ELEMENT_NODE) {
    const el = node;
    const attributes = {};
    if (el.attributes) {
      Array.from(el.attributes).forEach((attr) => {
        attributes[attr.name] = attr.value;
      });
    }

    return {
      kind: "element",
      nodeType,
      tag: el.tagName ? el.tagName.toLowerCase() : undefined,
      id: el.id || undefined,
      classes: el.classList ? Array.from(el.classList) : undefined,
      text: normalizeNodeText(el.innerText || el.textContent || ""),
      attributes: Object.keys(attributes).length ? attributes : undefined,
      childCount: el.childNodes ? el.childNodes.length : 0,
    };
  }

  return {
    kind: "node",
    nodeType,
    text: normalizeNodeText(node.textContent || ""),
  };
}

function describeSerializedNode(info) {
  if (!info) return "unknown node";

  if (info.kind === "text") {
    return info.text ? `Text: "${info.text}"` : "Empty text node";
  }

  if (info.kind === "element") {
    const idPart = info.id ? `#${info.id}` : "";
    const classPart = info.classes
      ? info.classes.map((cls) => `.${cls}`).join("")
      : "";
    const tag = info.tag || "element";
    const descriptor = `<${tag}${idPart}${classPart}>`;
    return info.text ? `${descriptor} "${info.text}"` : descriptor;
  }

  return `Node type ${info.nodeType}`;
}

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
    // Check mutations for Copy button being added (indicates completion)
    let foundCopyButton = false;

    for (const m of mutations) {
      // Check the mutation target and its descendants for Copy button
      if (m.target && m.target.nodeType === Node.ELEMENT_NODE) {
        const targetElement = m.target;

        // Check if target itself is a Copy button
        if (targetElement.tagName === 'BUTTON' && targetElement.getAttribute('aria-label') === 'Copy') {
          foundCopyButton = true;
          console.log('[ChatGPT CLI Bridge] Copy button detected in mutation target!');
        }

        // Check if target contains a Copy button
        if (!foundCopyButton && targetElement.querySelector) {
          const copyBtn = targetElement.querySelector('button[aria-label="Copy"]');
          if (copyBtn) {
            foundCopyButton = true;
            console.log('[ChatGPT CLI Bridge] Copy button found in mutation target descendants!');
          }
        }
      }

      // Also check added nodes
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BUTTON' && node.getAttribute('aria-label') === 'Copy') {
            foundCopyButton = true;
            console.log('[ChatGPT CLI Bridge] Copy button detected in addedNodes!');
          } else if (node.querySelector) {
            const copyBtn = node.querySelector('button[aria-label="Copy"]');
            if (copyBtn) {
              foundCopyButton = true;
              console.log('[ChatGPT CLI Bridge] Copy button found in added node descendants!');
            }
          }
        }

        if (isConnected && ws.readyState === WebSocket.OPEN) {
          const nodeInfo = serializeNode(node);
          ws.send(
            JSON.stringify({
              type: "debug",
              text: describeSerializedNode(nodeInfo),
              node: nodeInfo,
              done: false,
            }),
          );
        }

        if (foundCopyButton) break;
      }
      if (foundCopyButton) break;
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

    const hasActionButtons = foundCopyButton;

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
            done: hasActionButtons,
          }),
        );
      }

      if (hasActionButtons) {
        console.log(
          "[ChatGPT CLI Bridge] Response complete (Copy button detected in mutations)",
        );
      }
    } else if (hasActionButtons && currentResponseText.length > 0) {
      // Copy button appeared but no new text - send final done signal
      console.log('[ChatGPT CLI Bridge] Copy button detected but no new text - sending done signal');
      if (isConnected && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "chunk",
            text: "",
            done: true,
          }),
        );
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
