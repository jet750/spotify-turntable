// HowTo.tsx — a compact paged how-to that lives inside the SETTINGS drawer
// ("How-To" section). Four short screens: connect, transport, the tonearm
// gesture, extras. ‹ › buttons, dot indicators, horizontal swipe on touch,
// and ←/→ while the pager has focus (stopPropagation keeps those presses
// from also driving the deck's document-level seek shortcuts).

import { useRef, useState } from "react";

// Metal-aware accents (see metals.ts); walnut tones stay fixed.
const BRIGHT = "var(--m-bright, #e8c870)";
const BASE = "var(--m-base, #c49a3c)";
const DIM = "var(--m-dim, #a08040)";
const SHADE = "var(--m-shade, #6a5018)";
const MONO = "'Courier New', monospace";

const SWIPE_MIN_PX = 40; // horizontal travel that counts as a page swipe

interface Screen {
  title: string;
  body: React.ReactNode;
}

const b = (text: string) => <b style={{ color: BRIGHT }}>{text}</b>;

const SCREENS: Screen[] = [
  {
    title: "Connect",
    body: (
      <>
        On the live deck, hit {b("CONNECT")} and authorize your Spotify{" "}
        {b("Premium")} account. If sound is playing somewhere else, press{" "}
        {b("▶ THIS DEVICE")} to pull playback onto the turntable. (The demo
        deck needs no account — just press play.)
      </>
    ),
  },
  {
    title: "Controls",
    body: (
      <>
        {b("▶")} starts the record, {b("■")} stops it. {b("LIFT")} raises the
        needle to pause in place; {b("DROP")} sets it back down. Tap {b("⏭")}{" "}
        to skip — hold it to fast-forward. Click or drag the progress bar to
        seek. Keyboard: {b("Space")} start/stop, {b("← →")} seek.
      </>
    ),
  },
  {
    title: "The Arm",
    body: (
      <>
        The tonearm is real: {b("grab it")}, drag it over the record, and let
        go. Where it lands is where the music plays from — the {b("outer edge")}{" "}
        is the start of the track, the inner grooves are the end. Drag it off
        the record to park it.
      </>
    ),
  },
  {
    title: "Extras",
    body: (
      <>
        The {b("SPEED")} plate switches 33⅓ / 45 RPM. {b("CRACKLE")} adds
        vinyl surface noise under the music. On the live deck, {b("LIBRARY")}{" "}
        (right edge) picks what plays next, and the {b("Deck")} / {b("Metal")}{" "}
        sections above re-finish the hardware.
      </>
    ),
  },
];

export default function HowToPager() {
  const [page, setPage] = useState(0);
  const last = SCREENS.length - 1;
  const swipeStartX = useRef<number | null>(null);

  const go = (next: number) => setPage(Math.max(0, Math.min(next, last)));

  return (
    <div
      role="group"
      aria-label={`How-to, screen ${page + 1} of ${SCREENS.length}: ${SCREENS[page].title}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation(); // don't let the deck's seek shortcut fire too
        go(page + (e.key === "ArrowRight" ? 1 : -1));
      }}
      onPointerDown={(e) => {
        swipeStartX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (swipeStartX.current === null) return;
        const dx = e.clientX - swipeStartX.current;
        swipeStartX.current = null;
        if (Math.abs(dx) >= SWIPE_MIN_PX) go(page + (dx < 0 ? 1 : -1));
      }}
      style={{ touchAction: "pan-y", outlineOffset: 4 }}
    >
      {/* Screen card — fixed min height so the drawer doesn't jump per page */}
      <div style={{ minHeight: 128 }} aria-live="polite">
        <div
          style={{
            color: BRIGHT,
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {page + 1} · {SCREENS[page].title}
        </div>
        <div style={{ color: "#c9bda1", fontFamily: MONO, fontSize: 12, lineHeight: 1.55 }}>
          {SCREENS[page].body}
        </div>
      </div>

      {/* Nav row: ‹ dots › */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 12,
        }}
      >
        <PagerArrow dir="prev" disabled={page === 0} onClick={() => go(page - 1)} />
        <div style={{ display: "flex", gap: 8 }} aria-hidden>
          {SCREENS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: i === page ? BASE : "transparent",
                border: `1px solid ${i === page ? BRIGHT : SHADE}`,
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>
        <PagerArrow dir="next" disabled={page === last} onClick={() => go(page + 1)} />
      </div>
    </div>
  );
}

function PagerArrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous how-to screen" : "Next how-to screen"}
      style={{
        background: "none",
        border: `1px solid ${disabled ? SHADE : BASE}`,
        borderRadius: 4,
        color: disabled ? SHADE : DIM,
        fontFamily: MONO,
        fontSize: 14,
        lineHeight: 1,
        padding: "4px 10px",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {dir === "prev" ? "‹" : "›"}
    </button>
  );
}
