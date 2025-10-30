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

const ICON_SIZE = 64;
const Z_INDEX = 1_000_000;

// --- SETTINGS ---
let settings = {
  enabled: true,
  gestures: { back: true, forward: true, reload: true, up: true },
  sensitivity: { horizontal: 0.1, vertical: 0.3 },
  exclusions: [],
  siteRules: {},
  style: "classic",
  color: "#00A8FF",
};

// --- STATE ---
let dragStart = { x: 0, y: 0, scrollY: 0 };
let rafToken = null;
let touchData = null;
let activeIcon = null;
let gestureAxis = null;
let gestureDir = null;
let cancelledGesture = false;
let gestureMaxProgress = 0;

let iconManifest = null;
let ICONS = {};

//---------------------------------------------------------------------//
// ADVANCED SVG ANIMATOR
//---------------------------------------------------------------------//
class IconAnimator {
  constructor(svgElement, animationRules) {
    this.svg = svgElement;
    this.rules = animationRules;
    this.targets = [];
    this.maxEndTime = 0;
    this.initialize();
  }

  initialize() {
    if (!this.svg || !this.rules || this.rules.length === 0) return;

    this.rules.forEach((rule) => {
      const begins = Array.isArray(rule.begin) ? rule.begin : [rule.begin];
      const durs = Array.isArray(rule.dur) ? rule.dur : [rule.dur];

      begins.forEach((begin, i) => {
        const dur = durs[i] || durs[0];
        const endTime = begin + dur;
        this.maxEndTime = Math.max(this.maxEndTime, endTime);
      });
    });

    const elements = this.svg.querySelectorAll(
      "path, circle, rect, line, polyline, polygon"
    );

    this.rules.forEach((rule, index) => {
      const element = elements[index];
      if (!element) return;

      const attributes = Array.isArray(rule.attributeName)
        ? rule.attributeName
        : [rule.attributeName];

      if (attributes.includes("fill-opacity")) {
        element.setAttribute("fill", "currentColor");
        element.setAttribute(
          "fill-opacity",
          Array.isArray(rule.from)
            ? rule.from[attributes.indexOf("fill-opacity")]
            : rule.from
        );
      }

      this.targets.push({ element, rule });
    });

    this.update(0);
  }

  update(progress) {
    if (this.targets.length === 0) return;

    const scaledProgress = progress * this.maxEndTime;

    this.targets.forEach(({ element, rule }) => {
      const attributes = Array.isArray(rule.attributeName)
        ? rule.attributeName
        : [rule.attributeName];

      attributes.forEach((attr, i) => {
        const from = Array.isArray(rule.from) ? rule.from[i] : rule.from;
        const to = Array.isArray(rule.to) ? rule.to[i] : rule.to;
        const begin = Array.isArray(rule.begin) ? rule.begin[i] : rule.begin;
        const dur = Array.isArray(rule.dur) ? rule.dur[i] : rule.dur;

        let localProgress = (scaledProgress - begin) / dur;
        localProgress = Math.max(0, Math.min(localProgress, 1));

        const currentValue = from + (to - from) * localProgress;
        element.setAttribute(attr, String(currentValue));
      });
    });
  }
}

//---------------------------------------------------------------------//
// Loading & Building
//---------------------------------------------------------------------//
async function loadIconManifest() {
  if (iconManifest) return iconManifest;
  const res = await fetch(
    chrome.runtime.getURL("assets/icons/overlay/packs.json")
  );
  iconManifest = await res.json();
  return iconManifest;
}

async function createIcon(src, alignX) {
  const isSvg = src.endsWith(".svg");
  let el;

  if (isSvg) {
    const res = await fetch(chrome.runtime.getURL(src));
    const text = await res.text();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = text.trim();
    el = wrapper.querySelector("svg");
  } else {
    // FIXED: Changed "imRg" to "img"
    el = document.createElement("img");
    el.src = chrome.runtime.getURL(src);
  }

  Object.assign(el.style, {
    display: "none",
    position: "fixed",
    top: `calc(50vh - ${ICON_SIZE / 2}px)`,
    [alignX ?? "left"]: "0px",
    width: `${ICON_SIZE}px`,
    height: `${ICON_SIZE}px`,
    transition: "opacity 0.2s ease, filter 0.2s ease, transform 0.15s ease",
    zIndex: Z_INDEX,
    willChange: "opacity, transform",
    pointerEvents: "none", // Prevent icons from blocking touches
  });

  document.body.appendChild(el);
  return el;
}

async function buildIcons() {
  Object.values(ICONS).forEach((i) => i.remove());

  const manifest = await loadIconManifest();
  const pack =
    manifest.packs.find((p) => p.id === settings.style) || manifest.packs[0];

  ICONS = {
    left: await createIcon(pack.icons.back, "left"),
    right: await createIcon(pack.icons.forward, "right"),
    reload: await createIcon(pack.icons.reload, "center"),
    up: await createIcon(pack.icons.up, "center"),
  };

  if (pack.animate) {
    Object.values(ICONS).forEach((icon) => {
      if (icon.tagName === "svg") {
        icon.animator = new IconAnimator(icon, pack.animate);
      }
    });
  }

  ICONS.reload.style.top = `24px`;
  ICONS.reload.style.left = `calc(50vw - ${ICON_SIZE / 2}px)`;
  ICONS.up.style.top = "";
  ICONS.up.style.bottom = "24px";
  ICONS.up.style.left = `calc(50vw - ${ICON_SIZE / 2}px)`;

  // Apply chosen accent color to every icon
  Object.values(ICONS).forEach((icon) => {
    if (icon.tagName === "svg") {
      icon.style.color = settings.color;

      icon.querySelectorAll("g").forEach((g) => {
        if (
          g.getAttribute("stroke") === "currentColor" ||
          g.getAttribute("stroke") === null
        )
          g.setAttribute("stroke", settings.color);
        if (
          g.getAttribute("fill") === "currentColor" ||
          g.getAttribute("fill") === null
        )
          g.setAttribute("fill", settings.color);
      });

      icon
        .querySelectorAll("path,circle,rect,line,polyline,polygon")
        .forEach((el) => {
          const stroke = el.getAttribute("stroke");
          const fill = el.getAttribute("fill");
          if (stroke === "currentColor" || stroke === null)
            el.setAttribute("stroke", settings.color);
          if (fill === "currentColor") el.setAttribute("fill", settings.color);
        });
    } else {
      icon.style.filter = `drop-shadow(0 0 2px ${settings.color})`;
    }
  });
}

//---------------------------------------------------------------------//
// Helpers
//---------------------------------------------------------------------//
const isInput = (el) => ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName);

function atTop(target = document.elementFromPoint(dragStart.x, dragStart.y)) {
  let node = target;
  while (node && node !== document.body) {
    if (node.scrollTop > 5) return false;
    node = node.parentNode;
  }
  return window.scrollY <= 5;
}

function atBottom(
  target = document.elementFromPoint(dragStart.x, dragStart.y)
) {
  let node = target;
  while (node && node !== document.body) {
    const maxScroll = node.scrollHeight - node.clientHeight;

    if (maxScroll > 0) {
      // Check if this is actually a scroll container
      const style = window.getComputedStyle(node);
      const isScrollContainer = ["auto", "scroll", "overlay"].includes(
        style.overflowY
      );

      if (isScrollContainer && node.scrollTop < maxScroll - 5) {
        console.log(
          `❌ ${node.tagName} can scroll ${maxScroll - node.scrollTop}px more`
        );
        return false;
      }
    }
    node = node.parentNode;
  }

  // Window check
  const docHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight
  );
  const maxScroll = docHeight - window.innerHeight;
  const remaining = maxScroll - window.scrollY;

  console.log(`Window remaining: ${remaining}px`);
  return remaining <= 5;
}

const isExcluded = () =>
  settings.exclusions.some((dom) => location.hostname.includes(dom));

function isGestureAllowed(type) {
  if (!settings.enabled || !settings.gestures[type] || isExcluded())
    return false;
  const host = location.hostname;
  const rules = settings.siteRules?.[host];
  if (!rules) return true;
  if (rules.enabled === false) return false;
  return rules[type] !== false;
}

function hideIcons() {
  for (const i of Object.values(ICONS)) {
    i.style.display = "none";
    i.style.filter = "none";
    i.style.opacity = "1";
  }
  activeIcon = null;
  gestureAxis = null;
  gestureDir = null;
}

function fadeOutIcons() {
  for (const icon of Object.values(ICONS)) icon.style.opacity = "0";
  setTimeout(hideIcons, 200);
}

//---------------------------------------------------------------------//
// Gesture Handlers
//---------------------------------------------------------------------//
function onTouchStart(e) {
  if (!settings.enabled || isExcluded() || isInput(e.target)) return;
  const t = e.changedTouches[0];
  dragStart = { x: t.clientX, y: t.clientY, scrollY: window.scrollY };
  gestureAxis = null;
  cancelledGesture = false;
  gestureMaxProgress = 0;
  activeIcon = null;
}

function onTouchMove(e) {
  if (!settings.enabled || isExcluded()) return;
  touchData = e;
  if (!rafToken) rafToken = requestAnimationFrame(updateIcons);
}

function showIcon(icon, currentProgress, maxProgress) {
  let effectiveProgress;
  let opacity;

  if (currentProgress < maxProgress) {
    const cancellationRatio = currentProgress / maxProgress;
    effectiveProgress = cancellationRatio;
    opacity = cancellationRatio ** 2;
  } else {
    effectiveProgress = Math.min(currentProgress, 1);
    opacity = Math.min(currentProgress, 1);
  }

  const scale = 0.85 + Math.min(currentProgress, 1) * 0.15;

  // Smoother saturation boost (120% instead of 500%)
  const saturate = currentProgress >= 1 ? 120 : 100;

  icon.style.display = "block";
  icon.style.opacity = opacity.toFixed(3);

  // Combine saturation with existing filters
  if (icon.tagName === "svg") {
    icon.style.filter = `saturate(${saturate}%)`;
  } else {
    // Keep drop-shadow for non-SVG icons
    icon.style.filter = `saturate(${saturate}%) drop-shadow(0 0 2px ${settings.color})`;
  }

  const maxSlide = 48;
  const maxMove = 52;

  let transform = `scale(${scale})`;
  if (icon === ICONS.left) {
    transform += ` translateX(${maxSlide * effectiveProgress}px)`;
  } else if (icon === ICONS.right) {
    transform += ` translateX(-${maxSlide * effectiveProgress}px)`;
  } else if (icon === ICONS.reload) {
    transform += ` translateY(${maxMove * effectiveProgress}px)`;
  } else if (icon === ICONS.up) {
    transform += ` translateY(-${maxMove * effectiveProgress}px)`;
  }
  icon.style.transform = transform;

  if (icon.animator) {
    icon.animator.update(effectiveProgress);
  }
  activeIcon = icon;
}

function updateIcons() {
  rafToken = null;
  if (cancelledGesture) return;
  const e = touchData;
  if (!e?.changedTouches?.length) return;

  const t = e.changedTouches[0];
  const dx = t.clientX - dragStart.x;
  const dy = t.clientY - dragStart.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Lock in the axis on the first significant movement
  if (!gestureAxis && (absX > 20 || absY > 20)) {
    gestureAxis = absX > absY ? "horizontal" : "vertical";
  }

  // Guard against sloppy swipes
  if (
    (gestureAxis === "horizontal" && absY > absX * 0.7) ||
    (gestureAxis === "vertical" && absX > absY * 0.7)
  ) {
    cancelledGesture = true;
    fadeOutIcons();
    return;
  }

  // Lock in the ACTIVE ICON
  if (!activeIcon && gestureAxis) {
    if (gestureAxis === "horizontal") {
      // Check for horizontal scroll containers first
      if (dx > 20 && !canScrollLeft() && isGestureAllowed("back")) {
        activeIcon = ICONS.left;
      } else if (dx < -20 && !canScrollRight() && isGestureAllowed("forward")) {
        activeIcon = ICONS.right;
      }
      // In updateIcons(), replace the vertical gesture section:
    } else if (gestureAxis === "vertical") {
      // console.log("Vertical gesture detected, dy:", dy);

      if (dy > 20 && atTop() && isGestureAllowed("reload")) {
        // console.log("✅ Reload gesture activated");
        activeIcon = ICONS.reload;
      } else if (dy < -20 && atBottom() && isGestureAllowed("up")) {
        // console.log("✅ Up gesture activated");
        activeIcon = ICONS.up;
      } else {
        // console.log("❌ No vertical gesture activated");
        // console.log("  dy < -20:", dy < -20);
        // console.log("  atBottom():", atBottom());
        // console.log("  isGestureAllowed('up'):", isGestureAllowed("up"));
      }
    }
  }

  // Animate the Active Gesture
  if (activeIcon) {
    let currentProgress = 0;

    if (activeIcon === ICONS.left) {
      currentProgress =
        dx / (window.innerWidth * settings.sensitivity.horizontal);
    } else if (activeIcon === ICONS.right) {
      currentProgress =
        -dx / (window.innerWidth * settings.sensitivity.horizontal);
    } else if (activeIcon === ICONS.reload) {
      currentProgress =
        dy / (window.innerHeight * settings.sensitivity.vertical);
    } else if (activeIcon === ICONS.up) {
      currentProgress =
        -dy / (window.innerHeight * settings.sensitivity.vertical);
    }

    currentProgress = Math.max(0, currentProgress);
    gestureMaxProgress = Math.max(gestureMaxProgress, currentProgress);

    showIcon(activeIcon, currentProgress, gestureMaxProgress);

    if (currentProgress < 0.01 && gestureMaxProgress > 0.1) {
      hideIcons();
    }
  }
}

// Check if element or parent can scroll left
function canScrollLeft(
  target = document.elementFromPoint(dragStart.x, dragStart.y)
) {
  let node = target;
  while (node && node !== document.body) {
    const maxScroll = node.scrollWidth - node.clientWidth;

    if (maxScroll > 0) {
      const style = window.getComputedStyle(node);
      const isScrollContainer = ["auto", "scroll", "overlay"].includes(
        style.overflowX
      );

      if (isScrollContainer && node.scrollLeft > 5) {
        return true; // Can still scroll left
      }
    }
    node = node.parentNode;
  }
  return false;
}

// Check if element or parent can scroll right
function canScrollRight(
  target = document.elementFromPoint(dragStart.x, dragStart.y)
) {
  let node = target;
  while (node && node !== document.body) {
    const maxScroll = node.scrollWidth - node.clientWidth;

    if (maxScroll > 0) {
      const style = window.getComputedStyle(node);
      const isScrollContainer = ["auto", "scroll", "overlay"].includes(
        style.overflowX
      );

      if (isScrollContainer && node.scrollLeft < maxScroll - 5) {
        return true; // Can still scroll right
      }
    }
    node = node.parentNode;
  }
  return false;
}

function onTouchEnd(e) {
  if (cancelledGesture || !settings.enabled || isExcluded() || !gestureAxis) {
    hideIcons();
    cancelledGesture = false;
    return;
  }

  const t = e.changedTouches[0];
  const dx = t.clientX - dragStart.x;
  const dy = t.clientY - dragStart.y;
  const dxP = dx / window.innerWidth;
  const dyP = dy / window.innerHeight;
  const { horizontal: H, vertical: V } = settings.sensitivity;
  let triggered = false;

  if (gestureAxis === "horizontal") {
    if (dxP > H && isGestureAllowed("back")) {
      triggered = true;
      top.history.back();
    } else if (dxP < -H && isGestureAllowed("forward")) {
      triggered = true;
      top.history.forward();
    }
  } else if (gestureAxis === "vertical") {
    if (dyP > V && atTop() && isGestureAllowed("reload")) {
      triggered = true;
      top.location.reload();
      // FIXED: Changed to atBottom() instead of !atTop()
    } else if (dyP < -V && atBottom() && isGestureAllowed("up")) {
      triggered = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  triggered ? fadeOutIcons() : hideIcons();
}

//---------------------------------------------------------------------//
// Init & Listeners
//---------------------------------------------------------------------//
async function loadSettings() {
  const s = await chrome.storage.local.get("config");
  const stored = s.config || {};

  settings = {
    ...settings,
    ...stored,
    gestures: { ...settings.gestures, ...(stored.gestures || {}) },
    sensitivity: { ...settings.sensitivity, ...(stored.sensitivity || {}) },
  };

  console.log("✅ Settings loaded:", settings);
}

function addListeners() {
  document.body.addEventListener("touchstart", onTouchStart, { passive: true });
  document.body.addEventListener("touchmove", onTouchMove, { passive: true });
  document.body.addEventListener("touchend", onTouchEnd);
  document.body.addEventListener("touchcancel", hideIcons);
}

(async () => {
  try {
    await loadSettings();
    await buildIcons();
    addListeners();
  } catch (err) {
    console.error("Gesture Navigation Init Error:", err);
  }
})();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.to !== "content") return;
  const host = location.hostname;
  switch (msg.action) {
    case "toggle-global":
      settings.enabled = msg.value;
      break;
    case "toggle-site":
      if (!settings.exclusions) settings.exclusions = [];
      const exists = settings.exclusions.includes(host);
      settings.exclusions = exists
        ? settings.exclusions.filter((h) => h !== host)
        : [...settings.exclusions, host];
      chrome.storage.local.set({ config: settings });
      break;
    case "reload-config":
      loadSettings().then(buildIcons);
      break;
  }
});
