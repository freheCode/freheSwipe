/**
 * freheSwipe - Touchscreen Swipe Navigation
 * Copyright (C) 2025 freheCode
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadPopup() {
  // Display version from manifest
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version').textContent = `v${manifest.version}`;

  const tab = await getCurrentTab();
  
  // ✅ Validate tab and URL
  if (!tab || !tab.url) {
    showUnsupportedPage("No active tab found");
    return;
  }

  let host;
  let isSpecialPage = false;

  try {
    const url = new URL(tab.url);
    
    // Check for browser special pages
    const specialProtocols = ['chrome:', 'about:', 'moz-extension:', 'chrome-extension:', 'edge:', 'file:'];
    if (specialProtocols.some(proto => tab.url.startsWith(proto))) {
      isSpecialPage = true;
      showUnsupportedPage(tab.url);
      return;
    }
    
    host = url.hostname;
    
    // Handle empty hostname (e.g., data: URLs)
    if (!host) {
      isSpecialPage = true;
      showUnsupportedPage(tab.url);
      return;
    }
    
  } catch (error) {
    console.error("Invalid URL:", tab.url, error);
    showUnsupportedPage(tab.url);
    return;
  }

  document.getElementById("hostname").textContent = host;

  // --- Load full configuration (includes siteRules from options)
  const { config = {} } = await chrome.storage.local.get("config");
  const cfg = Object.assign(
    {
      enabled: true,
      gestures: { back: true, forward: true, reload: true, up: true },
      siteRules: {}, // <-- ensure key exists
    },
    config
  );

  const enabledChk = document.getElementById("global-enabled");
  const siteBtn = document.getElementById("site-toggle");
  enabledChk.checked = cfg.enabled;

  // If siteRule exists and .enabled === false => disabled
  const siteRule = cfg.siteRules[host] ?? {
    enabled: true,
    back: true,
    forward: true,
    reload: true,
    up: true,
  };
  let disabled = siteRule.enabled === false;

  updateStatus(disabled, cfg.enabled);

  // ---- Global toggle
  enabledChk.addEventListener("change", async () => {
    cfg.enabled = enabledChk.checked;
    await chrome.storage.local.set({ config: cfg });
    sendCmd({ action: "toggle-global", value: cfg.enabled });
    updateStatus(disabled, cfg.enabled);
  });

  // ---- Site toggle
  siteBtn.addEventListener("click", async () => {
    disabled = !disabled;
    // make sure the host exists in rules
    if (!cfg.siteRules[host])
      cfg.siteRules[host] = {
        enabled: true,
        back: true,
        forward: true,
        reload: true,
        up: true,
      };

    cfg.siteRules[host].enabled = !disabled; // reverse: disabled→enabled= false→true
    await chrome.storage.local.set({ config: cfg });
    sendCmd({ action: "reload-config" });
    updateStatus(disabled, cfg.enabled);
    window.close();
  });

  // ---- Open settings
  document.getElementById("open-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

// ✅ NEW: Show friendly message for unsupported pages
function showUnsupportedPage(url) {
  const st = document.getElementById("status");
  const hostnameEl = document.getElementById("hostname");
  const enabledChk = document.getElementById("global-enabled");
  const siteBtn = document.getElementById("site-toggle");

  // Detect page type
  let pageType = "Special page";
  if (url.startsWith("chrome://")) pageType = "Chrome internal page";
  else if (url.startsWith("edge://")) pageType = "Edge internal page";
  else if (url.startsWith("about:")) pageType = "Browser settings page";
  else if (url.startsWith("moz-extension://") || url.startsWith("chrome-extension://")) 
    pageType = "Extension page";
  else if (url.startsWith("file://")) pageType = "Local file";

  hostnameEl.textContent = pageType;
  hostnameEl.style.color = "#999";
  hostnameEl.style.fontStyle = "italic";

  st.textContent = "⚠️ Gestures not available on this page";
  st.style.color = "orange";

  // Disable site-specific controls
  siteBtn.disabled = true;
  siteBtn.style.opacity = 0.5;
  siteBtn.textContent = "Not available";

  // Keep global toggle enabled
  enabledChk.disabled = false;

  // Still allow opening settings
  document.getElementById("open-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Load and display global state
  chrome.storage.local.get("config").then(({ config = {} }) => {
    enabledChk.checked = config.enabled ?? true;
    
    enabledChk.addEventListener("change", async () => {
      config.enabled = enabledChk.checked;
      await chrome.storage.local.set({ config });
      sendCmd({ action: "toggle-global", value: config.enabled });
    });
  });
}

function sendCmd(data) {
  chrome.runtime.sendMessage({ ...data, to: "background" });
}

function updateStatus(disabled, globallyEnabled) {
  const st = document.getElementById("status");
  const btn = document.getElementById("site-toggle");

  if (!globallyEnabled) {
    st.textContent = "Gestures globally disabled ⚙️";
    st.style.color = "gray";
    btn.disabled = true;
    btn.style.opacity = 0.6;
  } else {
    btn.disabled = false;
    btn.style.opacity = 1;
    if (disabled) {
      st.textContent = "Gestures off on this site 🚫";
      st.style.color = "tomato";
      btn.textContent = "Enable on this site";
    } else {
      st.textContent = "Gestures active ✅";
      st.style.color = "mediumseagreen";
      btn.textContent = "Disable on this site";
    }
  }
}

document.addEventListener("DOMContentLoaded", loadPopup);
