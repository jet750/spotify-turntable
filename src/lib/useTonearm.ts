// useTonearm.ts
// Owns the tonearm's behavior: a real-deck state machine plus true-arc geometry
// so the stylus sits on the actual groove radius for the song's progress.
//
// States: parked -> cueing -> playing -> lifted -> dragging -> (drop) playing
//                                     \-> returning -> parked   (STOP)
//         parked -> dragging ─ release ON record  -> playing   (drop-to-play)
//                            └ release OFF record -> returning -> parked
//
// The arm itself is the primary play gesture (Item 1): grab it from the rest and
// the platter spins up; land it on the record and playback starts at that groove
// radius; let go off the record (past the outer edge, or back on the rest) and
// the platter coasts down and playback stops. START/STOP remain as backups.
//
// GEOMETRY: all coordinates are in the pixel space of the deck element you attach
// `deckRef` to (its top-left = 0,0). The six constants in DEFAULT_GEOMETRY are the
// only things you should need to nudge in the browser to make the needle land on
// the groove — everything downstream is derived. See the README tuning note.

import { useCallback, useEffect, useRef, useState } from "react";

// ─── FEEL constants — tune by eye ────────────────────────────────────────────
// FEEL: tune by eye — arm timing + drop tolerances, all in one place.
const CUE_MS = 900;             // arm swing time on START (auto-cue)
const RETURN_MS = 1700;         // arm return-to-rest time (STOP / off-record release)
const PARK_TRANSITION_MS = 1600; // CSS transition when settling back on the rest
const PLAYING_TRANSITION_MS = 220; // arm easing while tracking the groove
const LIFTED_TRANSITION_MS = 300;  // arm easing while lifted in place
// How far past the outer groove (in deck px) a release still counts as landing
// ON the record. Beyond this — or on the rest — the drop is a "take it off".
const DROP_EDGE_SLOP_PX = 14;

export interface TonearmGeometry {
  pivotX: number;   // tonearm pivot, deck-space px
  pivotY: number;
  centerX: number;  // record center, deck-space px
  centerY: number;
  armLength: number; // pivot -> stylus distance (matches the arm artwork: ~234)
  rOuter: number;    // groove radius at 0% progress (song start, outer edge)
  rInner: number;    // groove radius at 100% progress (song end, near label)
  artOffsetDeg: number; // aligns the drawn arm so its stylus points along the math
  parkDeg: number;      // arm rotation when parked at rest, off the record
  side: 1 | -1;         // which side of the pivot->center line the arm swings
}

// Defaults assume the deck layout in TurntableVisual. Tune in-browser if needed.
export const DEFAULT_GEOMETRY: TonearmGeometry = {
  pivotX: 430,
  pivotY: 70,
  centerX: 184,
  centerY: 180,
  armLength: 234,
  rOuter: 150,
  rInner: 70,
  artOffsetDeg: -115,
  parkDeg: -18,
  side: -1,
};

export type ArmState = "parked" | "cueing" | "playing" | "lifted" | "dragging" | "returning";

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface UseTonearmArgs {
  progress01: number;
  deckRef: React.RefObject<HTMLDivElement | null>;
  geometry?: Partial<TonearmGeometry>;
  // CSS scale applied to the deck by the responsive wrapper (DeckScaler). The
  // geometry constants are authored in UNSCALED deck px, so the drag handler
  // divides the pointer offset by this to convert screen px -> deck-local px.
  // Defaults to 1 (no scaling).
  scale?: number;
  // Authoritative "audio is actually playing" signal (from the player / SDK).
  // Used to rehydrate the arm into "playing" when the page loads mid-playback —
  // see the reconcile effect below. Defaults to false.
  isPlaying?: boolean;
  ensurePlay: () => void;
  ensurePause: () => void;
  seek01: (p: number) => void;
}

export function useTonearm({
  progress01,
  deckRef,
  geometry,
  scale = 1,
  isPlaying = false,
  ensurePlay,
  ensurePause,
  seek01,
}: UseTonearmArgs) {
  const g = { ...DEFAULT_GEOMETRY, ...geometry };
  const [state, setState] = useState<ArmState>("parked");
  const [dragDeg, setDragDeg] = useState<number | null>(null);
  const dragging = useRef(false);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flips true the first time the user touches a transport control. Gates the
  // load-time rehydration below so it only ever runs before manual control —
  // it can never fight a STOP/lift the user just performed.
  const userInteracted = useRef(false);

  // ── geometry ──────────────────────────────────────────────────────────────
  const D = Math.hypot(g.centerX - g.pivotX, g.centerY - g.pivotY);
  const bearing = Math.atan2(g.centerY - g.pivotY, g.centerX - g.pivotX);

  const dirForRadius = useCallback(
    (r: number) => {
      const arg = (g.armLength * g.armLength + D * D - r * r) / (2 * g.armLength * D);
      return bearing + g.side * Math.acos(clamp(arg, -1, 1)); // pivot->stylus dir (rad)
    },
    [g.armLength, D, bearing, g.side]
  );

  const radiusForDir = useCallback(
    (dir: number) => {
      const sx = g.pivotX + g.armLength * Math.cos(dir);
      const sy = g.pivotY + g.armLength * Math.sin(dir);
      return Math.hypot(sx - g.centerX, sy - g.centerY);
    },
    [g.pivotX, g.pivotY, g.armLength, g.centerX, g.centerY]
  );

  const displayForProgress = useCallback(
    (p: number) => {
      const r = g.rOuter + (g.rInner - g.rOuter) * clamp(p, 0, 1);
      return dirForRadius(r) * R2D + g.artOffsetDeg;
    },
    [dirForRadius, g.rOuter, g.rInner, g.artOffsetDeg]
  );

  const dirA = dirForRadius(g.rOuter);
  const dirB = dirForRadius(g.rInner);
  const dirMin = Math.min(dirA, dirB);
  const dirMax = Math.max(dirA, dirB);

  // Groove radius the stylus sits at when the arm is on its rest. Anchors the
  // outer end of the drag range so a grabbed-from-rest arm tracks the pointer
  // all the way from the rest to the record instead of snapping on-groove.
  const parkRadius = radiusForDir((g.parkDeg - g.artOffsetDeg) * D2R);

  // ── controls ────────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    userInteracted.current = true;
    if (returnTimer.current) clearTimeout(returnTimer.current);
    if (cueTimer.current) clearTimeout(cueTimer.current);
    setState("cueing");
    ensurePlay();
    cueTimer.current = setTimeout(
      () => setState((s) => (s === "cueing" ? "playing" : s)),
      CUE_MS
    );
  }, [ensurePlay]);

  const stop = useCallback(() => {
    userInteracted.current = true;
    if (cueTimer.current) clearTimeout(cueTimer.current);
    ensurePause();
    seek01(0);
    setState("returning");
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => setState("parked"), RETURN_MS);
  }, [ensurePause, seek01]);

  const cue = useCallback(() => {
    userInteracted.current = true;
    setState((s) => {
      if (s === "playing") {
        ensurePause();
        return "lifted";
      }
      if (s === "lifted") {
        ensurePlay();
        return "playing";
      }
      return s;
    });
  }, [ensurePlay, ensurePause]);

  // ── drag (grab the arm = lift; release = drop-to-play or take-it-off) ───────
  // Live snapshot so the drag listeners can bind ONCE (re-registering every render
  // was dropping pointer events mid-drag).
  const live = useRef({
    centerX: g.centerX,
    centerY: g.centerY,
    rInner: g.rInner,
    rOuter: g.rOuter,
    artOffsetDeg: g.artOffsetDeg,
    parkRadius,
    scale,
    dirForRadius,
    seek01,
    ensurePlay,
    ensurePause,
  });
  live.current = {
    centerX: g.centerX,
    centerY: g.centerY,
    rInner: g.rInner,
    rOuter: g.rOuter,
    artOffsetDeg: g.artOffsetDeg,
    parkRadius,
    scale,
    dirForRadius,
    seek01,
    ensurePlay,
    ensurePause,
  };
  const dragRadiusRef = useRef<number | null>(null);

  // The arm can now be grabbed from ANY settled state (Item 1): from the rest it
  // is the primary "put the record on" gesture — grabbing spins the platter up
  // (dragging counts as powered) — and mid-return it can be caught and re-dropped.
  // Only "cueing" is excluded so an in-flight auto-cue isn't fought mid-swing.
  const onArmPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (state === "cueing") return;
      userInteracted.current = true;
      e.preventDefault();
      if (cueTimer.current) clearTimeout(cueTimer.current);
      if (returnTimer.current) clearTimeout(returnTimer.current); // don't let a pending park fire mid-drag
      dragging.current = true;
      if (state === "parked" || state === "returning") {
        // Seed the drag at the rest position so the arm follows the hand from
        // the rest instead of snapping onto the groove before the pointer moves.
        dragRadiusRef.current = live.current.parkRadius;
        setDragDeg(g.parkDeg);
      } else {
        // Grabbed off the groove: seed at the current progress radius so a
        // no-move release drops it right back where it was.
        const r = g.rOuter + (g.rInner - g.rOuter) * clamp(progress01, 0, 1);
        dragRadiusRef.current = r;
        setDragDeg(dirForRadius(r) * R2D + g.artOffsetDeg);
      }
      ensurePause();
      setState("dragging");
    },
    [state, ensurePause, progress01, dirForRadius, g.parkDeg, g.rOuter, g.rInner, g.artOffsetDeg]
  );

  // Drag maps the pointer's DISTANCE FROM THE RECORD CENTER to a groove radius, then
  // to the arm angle. This only depends on the record center + the two radii, so it
  // stays usable even before the pivot constants are finely tuned.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current || !deckRef.current) return;
      const L = live.current;
      const rect = deckRef.current.getBoundingClientRect();
      // getBoundingClientRect() reflects the CSS-scaled deck, so undo the scale to
      // land back in the unscaled deck-local space the geometry constants live in.
      const x = (e.clientX - rect.left) / L.scale;
      const y = (e.clientY - rect.top) / L.scale;
      const rPointer = Math.hypot(x - L.centerX, y - L.centerY);
      // Keep the RAW radius for the release decision (on vs. off the record);
      // only the displayed angle is clamped, to the label⟷rest swing range.
      dragRadiusRef.current = rPointer;
      const rDisplay = clamp(rPointer, L.rInner, L.parkRadius);
      setDragDeg(L.dirForRadius(rDisplay) * R2D + L.artOffsetDeg);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      const L = live.current;
      const r = dragRadiusRef.current;
      dragRadiusRef.current = null;
      setDragDeg(null);
      if (r != null && r <= L.rOuter + DROP_EDGE_SLOP_PX) {
        // Landed ON the record: that groove radius IS the playback position.
        L.seek01(clamp((clamp(r, L.rInner, L.rOuter) - L.rOuter) / (L.rInner - L.rOuter), 0, 1));
        setState("playing");
        L.ensurePlay();
      } else {
        // Released OFF the record (past the edge / on the rest): the needle never
        // lands — playback stays paused (grab already paused it) and the arm
        // returns while the platter coasts down. Unlike STOP this does NOT reset
        // to 0: lifting the record off shouldn't lose your place.
        L.ensurePause();
        setState("returning");
        if (returnTimer.current) clearTimeout(returnTimer.current);
        returnTimer.current = setTimeout(() => setState("parked"), RETURN_MS);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [deckRef]);

  useEffect(() => () => {
    if (cueTimer.current) clearTimeout(cueTimer.current);
    if (returnTimer.current) clearTimeout(returnTimer.current);
  }, []);

  // ── Load-time rehydration ───────────────────────────────────────────────────
  // If audio is already playing while the arm is still parked — i.e. the page was
  // (re)loaded mid-playback, a token was silently restored, or playback was kicked
  // off from the LIBRARY/another device — drop the arm into "playing" so the deck
  // isn't visually dead while sound comes out. This is the consumer of the initial
  // GET /me/player state that useSpotify already fetches on mount.
  //
  // It is strictly one-directional (parked -> playing) and never calls
  // ensurePlay/ensurePause, so it agrees with the SDK player_state_changed path
  // instead of fighting it. It is also gated to BEFORE the first manual transport
  // action (userInteracted), which guarantees it can never bounce a STOP/lift the
  // user just performed back into "playing".
  useEffect(() => {
    if (userInteracted.current) return;
    if (isPlaying && state === "parked") setState("playing");
  }, [isPlaying, state]);

  // ── derived render values ───────────────────────────────────────────────────
  let angleDeg: number;
  let transitionMs: number;
  if (state === "dragging" && dragDeg != null) {
    angleDeg = dragDeg;
    transitionMs = 0;
  } else if (state === "parked" || state === "returning") {
    angleDeg = g.parkDeg;
    transitionMs = PARK_TRANSITION_MS;
  } else if (state === "cueing") {
    angleDeg = displayForProgress(progress01);
    transitionMs = CUE_MS;
  } else {
    // playing | lifted
    angleDeg = displayForProgress(progress01);
    transitionMs = state === "lifted" ? LIFTED_TRANSITION_MS : PLAYING_TRANSITION_MS;
  }

  const lifted = state === "lifted" || state === "dragging";
  const motorOn = state !== "parked"; // platter spins through lift/drag/return

  return { state, angleDeg, transitionMs, lifted, motorOn, start, stop, cue, onArmPointerDown };
}
