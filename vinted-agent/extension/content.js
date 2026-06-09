// Injected into Vinted pages – reads conversations and injects the VintBot UI

(function () {
  "use strict";

  let lastConversationId = null;
  let vintbotOverlay = null;
  let isProcessing = false;

  // --- Entry point ---
  init();

  function init() {
    observeUrlChanges();
    tryInjectOnCurrentPage();
  }

  // Detect SPA navigation (Vinted is a React SPA)
  function observeUrlChanges() {
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(tryInjectOnCurrentPage, 800);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function tryInjectOnCurrentPage() {
    if (!isConversationPage()) return;
    waitForMessagesContainer().then(() => {
      injectVintBotButton();
      observeNewMessages();
    });
  }

  function isConversationPage() {
    return /\/(inbox|messages|conversations)/.test(location.pathname);
  }

  // Wait until Vinted has rendered the message list
  function waitForMessagesContainer(timeout = 8000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const container = findMessagesContainer();
        if (container) {
          clearInterval(interval);
          resolve(container);
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject(new Error("timeout"));
        }
      }, 300);
    });
  }

  function findMessagesContainer() {
    // Vinted uses data-testid attributes – try common selectors
    return (
      document.querySelector("[data-testid='inbox-message-list']") ||
      document.querySelector(".c-inbox__message-list") ||
      document.querySelector("[class*='message-list']") ||
      document.querySelector("[class*='inbox']")
    );
  }

  function findMessageInput() {
    return (
      document.querySelector("[data-testid='message-input']") ||
      document.querySelector("textarea[placeholder*='message']") ||
      document.querySelector("textarea[name='body']") ||
      document.querySelector(".c-message-input textarea") ||
      document.querySelector("[class*='message-input'] textarea") ||
      document.querySelector("textarea")
    );
  }

  function findSendButton() {
    return (
      document.querySelector("[data-testid='send-message-button']") ||
      document.querySelector("button[type='submit'][class*='send']") ||
      document.querySelector("[class*='send-button']")
    );
  }

  // --- VintBot floating button ---
  function injectVintBotButton() {
    if (document.getElementById("vintbot-btn")) return;

    const btn = document.createElement("button");
    btn.id = "vintbot-btn";
    btn.className = "vintbot-fab";
    btn.innerHTML = `<span class="vintbot-fab-icon">🤖</span><span class="vintbot-fab-label">VintBot</span>`;
    btn.title = "Laisser VintBot répondre à ta place";
    btn.addEventListener("click", onVintBotClick);
    document.body.appendChild(btn);
  }

  // Observe DOM for new incoming messages and auto-respond if enabled
  function observeNewMessages() {
    const container = findMessagesContainer();
    if (!container) return;

    const msgObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          // Check if this looks like a new buyer message (not the seller's own)
          if (isIncomingBuyerMessage(node)) {
            handleIncomingMessage();
            return;
          }
        }
      }
    });

    msgObserver.observe(container, { childList: true, subtree: true });
  }

  function isIncomingBuyerMessage(node) {
    const text = node.textContent || "";
    // Vinted marks received messages differently than sent ones
    const isReceived =
      node.classList.contains("c-message--received") ||
      node.getAttribute("data-from") === "buyer" ||
      node.querySelector("[class*='received']") !== null ||
      node.querySelector("[class*='incoming']") !== null;
    return isReceived && text.trim().length > 0;
  }

  async function handleIncomingMessage() {
    const autoSend = await getSettingValue("autoSend");
    if (!autoSend) return; // manual mode – user triggers via button
    const active = await getSettingValue("active");
    if (!active) return;
    triggerNegotiation(true);
  }

  async function onVintBotClick() {
    if (isProcessing) return;
    triggerNegotiation(false);
  }

  async function triggerNegotiation(isAuto) {
    if (isProcessing) return;
    isProcessing = true;
    showOverlay("thinking");

    try {
      const context = extractConversationContext();
      if (!context) {
        showOverlay("error", "Impossible de lire la conversation. Ouvre un chat Vinted.");
        return;
      }

      const result = await sendToBackground("NEGOTIATE", context);

      if (result.error) {
        showOverlay("error", result.error);
        return;
      }

      if (isAuto && result.autoApproved) {
        insertAndSendMessage(result.reply);
        hideOverlay();
      } else {
        showOverlay("ready", result);
      }
    } catch (err) {
      showOverlay("error", err.message);
    } finally {
      isProcessing = false;
    }
  }

  // --- Conversation context extraction ---
  function extractConversationContext() {
    const messages = extractMessages();
    if (!messages || messages.length === 0) return null;

    const itemInfo = extractItemInfo();
    const conversationId = extractConversationId();

    return {
      conversationId,
      messages,
      item: itemInfo,
      pageUrl: location.href,
    };
  }

  function extractMessages() {
    const selectors = [
      "[data-testid='message-bubble']",
      ".c-message__content",
      "[class*='message-bubble']",
      "[class*='message-content']",
      "[class*='chat-message']",
    ];

    let messageNodes = [];
    for (const sel of selectors) {
      messageNodes = Array.from(document.querySelectorAll(sel));
      if (messageNodes.length > 0) break;
    }

    if (messageNodes.length === 0) {
      // Fallback: grab all text-bearing elements in the message list
      const container = findMessagesContainer();
      if (!container) return [];
      messageNodes = Array.from(container.querySelectorAll("p, span, div")).filter(
        (el) => el.children.length === 0 && el.textContent.trim().length > 5
      );
    }

    return messageNodes.slice(-20).map((node) => {
      const isSeller =
        node.closest("[class*='sent']") !== null ||
        node.closest("[class*='outgoing']") !== null ||
        node.closest("[data-from='seller']") !== null;
      return {
        role: isSeller ? "seller" : "buyer",
        text: node.textContent.trim(),
      };
    });
  }

  function extractItemInfo() {
    // Vinted shows the item card at the top of the conversation
    const titleEl =
      document.querySelector("[data-testid='item-title']") ||
      document.querySelector("[class*='item-title']") ||
      document.querySelector("[class*='transaction-title']") ||
      document.querySelector("h2, h3");

    const priceEl =
      document.querySelector("[data-testid='item-price']") ||
      document.querySelector("[class*='item-price']") ||
      document.querySelector("[class*='price']");

    const price = priceEl ? parsePriceFromText(priceEl.textContent) : null;

    return {
      title: titleEl ? titleEl.textContent.trim() : "Article Vinted",
      listedPrice: price,
    };
  }

  function parsePriceFromText(text) {
    const match = text.match(/[\d,\.]+/);
    if (!match) return null;
    return parseFloat(match[0].replace(",", "."));
  }

  function extractConversationId() {
    const match = location.pathname.match(/\/(\d+)/);
    return match ? match[1] : null;
  }

  // --- Message insertion ---
  function insertAndSendMessage(text) {
    const input = findMessageInput();
    if (!input) return;

    // React-friendly value setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    nativeInputValueSetter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    setTimeout(() => {
      const sendBtn = findSendButton();
      if (sendBtn) {
        sendBtn.click();
      }
    }, 300);
  }

  // --- Overlay UI ---
  function showOverlay(state, data) {
    removeOverlay();

    const overlay = document.createElement("div");
    overlay.id = "vintbot-overlay";
    overlay.className = `vintbot-overlay vintbot-overlay--${state}`;

    if (state === "thinking") {
      overlay.innerHTML = `
        <div class="vintbot-card">
          <div class="vintbot-header">
            <span class="vintbot-logo">🤖 VintBot</span>
          </div>
          <div class="vintbot-body">
            <div class="vintbot-spinner"></div>
            <p>Analyse de la conversation…</p>
          </div>
        </div>`;
    } else if (state === "ready") {
      const { reply, reasoning, offerAnalysis } = data;
      overlay.innerHTML = `
        <div class="vintbot-card">
          <div class="vintbot-header">
            <span class="vintbot-logo">🤖 VintBot</span>
            <button class="vintbot-close" id="vintbot-close">✕</button>
          </div>
          ${offerAnalysis ? `<div class="vintbot-analysis">${escapeHtml(offerAnalysis)}</div>` : ""}
          ${reasoning ? `<div class="vintbot-reasoning"><strong>Stratégie :</strong> ${escapeHtml(reasoning)}</div>` : ""}
          <div class="vintbot-body">
            <label class="vintbot-label">Réponse suggérée :</label>
            <textarea class="vintbot-reply-text" id="vintbot-reply-text">${escapeHtml(reply)}</textarea>
          </div>
          <div class="vintbot-actions">
            <button class="vintbot-btn vintbot-btn--send" id="vintbot-send">Envoyer ✓</button>
            <button class="vintbot-btn vintbot-btn--edit" id="vintbot-edit">Modifier</button>
            <button class="vintbot-btn vintbot-btn--cancel" id="vintbot-cancel">Ignorer</button>
          </div>
        </div>`;
    } else if (state === "error") {
      overlay.innerHTML = `
        <div class="vintbot-card vintbot-card--error">
          <div class="vintbot-header">
            <span class="vintbot-logo">🤖 VintBot</span>
            <button class="vintbot-close" id="vintbot-close">✕</button>
          </div>
          <div class="vintbot-body">
            <p class="vintbot-error-msg">⚠️ ${escapeHtml(data)}</p>
          </div>
          <div class="vintbot-actions">
            <button class="vintbot-btn vintbot-btn--cancel" id="vintbot-cancel">Fermer</button>
          </div>
        </div>`;
    }

    document.body.appendChild(overlay);
    vintbotOverlay = overlay;

    // Wire up buttons
    overlay.querySelector("#vintbot-close")?.addEventListener("click", hideOverlay);
    overlay.querySelector("#vintbot-cancel")?.addEventListener("click", hideOverlay);

    const sendBtn = overlay.querySelector("#vintbot-send");
    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        const text = overlay.querySelector("#vintbot-reply-text").value.trim();
        if (text) {
          insertAndSendMessage(text);
          hideOverlay();
        }
      });
    }

    const editBtn = overlay.querySelector("#vintbot-edit");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        const textarea = overlay.querySelector("#vintbot-reply-text");
        const input = findMessageInput();
        if (textarea && input) {
          insertAndSendMessage(textarea.value);
          hideOverlay();
        }
      });
    }
  }

  function hideOverlay() {
    removeOverlay();
    isProcessing = false;
  }

  function removeOverlay() {
    if (vintbotOverlay) {
      vintbotOverlay.remove();
      vintbotOverlay = null;
    }
    const existing = document.getElementById("vintbot-overlay");
    if (existing) existing.remove();
  }

  // --- Helpers ---
  function sendToBackground(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function getSettingValue(key) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([key], (result) => resolve(result[key]));
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
