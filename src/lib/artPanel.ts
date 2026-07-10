// artPanel.ts — persistence for the optional album-art side panel (the
// "sleeve display" that can sit beside the deck on wide screens). Follows the
// woods/metals/dimmer pattern: one saved preference, defaulting to OFF.

const STORAGE_KEY = "art_panel";

export function loadSavedArtPanel(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "on";
}

export function saveArtPanel(on: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}
