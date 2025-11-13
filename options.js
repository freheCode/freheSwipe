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

// ------------------------------------------------------------------
// DOM references - Initialize after DOM loads
// ------------------------------------------------------------------
let els = {};

let cfg;
let manifest;
const _hoveredTiles = new Set();

const SENSITIVITY_MAX_THRESHOLD = 0.4; // Corresponds to slider value 1 (least sensitive)
const SENSITIVITY_MIN_THRESHOLD = 0.05; // Corresponds to slider value 100 (most sensitive)
const SENSITIVITY_RANGE = SENSITIVITY_MAX_THRESHOLD - SENSITIVITY_MIN_THRESHOLD;

// ------------------------------------------------------------------
// Initialize DOM elements
// ------------------------------------------------------------------
function initializeElements() {
  els = {
    enabled: document.getElementById("enabled"),
    back: document.getElementById("back"),
    forward: document.getElementById("forward"),
    reload: document.getElementById("reload"),
    up: document.getElementById("up"),
    hRange: document.getElementById("horizontal"),
    vRange: document.getElementById("vertical"),
    colorInp: document.getElementById("accent-color"),
    hVal: document.getElementById("horizontal-val"),
    vVal: document.getElementById("vertical-val"),
    sites: document.getElementById("sites"),
    newDomain: document.getElementById("new-domain"),
    addSite: document.getElementById("add-site"),
    reset: document.getElementById("reset"),
    packGallery: document.getElementById("pack-gallery"),
    themeToggle: document.getElementById("theme-toggle"),
    themeIcon: document.getElementById("theme-icon"),
    themeLabel: document.getElementById("theme-label"),
    themeDesc: document.getElementById("theme-description"),
  };
}

// ------------------------------------------------------------------
// Manifest & settings
// ------------------------------------------------------------------
async function loadManifest() {
  const res = await fetch(
    chrome.runtime.getURL("assets/icons/overlay/packs.json")
  );
  manifest = await res.json();
}

async function restore() {
  await loadManifest();
  const s = await chrome.storage.local.get("config");

  const defaults = {
    enabled: true,
    gestures: { back: true, forward: true, reload: true, up: true },
    sensitivity: { horizontal: 0.296, vertical: 0.296 },
    siteRules: {},
    style: "classic",
    color: "#00A8FF",
    theme: "auto",
  };

  cfg = Object.assign({}, defaults, s.config || {});
  cfg.gestures = Object.assign({}, defaults.gestures, s.config?.gestures);
  cfg.sensitivity = Object.assign(
    {},
    defaults.sensitivity,
    s.config?.sensitivity
  );

  els.enabled.checked = cfg.enabled;
  els.back.checked = cfg.gestures.back;
  els.forward.checked = cfg.gestures.forward;
  els.reload.checked = cfg.gestures.reload;
  els.up.checked = cfg.gestures.up;

  const hThreshold = cfg.sensitivity.horizontal;
  const vThreshold = cfg.sensitivity.vertical;

  // This is the reverse of the formula in save(). It converts a threshold (e.g., 0.1) back to a slider value (e.g., 85).
  // Formula: 1 + (99 * ( (MAX - threshold) / RANGE ))
  const hPct = Math.round(
    1 + 99 * ((SENSITIVITY_MAX_THRESHOLD - hThreshold) / SENSITIVITY_RANGE)
  );
  const vPct = Math.round(
    1 + 99 * ((SENSITIVITY_MAX_THRESHOLD - vThreshold) / SENSITIVITY_RANGE)
  );

  // Clamp values just in case to prevent errors from bad stored data
  const clamp = (val) => Math.max(1, Math.min(100, val));

  els.colorInp.value = cfg.color ?? "#00A8FF";
  els.hRange.value = clamp(hPct);
  els.hVal.textContent = clamp(hPct);
  els.vRange.value = clamp(vPct);
  els.vVal.textContent = clamp(vPct);

  const theme = cfg.theme ?? "auto";
  await updateThemeUI(theme, els.themeIcon, els.themeLabel, els.themeDesc);
  applyTheme(theme);

  renderSites();
  renderPackGallery();
}

// ------------------------------------------------------------------
// Update theme UI elements
// ------------------------------------------------------------------
async function updateThemeUI(theme) {
  await loadThemeIcon(theme, els.themeIcon);
  els.themeLabel.textContent = THEME_CONFIG[theme].label;
  els.themeDesc.textContent = THEME_CONFIG[theme].description;
}

// ------------------------------------------------------------------
// SVG / image loading helpers
// ------------------------------------------------------------------

// NEW & IMPROVED: Dynamically generates SMIL <animate> tags and sets the correct
// initial visual state for the SVG elements to prevent flickering.
function applySmilAnimation(svgString, rules) {
  // Always clean out pre-existing animations first
  const cleanedSvg = svgString.replace(/<animate[\s\S]*?<\/animate>/gi, "");

  if (!rules || rules.length === 0) {
    return cleanedSvg;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanedSvg, "image/svg+xml");
  const svgEl = doc.documentElement;

  if (svgEl.querySelector("parsererror")) {
    console.error("Error parsing SVG string.");
    return svgString; // Return original string on error
  }

  // Find all animatable elements. We assume the order of rules in JSON
  // matches the order of these elements in the SVG.
  const targets = svgEl.querySelectorAll(
    "path, circle, rect, line, polyline, polygon"
  );

  const serializer = new XMLSerializer();
  if (!targets.length) return serializer.serializeToString(svgEl);

  rules.forEach((rule, ruleIndex) => {
    // Find the corresponding SVG element for this animation rule
    const targetElement = targets[ruleIndex];
    if (!targetElement) {
      console.warn(`Animation rule ${ruleIndex} has no matching SVG element.`);
      return;
    }

    // --- THIS IS THE KEY FIX ---
    // If this rule is a stroke-dashoffset animation, we must set the initial
    // state of the path to be "hidden" before the animation starts.
    const attributes = Array.isArray(rule.attributeName)
      ? rule.attributeName
      : [rule.attributeName];
    const dashOffsetIndex = attributes.indexOf("stroke-dashoffset");

    if (dashOffsetIndex !== -1) {
      // The `from` value in the JSON represents the total length of the path.
      const pathLength = Array.isArray(rule.from)
        ? rule.from[dashOffsetIndex]
        : rule.from;
      if (typeof pathLength === "number" && pathLength > 0) {
        targetElement.style.strokeDasharray = pathLength;
        targetElement.style.strokeDashoffset = pathLength;
      }
    }
    // --- END OF FIX ---

    // Now, create and append the <animate> tags as before
    attributes.forEach((attr, i) => {
      const anim = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "animate"
      );
      anim.setAttribute("attributeName", attr);

      const fromValue = Array.isArray(rule.from) ? rule.from[i] : rule.from;
      const toValue = Array.isArray(rule.to) ? rule.to[i] : rule.to;
      const durValue = Array.isArray(rule.dur) ? rule.dur[i] : rule.dur;
      const beginValue = Array.isArray(rule.begin) ? rule.begin[i] : rule.begin;

      anim.setAttribute("from", fromValue);
      anim.setAttribute("to", toValue);
      anim.setAttribute("dur", `${durValue}s`);
      anim.setAttribute("begin", `${beginValue}s`);

      // fill="freeze" makes the animation's end state persist.
      anim.setAttribute("fill", "freeze");

      targetElement.appendChild(anim);
    });
  });

  return serializer.serializeToString(svgEl);
}

function refreshMedia(el) {
  if (el.dataset.type === "svg") {
    const animationRules = JSON.parse(el.dataset.animation || "[]");

    fetch(el.dataset.src)
      .then((r) => r.text())
      .then((svgText) => {
        const animatedSvg = applySmilAnimation(svgText, animationRules);

        // FIXED: Parse SVG safely instead of innerHTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(animatedSvg, "image/svg+xml");
        const svg = doc.querySelector("svg");

        if (svg) {
          el.textContent = ""; // Clear existing content
          el.appendChild(svg);

          // Apply the current accent color to the newly loaded SVG
          if (cfg && cfg.color) {
            svg.style.color = cfg.color;

            // Apply to groups
            svg.querySelectorAll("g").forEach((g) => {
              if (
                g.getAttribute("stroke") === "currentColor" ||
                g.getAttribute("stroke") === null
              ) {
                g.setAttribute("stroke", cfg.color);
              }
              if (
                g.getAttribute("fill") === "currentColor" ||
                g.getAttribute("fill") === null
              ) {
                g.setAttribute("fill", cfg.color);
              }
            });

            // Apply to primitive shapes
            svg
              .querySelectorAll("path, circle, rect, line, polyline, polygon")
              .forEach((el) => {
                const stroke = el.getAttribute("stroke");
                const fill = el.getAttribute("fill");

                if (stroke === "currentColor" || stroke === null) {
                  el.setAttribute("stroke", cfg.color);
                }
                if (fill === "currentColor") {
                  el.setAttribute("fill", cfg.color);
                }
              });
          }
        } else {
          el.textContent = "⚠️";
        }
      })
      .catch(() => (el.textContent = "⚠️"));
  } else if (el.dataset.type === "image") {
    el.src = `${el.dataset.src}?v=${Date.now()}`;
  }
}

// ------------------------------------------------------------------
// Gallery tile behaviour
// ------------------------------------------------------------------
function addHoverReload(tile, fastMs = 2500) {
  let timer;

  tile.addEventListener("mouseenter", () => {
    _hoveredTiles.add(tile);

    const all = tile.querySelectorAll("[data-type='svg'],[data-type='image']");
    if (!all.length) return;

    // Immediate refresh once
    all.forEach(refreshMedia);

    // Faster loop while hovered
    timer = setInterval(() => {
      all.forEach(refreshMedia);
    }, fastMs);
  });

  tile.addEventListener("mouseleave", () => {
    _hoveredTiles.delete(tile);
    clearInterval(timer);
  });
}

// CHANGED: Now accepts `animationRules` and stores them on the element's dataset.
function createPreviewIcon(path, label, animationRules = []) {
  const src = chrome.runtime.getURL(path);
  const isSvg = src.endsWith(".svg");

  if (isSvg) {
    const holder = document.createElement("div");
    holder.dataset.type = "svg";
    holder.dataset.src = src;
    // Store animation rules as a string for the refreshMedia function to use
    holder.dataset.animation = JSON.stringify(animationRules);
    holder.style.width = "42px";
    holder.style.height = "42px";
    refreshMedia(holder); // Initial load
    return holder;
  }

  const img = document.createElement("img");
  img.dataset.type = "image";
  img.dataset.src = src;
  img.src = src;
  img.alt = label;
  img.width = 42;
  img.height = 42;
  return img;
}

// global idle replay (runs all SVG/GIF previews periodically)
function startIdleReplayLoop() {
  const slowMs = 5000; // 5 s idle refresh
  setInterval(() => {
    document
      .querySelectorAll("[data-type='svg'],[data-type='image']")
      .forEach((el) => {
        // find the tile container for this preview
        const tile = el.closest(".pack-preview");
        if (_hoveredTiles.has(tile)) return; // skip actively hovered tile
        refreshMedia(el);
      });
  }, slowMs);
}

// ------------------------------------------------------------------
// Gallery rendering
// ------------------------------------------------------------------
function renderPackGallery() {
  els.packGallery.innerHTML = "";

  // Sort packs by the 'sort' key before rendering
  const sortedPacks = manifest.packs.sort(
    (a, b) => (a.sort ?? 99) - (b.sort ?? 99)
  );

  for (const pack of sortedPacks) {
    const tile = document.createElement("div");
    tile.className =
      "pack-preview" + (cfg.style === pack.id ? " selected" : "");
    tile.tabIndex = 0;
    tile.title = pack.label;

    const icons = document.createElement("div");
    icons.className = "preview-icons";
    for (const k of ["back", "forward", "reload", "up"]) {
      if (!pack.icons[k]) continue;
      // CHANGED: Pass the pack's animation rules to the icon creator.
      icons.append(createPreviewIcon(pack.icons[k], k, pack.animate));
    }

    const lbl = document.createElement("span");
    lbl.className = "pack-label";
    lbl.textContent = pack.label;
    tile.append(icons, lbl);

    tile.addEventListener("click", () => selectPack(pack.id, tile));
    tile.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") selectPack(pack.id, tile);
    });

    addHoverReload(tile, 2500);
    els.packGallery.append(tile);

    // Start the global gentle loop once (moved from renderRefreshGallery)
    if (!window._idleLoopStarted) {
      startIdleReplayLoop();
      window._idleLoopStarted = true;
    }
  }
}

// ------------------------------------------------------------------
// Helper to notify all tabs
// ------------------------------------------------------------------
async function notifyAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs
      .sendMessage(tab.id, {
        to: "content",
        action: "reload-config",
      })
      .catch(() => {}); // Ignore errors for tabs without content script
  }
}

// ------------------------------------------------------------------
// Config save / site overrides
// ------------------------------------------------------------------
function selectPack(id, element) {
  cfg.style = id;
  save();
  [...els.packGallery.children].forEach((n) => n.classList.remove("selected"));
  element.classList.add("selected");
  element.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.9)" },
      { transform: "scale(1)" },
    ],
    { duration: 180, easing: "ease-out" }
  );
  notifyAllTabs();
}

function renderSites() {
  els.sites.innerHTML = "";
  for (const host of Object.keys(cfg.siteRules)) {
    const rule = cfg.siteRules[host];
    const row = document.createElement("div");
    row.className = "site-row";

    const hdr = document.createElement("div");
    hdr.className = "site-header";

    const label = document.createElement("span");
    label.className = "host";
    label.textContent = host;

    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.textContent = "✕";
    remove.onclick = () => {
      delete cfg.siteRules[host];
      save();
      notifyAllTabs();
    };

    hdr.append(label, remove);
    const acts = document.createElement("div");
    acts.className = "site-actions";

    const makeChk = (id, text, checked) => {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = checked;
      cb.onchange = () => {
        rule[id] = cb.checked;
        save();
        notifyAllTabs();
      };
      const lbl = document.createElement("label");
      lbl.append(cb, text);
      return lbl;
    };

    acts.append(
      makeChk("enabled", "Enable", rule.enabled ?? true),
      makeChk("back", "Back", rule.back ?? true),
      makeChk("forward", "Forward", rule.forward ?? true),
      makeChk("reload", "Reload", rule.reload ?? true),
      makeChk("up", "Up", rule.up ?? true)
    );

    row.append(hdr, acts);
    els.sites.append(row);
  }
}

async function save() {
  cfg.enabled = els.enabled.checked;
  cfg.gestures.back = els.back.checked;
  cfg.gestures.forward = els.forward.checked;
  cfg.gestures.reload = els.reload.checked;
  cfg.gestures.up = els.up.checked;

  // The slider value (1-100)
  const hSliderVal = els.hRange.value;
  const vSliderVal = els.vRange.value;

  // Invert the value: 100 on slider should mean a low threshold.
  // Formula: MAX - ((slider_val - 1)/99) * RANGE
  cfg.sensitivity.horizontal =
    SENSITIVITY_MAX_THRESHOLD - ((hSliderVal - 1) / 99) * SENSITIVITY_RANGE;
  cfg.sensitivity.vertical =
    SENSITIVITY_MAX_THRESHOLD - ((vSliderVal - 1) / 99) * SENSITIVITY_RANGE;

  if (els.themeAuto.checked) cfg.theme = "auto";
  else if (els.themeLight.checked) cfg.theme = "light";
  else if (els.themeDark.checked) cfg.theme = "dark";

  await chrome.storage.local.set({ config: cfg });
  renderSites();
}

// New function to update all preview icons with the chosen color
function updatePreviewColors(color) {
  // Find all SVG elements in both galleries
  document.querySelectorAll("#pack-gallery svg").forEach((svg) => {
    // Set the root SVG color
    svg.style.color = color;

    // Update all groups
    svg.querySelectorAll("g").forEach((g) => {
      if (
        g.getAttribute("stroke") === "currentColor" ||
        g.getAttribute("stroke") === null
      ) {
        g.setAttribute("stroke", color);
      }
      if (
        g.getAttribute("fill") === "currentColor" ||
        g.getAttribute("fill") === null
      ) {
        g.setAttribute("fill", color);
      }
    });

    // Update all primitive shapes
    svg
      .querySelectorAll("path, circle, rect, line, polyline, polygon")
      .forEach((el) => {
        const stroke = el.getAttribute("stroke");
        const fill = el.getAttribute("fill");

        if (stroke === "currentColor" || stroke === null) {
          el.setAttribute("stroke", color);
        }
        if (fill === "currentColor") {
          el.setAttribute("fill", color);
        }
      });
  });
}

// ------------------------------------------------------------------
// Initialize on DOM ready
// ------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, initializing...");

  initializeElements(); // Initialize DOM references first

  // Display version from manifest
  const extensionManifest = chrome.runtime.getManifest();
  document.getElementById(
    "version"
  ).textContent = `v${extensionManifest.version}`;

  // Verify critical elements exist
  if (!els.packGallery) {
    console.error("Critical elements missing! Check your HTML.");
    return;
  }

  await restore();

  // Bind control events after elements are initialized
  [els.enabled, els.back, els.forward, els.reload, els.up].forEach((el) =>
    el.addEventListener("change", async () => {
      await save();
      notifyAllTabs();
    })
  );

  [
    [els.hRange, els.hVal],
    [els.vRange, els.vVal],
  ].forEach(([range, val]) => {
    range.oninput = async () => {
      val.textContent = range.value;
      await save();
      notifyAllTabs();
    };
  });

  els.addSite.onclick = async () => {
    const d = els.newDomain.value.trim();
    if (!d) return;
    if (!cfg.siteRules[d])
      cfg.siteRules[d] = {
        enabled: true,
        back: true,
        forward: true,
        reload: true,
        up: true,
      };
    els.newDomain.value = "";
    await save();
    notifyAllTabs();
  };

  els.reset.onclick = async () => {
    await chrome.storage.local.clear();
    await restore();
    notifyAllTabs();
  };

  // Color picker with live preview AND live updates to all tabs
  els.colorInp.addEventListener("input", async () => {
    cfg.color = els.colorInp.value;
    await chrome.storage.local.set({ config: cfg });
    updatePreviewColors(cfg.color);
    notifyAllTabs();
  });

  els.themeToggle.addEventListener("click", async () => {
    const currentTheme = cfg.theme ?? "auto";
    const nextTheme = THEME_CYCLE[currentTheme];

    cfg.theme = nextTheme;
    await updateThemeUI(nextTheme, els.themeIcon, els.themeLabel, els.themeDesc);
    applyTheme(nextTheme);

    await chrome.storage.local.set({ config: cfg });

    // Animate the icon
    els.themeIcon.style.transform = "rotate(360deg)";
    setTimeout(() => {
      els.themeIcon.style.transform = "";
    }, 300);
  });
});
