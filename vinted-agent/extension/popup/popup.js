const $ = (id) => document.getElementById(id);

const licenseInput   = $("license-key");
const validateBtn    = $("validate-btn");
const statusDot      = $("status-dot");
const statusText     = $("status-text");
const minRatioInput  = $("min-price-ratio");
const minRatioLabel  = $("min-price-label");
const styleSelect    = $("style");
const languageSelect = $("language");
const autoSendCheck  = $("auto-send");
const activeCheck    = $("active");
const saveBtn        = $("save-btn");
const saveMsg        = $("save-msg");

// Load saved settings on open
chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => {
  if (settings.licenseKey) {
    licenseInput.value = settings.licenseKey;
    checkLicenseStatus(settings.licenseKey);
  } else {
    setStatus("inactive", "Aucune licence configurée");
  }

  if (settings.minPriceRatio) {
    minRatioInput.value = Math.round(settings.minPriceRatio * 100);
    minRatioLabel.textContent = `${Math.round(settings.minPriceRatio * 100)}%`;
  }
  if (settings.style)    styleSelect.value    = settings.style;
  if (settings.language) languageSelect.value = settings.language;
  if (settings.autoSend !== undefined) autoSendCheck.checked = settings.autoSend;
  if (settings.active   !== undefined) activeCheck.checked   = settings.active;
});

// Range label update
minRatioInput.addEventListener("input", () => {
  minRatioLabel.textContent = `${minRatioInput.value}%`;
});

// Validate license key
validateBtn.addEventListener("click", () => {
  const key = licenseInput.value.trim();
  if (!key) return;
  setStatus("checking", "Vérification…");
  chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE", licenseKey: key }, (res) => {
    if (res && res.valid) {
      setStatus("active", `Licence valide • ${res.plan || "Standard"}`);
      chrome.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        settings: { licenseKey: key },
      });
    } else {
      setStatus("inactive", res?.error || "Licence invalide");
    }
  });
});

// Save all settings
saveBtn.addEventListener("click", () => {
  const settings = {
    licenseKey:    licenseInput.value.trim(),
    minPriceRatio: parseInt(minRatioInput.value, 10) / 100,
    style:         styleSelect.value,
    language:      languageSelect.value,
    autoSend:      autoSendCheck.checked,
    active:        activeCheck.checked,
  };

  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings }, () => {
    saveMsg.textContent = "✓ Sauvegardé !";
    setTimeout(() => { saveMsg.textContent = ""; }, 2500);
  });
});

function checkLicenseStatus(key) {
  setStatus("checking", "Vérification…");
  chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE", licenseKey: key }, (res) => {
    if (res && res.valid) {
      setStatus("active", `Licence valide • ${res.plan || "Standard"}`);
    } else {
      setStatus("inactive", "Licence expirée ou invalide");
    }
  });
}

function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}
