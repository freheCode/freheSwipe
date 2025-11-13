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
// Theme configuration and metadata
// ------------------------------------------------------------------

const THEME_CONFIG = {
  auto: {
    label: "Auto (System)",
    description: "Matches your operating system preference",
    icon: "assets/icons/theme/auto.svg"
  },
  light: {
    label: "Light Mode",
    description: "Always use light theme",
    icon: "assets/icons/theme/light.svg"
  },
  dark: {
    label: "Dark Mode",
    description: "Always use dark theme",
    icon: "assets/icons/theme/dark.svg"
  }
};

const THEME_CYCLE = {
  auto: "light",
  light: "dark",
  dark: "auto"
};

// ------------------------------------------------------------------
// Load and display theme icon
// ------------------------------------------------------------------
async function loadThemeIcon(theme, targetElement) {
  const iconPath = THEME_CONFIG[theme].icon;
  const iconUrl = chrome.runtime.getURL(iconPath);
  
  try {
    const response = await fetch(iconUrl);
    const svgText = await response.text();
    
    // ✅ SAFE: Parse SVG using DOMParser
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    
    // Check for parsing errors
    const parserError = svgDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid SVG content');
    }
    
    // Clear and append the parsed SVG
    targetElement.textContent = ''; // Clear existing content safely
    targetElement.appendChild(svgElement);
    
  } catch (error) {
    console.error(`Failed to load theme icon for ${theme}:`, error);
    targetElement.textContent = '🎨'; // Fallback emoji (using textContent, not innerHTML)
  }
}

// ------------------------------------------------------------------
// Update theme UI elements (for options page with label/description)
// ------------------------------------------------------------------
async function updateThemeUI(theme, iconElement, labelElement = null, descElement = null) {
  await loadThemeIcon(theme, iconElement);
  
  // Only update label and description if elements are provided (options page)
  if (labelElement && descElement) {
    labelElement.textContent = THEME_CONFIG[theme].label;
    descElement.textContent = THEME_CONFIG[theme].description;
  }
}