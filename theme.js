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
// Theme application utility
// ------------------------------------------------------------------
function applyTheme(theme) {
  const root = document.documentElement;
  
  if (theme === "light") {
    root.style.colorScheme = "light";
  } else if (theme === "dark") {
    root.style.colorScheme = "dark";
  } else {
    // auto - let browser decide based on system preference
    root.style.colorScheme = "light dark";
  }
}