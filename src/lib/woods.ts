// woods.ts — deck-wood texture catalog + persistence.
// Add a new finish by adding one entry to WOODS; both the deck surface
// (TurntableVisual) and the Settings swatches (SettingsPanel) read from it.

import type { CSSProperties } from "react";

export type WoodName = "dark" | "oak" | "pine" | "rosewood";

export interface WoodTexture {
  label: string;
  color: string;
  normal: string;
}

export const WOODS: Record<WoodName, WoodTexture> = {
  dark: {
    label: "Dark",
    color: "/wood-textures/wood-dark-wood-color.jpg",
    normal: "/wood-textures/wood-dark-wood-normal.png",
  },
  oak: {
    label: "Oak",
    color: "/wood-textures/wood-oak-color.jpg",
    normal: "/wood-textures/wood-oak-normal.png",
  },
  pine: {
    label: "Pine",
    color: "/wood-textures/wood-pine-bark-color.jpg",
    normal: "/wood-textures/wood-pine-bark-normal.png",
  },
  rosewood: {
    label: "Rosewood",
    color: "/wood-textures/wood-rosewood-color.jpg",
    normal: "/wood-textures/wood-rosewood-normal.png",
  },
};

export const DEFAULT_WOOD: WoodName = "oak";
const STORAGE_KEY = "deck_wood";

// FEEL: tune by eye — how large the color tile reads at deck scale, and how
// strongly the normal map's grain catches the existing highlight gradient
// (kept low so it reads as texture, not noise).
export const WOOD_TILE_PX = 220;
export const WOOD_NORMAL_OPACITY = 0.35;
export const WOOD_NORMAL_BLEND: CSSProperties["mixBlendMode"] = "overlay";

function isWoodName(v: string | null): v is WoodName {
  return !!v && v in WOODS;
}

export function loadSavedWood(): WoodName {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return isWoodName(saved) ? saved : DEFAULT_WOOD;
}

export function saveWood(name: WoodName): void {
  window.localStorage.setItem(STORAGE_KEY, name);
}
