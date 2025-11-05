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
  scrollThreshold: 10,

  // NEW: overlay sizing options
  overlay: {
    sizeRatio: 0.08, // 8% of min(viewport w,h)
    minSizePx: 48,
    maxSizePx: 112,
    edgePaddingRatio: 0.005, // 3% of min(viewport w,h)
    minPaddingPx: 12,
    maxPaddingPx: 40,
    slideRatio: 0.75, // horizontal translate ~ 0.75 * size
    moveRatio: 0.8, // vertical translate ~ 0.8 * size
  },
};

// --- STATE ---
let UI = { size: 64, pad: 24, slide: 48, move: 52 };
let edgeStart = { top: false, bottom: false, left: false, right: false };
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

  layoutIcons();
}

//---------------------------------------------------------------------//
// Helpers
//---------------------------------------------------------------------//
const isInput = (el) => ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function computeUiMetrics() {
  const ol = settings.overlay || {};
  const base = Math.min(window.innerWidth, window.innerHeight) || 800;

  const sizeRatio = typeof ol.sizeRatio === "number" ? ol.sizeRatio : 0.08;
  const padRatio =
    typeof ol.edgePaddingRatio === "number" ? ol.edgePaddingRatio : 0.03;

  const size = Math.round(
    clamp(base * sizeRatio, ol.minSizePx ?? 48, ol.maxSizePx ?? 112)
  );
  const pad = Math.round(
    clamp(base * padRatio, ol.minPaddingPx ?? 12, ol.maxPaddingPx ?? 40)
  );
  const slide = Math.round(size * (ol.slideRatio ?? 0.75)); // left/right
  const move = Math.round(size * (ol.moveRatio ?? 0.8)); // up/reload

  return { size, pad, slide, move };
}

function layoutIcons() {
  UI = computeUiMetrics();
  const { size, pad } = UI;

  // Size all icons
  for (const icon of Object.values(ICONS)) {
    icon.style.width = `${size}px`;
    icon.style.height = `${size}px`;
  }

  // Left (center vertically, pad from left)
  ICONS.left.style.top = `calc(50vh - ${size / 2}px)`;
  ICONS.left.style.left = `${pad}px`;
  ICONS.left.style.right = "";

  // Right (center vertically, pad from right)
  ICONS.right.style.top = `calc(50vh - ${size / 2}px)`;
  ICONS.right.style.right = `${pad}px`;
  ICONS.right.style.left = "";

  // Reload (top center, pad from top)
  ICONS.reload.style.top = `${pad}px`;
  ICONS.reload.style.bottom = "";
  ICONS.reload.style.left = `calc(50vw - ${size / 2}px)`;

  // Up (bottom center, pad from bottom)
  ICONS.up.style.top = "";
  ICONS.up.style.bottom = `${pad}px`;
  ICONS.up.style.left = `calc(50vw - ${size / 2}px)`;
}

// Sensitivity-driven distances (all scaled by viewport)
const SENSE = {
  minPx: 12, // floors so it's never too tiny
  lockRatio: 0.12, // axis lock at 35% of trigger distance
  armRatio: 0.25, // activation at 55% of trigger distance
};

function axisLen(axis) {
  return axis === "horizontal" ? window.innerWidth : window.innerHeight;
}

// Clamp and read the trigger fraction from settings.sensitivity
function triggerFrac(axis) {
  const def = axis === "horizontal" ? 0.1 : 0.3;
  const val = settings?.sensitivity?.[axis];
  const f = typeof val === "number" ? val : def;
  // keep within sane bounds: 3%..60% of screen
  return Math.min(0.6, Math.max(0.03, f));
}

function triggerPx(axis) {
  return Math.max(SENSE.minPx, axisLen(axis) * triggerFrac(axis));
}

function lockPx(axis) {
  return Math.max(SENSE.minPx, triggerPx(axis) * SENSE.lockRatio);
}

function armPx(axis) {
  return Math.max(SENSE.minPx, triggerPx(axis) * SENSE.armRatio);
}

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

  // Snapshot edge state at touchstart (so gestures can’t arm mid-swipe)
  const startTarget =
    document.elementFromPoint(t.clientX, t.clientY) || e.target;
  edgeStart = {
    top: atTop(startTarget),
    bottom: atBottom(startTarget),
    left: !canScrollLeft(startTarget),
    right: !canScrollRight(startTarget),
  };
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

  const maxSlide = UI?.slide ?? 48;
  const maxMove = UI?.move ?? 52;

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

  // Lock in the axis on the first significant movement (sensitivity-based)
  if (!gestureAxis) {
    const lockX = lockPx("horizontal");
    const lockY = lockPx("vertical");
    if (absX > lockX || absY > lockY) {
      gestureAxis = absX > absY ? "horizontal" : "vertical";
    }
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

  // Lock in the ACTIVE ICON (sensitivity-based)
  if (!activeIcon && gestureAxis) {
    const armX = armPx("horizontal");
    const armY = armPx("vertical");

    if (gestureAxis === "horizontal") {
      if (dx > armX && edgeStart.left && isGestureAllowed("back")) {
        activeIcon = ICONS.left;
      } else if (dx < -armX && edgeStart.right && isGestureAllowed("forward")) {
        activeIcon = ICONS.right;
      }
    } else if (gestureAxis === "vertical") {
      if (dy > armY && edgeStart.top && isGestureAllowed("reload")) {
        activeIcon = ICONS.reload;
      } else if (dy < -armY && edgeStart.bottom && isGestureAllowed("up")) {
        activeIcon = ICONS.up;
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

// Check if element, parent, or window can scroll left
function canScrollLeft(
  target = document.elementFromPoint(dragStart.x, dragStart.y)
) {
  const threshold = settings.scrollThreshold || 5;

  // Check window-level horizontal scroll first
  if (window.scrollX > threshold) {
    console.log("🚫 Window can scroll left, blocking back gesture");
    return true;
  }

  // Check element-level scroll containers
  let node = target;
  while (node && node !== document.documentElement) {
    const maxScroll = node.scrollWidth - node.clientWidth;

    if (maxScroll > 0) {
      const style = window.getComputedStyle(node);
      const isScrollContainer = ["auto", "scroll", "overlay"].includes(
        style.overflowX
      );

      if (isScrollContainer && node.scrollLeft > threshold) {
        console.log(
          `🚫 ${node.tagName} can scroll left, blocking back gesture`
        );
        return true;
      }
    }
    node = node.parentNode;
  }

  return false;
}

// Check if element, parent, or window can scroll right
function canScrollRight(
  target = document.elementFromPoint(dragStart.x, dragStart.y)
) {
  const threshold = settings.scrollThreshold || 5;

  // Check window-level horizontal scroll first
  const docWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth
  );
  const maxWindowScroll = docWidth - window.innerWidth;

  if (maxWindowScroll > 0 && window.scrollX < maxWindowScroll - threshold) {
    console.log("🚫 Window can scroll right, blocking forward gesture");
    return true;
  }

  // Check element-level scroll containers
  let node = target;
  while (node && node !== document.documentElement) {
    const maxScroll = node.scrollWidth - node.clientWidth;

    if (maxScroll > 0) {
      const style = window.getComputedStyle(node);
      const isScrollContainer = ["auto", "scroll", "overlay"].includes(
        style.overflowX
      );

      if (isScrollContainer && node.scrollLeft < maxScroll - threshold) {
        console.log(
          `🚫 ${node.tagName} can scroll right, blocking forward gesture`
        );
        return true;
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
    if (dxP > H && edgeStart.left && isGestureAllowed("back")) {
      triggered = true;
      top.history.back();
    } else if (dxP < -H && edgeStart.right && isGestureAllowed("forward")) {
      triggered = true;
      top.history.forward();
    }
  } else if (gestureAxis === "vertical") {
    if (dyP > V && edgeStart.top && isGestureAllowed("reload")) {
      triggered = true;
      top.location.reload();
      // FIXED: Changed to atBottom() instead of !atTop()
    } else if (dyP < -V && edgeStart.bottom && isGestureAllowed("up")) {
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
    overlay: { ...settings.overlay, ...(stored.overlay || {}) },
  };

  console.log("✅ Settings loaded:", settings);
}

let resizeRaf = null;
function onResize() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(layoutIcons);
}

function addListeners() {
  document.body.addEventListener("touchstart", onTouchStart, { passive: true });
  document.body.addEventListener("touchmove", onTouchMove, { passive: true });
  document.body.addEventListener("touchend", onTouchEnd);
  document.body.addEventListener("touchcancel", hideIcons);
  window.addEventListener("resize", onResize, { passive: true });
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
