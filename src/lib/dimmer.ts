// dimmer.ts — "dim for focus" display levels + persistence (Settings →
// Brightness). Built for long study sessions: instead of a blunt CSS filter
// over the page (which would both crush text contrast AND re-anchor the
// position:fixed drawers — filter creates a containing block), a level sets
// three targeted custom properties on the stage:
//
//   --dim-scrim   alpha of a black scrim over the deck's WOOD surface only —
//                 it sits under the platter/controls, so labels keep contrast
//   --dim-glow    multiplier on the metal glow/inset alphas (the "shine")
//   --dim-record  brightness() on the spinning record + label art
//
// Text is never dimmed directly, so WCAG AA legibility survives every level.

export type DimLevel = "bright" | "soft" | "dim";

export interface DimSpec {
  label: string;
  scrim: number; // 0..1 black overlay on the wood
  glow: number; // 0..1 multiplier for metal glows
  record: number; // brightness() factor for the record/label
}

// FEEL: tune by eye — "soft" should read as a lamp turned down, "dim" as a
// late-night room where the deck still clearly works.
export const DIM_LEVELS: Record<DimLevel, DimSpec> = {
  bright: { label: "Bright", scrim: 0, glow: 1, record: 1 },
  soft: { label: "Soft", scrim: 0.18, glow: 0.6, record: 0.92 },
  dim: { label: "Dim", scrim: 0.34, glow: 0.35, record: 0.84 },
};

export const DEFAULT_DIM: DimLevel = "bright";
const STORAGE_KEY = "deck_dim";

export function dimCssVars(level: DimLevel): Record<string, string> {
  const d = DIM_LEVELS[level];
  return {
    "--dim-scrim": String(d.scrim),
    "--dim-glow": String(d.glow),
    "--dim-record": String(d.record),
  };
}

function isDimLevel(v: string | null): v is DimLevel {
  return !!v && v in DIM_LEVELS;
}

export function loadSavedDim(): DimLevel {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return isDimLevel(saved) ? saved : DEFAULT_DIM;
}

export function saveDim(level: DimLevel): void {
  window.localStorage.setItem(STORAGE_KEY, level);
}
