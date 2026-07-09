// SettingsPanel.tsx
// Slide-out drawer (right side) that's the single settings + info surface for
// a page (formerly split across a standalone round-icon InfoButtons popover
// row and this panel's Deck section — now merged). Generic: callers pass a
// list of labeled sections, so Live (About/Access/Deck) and Home
// (About/Credits) each show only what applies to them. Mirrors BrowsePanel's
// drawer chrome so the two read as the same piece of hardware.

import { WOODS, WoodName } from "../lib/woods";
import { METALS, MetalName } from "../lib/metals";
import { DIM_LEVELS, DimLevel } from "../lib/dimmer";

// ─── Palette (matches TurntableVisual.tsx / BrowsePanel.tsx) ───────────────
// Metal tones route through the stage's --m-* custom properties (metals.ts)
// so the drawer chrome follows the selected finish; walnut stays fixed.
const WALNUT_DARK = "#2a1c08";
const WALNUT_DEEP = "#3e2808";
const BRASS = "var(--m-base, #c49a3c)";
const BRASS_LIGHT = "var(--m-bright, #e8c870)";
const BRASS_DIM = "var(--m-dim, #a08040)";
const BORDER_DARK = "#3a2808";
const MONO = "'Courier New', monospace";

export interface SettingsSection {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  sections: SettingsSection[];
}

export default function SettingsPanel({ open, onClose, sections }: SettingsPanelProps) {
  return (
    <>
      {/* Backdrop — click-away to close (only catches clicks while open) */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <aside
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 320,
          maxWidth: "100vw",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.32s cubic-bezier(0.4,0,0.2,1)",
          background: `linear-gradient(160deg, ${WALNUT_DEEP} 0%, ${WALNUT_DARK} 100%)`,
          borderLeft: `2px solid ${BRASS}`,
          boxShadow: "-12px 0 48px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          fontFamily: MONO,
          zIndex: 1000,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px 12px",
            borderBottom: `1px solid ${BORDER_DARK}`,
          }}
        >
          <span
            style={{
              color: BRASS_LIGHT,
              fontFamily: "Georgia, serif",
              fontWeight: "bold",
              fontSize: 18,
              letterSpacing: "0.12em",
            }}
          >
            ⚙ SETTINGS
          </span>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: "none",
              border: "none",
              color: BRASS,
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {sections.map((section, i) => (
            <Section key={section.id} label={section.label} last={i === sections.length - 1}>
              {section.content}
            </Section>
          ))}
        </div>
      </aside>
    </>
  );
}

// One labeled block in the drawer (About / Access / Credits / Deck ...). A
// bottom divider separates it from the next section; the last one omits it.
function Section({
  label,
  last,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 18,
        paddingBottom: last ? 0 : 18,
        borderBottom: last ? "none" : `1px solid ${BORDER_DARK}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          color: BRASS_DIM,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  color: "#c9bda1",
  fontFamily: MONO,
  fontSize: 12,
  lineHeight: 1.55,
};

// Brightness chips — content of the "Brightness" section (both pages). Three
// named levels (see dimmer.ts) rendered like the deck's SPEED chips.
export function DimPicker({
  level,
  onLevelChange,
}: {
  level: DimLevel;
  onLevelChange: (level: DimLevel) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {(Object.keys(DIM_LEVELS) as DimLevel[]).map((name) => {
        const active = name === level;
        return (
          <button
            key={name}
            onClick={() => onLevelChange(name)}
            aria-pressed={active}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: active ? "#2a1c08" : BRASS_DIM,
              background: active ? BRASS : "transparent",
              border: `1px solid ${active ? BRASS_LIGHT : BORDER_DARK}`,
              borderRadius: 3,
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            {DIM_LEVELS[name].label}
          </button>
        );
      })}
    </div>
  );
}

// Metal-finish swatch picker — content of Live's "Metal" section. Each disc
// previews its own palette (radial highlight → base → deep, like the deck's
// metal buttons), so the row reads as three little machined knobs.
export function MetalPicker({
  metal,
  onMetalChange,
}: {
  metal: MetalName;
  onMetalChange: (metal: MetalName) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {(Object.keys(METALS) as MetalName[]).map((name) => {
        const m = METALS[name];
        const active = name === metal;
        return (
          <button
            key={name}
            onClick={() => onMetalChange(name)}
            aria-label={`${m.label} metal finish`}
            aria-pressed={active}
            title={m.label}
            style={{
              width: 48,
              height: 48,
              padding: 0,
              borderRadius: "50%",
              border: `2px solid ${active ? BRASS_LIGHT : BORDER_DARK}`,
              boxShadow: active ? `0 0 0 2px rgba(232,200,112,0.35)` : "none",
              background: `radial-gradient(circle at 35% 30%, ${m.bright}, ${m.base} 55%, ${m.deep})`,
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}

// Deck-finish swatch picker — used as the content of Live's "Deck" section.
export function WoodPicker({
  wood,
  onWoodChange,
}: {
  wood: WoodName;
  onWoodChange: (wood: WoodName) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {(Object.keys(WOODS) as WoodName[]).map((name) => {
        const active = name === wood;
        return (
          <button
            key={name}
            onClick={() => onWoodChange(name)}
            aria-label={`${WOODS[name].label} deck finish`}
            aria-pressed={active}
            title={WOODS[name].label}
            style={{
              width: 48,
              height: 48,
              padding: 0,
              borderRadius: 6,
              border: `2px solid ${active ? BRASS_LIGHT : BORDER_DARK}`,
              boxShadow: active ? `0 0 0 2px rgba(232,200,112,0.35)` : "none",
              backgroundImage: `url(${WOODS[name].color})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}
