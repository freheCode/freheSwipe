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


// background.js
chrome.runtime.onMessage.addListener(async (message, sender) => {
  if (message.to !== "background") return;
  
  // Forward to ALL tabs (not just active one)
  const tabs = await chrome.tabs.query({});
  
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { ...message, to: "content" })
      .catch(() => {}); // Ignore errors for tabs without content script
  }
});