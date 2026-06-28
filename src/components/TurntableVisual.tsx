// TurntableVisual.tsx
// Presentational turntable. Driven by props + the useTonearm state machine.
// The arm auto-cues on START, sweeps across the record in sync with song progress
// (true-arc geometry), lifts in place on CUE, can be grabbed and dragged to seek,
// and returns slowly to rest on STOP.

import { useEffect, useRef, useState } from "react";
import type { SpotifyTrack } from "../lib/useSpotify";
import { useTonearm, ArmState } from "../lib/useTonearm";

export type TurntableMode = "live" | "demo";

export interface TurntableVisualProps {
  track: SpotifyTrack | null;
  isAuthenticated: boolean;
  isConnected: boolean;
  error?: string | null;
  mode?: TurntableMode;
  locked?: boolean;
  // CSS scale the deck is rendered at (set by DeckScaler). Forwarded to the
  // tonearm so drag-to-seek converts pointer px correctly. Defaults to 1.
  scale?: number;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onTransfer: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onUnlockRequest?: () => void;
}

// ─── Vinyl Record SVG ─────────────────────────────────────────────────────
function VinylRecord({
  albumArt,
  isSpinning,
  rotationDeg,
}: {
  albumArt: string | null;
  isSpinning: boolean;
  rotationDeg: number;
}) {
  const size = 320;
  const r = size / 2;
  const labelRadius = r * 0.345;
  const grooves = Array.from({ length: 22 }, (_, i) => ({
    r: r * 0.41 + i * ((r * 0.92 - r * 0.41) / 22),
    opacity: 0.4 + (i % 3) * 0.12,
    width: i % 4 === 0 ? 0.7 : 0.4,
  }));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        transform: `rotate(${rotationDeg}deg)`,
        transition: isSpinning ? "none" : "transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94)",
        display: "block",
        filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.7))",
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
      {albumArt ? (
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
      )}

      <circle cx={r} cy={r} r={6} fill="#111" stroke="#333" strokeWidth="1" />
      <circle cx={r} cy={r} r={3} fill="#222" />
    </svg>
  );
}

// ─── Tonearm SVG (positioned at the pivot; rotated by the state machine) ────
function Tonearm({
  angleDeg,
  transitionMs,
  lifted,
  pivotX,
  pivotY,
  onPointerDown,
}: {
  angleDeg: number;
  transitionMs: number;
  lifted: boolean;
  pivotX: number;
  pivotY: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  // Local pivot inside the artwork box is (118, 38); place that at (pivotX,pivotY).
  return (
    <div
      style={{
        position: "absolute",
        left: pivotX - 118,
        top: pivotY - 38,
        width: 140,
        height: 260,
        transform: `translateY(${lifted ? -5 : 0}px)`,
        transition: `transform ${lifted ? 180 : 220}ms ease`,
        zIndex: 20,
        pointerEvents: "auto",
        cursor: lifted ? "grabbing" : "grab",
        filter: lifted ? "drop-shadow(0 10px 10px rgba(0,0,0,0.55))" : "drop-shadow(0 3px 4px rgba(0,0,0,0.4))",
      }}
      onPointerDown={onPointerDown}
    >
      <div
        style={{
          width: 140,
          height: 260,
          transformOrigin: "118px 38px",
          transform: `rotate(${angleDeg}deg)`,
          transition: `transform ${transitionMs}ms cubic-bezier(0.4,0,0.2,1)`,
        }}
      >
        <svg width="140" height="260" viewBox="0 0 140 260" overflow="visible">
          <defs>
            <radialGradient id="pivotGrad" cx="40%" cy="35%">
              <stop offset="0%" stopColor="#e8c870" />
              <stop offset="50%" stopColor="#c49a3c" />
              <stop offset="100%" stopColor="#8a6820" />
            </radialGradient>
            <linearGradient id="armGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#d4a843" />
              <stop offset="50%" stopColor="#c49a3c" />
              <stop offset="100%" stopColor="#a07828" />
            </linearGradient>
          </defs>

          <line x1="118" y1="38" x2="134" y2="18" stroke="#b08020" strokeWidth="3" strokeLinecap="round" />
          <circle cx="134" cy="14" r="5" fill="#c49a3c" stroke="#e8c870" strokeWidth="1" />
          <line x1="118" y1="38" x2="28" y2="215" stroke="url(#armGrad)" strokeWidth="5" strokeLinecap="round" />
          <line x1="28" y1="215" x2="18" y2="228" stroke="#c49a3c" strokeWidth="4" strokeLinecap="round" />
          <rect x="8" y="224" width="22" height="14" rx="3" fill="#b08020" stroke="#d4a843" strokeWidth="1" />
          <rect x="10" y="237" width="18" height="8" rx="2" fill="#6a5018" stroke="#b08020" strokeWidth="0.8" />
          <line x1="19" y1="245" x2="19" y2="252" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="100" y="50" width="36" height="24" rx="4" fill="#8a7040" stroke="#c49a3c" strokeWidth="1" />
          <circle cx="118" cy="38" r="18" fill="url(#pivotGrad)" stroke="#e8d080" strokeWidth="1.5" />
          <circle cx="118" cy="38" r="10" fill="#8a6820" stroke="#c49a3c" strokeWidth="1" />
          <circle cx="118" cy="38" r="4" fill="#c49a3c" />
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
  locked: boolean;
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
  onUnlockRequest?: () => void;
}

function ctrlBtn(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    color: "#d4a843",
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
  if (p.locked) {
    authLabel = "🔒 LOCKED";
    authHandler = () => p.onUnlockRequest?.();
  } else if (p.isAuthenticated) {
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
            style={{
              background: "linear-gradient(180deg, #8a6828 0%, #6a4e18 100%)",
              border: "1px solid #c49a3c",
              borderRadius: 3,
              padding: "4px 10px",
              color: "#f0d080",
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
        {!isDemo && !p.locked && p.isAuthenticated && !p.isConnected && (
          <button
            onClick={p.onTransfer}
            style={{
              background: "transparent",
              border: "1px solid #c49a3c",
              borderRadius: 3,
              padding: "4px 8px",
              color: "#c49a3c",
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
          title="Cue (lift / drop the arm)"
          style={ctrlBtn({
            border: "1px solid #8a6828",
            borderRadius: 3,
            padding: "3px 8px",
            fontSize: "0.5em",
            letterSpacing: "0.12em",
            color: canCue ? "#e8c870" : "#6a5018",
            cursor: canCue ? "pointer" : "default",
          })}
        >
          {p.armState === "lifted" ? "DROP" : "LIFT"}
        </button>

        <button onClick={p.onPrev} disabled={!seekEnabled} style={ctrlBtn({ color: seekEnabled ? "#d4a843" : "#6a5018", cursor: seekEnabled ? "pointer" : "default" })}>
          ⏮
        </button>

        <button
          onClick={running ? p.onStop : p.onStart}
          disabled={!seekEnabled}
          title={running ? "Stop" : "Start"}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: seekEnabled
              ? "radial-gradient(circle at 35% 35%, #e8c870, #c49a3c, #8a6820)"
              : "radial-gradient(circle at 35% 35%, #6a5818, #4a3810, #2a1800)",
            border: `2px solid ${seekEnabled ? "#e8d080" : "#4a3800"}`,
            boxShadow: seekEnabled ? "0 3px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,100,0.3)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: seekEnabled ? "pointer" : "default",
            transition: "all 0.2s",
          }}
        >
          <span style={{ fontSize: "0.95em", color: seekEnabled ? "#3d2100" : "#2a1800" }}>
            {running ? "■" : "▶"}
          </span>
        </button>

        <button
          onPointerDown={ffDown}
          onPointerUp={ffUp}
          onPointerLeave={ffUp}
          disabled={!seekEnabled}
          title="Tap = next track · hold = fast-forward"
          style={ctrlBtn({ color: seekEnabled ? "#d4a843" : "#6a5018", cursor: seekEnabled ? "pointer" : "default" })}
        >
          ⏭
        </button>
      </div>

      {/* Right: model plate */}
      <div
        style={{
          background: "linear-gradient(180deg, #c49a3c 0%, #a07828 100%)",
          border: "1px solid #e8c870",
          borderRadius: 3,
          padding: "5px 12px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "0.5em", color: "#3d2100", fontFamily: "'Courier New', monospace", letterSpacing: "0.15em" }}>
          OB-1974
        </div>
        <div style={{ fontSize: "0.4em", color: "#5a3800", fontFamily: "'Courier New', monospace", opacity: 0.8 }}>
          {isDemo ? "● DEMO" : p.isConnected ? "● ACTIVE" : p.isAuthenticated ? "○ READY" : "○ OFFLINE"}
        </div>
      </div>
    </div>
  );
}

// ─── Track Info Bar (with click/drag seek) ────────────────────────────────
function TrackInfo({
  track,
  onSeek,
  enabled,
}: {
  track: SpotifyTrack | null;
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
        <span style={{ fontSize: "0.6em", color: "#6a5028", fontFamily: "'Courier New', monospace", letterSpacing: "0.2em" }}>
          NO TRACK LOADED
        </span>
      </div>
    );
  }
  const progress = durationMs > 0 ? (track.progressMs / durationMs) * 100 : 0;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return (
    <div style={{ padding: "8px 20px 10px", background: "#2a1c08", borderTop: "1px solid #3a2808" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <div>
          <span style={{ fontSize: "0.7em", color: "#e8c870", fontFamily: "Georgia, serif", fontWeight: "bold" }}>{track.name}</span>
          <span style={{ fontSize: "0.55em", color: "#a08040", fontFamily: "'Courier New', monospace", marginLeft: 8 }}>{track.artist}</span>
        </div>
        <span style={{ fontSize: "0.5em", color: "#6a5028", fontFamily: "'Courier New', monospace" }}>
          {fmt(track.progressMs)} / {fmt(track.durationMs)}
        </span>
      </div>
      <div
        ref={barRef}
        onPointerDown={(e) => {
          if (!seekable) return;
          draggingBar.current = true;
          seekRef.current(e.clientX);
        }}
        title={seekable ? "Click or drag to seek" : undefined}
        style={{ display: "flex", alignItems: "center", height: 12, cursor: seekable ? "pointer" : "default" }}
      >
        <div style={{ height: 4, width: "100%", background: "#3a2808", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #c49a3c, #e8c870)", borderRadius: 2, transition: draggingBar.current ? "none" : "width 1s linear" }} />
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
  mode = "live",
  locked = false,
  scale = 1,
  onTogglePlay,
  onSeek,
  onNext,
  onPrev,
  onTransfer,
  onLogin,
  onLogout,
  onUnlockRequest,
}: TurntableVisualProps) {
  const deckRef = useRef<HTMLDivElement>(null);
  const isPlaying = track?.isPlaying ?? false;
  const progress01 = track && track.durationMs > 0 ? track.progressMs / track.durationMs : 0;

  // Map the arm's start/pause/seek onto whatever player is wired in.
  const ensurePlay = () => {
    if (!isPlaying) onTogglePlay();
  };
  const ensurePause = () => {
    if (isPlaying) onTogglePlay();
  };
  const seek01 = (p: number) => onSeek(p * (track?.durationMs ?? 0));

  const arm = useTonearm({ progress01, deckRef, scale, ensurePlay, ensurePause, seek01 });

  // ── Platter rotation with inertia: quick spin-up, slow coast to a stop ──
  // On STOP the motor cuts immediately (state -> returning, not powered) and the
  // platter coasts down over SPIN_DOWN_MS, which is longer than the arm's ~1.7s
  // return — so it keeps turning for a beat or two after the arm has parked.
  const FULL_RPM = 33.333;
  const SPIN_UP_MS = 800; // time to reach full speed from rest
  const SPIN_DOWN_MS = 3200; // coast time from full speed to a stop

  const rpmRef = useRef(0);
  const rotationRef = useRef(0);
  const lastFrameRef = useRef(0);
  const animFrameRef = useRef(0);
  const stateRef = useRef(arm.state);
  stateRef.current = arm.state;
  const [rotationDeg, setRotationDeg] = useState(0);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const DEG_PER_MS_PER_RPM = 360 / 60000;
    const tick = (t: number) => {
      const delta = lastFrameRef.current ? Math.min(t - lastFrameRef.current, 100) : 0;
      lastFrameRef.current = t;
      const s = stateRef.current;
      const powered = s === "playing" || s === "cueing" || s === "lifted" || s === "dragging";
      const target = powered ? FULL_RPM : 0;
      if (rpmRef.current < target) {
        rpmRef.current = Math.min(target, rpmRef.current + (FULL_RPM / SPIN_UP_MS) * delta);
      } else if (rpmRef.current > target) {
        rpmRef.current = Math.max(0, rpmRef.current - (FULL_RPM / SPIN_DOWN_MS) * delta);
      }
      const moving = rpmRef.current > 0.001;
      if (moving) {
        rotationRef.current = (rotationRef.current + rpmRef.current * DEG_PER_MS_PER_RPM * delta) % 360;
        setRotationDeg(rotationRef.current);
      }
      setSpinning((prev) => (prev !== moving ? moving : prev));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

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
      style={{
        display: "inline-flex",
        flexDirection: "column",
        background: "linear-gradient(160deg, #7a5228 0%, #5a3c18 40%, #3e2808 100%)",
        borderRadius: 12,
        boxShadow: "0 12px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,200,80,0.12)",
        border: "2px solid #3a2808",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
        minWidth: 560,
      }}
    >
      {/* Deck surface — coordinate space for the tonearm geometry */}
      <div
        ref={deckRef}
        style={{
          position: "relative",
          padding: "24px 20px 20px 24px",
          backgroundImage: [
            "linear-gradient(160deg, rgba(120,80,30,0.15) 0%, rgba(60,35,10,0.2) 100%)",
            "repeating-linear-gradient(85deg, transparent, transparent 22px, rgba(0,0,0,0.03) 22px, rgba(0,0,0,0.03) 23px)",
          ].join(", "),
          display: "flex",
          alignItems: "center",
          gap: 0,
        }}
      >
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
              boxShadow: "0 6px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,180,60,0.06)",
            }}
          />
          <div style={{ position: "relative", zIndex: 2, width: 320, height: 320 }}>
            {isFading && fadingArt && (
              <div style={{ position: "absolute", inset: 0, opacity: 0, transition: "opacity 0.6s ease" }}>
                <VinylRecord albumArt={fadingArt} isSpinning={false} rotationDeg={rotationDeg} />
              </div>
            )}
            <div style={{ opacity: isFading ? 0 : 1, transition: "opacity 0.6s ease" }}>
              <VinylRecord albumArt={displayArt} isSpinning={spinning} rotationDeg={rotationDeg} />
            </div>
          </div>
        </div>

        {/* Right: speed plate */}
        <div style={{ position: "relative", width: 160, alignSelf: "stretch", flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              bottom: 20,
              right: 10,
              background: "linear-gradient(180deg, #8a6828 0%, #6a4e18 100%)",
              border: "1px solid #c49a3c",
              borderRadius: 4,
              padding: "6px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "0.45em", color: "#f0d080", letterSpacing: "0.2em", marginBottom: 4 }}>SPEED</div>
            <div style={{ fontSize: "0.5em", color: "#3d2100", background: "#c49a3c", borderRadius: 2, padding: "2px 6px" }}>33 ⅓</div>
            <div style={{ fontSize: "0.38em", color: "#a07828", marginTop: 3, letterSpacing: "0.1em" }}>RPM</div>
          </div>
        </div>

        {/* Tonearm overlay (absolute, positioned at the pivot) */}
        <Tonearm
          angleDeg={arm.angleDeg}
          transitionMs={arm.transitionMs}
          lifted={arm.lifted}
          pivotX={430}
          pivotY={70}
          onPointerDown={arm.onArmPointerDown}
        />
      </div>

      <TrackInfo track={track} onSeek={onSeek} enabled={mode === "demo" || isAuthenticated} />

      <ControlStrip
        armState={arm.state}
        ledOn={isPlaying}
        isConnected={isConnected}
        isAuthenticated={isAuthenticated}
        mode={mode}
        locked={locked}
        progressMs={track?.progressMs ?? 0}
        durationMs={track?.durationMs ?? 0}
        onStart={arm.start}
        onStop={arm.stop}
        onCue={arm.cue}
        onNext={onNext}
        onPrev={onPrev}
        onSeek={onSeek}
        onTransfer={onTransfer}
        onLogin={onLogin}
        onLogout={onLogout}
        onUnlockRequest={onUnlockRequest}
      />

      {error && (
        <div style={{ padding: "6px 20px", background: "#3a1008", borderTop: "1px solid #6a1808", fontSize: "0.5em", color: "#ff6040", fontFamily: "'Courier New', monospace", letterSpacing: "0.1em" }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
