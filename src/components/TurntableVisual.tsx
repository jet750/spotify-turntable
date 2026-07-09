// TurntableVisual.tsx
// Presentational turntable. Driven by props + the useTonearm state machine.
// The arm auto-cues on START, sweeps across the record in sync with song progress
// (true-arc geometry), lifts in place on CUE, can be grabbed and dragged to seek,
// and returns slowly to rest on STOP.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpotifyTrack } from "../lib/useSpotify";
import { useTonearm, ArmState } from "../lib/useTonearm";
import { useVinylNoise } from "../lib/useVinylNoise";
import {
  WOODS,
  DEFAULT_WOOD,
  WOOD_TILE_PX,
  WOOD_NORMAL_OPACITY,
  WOOD_NORMAL_BLEND,
  WoodName,
} from "../lib/woods";

export type TurntableMode = "live" | "demo";

// ─── FEEL constants — tune by eye ────────────────────────────────────────────
// FEEL: tune by eye — platter speeds + inertia. RPM_45 / RPM_33 is also the
// audio playbackRate handed to onSetPlaybackRate (demo mode), so the record
// genuinely speeds up AND pitches up where the player allows it (Item 6).
const RPM_33 = 33.333;
const RPM_45 = 45;
const SPIN_UP_MS = 800; // time to reach 33⅓ from rest
const SPIN_DOWN_MS = 3200; // coast time from full speed to a stop

// FEEL: tune by eye — spin motion-blur (Item 7). Implemented as ghost copies of
// the label art rotated ±BLUR_GHOST_DEG inside the composited spinning layer —
// a tangential smear that fades in with the motor. Opacity changes only on
// spin-state transitions (CSS-eased), so spinning costs no per-frame repaints.
// (The grooves themselves are rotation-invariant circles — only the label can
// visibly blur, which is also what the eye tracks on real vinyl.)
const BLUR_GHOST_DEG = 2.6; // smear angle of each ghost copy
const BLUR_MAX_OPACITY = 0.3; // ghost opacity at full blur (45 RPM)
const BLUR_33_LEVEL = 0.7; // fraction of full blur while at 33⅓
const BLUR_FADE_MS = 700; // blur fade-in/out ≈ the spin-up feel

// ─── Metal finish (Settings → Metal) ─────────────────────────────────────────
// Every brass-family tone routes through a CSS custom property set on the page
// stage (see metals.ts / metalCssVars); the fallback is the classic brass so
// the deck renders identically if no stage sets the vars. SVG gradient stops
// read these via style={{ stopColor }} — presentation attributes can't carry
// var() — everything else uses them like any other color string.
const M = {
  bright: "var(--m-bright, #e8c870)",
  brightest: "var(--m-brightest, #f0d080)",
  base: "var(--m-base, #c49a3c)",
  mid: "var(--m-mid, #d4a843)",
  accent: "var(--m-accent, #e0b450)",
  dim: "var(--m-dim, #a07828)",
  deep: "var(--m-deep, #8a6820)",
  detail: "var(--m-detail, #b08020)",
  shade: "var(--m-shade, #6a5018)",
  plateTop: "var(--m-plate-top, #6a4e18)",
  plateBottom: "var(--m-plate-bottom, #523a10)",
  weight: "var(--m-weight, #8a7040)",
  textOn: "var(--m-text-on, #3d2100)",
  // Glow alphas ride the dim level (Item 5): --dim-glow scales the metal's
  // shine down in soft/dim mode without touching any text color.
  glow: (a: number) => `rgba(var(--m-glow-rgb, 232,200,112), calc(${a} * var(--dim-glow, 1)))`,
};

export interface TurntableVisualProps {
  track: SpotifyTrack | null;
  isAuthenticated: boolean;
  isConnected: boolean;
  error?: string | null;
  onDismissError?: () => void;
  // Informational "why the deck isn't doing what you expect" line (session
  // expired / playback moved elsewhere / no active device). Amber, dismissible
  // — a state explanation, not a fault.
  notice?: string | null;
  onDismissNotice?: () => void;
  mode?: TurntableMode;
  // Selected deck wood finish (Settings tab, live-only). Falls back to the
  // catalog default so callers that don't customize it (e.g. Home's demo
  // deck) still render a real wood surface instead of a flat fill.
  deckWood?: WoodName;
  // CSS scale the deck is rendered at (set by DeckScaler). Forwarded to the
  // tonearm so drag-to-seek converts pointer px correctly. Defaults to 1.
  scale?: number;
  // Full needle-drop cue for a NEW record (Item 3): bump this counter and the
  // deck pauses current audio, swings the arm to the outer groove, and fires
  // onCueLand exactly as the stylus touches — the caller starts playback there.
  cueRequestId?: number;
  onCueLand?: () => void;
  // 45 RPM Easter egg (Item 6): optional hook to genuinely change the AUDIO
  // rate when the platter speed changes. Demo mode passes a real setter (the
  // <audio> element supports playbackRate). LIVE MODE LIMITATION: the Spotify
  // Web Playback SDK exposes no rate/pitch control — the DRM'd stream is fixed
  // at 1× and periodic seek-nudging would just stutter — so live leaves this
  // undefined and the 45 setting changes the VISUAL spin speed only.
  onSetPlaybackRate?: (rate: number) => void;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onTransfer: () => void;
  onLogin: () => void;
  onLogout: () => void;
}

// ─── Vinyl Record SVG ─────────────────────────────────────────────────────
function VinylRecord({
  albumArt,
  isSpinning,
  rotationDeg,
  blur01 = 0,
}: {
  albumArt: string | null;
  isSpinning: boolean;
  rotationDeg: number;
  // 0..1 motion-blur amount (Item 7). Changes only on spin-state transitions.
  blur01?: number;
}) {
  const size = 320;
  const r = size / 2;
  const labelRadius = r * 0.345;
  const grooves = Array.from({ length: 22 }, (_, i) => ({
    r: r * 0.41 + i * ((r * 0.92 - r * 0.41) / 22),
    opacity: 0.4 + (i % 3) * 0.12,
    width: i % 4 === 0 ? 0.7 : 0.4,
  }));

  // The label face, reused for the main print and the two motion-blur ghosts
  // (Item 7). Ghosts are the same node rotated a few degrees either way — a
  // tangential smear, exactly what a fast label does to the eye.
  const label = albumArt ? (
    <image
      href={albumArt}
      x={r - labelRadius}
      y={r - labelRadius}
      width={labelRadius * 2}
      height={labelRadius * 2}
      clipPath="url(#labelClip)"
      preserveAspectRatio="xMidYMid slice"
    />
  ) : (
    <g clipPath="url(#labelClip)">
      <circle cx={r} cy={r} r={labelRadius} fill="#d4a843" />
      <text x={r} y={r} textAnchor="middle" fill="#3d2100" fontSize={labelRadius * 0.2} fontFamily="Georgia, serif" fontWeight="bold">
        VINYL
      </text>
    </g>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        transform: `rotate(${rotationDeg}deg)`,
        transition: isSpinning ? "none" : "transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94)",
        display: "block",
        // brightness() follows the dim level (Item 5) so the bright label art
        // dims with the room; static per setting, no per-frame filter changes.
        filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.7)) brightness(var(--dim-record, 1))",
        // Promote the spinning platter+label to its own compositor layer so the
        // per-frame rotation is handled by the GPU, not relayout/repaint (Item 4).
        willChange: "transform",
      }}
    >
      <defs>
        <radialGradient id="vinylBase" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1e1e1e" />
          <stop offset="55%" stopColor="#0d0d0d" />
          <stop offset="100%" stopColor="#050505" />
        </radialGradient>
        <radialGradient id="vinylSheen" cx="38%" cy="32%" r="60%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.01)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id="labelClip">
          <circle cx={r} cy={r} r={labelRadius} />
        </clipPath>
      </defs>

      <circle cx={r} cy={r} r={r - 1} fill="url(#vinylBase)" />
      {grooves.map((gr, i) => (
        <circle key={i} cx={r} cy={r} r={gr.r} fill="none" stroke="#2a2a2a" strokeWidth={gr.width} opacity={gr.opacity} />
      ))}
      <circle cx={r} cy={r} r={r - 1} fill="url(#vinylSheen)" />

      <circle cx={r} cy={r} r={labelRadius} fill="#c8a84b" />
      {label}
      {/* Motion-blur ghosts (Item 7): the label again at ±BLUR_GHOST_DEG, faded
          in while spinning. Static transforms + a rare opacity change (CSS-eased
          on spin-state transitions), all inside the composited spinning layer —
          no per-frame filter/repaint work. */}
      <g
        transform={`rotate(${-BLUR_GHOST_DEG} ${r} ${r})`}
        style={{ opacity: blur01 * BLUR_MAX_OPACITY, transition: `opacity ${BLUR_FADE_MS}ms ease` }}
      >
        {label}
      </g>
      <g
        transform={`rotate(${BLUR_GHOST_DEG} ${r} ${r})`}
        style={{ opacity: blur01 * BLUR_MAX_OPACITY, transition: `opacity ${BLUR_FADE_MS}ms ease` }}
      >
        {label}
      </g>

      <circle cx={r} cy={r} r={6} fill="#111" stroke="#333" strokeWidth="1" />
      <circle cx={r} cy={r} r={3} fill="#222" />
    </svg>
  );
}

// ─── Tonearm SVG (positioned at the pivot; rotated by the spring) ───────────
// The swing angle is spring-integrated per frame (Item 2), so the rotation has
// NO CSS transition — only the vertical lift (translateY) keeps an easing.
function Tonearm({
  angleDeg,
  lifted,
  pivotX,
  pivotY,
  onPointerDown,
}: {
  angleDeg: number;
  lifted: boolean;
  pivotX: number;
  pivotY: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  // FEEL: tune by eye — vertical needle lift (px) and its raise/drop easing (ms).
  // The DROP time is the audible "needle meets record" moment (Items 2/3).
  const LIFT_PX = 5;
  const LIFT_RAISE_MS = 180;
  const LIFT_DROP_MS = 220;
  // Local pivot inside the artwork box is (118, 38); place that at (pivotX,pivotY).
  return (
    <div
      style={{
        position: "absolute",
        left: pivotX - 118,
        top: pivotY - 38,
        width: 140,
        height: 260,
        transform: `translateY(${lifted ? -LIFT_PX : 0}px)`,
        transition: `transform ${lifted ? LIFT_RAISE_MS : LIFT_DROP_MS}ms ease`,
        zIndex: 20,
        pointerEvents: "auto",
        cursor: lifted ? "grabbing" : "grab",
        filter: lifted ? "drop-shadow(0 10px 10px rgba(0,0,0,0.55))" : "drop-shadow(0 3px 4px rgba(0,0,0,0.4))",
        // The tonearm is its own compositor layer (Item 4) — the rotation below is
        // the per-frame hot path now that it tracks the progress clock.
        willChange: "transform",
      }}
      onPointerDown={onPointerDown}
    >
      <div
        style={{
          width: 140,
          height: 260,
          transformOrigin: "118px 38px",
          transform: `rotate(${angleDeg}deg)`,
          transition: "none", // spring-driven per frame (Item 2)
          willChange: "transform",
        }}
      >
        <svg width="140" height="260" viewBox="0 0 140 260" overflow="visible">
          <defs>
            <radialGradient id="pivotGrad" cx="40%" cy="35%">
              <stop offset="0%" style={{ stopColor: M.bright }} />
              <stop offset="50%" style={{ stopColor: M.base }} />
              <stop offset="100%" style={{ stopColor: M.deep }} />
            </radialGradient>
            <linearGradient id="armGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: M.mid }} />
              <stop offset="50%" style={{ stopColor: M.base }} />
              <stop offset="100%" style={{ stopColor: M.dim }} />
            </linearGradient>
          </defs>

          <line x1="118" y1="38" x2="134" y2="18" style={{ stroke: M.detail }} strokeWidth="3" strokeLinecap="round" />
          <circle cx="134" cy="14" r="5" style={{ fill: M.base, stroke: M.bright }} strokeWidth="1" />
          <line x1="118" y1="38" x2="28" y2="215" stroke="url(#armGrad)" strokeWidth="5" strokeLinecap="round" />
          <line x1="28" y1="215" x2="18" y2="228" style={{ stroke: M.base }} strokeWidth="4" strokeLinecap="round" />
          <rect x="8" y="224" width="22" height="14" rx="3" style={{ fill: M.detail, stroke: M.mid }} strokeWidth="1" />
          <rect x="10" y="237" width="18" height="8" rx="2" style={{ fill: M.shade, stroke: M.detail }} strokeWidth="0.8" />
          <line x1="19" y1="245" x2="19" y2="252" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="100" y="50" width="36" height="24" rx="4" style={{ fill: M.weight, stroke: M.base }} strokeWidth="1" />
          <circle cx="118" cy="38" r="18" fill="url(#pivotGrad)" style={{ stroke: M.brightest }} strokeWidth="1.5" />
          <circle cx="118" cy="38" r="10" style={{ fill: M.deep, stroke: M.base }} strokeWidth="1" />
          <circle cx="118" cy="38" r="4" style={{ fill: M.base }} />
        </svg>
      </div>
    </div>
  );
}

// ─── Control Strip ────────────────────────────────────────────────────────
interface ControlsProps {
  armState: ArmState;
  ledOn: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  mode: TurntableMode;
  progressMs: number;
  durationMs: number;
  onStart: () => void;
  onStop: () => void;
  onCue: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (ms: number) => void;
  onTransfer: () => void;
  onLogin: () => void;
  onLogout: () => void;
}

function ctrlBtn(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    color: M.mid,
    fontSize: "1.05em",
    cursor: "pointer",
    padding: "4px 6px",
    fontFamily: "'Courier New', monospace",
    ...extra,
  };
}

function ControlStrip(p: ControlsProps) {
  const isDemo = p.mode === "demo";
  const running = p.armState !== "parked" && p.armState !== "returning";
  const seekEnabled = isDemo || p.isAuthenticated;
  const canCue = p.armState === "playing" || p.armState === "lifted";

  // Press-and-hold ⏭ to scrub forward; a quick tap skips to the next track.
  const ff = useRef<{
    start: number;
    pos: number;
    held: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    interval: ReturnType<typeof setInterval> | null;
  }>({ start: 0, pos: 0, held: false, timer: null, interval: null });

  const ffDown = () => {
    if (!seekEnabled) return;
    const st = ff.current;
    st.start = Date.now();
    st.held = false;
    st.pos = p.progressMs;
    st.timer = setTimeout(() => {
      st.held = true;
      let step = 4000; // ms of song per tick, accelerating
      st.interval = setInterval(() => {
        st.pos = st.pos + step;
        if (p.durationMs) st.pos = Math.min(st.pos, p.durationMs);
        p.onSeek(st.pos);
        step = Math.min(step + 1500, 20000);
        if (p.durationMs && st.pos >= p.durationMs && st.interval) {
          clearInterval(st.interval);
          st.interval = null;
        }
      }, 120);
    }, 300);
  };

  const ffUp = () => {
    const st = ff.current;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    if (st.interval) { clearInterval(st.interval); st.interval = null; }
    if (!st.held) p.onNext(); // short tap = skip track
    st.held = false;
  };

  let authLabel = "CONNECT";
  let authHandler: () => void = p.onLogin;
  if (p.isAuthenticated) {
    authLabel = "LOGOUT";
    authHandler = p.onLogout;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        background: "linear-gradient(180deg, #5a3e1e 0%, #4a3010 100%)",
        borderTop: "2px solid #3a2008",
        borderRadius: "0 0 10px 10px",
      }}
    >
      {/* Left: LED + auth (live) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: p.ledOn ? "#ffaa00" : "#4a3800",
            boxShadow: p.ledOn ? "0 0 8px 3px rgba(255,160,0,0.6)" : "none",
            transition: "all 0.3s ease",
          }}
        />
        {!isDemo && (
          <button
            onClick={authHandler}
            aria-label={p.isAuthenticated ? "Log out of Spotify" : "Connect Spotify"}
            style={{
              // Darkened from the old #8a6828 top so the #f0d080 label clears WCAG AA
              // 4.5:1 across the whole button (Item 10).
              background: `linear-gradient(180deg, ${M.plateTop} 0%, ${M.plateBottom} 100%)`,
              border: `1px solid ${M.base}`,
              borderRadius: 3,
              padding: "4px 10px",
              color: M.brightest,
              fontSize: "0.55em",
              fontFamily: "'Courier New', monospace",
              letterSpacing: "0.14em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {authLabel}
          </button>
        )}
        {!isDemo && p.isAuthenticated && !p.isConnected && (
          <button
            onClick={p.onTransfer}
            aria-label="Transfer playback to this device"
            style={{
              background: "transparent",
              border: `1px solid ${M.base}`,
              borderRadius: 3,
              padding: "4px 8px",
              color: M.accent,
              fontSize: "0.5em",
              fontFamily: "'Courier New', monospace",
              letterSpacing: "0.1em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            ▶ THIS DEVICE
          </button>
        )}
      </div>

      {/* Center: CUE · PREV · START/STOP · NEXT */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={p.onCue}
          disabled={!canCue}
          aria-label={p.armState === "lifted" ? "Drop the tonearm" : "Lift the tonearm"}
          title="Cue (lift / drop the arm)"
          style={ctrlBtn({
            border: `1px solid ${M.deep}`,
            borderRadius: 3,
            padding: "3px 8px",
            fontSize: "0.5em",
            letterSpacing: "0.12em",
            color: canCue ? M.bright : M.shade,
            cursor: canCue ? "pointer" : "default",
          })}
        >
          {p.armState === "lifted" ? "DROP" : "LIFT"}
        </button>

        <button onClick={p.onPrev} disabled={!seekEnabled} aria-label="Previous track" style={ctrlBtn({ color: seekEnabled ? M.accent : M.shade, cursor: seekEnabled ? "pointer" : "default" })}>
          ⏮
        </button>

        <button
          onClick={running ? p.onStop : p.onStart}
          disabled={!seekEnabled}
          aria-label={running ? "Stop" : "Start"}
          title={running ? "Stop" : "Start"}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: seekEnabled
              ? `radial-gradient(circle at 35% 35%, ${M.bright}, ${M.base}, ${M.deep})`
              : "radial-gradient(circle at 35% 35%, #6a5818, #4a3810, #2a1800)",
            border: `2px solid ${seekEnabled ? M.brightest : "#4a3800"}`,
            boxShadow: seekEnabled ? `0 3px 10px rgba(0,0,0,0.5), inset 0 1px 0 ${M.glow(0.3)}` : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: seekEnabled ? "pointer" : "default",
            transition: "all 0.2s",
          }}
        >
          <span style={{ fontSize: "0.95em", color: seekEnabled ? M.textOn : "#2a1800" }}>
            {running ? "■" : "▶"}
          </span>
        </button>

        <button
          onPointerDown={ffDown}
          onPointerUp={ffUp}
          onPointerLeave={ffUp}
          disabled={!seekEnabled}
          aria-label="Next track (hold to fast-forward)"
          title="Tap = next track · hold = fast-forward"
          style={ctrlBtn({ color: seekEnabled ? M.accent : M.shade, cursor: seekEnabled ? "pointer" : "default" })}
        >
          ⏭
        </button>
      </div>

      {/* Right: model plate */}
      <div
        style={{
          background: `linear-gradient(180deg, ${M.base} 0%, ${M.dim} 100%)`,
          border: `1px solid ${M.bright}`,
          borderRadius: 3,
          padding: "5px 12px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "0.5em", color: M.textOn, fontFamily: "'Courier New', monospace", letterSpacing: "0.15em" }}>
          OB-1974
        </div>
        <div style={{ fontSize: "0.4em", color: "#140a00", fontFamily: "'Courier New', monospace" }}>
          {isDemo ? "● DEMO" : p.isConnected ? "● ACTIVE" : p.isAuthenticated ? "○ READY" : "○ OFFLINE"}
        </div>
      </div>
    </div>
  );
}

// ─── Track Info Bar (with click/drag seek) ────────────────────────────────
function TrackInfo({
  track,
  progressMs,
  onSeek,
  enabled,
}: {
  track: SpotifyTrack | null;
  // Smoothed, locally-extrapolated position (Item 2) — drives the bar + timecode
  // every frame, instead of the 3s-stepped track.progressMs.
  progressMs: number;
  onSeek?: (ms: number) => void;
  enabled?: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingBar = useRef(false);
  const seekRef = useRef<(clientX: number) => void>(() => {});

  const durationMs = track?.durationMs ?? 0;
  const seekable = !!onSeek && !!enabled && durationMs > 0;
  seekRef.current = (clientX: number) => {
    const el = barRef.current;
    if (!el || !seekable || !track) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek!(frac * track.durationMs);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (draggingBar.current) seekRef.current(e.clientX);
    };
    const up = () => {
      draggingBar.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  if (!track) {
    return (
      <div style={{ padding: "8px 20px", background: "#2a1c08", borderTop: "1px solid #3a2808", textAlign: "center" }}>
        <span style={{ fontSize: "0.6em", color: "#b89a5e", fontFamily: "'Courier New', monospace", letterSpacing: "0.2em" }}>
          NO TRACK LOADED
        </span>
      </div>
    );
  }
  const progress = durationMs > 0 ? (progressMs / durationMs) * 100 : 0;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return (
    <div style={{ padding: "8px 20px 10px", background: "#2a1c08", borderTop: "1px solid #3a2808" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <div>
          <span style={{ fontSize: "0.7em", color: M.bright, fontFamily: "Georgia, serif", fontWeight: "bold" }}>{track.name}</span>
          <span style={{ fontSize: "0.55em", color: "#b0905a", fontFamily: "'Courier New', monospace", marginLeft: 8 }}>{track.artist}</span>
        </div>
        <span style={{ fontSize: "0.5em", color: "#b89a5e", fontFamily: "'Courier New', monospace" }}>
          {fmt(progressMs)} / {fmt(track.durationMs)}
        </span>
      </div>
      <div
        ref={barRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.floor(durationMs / 1000)}
        aria-valuenow={Math.floor(progressMs / 1000)}
        aria-valuetext={`${fmt(progressMs)} of ${fmt(durationMs)}`}
        aria-disabled={!seekable}
        tabIndex={seekable ? 0 : -1}
        onPointerDown={(e) => {
          if (!seekable) return;
          draggingBar.current = true;
          seekRef.current(e.clientX);
        }}
        title={seekable ? "Click or drag to seek" : undefined}
        style={{ display: "flex", alignItems: "center", height: 12, cursor: seekable ? "pointer" : "default" }}
      >
        <div style={{ height: 4, width: "100%", background: "#3a2808", borderRadius: 2, overflow: "hidden" }}>
          {/* Fill driven directly by the per-frame clock via a composited
              transform: scaleX (Item 4) — no per-frame width/layout, no CSS
              transition (the rAF already updates it every frame). The track's
              overflow:hidden + border-radius round the visible ends. */}
          <div
            style={{
              height: "100%",
              width: "100%",
              transformOrigin: "left center",
              transform: `scaleX(${Math.max(0, Math.min(progress / 100, 1))})`,
              background: `linear-gradient(90deg, ${M.base}, ${M.bright})`,
              willChange: "transform",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function TurntableVisual({
  track,
  isAuthenticated,
  isConnected,
  error,
  onDismissError,
  notice,
  onDismissNotice,
  mode = "live",
  deckWood = DEFAULT_WOOD,
  scale = 1,
  cueRequestId,
  onCueLand,
  onSetPlaybackRate,
  onTogglePlay,
  onSeek,
  onNext,
  onPrev,
  onTransfer,
  onLogin,
  onLogout,
}: TurntableVisualProps) {
  const deckRef = useRef<HTMLDivElement>(null);
  const isPlaying = track?.isPlaying ?? false;
  const durationMs = track?.durationMs ?? 0;

  // ── Local progress clock (Item 2) ───────────────────────────────────────────
  // The player only hands us a fresh progressMs every ~3s (REST poll) or on an SDK
  // event. Driving the UI straight off that makes the %-bar jump in 3s steps and
  // desync after a lift/seek. Instead we keep a local anchor {pos, t} and, while
  // the song is advancing, extrapolate progress every animation frame from it. A
  // poll / player_state_changed is treated as a CORRECTION that resets the anchor;
  // a seek / lift / drop / stop sets the anchor immediately so the bar + needle
  // move with no lag. The actual frame-by-frame advance happens in the platter rAF
  // loop below (one loop, math only) — see the `advancing` block there.
  //
  // After a local seek we briefly defer to the local anchor (SEEK_SETTLE_MS) so an
  // already-in-flight stale poll can't snap the bar back to the pre-seek position;
  // polls resume correcting once the player has caught up. Mechanism, not feel —
  // tune the window if Spotify's echo proves slower.
  const SEEK_SETTLE_MS = 1500;
  const anchorRef = useRef({ pos: track?.progressMs ?? 0, t: 0 });
  const liveProgressRef = useRef(track?.progressMs ?? 0);
  const lastSeekRef = useRef(-Infinity);
  const prevAdvancingRef = useRef(false);
  const [liveProgressMs, setLiveProgressMs] = useState(track?.progressMs ?? 0);

  // Inputs the rAF loop reads each frame (kept live without re-subscribing it).
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;

  const progress01 = durationMs > 0 ? Math.min(liveProgressMs / durationMs, 1) : 0;

  // Move the LOCAL clock only (anchor + shield window) without telling the
  // player — used by real seeks below, and by the new-record cue (Item 3),
  // where the incoming context starts at 0 on its own.
  const localSeekMs = (ms: number) => {
    anchorRef.current = { pos: ms, t: performance.now() };
    liveProgressRef.current = ms;
    lastSeekRef.current = performance.now();
    setLiveProgressMs(ms);
  };

  // Seek that also moves the local clock instantly, then forwards to the player.
  // Wakes the animation loop (via ref — ensureLoop is defined below) so the arm
  // spring can glide to the new groove radius even if the deck was idle.
  const ensureLoopRef = useRef<() => void>(() => {});
  const seekTo = (ms: number) => {
    const clamped = durationMs > 0 ? Math.max(0, Math.min(ms, durationMs)) : Math.max(0, ms);
    localSeekMs(clamped);
    onSeek(ms);
    ensureLoopRef.current();
  };

  // Map the arm's start/pause/seek onto whatever player is wired in.
  const ensurePlay = () => {
    if (!isPlaying) onTogglePlay();
  };
  const ensurePause = () => {
    if (isPlaying) onTogglePlay();
  };
  const seek01 = (p: number) => seekTo(p * durationMs);

  // ── Vinyl crackle overlay (Item 4) ─────────────────────────────────────────
  // One-shot drop crackle fires from the arm's needle-down moments; the ambient
  // bed runs only while the needle is riding a spinning record ("playing").
  const noise = useVinylNoise();

  const arm = useTonearm({
    progress01,
    deckRef,
    scale,
    isPlaying,
    ensurePlay,
    ensurePause,
    seek01,
    onNeedleDown: noise.playNeedleDrop,
  });

  useEffect(() => {
    noise.setBedActive(arm.state === "playing");
  }, [arm.state, noise.setBedActive]);

  // ── New-record needle-drop cue (Item 3) ─────────────────────────────────────
  // A bumped cueRequestId means "a fresh record just went on" (Library pick).
  // Silence the current audio, zero the local clock so the arm targets the
  // outer groove, and swing over — onCueLand (which starts the new context)
  // fires only as the stylus touches down.
  const onCueLandRef = useRef(onCueLand);
  onCueLandRef.current = onCueLand;
  const lastCueReqRef = useRef(cueRequestId);
  useEffect(() => {
    if (cueRequestId === undefined || cueRequestId === lastCueReqRef.current) return;
    lastCueReqRef.current = cueRequestId;
    ensurePause();
    localSeekMs(0);
    arm.cueTo(() => onCueLandRef.current?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueRequestId]);

  // Correction: a fresh player/SDK reading re-anchors the local clock — unless a
  // local seek was just issued, in which case we ride the optimistic anchor until
  // the player echoes the new position (see SEEK_SETTLE_MS above).
  useEffect(() => {
    if (performance.now() - lastSeekRef.current < SEEK_SETTLE_MS) return;
    const pos = track?.progressMs ?? 0;
    anchorRef.current = { pos, t: performance.now() };
    liveProgressRef.current = pos;
    setLiveProgressMs(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, track?.progressMs, track?.isPlaying, track?.durationMs]);

  // Any arm transition (lift / drop / stop / cue) re-anchors the clock to the
  // CURRENTLY displayed position so the bar + needle don't snap, and marks it as a
  // local anchor so the settle window shields it from a stale poll.
  useEffect(() => {
    anchorRef.current = { pos: liveProgressRef.current, t: performance.now() };
    lastSeekRef.current = performance.now();
  }, [arm.state]);

  // ── Keyboard transport (Item 6) ─────────────────────────────────────────────
  // Space = start/stop · ←/→ = seek · Shift+←/→ or [/] = prev/next. Only when the
  // page/deck has focus and NOT while typing in a field; a focused transport button
  // keeps its own Space/Enter activation (no double-fire). The handler reads live
  // values from a ref so it can bind once instead of per-frame.
  const running = arm.state !== "parked" && arm.state !== "returning";
  const seekEnabled = mode === "demo" || isAuthenticated;
  const SEEK_STEP_MS = 5000; // small keyboard seek step; neutral, tunable
  // Live transport snapshot, read by both the keyboard handler (Item 6) and the
  // Media Session handlers (Item 7) so each binds its listeners once.
  const kbRef = useRef<{
    running: boolean;
    enabled: boolean;
    isPlaying: boolean;
    duration: number;
    pos: () => number;
    start: () => void;
    stop: () => void;
    togglePlay: () => void;
    prev: () => void;
    next: () => void;
    seek: (ms: number) => void;
  }>(null as never);
  kbRef.current = {
    running,
    enabled: seekEnabled,
    isPlaying,
    duration: durationMs,
    pos: () => liveProgressRef.current,
    start: arm.start,
    stop: arm.stop,
    togglePlay: onTogglePlay,
    prev: onPrev,
    next: onNext,
    seek: seekTo,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Never hijack typing (search box, passphrase, etc.).
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const k = kbRef.current;
      if (!k.enabled) return;
      const onButtonOrLink = tag === "BUTTON" || tag === "A";
      switch (e.key) {
        case " ":
        case "Spacebar": // legacy
          if (onButtonOrLink) return; // let the focused control activate itself
          e.preventDefault();
          (k.running ? k.stop : k.start)();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) k.prev();
          else k.seek(k.pos() - SEEK_STEP_MS);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) k.next();
          else k.seek(Math.min(k.pos() + SEEK_STEP_MS, k.duration || Infinity));
          break;
        case "[":
          e.preventDefault();
          k.prev();
          break;
        case "]":
          e.preventDefault();
          k.next();
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Media Session API (Item 7) ──────────────────────────────────────────────
  // Action handlers (laptop media keys + the OS now-playing widget) mapped to the
  // deck's transport. Bound once; they read the live snapshot in kbRef.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => { const k = kbRef.current; if (!k.running) k.start(); else if (!k.isPlaying) k.togglePlay(); }],
      ["pause", () => { const k = kbRef.current; if (k.isPlaying) k.togglePlay(); }],
      ["previoustrack", () => kbRef.current.prev()],
      ["nexttrack", () => kbRef.current.next()],
      ["stop", () => kbRef.current.stop()],
      ["seekto", (d) => { if (typeof d.seekTime === "number") kbRef.current.seek(d.seekTime * 1000); }],
    ];
    for (const [action, handler] of actions) {
      // Some browsers don't support every action — setting an unsupported one
      // throws, so guard each individually.
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* unsupported action — ignore */
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // Metadata follows the current track (title / artist / album / artwork).
  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof window.MediaMetadata === "undefined") return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: track.name,
      artist: track.artist,
      album: track.album,
      artwork: track.albumArt
        ? [{ src: track.albumArt, sizes: "640x640", type: "image/jpeg" }]
        : [],
    });
  }, [track?.id, track?.name, track?.artist, track?.album, track?.albumArt]);

  // Keep the OS widget's play/pause state + scrubber in sync (poll cadence is fine
  // for the widget — no need to push it every frame).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.playbackState = !track ? "none" : track.isPlaying ? "playing" : "paused";
    try {
      if (track && track.durationMs > 0 && typeof ms.setPositionState === "function") {
        ms.setPositionState({
          duration: track.durationMs / 1000,
          position: Math.min(Math.max(track.progressMs, 0), track.durationMs) / 1000,
          playbackRate: 1,
        });
      }
    } catch {
      /* setPositionState can throw on bad values — non-fatal */
    }
  }, [track?.isPlaying, track?.progressMs, track?.durationMs, track?.id]);

  // ── Platter rotation with inertia: quick spin-up, slow coast to a stop ──
  // On STOP the motor cuts immediately (state -> returning, not powered) and the
  // platter coasts down over SPIN_DOWN_MS, which is longer than the arm's ~1.7s
  // return — so it keeps turning for a beat or two after the arm has parked.
  // Speeds/inertia are module-level FEEL constants (RPM_33 / RPM_45 / SPIN_*).

  // ── 45 RPM Easter egg (Item 6) ──
  // The platter target speed follows this; the audio only follows where the
  // player allows a real rate change (see onSetPlaybackRate above).
  const [rpm45, setRpm45] = useState(false);
  const rpm45Ref = useRef(rpm45);
  rpm45Ref.current = rpm45;
  // Rate the AUDIO is actually advancing at — 1 unless a real rate setter is
  // wired (demo). The local progress clock extrapolates with this multiplier.
  const clockRate = onSetPlaybackRate && rpm45 ? RPM_45 / RPM_33 : 1;
  const clockRateRef = useRef(clockRate);
  clockRateRef.current = clockRate;

  const setPlatterRpm45 = (fortyFive: boolean) => {
    if (fortyFive === rpm45) return;
    setRpm45(fortyFive);
    // Re-anchor the clock at the displayed position so the new advance rate
    // applies from now, not retroactively across the anchor interval.
    localSeekMs(liveProgressRef.current);
    onSetPlaybackRate?.(fortyFive ? RPM_45 / RPM_33 : 1);
    ensureLoopRef.current();
  };

  const rpmRef = useRef(0);
  const rotationRef = useRef(0);
  const lastFrameRef = useRef(0);
  const animFrameRef = useRef(0);
  const runningRef = useRef(false); // is the rAF loop currently scheduled? (Item 3)
  const stateRef = useRef(arm.state);
  stateRef.current = arm.state;
  // The tonearm spring (Item 2) is stepped from THIS loop, so arm + platter +
  // clock all land in one render per frame. Ref-forwarded because tick binds once.
  const armStepRef = useRef(arm.step);
  armStepRef.current = arm.step;
  const [rotationDeg, setRotationDeg] = useState(0);
  const [spinning, setSpinning] = useState(false);

  // Motion-blur amount (Item 7): follows the spin state, slightly heavier at
  // 45 RPM. Flips only on these state transitions — the ghosts' CSS opacity
  // ease (BLUR_FADE_MS) does the actual ramp, so no per-frame work.
  const blur01 = spinning ? (rpm45 ? 1 : BLUR_33_LEVEL) : 0;

  // ── prefers-reduced-motion (Item 5) ─────────────────────────────────────────
  // When the user asks for reduced motion we stop the continuous platter spin and
  // show a static record. Everything functional — the progress clock, the tonearm
  // position, all transport controls — keeps working; only the large continuous
  // motion is suppressed. Read live by the rAF via reducedMotionRef.
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── Animation loop (Item 3: runs ONLY when visible AND there's motion) ──────
  // Halts via cancelAnimationFrame whenever the tab is hidden or the deck is fully
  // idle (platter stopped + clock not advancing), and is re-armed by ensureLoop on
  // visibility return / state change. Audio is never touched — this is the visual
  // loop only. Saves battery instead of burning a frame every 16ms while parked.
  const stopLoop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = 0;
    runningRef.current = false;
    lastFrameRef.current = 0; // reset the delta baseline for a clean restart
  }, []);

  const tick = useCallback(
    (t: number) => {
      // Hidden tab → stop the visual loop entirely (battery). rAF is already
      // throttled/paused while hidden, but we cancel explicitly so it's provably
      // not running.
      if (document.hidden) {
        stopLoop();
        return;
      }
      const DEG_PER_MS_PER_RPM = 360 / 60000;
      const delta = lastFrameRef.current ? Math.min(t - lastFrameRef.current, 100) : 0;
      lastFrameRef.current = t;
      const s = stateRef.current;
      const powered = s === "playing" || s === "cueing" || s === "lifted" || s === "dragging";
      // Reduced motion (Item 5): target 0 rpm so the platter coasts to a stop and
      // stays static, while the clock below keeps advancing (functionality intact).
      // 33⅓ or 45 per the speed switch (Item 6); ramp rates stay 33-based so the
      // 33→45 shift is a gentle motor push, not a jump.
      const target = powered && !reducedMotionRef.current ? (rpm45Ref.current ? RPM_45 : RPM_33) : 0;
      if (rpmRef.current < target) {
        rpmRef.current = Math.min(target, rpmRef.current + (RPM_33 / SPIN_UP_MS) * delta);
      } else if (rpmRef.current > target) {
        rpmRef.current = Math.max(0, rpmRef.current - (RPM_33 / SPIN_DOWN_MS) * delta);
      }
      const moving = rpmRef.current > 0.001;
      if (moving) {
        rotationRef.current = (rotationRef.current + rpmRef.current * DEG_PER_MS_PER_RPM * delta) % 360;
        setRotationDeg(rotationRef.current);
      }
      setSpinning((prev) => (prev !== moving ? moving : prev));

      // ── Local progress clock advance (Item 2) ──
      // Extrapolate progressMs from the anchor while the song is actually moving.
      // The anchor is reset by polls (correction) and by seek/lift/drop/stop.
      const advancing = (s === "playing" || s === "cueing") && isPlayingRef.current;
      if (advancing && !prevAdvancingRef.current) {
        // Resume edge (cue-drop or an external resume): re-anchor at the frozen
        // position so we don't jump forward by the paused interval.
        anchorRef.current = { pos: liveProgressRef.current, t };
      }
      prevAdvancingRef.current = advancing;
      if (advancing) {
        const a = anchorRef.current;
        // clockRate ≠ 1 only when the audio itself runs faster (45 RPM in demo).
        let live = a.pos + (t - a.t) * clockRateRef.current;
        const dur = durationRef.current;
        if (dur > 0 && live > dur) live = dur;
        liveProgressRef.current = live;
        setLiveProgressMs(live);
      }

      // ── Tonearm spring step (fable Item 2) ──
      // Integrates the arm toward its target; batched into this frame's render.
      const armMoving = armStepRef.current(delta);

      // Keep looping only while something is still moving (platter spinning up /
      // coasting, the clock advancing, or the arm mid-swing/settle). Otherwise
      // idle out until ensureLoop wakes us. `rpm < target` covers the spin-up
      // ramp from a standstill.
      if (rpmRef.current > 0.001 || advancing || rpmRef.current < target || armMoving) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        stopLoop();
      }
    },
    [stopLoop]
  );

  const ensureLoop = useCallback(() => {
    if (runningRef.current || document.hidden) return;
    runningRef.current = true;
    lastFrameRef.current = 0;
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick]);
  ensureLoopRef.current = ensureLoop;

  // Wake the loop whenever motion may be needed: arm transitions (spin up/down),
  // and play/pause (clock advance). The loop self-terminates once it settles.
  useEffect(() => {
    ensureLoop();
  }, [arm.state, isPlaying, reducedMotion, ensureLoop]);

  // Pause on tab-hide, resume on tab-show (only if there's motion to render).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else ensureLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopLoop();
    };
  }, [ensureLoop, stopLoop]);

  // ── Album art crossfade ──
  const [displayArt, setDisplayArt] = useState<string | null>(null);
  const [fadingArt, setFadingArt] = useState<string | null>(null);
  const [isFading, setIsFading] = useState(false);
  const prevTrackId = useRef<string | null>(null);

  useEffect(() => {
    const newArt = track?.albumArt ?? null;
    const newId = track?.id ?? null;
    if (newId !== prevTrackId.current) {
      prevTrackId.current = newId;
      if (displayArt) {
        setFadingArt(displayArt);
        setIsFading(true);
        setTimeout(() => {
          setDisplayArt(newArt);
          setFadingArt(null);
          setIsFading(false);
        }, 600);
      } else {
        setDisplayArt(newArt);
      }
    }
  }, [track?.id, track?.albumArt, displayArt]);

  return (
    <div
      className="deck-region"
      role="region"
      aria-label={`Turntable — ${mode} mode`}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        background: "linear-gradient(160deg, #7a5228 0%, #5a3c18 40%, #3e2808 100%)",
        borderRadius: 12,
        boxShadow: `0 12px 48px rgba(0,0,0,0.7), inset 0 1px 0 ${M.glow(0.12)}`,
        border: "2px solid #3a2808",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
        minWidth: 560,
      }}
    >
      {/* Deck surface — coordinate space for the tonearm geometry. The wood
          finish (WOODS[deckWood]) is the flat plinth fill: color tile on the
          bottom, the pre-existing highlight wash layered on top of it (both
          as this element's own background), then the normal map composited
          as a blended overlay CHILD just below — so it paints above the
          highlight and the grain catches it — and finally the platter/
          controls/tonearm (later children) render on top of all of it. The
          brass edge, vignette + shadows on the outer .deck-region are
          untouched — only this flat fill is replaced. */}
      <div
        ref={deckRef}
        style={{
          position: "relative",
          padding: "24px 20px 20px 24px",
          backgroundImage: [
            "linear-gradient(160deg, rgba(120,80,30,0.15) 0%, rgba(60,35,10,0.2) 100%)",
            `url(${WOODS[deckWood].color})`,
          ].join(", "),
          backgroundSize: `auto, ${WOOD_TILE_PX}px ${WOOD_TILE_PX}px`,
          backgroundRepeat: "no-repeat, repeat",
          display: "flex",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Normal-map overlay: adds grain that catches the highlight above.
            Decorative only; sits between the deck's own background and the
            real controls (next siblings), never intercepts pointer events. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${WOODS[deckWood].normal})`,
            backgroundSize: `${WOOD_TILE_PX}px ${WOOD_TILE_PX}px`,
            backgroundRepeat: "repeat",
            mixBlendMode: WOOD_NORMAL_BLEND,
            opacity: WOOD_NORMAL_OPACITY,
            pointerEvents: "none",
          }}
        />

        {/* Dim-mode scrim (Item 5): darkens the wood surface only. It paints
            above the wood + grain but below every positioned sibling that
            follows (platter, plates, tonearm), so control labels keep their
            full contrast while the plinth reads as a lamp turned down. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, var(--dim-scrim, 0))",
            pointerEvents: "none",
          }}
        />

        {/* Platter */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 344,
              height: 344,
              borderRadius: "50%",
              background: "radial-gradient(circle, #2a2018 0%, #181008 100%)",
              border: "2px solid #3a2a10",
              boxShadow: `0 6px 24px rgba(0,0,0,0.8), inset 0 1px 0 ${M.glow(0.06)}`,
            }}
          />
          <div style={{ position: "relative", zIndex: 2, width: 320, height: 320 }}>
            {isFading && fadingArt && (
              <div style={{ position: "absolute", inset: 0, opacity: 0, transition: "opacity 0.6s ease" }}>
                <VinylRecord albumArt={fadingArt} isSpinning={false} rotationDeg={rotationDeg} blur01={0} />
              </div>
            )}
            <div style={{ opacity: isFading ? 0 : 1, transition: "opacity 0.6s ease" }}>
              <VinylRecord albumArt={displayArt} isSpinning={spinning} rotationDeg={rotationDeg} blur01={blur01} />
            </div>
          </div>
        </div>

        {/* Right: crackle + speed plates */}
        <div style={{ position: "relative", width: 160, alignSelf: "stretch", flexShrink: 0 }}>
          {/* Surface-noise bed toggle (Item 4) */}
          <button
            onClick={noise.toggleBed}
            aria-pressed={noise.bedEnabled}
            aria-label={noise.bedEnabled ? "Turn off surface crackle" : "Turn on surface crackle"}
            title="Ambient vinyl surface noise under the music"
            style={{
              position: "absolute",
              bottom: 108,
              right: 10,
              background: `linear-gradient(180deg, ${M.plateTop} 0%, ${M.plateBottom} 100%)`,
              border: `1px solid ${noise.bedEnabled ? M.bright : M.deep}`,
              borderRadius: 4,
              padding: "5px 10px",
              textAlign: "center",
              cursor: "pointer",
              fontFamily: "'Courier New', monospace",
            }}
          >
            <div style={{ fontSize: "0.42em", color: M.brightest, letterSpacing: "0.18em", marginBottom: 3 }}>
              CRACKLE
            </div>
            <div
              style={{
                fontSize: "0.42em",
                color: noise.bedEnabled ? M.textOn : M.dim,
                background: noise.bedEnabled ? M.base : "transparent",
                border: noise.bedEnabled ? "none" : `1px solid ${M.shade}`,
                borderRadius: 2,
                padding: "2px 6px",
                letterSpacing: "0.12em",
              }}
            >
              {noise.bedEnabled ? "ON" : "OFF"}
            </div>
          </button>

          {/* Speed switch (Item 6): 33⅓ / 45. Visual spin always follows; the
              audio only follows in demo mode (see onSetPlaybackRate). */}
          <div
            style={{
              position: "absolute",
              bottom: 20,
              right: 10,
              background: `linear-gradient(180deg, ${M.deep} 0%, ${M.plateTop} 100%)`,
              border: `1px solid ${M.base}`,
              borderRadius: 4,
              padding: "6px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "0.45em", color: M.brightest, letterSpacing: "0.2em", marginBottom: 4 }}>SPEED</div>
            <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
              {([false, true] as const).map((fortyFive) => {
                const active = rpm45 === fortyFive;
                return (
                  <button
                    key={String(fortyFive)}
                    onClick={() => setPlatterRpm45(fortyFive)}
                    aria-pressed={active}
                    aria-label={fortyFive ? "45 RPM" : "33⅓ RPM"}
                    title={
                      fortyFive
                        ? "45 RPM — spins the platter faster (audio rate only changes in demo mode)"
                        : "33⅓ RPM"
                    }
                    style={{
                      fontSize: "0.5em",
                      fontFamily: "'Courier New', monospace",
                      color: active ? M.textOn : M.dim,
                      background: active ? M.base : "transparent",
                      border: active ? `1px solid ${M.bright}` : `1px solid ${M.shade}`,
                      borderRadius: 2,
                      padding: "2px 6px",
                      cursor: "pointer",
                    }}
                  >
                    {fortyFive ? "45" : "33 ⅓"}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: "0.38em", color: M.dim, marginTop: 3, letterSpacing: "0.1em" }}>RPM</div>
          </div>
        </div>

        {/* Tonearm overlay (absolute, positioned at the pivot). Grabbing the arm
            is the primary play gesture (Item 1), so it obeys the same enablement
            as the transport buttons — a disconnected deck has a dead arm. */}
        <Tonearm
          angleDeg={arm.angleDeg}
          lifted={arm.lifted}
          pivotX={430}
          pivotY={70}
          onPointerDown={seekEnabled ? arm.onArmPointerDown : () => {}}
        />
      </div>

      <TrackInfo track={track} progressMs={liveProgressMs} onSeek={seekTo} enabled={mode === "demo" || isAuthenticated} />

      <ControlStrip
        armState={arm.state}
        ledOn={isPlaying}
        isConnected={isConnected}
        isAuthenticated={isAuthenticated}
        mode={mode}
        progressMs={liveProgressMs}
        durationMs={track?.durationMs ?? 0}
        onStart={arm.start}
        onStop={arm.stop}
        onCue={arm.cue}
        onNext={onNext}
        onPrev={onPrev}
        onSeek={seekTo}
        onTransfer={onTransfer}
        onLogin={onLogin}
        onLogout={onLogout}
      />

      {/* Status strips (backlog item 4): amber notice = state explanation
          (session expired, playback moved, no device); red = real error.
          Both dismissible so a stale line can't sit there forever. */}
      {notice && (
        <StatusStrip tone="notice" onDismiss={onDismissNotice}>
          {notice}
        </StatusStrip>
      )}
      {error && (
        <StatusStrip tone="error" onDismiss={onDismissError}>
          ⚠ {error}
        </StatusStrip>
      )}
    </div>
  );
}

// One-line status footer under the control strip. `notice` reads as a metal
// info plate (amber on walnut), `error` keeps the old red fault strip look.
function StatusStrip({
  tone,
  onDismiss,
  children,
}: {
  tone: "notice" | "error";
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 20px",
        background: isError ? "#3a1008" : "#2a1c08",
        borderTop: `1px solid ${isError ? "#6a1808" : "#3a2808"}`,
        fontSize: "0.5em",
        color: isError ? "#ff6040" : M.bright,
        fontFamily: "'Courier New', monospace",
        letterSpacing: "0.1em",
      }}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            font: "inherit",
            fontSize: "1.2em",
            lineHeight: 1,
            cursor: "pointer",
            padding: "0 2px",
            flex: "0 0 auto",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
