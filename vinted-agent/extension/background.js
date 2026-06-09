// Service worker – manages license validation and alarm-based polling

const BACKEND_URL = "https://vintbot-api.onrender.com"; // swap to your deployed URL

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "NEGOTIATE") {
    handleNegotiate(msg.payload).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async response
  }

  if (msg.type === "VALIDATE_LICENSE") {
    validateLicense(msg.licenseKey).then(sendResponse).catch((err) => {
      sendResponse({ valid: false, error: err.message });
    });
    return true;
  }

  if (msg.type === "SAVE_SETTINGS") {
    chrome.storage.sync.set(msg.settings, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_SETTINGS") {
    chrome.storage.sync.get(
      ["licenseKey", "minPriceRatio", "style", "language", "autoSend", "active"],
      (settings) => sendResponse(settings)
    );
    return true;
  }
});

async function handleNegotiate(payload) {
  const settings = await getSettings();

  if (!settings.licenseKey) throw new Error("Clé de licence manquante");
  if (!settings.active) throw new Error("Agent désactivé");

  const response = await fetch(`${BACKEND_URL}/api/negotiate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-license-key": settings.licenseKey,
    },
    body: JSON.stringify({
      ...payload,
      sellerSettings: {
        minPriceRatio: settings.minPriceRatio ?? 0.8,
        style: settings.style ?? "friendly",
        language: settings.language ?? "fr",
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(err.message || "Erreur API");
  }

  return response.json();
}

async function validateLicense(licenseKey) {
  const response = await fetch(`${BACKEND_URL}/api/license/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey }),
  });
  return response.json();
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ["licenseKey", "minPriceRatio", "style", "language", "autoSend", "active"],
      resolve
    );
  });
}
