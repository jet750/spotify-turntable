// ArtSidePanel.tsx
// Optional "sleeve display" — full-size cover art + basic info for the current
// track, sitting to the LEFT of the deck on wide screens. Left because the
// deck's right edge already carries the LIBRARY/SETTINGS tab column and its
// overlays; the sleeve counterweights that chrome so the composition balances.
//
// Toggled in Settings (Art Panel section, default off — see artPanel.ts) and
// gated on viewport width: below MIN_VIEWPORT it renders nothing regardless of
// the toggle, so narrow/mobile layouts never lose deck space to it.
//
// Built from the same furniture recipe as the deck and the Library cabinet:
// chrome-gradient frame, wood color tile + normal-map grain, dim scrim.

import { useEffect, useState } from "react";
import type { SpotifyTrack } from "../lib/useSpotify";
import {
  DEFAULT_WOOD,
  WOODS,
  WoodName,
  WOOD_TILE_PX,
  WOOD_NORMAL_OPACITY,
  WOOD_NORMAL_BLEND,
} from "../lib/woods";

// ─── Palette (matches TurntableVisual.tsx / BrowsePanel.tsx) ────────────────
const BRASS = "var(--m-base, #c49a3c)";
const BRASS_LIGHT = "var(--m-bright, #e8c870)";
const BRASS_DIM = "var(--m-dim-text, #b8945c)";
const BORDER_DARK = "#3a2808";
const MONO = "'Courier New', monospace";
const WALNUT_DARK = "#2a1c08";

// Below this viewport width the panel never renders: the deck needs the room.
const MIN_VIEWPORT = 1100;

function useWideViewport(): boolean {
  const [wide, setWide] = useState(
    () => window.matchMedia(`(min-width: ${MIN_VIEWPORT}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_VIEWPORT}px)`);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export default function ArtSidePanel({
  track,
  wood = DEFAULT_WOOD,
}: {
  track: SpotifyTrack | null;
  wood?: WoodName;
}) {
  const wide = useWideViewport();
  if (!wide) return null;

  return (
    <aside
      aria-label="Now playing artwork"
      style={{
        flex: "0 0 300px",
        width: 300,
        // Outer chrome — same as .deck-region / the Library cabinet.
        background: "linear-gradient(160deg, #7a5228 0%, #5a3c18 40%, #3e2808 100%)",
        border: "2px solid #3a2808",
        borderRadius: 12,
        boxShadow: "0 12px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(232,200,112,0.12)",
        overflow: "hidden",
        fontFamily: MONO,
      }}
    >
      {/* Wood surface — deck plinth fill (highlight wash over wood tile),
          grain overlay + dim scrim as absolute children, content above via
          position:relative (same layering trick as the deck and cabinet). */}
      <div
        style={{
          position: "relative",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          backgroundImage: [
            "linear-gradient(160deg, rgba(120,80,30,0.15) 0%, rgba(60,35,10,0.2) 100%)",
            `url(${WOODS[wood].color})`,
          ].join(", "),
          backgroundSize: `auto, ${WOOD_TILE_PX}px ${WOOD_TILE_PX}px`,
          backgroundRepeat: "no-repeat, repeat",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${WOODS[wood].normal})`,
            backgroundSize: `${WOOD_TILE_PX}px ${WOOD_TILE_PX}px`,
            backgroundRepeat: "repeat",
            mixBlendMode: WOOD_NORMAL_BLEND,
            opacity: WOOD_NORMAL_OPACITY,
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, var(--dim-scrim, 0))",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: BRASS_DIM,
            textTransform: "uppercase",
            // Dim brass on the light wood finishes needs the shadow to read.
            textShadow: "0 1px 3px rgba(0,0,0,0.85)",
          }}
        >
          Now spinning
        </div>

        <div style={{ position: "relative" }}>
          {track?.albumArt ? (
            <img
              src={track.albumArt}
              alt={`${track.album} cover art`}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                borderRadius: 6,
                display: "block",
                background: WALNUT_DARK,
                border: `1px solid ${BORDER_DARK}`,
                boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 6,
                background: "radial-gradient(circle at 35% 30%, var(--m-bright, #e8c870), var(--m-base, #c49a3c) 55%, var(--m-deep, #8a6820))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--m-text-on, #3d2100)",
                fontSize: 48,
              }}
            >
              ◉
            </div>
          )}
        </div>

        <div
          style={{
            position: "relative",
            background: "rgba(24, 15, 5, 0.55)",
            border: `1px solid ${BORDER_DARK}`,
            borderRadius: 6,
            padding: "10px 12px",
          }}
        >
          {track ? (
            <>
              <div
                style={{
                  color: BRASS_LIGHT,
                  fontFamily: "Georgia, serif",
                  fontWeight: "bold",
                  fontSize: 16,
                  lineHeight: 1.3,
                  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                }}
              >
                {track.name}
              </div>
              <div style={{ color: BRASS, fontSize: 12, marginTop: 4 }}>{track.artist}</div>
              <div style={{ color: BRASS_DIM, fontSize: 11, marginTop: 6 }}>{track.album}</div>
            </>
          ) : (
            <div style={{ color: BRASS_DIM, fontSize: 11 }}>Nothing on the platter.</div>
          )}
        </div>
      </div>
    </aside>
  );
}
