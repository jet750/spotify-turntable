// metals.ts — metal-finish catalog + persistence (mirrors woods.ts).
// The deck's trim, tonearm, and control accents are SVG/CSS (no image assets),
// so a finish is just a set of semantic color roles. Each role is exposed as a
// CSS custom property on the page stage (metalCssVars); every component that
// used to hardcode a brass hex now reads `var(--m-<role>, <brass fallback>)`,
// so "gold" renders exactly the classic brass and silver/bronze recolor the
// same gradients in place.

export type MetalName = "gold" | "silver" | "bronze";

export interface MetalPalette {
  label: string;
  bright: string; // highlights, bright borders, headings (brass #e8c870)
  brightest: string; // plate labels, hottest highlight (brass #f0d080)
  base: string; // the main trim tone (brass #c49a3c)
  mid: string; // slightly lighter base — arm tube, icons (brass #d4a843)
  accent: string; // enabled transport glyphs (brass #e0b450)
  dim: string; // muted accents on DARK walnut only (brass #a07828)
  // Muted-but-readable text on the walnut drawer/deck surfaces — every value
  // clears WCAG AA 4.5:1 on #3e2808 (the lightest walnut a label sits on).
  // Use this for secondary TEXT; `dim` is for non-text accents.
  dimText: string;
  deep: string; // deep shade of the metal (brass #8a6820)
  detail: string; // small arm hardware (brass #b08020)
  shade: string; // disabled/inactive metal (brass #6a5018)
  plateTop: string; // control-plate gradient top (brass #6a4e18)
  plateBottom: string; // control-plate gradient bottom (brass #523a10)
  weight: string; // counterweight / headshell body (brass #8a7040)
  textOn: string; // dark text sitting ON the metal (brass #3d2100)
  glowRgb: string; // "r,g,b" for rgba() glows/insets (brass 232,200,112)
}

export const METALS: Record<MetalName, MetalPalette> = {
  // Gold IS the original brass — values copied verbatim from the components,
  // so the default finish is pixel-identical to the pre-picker deck.
  gold: {
    label: "Gold",
    bright: "#e8c870",
    brightest: "#f0d080",
    base: "#c49a3c",
    mid: "#d4a843",
    accent: "#e0b450",
    dim: "#a07828",
    dimText: "#b8945c",
    deep: "#8a6820",
    detail: "#b08020",
    shade: "#6a5018",
    plateTop: "#6a4e18",
    plateBottom: "#523a10",
    weight: "#8a7040",
    textOn: "#3d2100",
    glowRgb: "232,200,112",
  },
  // FEEL: tune by eye — cool near-neutral with a whisper of blue so it reads
  // as polished steel against the warm walnut, not as flat gray.
  silver: {
    label: "Silver",
    bright: "#e2e6ec",
    brightest: "#f0f3f7",
    base: "#b4bac4",
    mid: "#c6ccd5",
    accent: "#d2d7df",
    dim: "#8d939e",
    dimText: "#a2a9b4",
    deep: "#6a707c",
    detail: "#8b929e",
    shade: "#565c66",
    plateTop: "#565b64",
    plateBottom: "#3f434b",
    weight: "#767c88",
    textOn: "#14171c",
    glowRgb: "224,232,244",
  },
  // FEEL: tune by eye — redder and a step darker than gold, aged-penny warm.
  bronze: {
    label: "Bronze",
    bright: "#e2a878",
    brightest: "#efc094",
    base: "#b07a44",
    mid: "#c08850",
    // Brighter than the metal's natural mid-tone: this is enabled-glyph TEXT
    // on the control strip and must clear 4.5:1 on #5a3e1e (Item 7 audit).
    accent: "#dcaa78",
    dim: "#8f6236",
    dimText: "#c49058",
    deep: "#744e24",
    detail: "#9a662c",
    shade: "#5c421e",
    plateTop: "#5e441e",
    plateBottom: "#463216",
    weight: "#7e5c34",
    textOn: "#2b1706",
    glowRgb: "226,168,120",
  },
};

export const DEFAULT_METAL: MetalName = "gold";
const STORAGE_KEY = "deck_metal";

// Style object for the page stage: sets every --m-* custom property so all
// descendants (deck, tabs, drawers) resolve their metal vars from one place.
export function metalCssVars(name: MetalName): Record<string, string> {
  const m = METALS[name];
  return {
    "--m-bright": m.bright,
    "--m-brightest": m.brightest,
    "--m-base": m.base,
    "--m-mid": m.mid,
    "--m-accent": m.accent,
    "--m-dim": m.dim,
    "--m-dim-text": m.dimText,
    "--m-deep": m.deep,
    "--m-detail": m.detail,
    "--m-shade": m.shade,
    "--m-plate-top": m.plateTop,
    "--m-plate-bottom": m.plateBottom,
    "--m-weight": m.weight,
    "--m-text-on": m.textOn,
    "--m-glow-rgb": m.glowRgb,
  };
}

function isMetalName(v: string | null): v is MetalName {
  return !!v && v in METALS;
}

export function loadSavedMetal(): MetalName {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return isMetalName(saved) ? saved : DEFAULT_METAL;
}

export function saveMetal(name: MetalName): void {
  window.localStorage.setItem(STORAGE_KEY, name);
}
