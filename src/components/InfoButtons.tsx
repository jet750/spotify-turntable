// InfoButtons.tsx
// A compact, centered row of small round brass icon-buttons that sits under the
// turntable and replaces the old always-visible text blocks (demo explainer, CC
// credits, live access/help). Each button opens a single InfoPopover — a dark
// walnut card with a brass border. Only one is open at a time; Escape and an
// outside click both close it. Nothing here ever unmounts the turntable, so
// playback keeps going while a popover is open.

import { useEffect, useRef, useState } from "react";

// ─── Palette (matches TurntableVisual / BrowsePanel) ────────────────────────
const BRASS = "#c49a3c";
const BRASS_LIGHT = "#e8c870";
const BRASS_DIM = "#a08040";
const WALNUT_DEEP = "#3e2808";
const WALNUT_DARK = "#2a1c08";
const BORDER_DARK = "#3a2808";
const MONO = "'Courier New', monospace";

export interface InfoItem {
  id: string;
  icon: string; // glyph shown in the round button (e.g. "ⓘ", "♪", "🔑")
  label: string; // popover title + accessible name
  content: React.ReactNode;
}

export default function InfoButtonRow({ items }: { items: InfoItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape close — only wired while a popover is open.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [openId]);

  const active = items.find((i) => i.id === openId) ?? null;

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "flex", justifyContent: "center" }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {items.map((item) => {
          const isOpen = item.id === openId;
          return (
            <button
              key={item.id}
              onClick={() => setOpenId((id) => (id === item.id ? null : item.id))}
              aria-label={item.label}
              aria-expanded={isOpen}
              title={item.label}
              style={roundBtn(isOpen)}
            >
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
                {item.icon}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <InfoPopover
          icon={active.icon}
          label={active.label}
          onClose={() => setOpenId(null)}
        >
          {active.content}
        </InfoPopover>
      )}
    </div>
  );
}

// 40px touch target, ~32px visual brass disc; brightens while open.
function roundBtn(open: boolean): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: open
      ? "radial-gradient(circle at 35% 30%, #f0d488, #c49a3c 60%, #8a6820)"
      : "radial-gradient(circle at 35% 30%, #c49a3c, #a07828 60%, #6a4e18)",
    border: `1px solid ${open ? BRASS_LIGHT : BRASS}`,
    color: "#2a1c08",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: open
      ? "0 0 10px 2px rgba(232,200,112,0.4), inset 0 1px 0 rgba(255,235,170,0.5)"
      : "0 2px 8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,220,120,0.35)",
    transition: "all 0.2s",
    padding: 0,
    flex: "0 0 auto",
  };
}

// ─── Reusable popover card (dark walnut, brass border, ✕ close) ─────────────
function InfoPopover({
  icon,
  label,
  children,
  onClose,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={label}
      style={{
        position: "absolute",
        bottom: "calc(100% + 12px)", // float above the button row
        left: "50%",
        transform: "translateX(-50%)",
        width: "max-content",
        maxWidth: "min(300px, calc(100vw - 32px))", // never wider than the viewport
        background: `linear-gradient(160deg, ${WALNUT_DEEP} 0%, ${WALNUT_DARK} 100%)`,
        border: `1px solid ${BRASS}`,
        borderRadius: 8,
        padding: "12px 14px 14px",
        boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
        zIndex: 1001,
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: BRASS_LIGHT,
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span aria-hidden>{icon}</span>
          {label}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            color: BRASS,
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
            padding: 2,
          }}
        >
          ✕
        </button>
      </div>
      <div
        style={{
          color: "#c9bda1",
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Helper for muted/secondary lines inside popover content (e.g. credits).
export function infoMutedStyle(): React.CSSProperties {
  return { color: BRASS_DIM, fontSize: 11, lineHeight: 1.5 };
}
