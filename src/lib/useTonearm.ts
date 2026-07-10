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
// MOTION (Item 2): the arm is driven by a damped spring, not CSS transitions.
// Every render computes a TARGET angle from the state machine; the host's rAF
// loop calls `step(dt)` each frame, which integrates the spring toward the
// target (semi-implicit Euler). Cueing and drops are slightly underdamped, so
// the arm overshoots a hair and settles — a real needle-drop settle. Dragging
// bypasses the spring (1:1 follow) but records velocity, so a release hands the
// throw straight into the settle. All motion is transform-only.
//
// GEOMETRY: all coordinates are in the pixel space of the deck element you attach
// `deckRef` to (its top-left = 0,0). The six constants in DEFAULT_GEOMETRY are the
// only things you should need to nudge in the browser to make the needle land on
// the groove — everything downstream is derived. See the README tuning note.

import { useCallback, useEffect, useRef, useState } from "react";

// ─── FEEL constants — tune by eye ────────────────────────────────────────────
// FEEL: tune by eye — arm timing + drop tolerances, all in one place.
const CUE_FALLBACK_MS = 2600;   // hard cap on a cue swing: if the spring hasn't landed by now (hidden tab), force it
const RECUE_FALLBACK_MS = 5200; // same cap for a record-change cue, which adds a return-to-rest leg first
// During a record-change return, hand off to the cue swing once the arm is
// within this of the rest — the heavy return spring takes seconds to fully
// settle, and the ceremony doesn't need it to.
const CUE_CHAIN_DEG = 1.5;
// How far past the outer groove (in deck px) a release still counts as landing
// ON the record. Beyond this — or on the rest — the drop is a "take it off".
const DROP_EDGE_SLOP_PX = 14;

// FEEL: tune by eye — spring feel per phase. `stiffness` is the pull toward the
// target (1/s²), `damping` bleeds velocity (1/s). Damping ratio
// ζ = damping / (2·√stiffness): below 1 the arm overshoots and settles
// (needle-drop), at/above 1 it glides in without bounce.
const SPRING_CUE = { stiffness: 36, damping: 8.5 };   // START auto-cue swing: weighted, lands with a slight overshoot (ζ≈0.71)
const SPRING_DROP = { stiffness: 60, damping: 9.5 };  // needle drop / drag release: quicker, visibly settles (ζ≈0.61)
const SPRING_RETURN = { stiffness: 9, damping: 7.5 }; // STOP / off-record return: heavy, no bounce (ζ≈1.25)
const SPRING_TRACK = { stiffness: 160, damping: 26 }; // groove tracking + seek glides once settled (ζ≈1.03)
const DROP_NUDGE_DEG_PER_S = 5; // tiny impulse on a DROP-button drop so even a zero-distance drop micro-settles
const LAND_EPS_DEG = 0.6;    // within this of the groove mid-cue = the stylus has touched down
const SETTLE_EPS_DEG = 0.02; // spring counts as at-rest under this error…
const SETTLE_EPS_VEL = 0.05; // …and this angular velocity (deg/s)
const MAX_DT_MS = 50; // clamp integrator steps after tab-jank so the spring can't explode

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
  // Fired the instant the stylus physically meets the record — cue landings,
  // drag drop-to-play releases, and DROP-button drops. Item 4 hangs the
  // one-shot crackle here. Optional and read live (ref), never re-binds.
  onNeedleDown?: () => void;
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
  onNeedleDown,
}: UseTonearmArgs) {
  const g = { ...DEFAULT_GEOMETRY, ...geometry };
  const [state, setState] = useState<ArmState>("parked");
  const dragging = useRef(false);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Groove radius the stylus sits at when the arm is on its rest. Anchors the
  // outer end of the drag range so a grabbed-from-rest arm tracks the pointer
  // all the way from the rest to the record instead of snapping on-groove.
  const parkRadius = radiusForDir((g.parkDeg - g.artOffsetDeg) * D2R);

  // ── spring integrator (Item 2) ──────────────────────────────────────────────
  // The rendered angle lives here; the state machine only moves the TARGET.
  const [animAngle, setAnimAngle] = useState<number>(() => g.parkDeg);
  const angleRef = useRef(animAngle);
  const velRef = useRef(0);
  const targetRef = useRef(animAngle);
  const springRef = useRef(SPRING_RETURN);
  const stateRef = useRef<ArmState>(state);
  stateRef.current = state;
  const dragDegRef = useRef<number | null>(null);

  // Target angle for the current state — recomputed every render so it tracks
  // progress (the needle's slow sweep) and geometry live.
  targetRef.current =
    state === "parked" || state === "returning"
      ? g.parkDeg
      : state === "dragging"
      ? dragDegRef.current ?? angleRef.current
      : displayForProgress(progress01);

  // Pick the spring for each phase as we enter it. A drop lands on SPRING_DROP
  // (bouncy settle) and is stiffened to SPRING_TRACK by step() once at rest, so
  // in-play seeks glide without wobble.
  useEffect(() => {
    switch (state) {
      case "cueing":
        springRef.current = SPRING_CUE;
        break;
      case "playing":
        springRef.current = SPRING_DROP;
        break;
      case "returning":
      case "parked":
        springRef.current = SPRING_RETURN;
        break;
      case "lifted":
        springRef.current = SPRING_TRACK;
        break;
      // dragging: 1:1 follow, no spring
    }
  }, [state]);

  // ── Needle-drop deferral (Item 3) ───────────────────────────────────────────
  // A cue can carry an action that must run EXACTLY as the stylus touches the
  // record — starting the audio after a beat of silence. Stored as a ref-read of
  // the live ensurePlay (not a captured closure) so a landing a second later
  // still acts on current player state.
  const ensurePlayRef = useRef(ensurePlay);
  ensurePlayRef.current = ensurePlay;
  const onNeedleDownRef = useRef(onNeedleDown);
  onNeedleDownRef.current = onNeedleDown;
  const pendingLandActionRef = useRef<(() => void) | null>(null);
  // A record-change cue (cueTo) whose return-to-rest leg is still in flight:
  // step() chains "returning" into "cueing" once the arm nears the rest.
  const pendingCueRef = useRef(false);
  // False until the first gesture that puts the needle on the record. Only the
  // FIRST start of a page load gets the ceremonial silent cue; every ordinary
  // resume afterwards starts the audio immediately (Item 3 scoping).
  const firstDropDoneRef = useRef(false);

  // The stylus has touched down at the end of a cue swing: cueing -> playing.
  // Runs any deferred needle-drop action (Item 3) at the exact touch moment.
  const landNow = useCallback(() => {
    if (cueTimer.current) {
      clearTimeout(cueTimer.current);
      cueTimer.current = null;
    }
    const action = pendingLandActionRef.current;
    pendingLandActionRef.current = null;
    action?.();
    onNeedleDownRef.current?.();
    setState((s) => (s === "cueing" ? "playing" : s));
  }, []);

  // One integrator step. Called by the host's rAF loop (TurntableVisual's tick)
  // so the arm, platter and progress clock all update in ONE render per frame.
  // Returns true while the arm still needs frames (unsettled or held).
  const step = useCallback(
    (dtMs: number): boolean => {
      const s = stateRef.current;
      const dt = Math.min(dtMs, MAX_DT_MS) / 1000;
      if (s === "dragging") {
        // 1:1 pointer follow; record velocity so a release inherits the throw.
        const dd = dragDegRef.current;
        if (dd != null && dd !== angleRef.current) {
          if (dt > 0) velRef.current = (dd - angleRef.current) / dt;
          angleRef.current = dd;
          setAnimAngle(dd);
        }
        return true; // held: keep frames coming
      }
      const target = targetRef.current;
      const err = target - angleRef.current;
      // Record-change chain (Item 3): the return leg of a new-record cue hands
      // off to the cue swing as the arm nears the rest — the heavy return
      // spring's full settle isn't part of the ceremony.
      if (s === "returning" && pendingCueRef.current && Math.abs(err) < CUE_CHAIN_DEG) {
        pendingCueRef.current = false;
        setState("cueing");
        return true;
      }
      if (Math.abs(err) < SETTLE_EPS_DEG && Math.abs(velRef.current) < SETTLE_EPS_VEL) {
        // At rest: snap the sub-epsilon remainder so tracking is exact, and
        // stiffen a finished drop into groove-tracking mode.
        if (angleRef.current !== target) {
          angleRef.current = target;
          setAnimAngle(target);
        }
        velRef.current = 0;
        if (s === "playing") springRef.current = SPRING_TRACK;
        if (s === "returning") setState("parked");
        return false;
      }
      if (dt > 0) {
        const { stiffness, damping } = springRef.current;
        // Semi-implicit Euler — stable at display rates for these constants.
        velRef.current += (err * stiffness - velRef.current * damping) * dt;
        angleRef.current += velRef.current * dt;
        setAnimAngle(angleRef.current);
        if (s === "cueing") {
          // Landing = first touch of the groove: either within LAND_EPS_DEG or
          // the swing crossed the target (overshoot begins).
          const newErr = target - angleRef.current;
          if (Math.abs(newErr) < LAND_EPS_DEG || err > 0 !== newErr > 0) landNow();
        }
      }
      return true;
    },
    [landNow]
  );

  // ── controls ────────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    userInteracted.current = true;
    if (cueTimer.current) clearTimeout(cueTimer.current);
    pendingCueRef.current = false; // a manual START supersedes any pending record-change cue
    setState("cueing");
    if (firstDropDoneRef.current) {
      // Ordinary re-start mid-session: audio rolls while the arm swings over.
      ensurePlay();
    } else {
      // FIRST start after page load (Item 3): hold the silence — the audio
      // begins only as the stylus lands.
      pendingLandActionRef.current = () => ensurePlayRef.current();
    }
    firstDropDoneRef.current = true;
    // Fallback only: the spring's landing detection normally ends the cue. This
    // catches a hidden tab (rAF halted) so the deck can't stick mid-cue forever.
    cueTimer.current = setTimeout(landNow, CUE_FALLBACK_MS);
  }, [ensurePlay, landNow]);

  // Full needle-drop cue onto a NEW record (a Library pick, Item 3): the arm
  // swings over and `onLand` — typically "start the new context" — fires only
  // as the stylus touches down. The caller is responsible for pausing current
  // audio and zeroing the local clock BEFORE invoking, so the swing is silent
  // and targets the outer groove.
  //
  // If the stylus is out over the record (playing/lifted) or mid-return, the
  // arm first carries it home — changing the record lifts the arm off, like a
  // real deck — and step() chains into the cue swing near the rest. Starting
  // the swing from wherever the arm happened to be let a pick land INSTANTLY
  // whenever the arm already sat near the outer groove (e.g. an album that
  // just started), which skipped the silent cue entirely.
  const cueTo = useCallback(
    (onLand: () => void) => {
      userInteracted.current = true;
      if (cueTimer.current) clearTimeout(cueTimer.current);
      firstDropDoneRef.current = true;
      pendingLandActionRef.current = onLand;
      dragging.current = false; // the deck takes the arm over from any drag
      const cur = stateRef.current;
      const needsReturn = cur === "playing" || cur === "lifted" || cur === "returning";
      pendingCueRef.current = needsReturn;
      setState(needsReturn ? "returning" : "cueing");
      cueTimer.current = setTimeout(landNow, needsReturn ? RECUE_FALLBACK_MS : CUE_FALLBACK_MS);
    },
    [landNow]
  );

  const stop = useCallback(() => {
    userInteracted.current = true;
    if (cueTimer.current) clearTimeout(cueTimer.current);
    pendingLandActionRef.current = null; // an aborted cue must never fire later
    pendingCueRef.current = false;
    ensurePause();
    seek01(0);
    setState("returning"); // spring carries it home; step() parks it on settle
  }, [ensurePause, seek01]);

  const cue = useCallback(() => {
    userInteracted.current = true;
    if (state === "lifted") {
      // A zero-distance drop: give the spring a nudge so the needle still
      // visibly micro-settles instead of freezing in place.
      velRef.current += DROP_NUDGE_DEG_PER_S;
      onNeedleDownRef.current?.();
    }
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
  }, [state, ensurePlay, ensurePause]);

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
      // Grabbing the arm cancels an in-flight record-change cue: its deferred
      // "start the new context" action must never fire under a manual drop.
      pendingLandActionRef.current = null;
      pendingCueRef.current = false;
      dragging.current = true;
      // Seed the drag wherever the spring currently has the arm (mid-return
      // catches included) so there's no snap on grab; the raw radius decides
      // on- vs off-record if released before any movement.
      dragDegRef.current = angleRef.current;
      dragRadiusRef.current =
        state === "parked" || state === "returning"
          ? live.current.parkRadius
          : g.rOuter + (g.rInner - g.rOuter) * clamp(progress01, 0, 1);
      ensurePause();
      setState("dragging");
    },
    [state, ensurePause, progress01, g.rOuter, g.rInner]
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
      // Written to the ref only — the spring's step() renders it next frame.
      dragDegRef.current = L.dirForRadius(rDisplay) * R2D + L.artOffsetDeg;
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      const L = live.current;
      const r = dragRadiusRef.current;
      dragRadiusRef.current = null;
      dragDegRef.current = null;
      if (r != null && r <= L.rOuter + DROP_EDGE_SLOP_PX) {
        // Landed ON the record: that groove radius IS the playback position.
        // A manual drop counts as the session's first needle-down, so a later
        // START gets no ceremonial delay (Item 3 scoping).
        firstDropDoneRef.current = true;
        L.seek01(clamp((clamp(r, L.rInner, L.rOuter) - L.rOuter) / (L.rInner - L.rOuter), 0, 1));
        setState("playing");
        onNeedleDownRef.current?.();
        L.ensurePlay();
      } else {
        // Released OFF the record (past the edge / on the rest): the needle never
        // lands — playback stays paused (grab already paused it) and the arm
        // returns while the platter coasts down. Unlike STOP this does NOT reset
        // to 0: lifting the record off shouldn't lose your place.
        L.ensurePause();
        setState("returning"); // spring carries it home; step() parks it on settle
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

  // ── External-state reconcile (backlog: failure states) ──────────────────────
  // The player is the source of truth. If the audio has been paused for a
  // sustained beat while the needle still rides the groove (paused from another
  // device, or a play command that silently failed), lift the arm so the deck
  // reads "paused" instead of miming playback. Symmetrically, if audio resumes
  // while the arm is lifted (resumed remotely), drop it back on the groove.
  // Debounced well past the REST poll cadence (3s) + fetch latency, so a local
  // lift/drop whose pause/play echo arrives on the NEXT poll never gets fought,
  // and SDK flickers around track changes never twitch the arm. It never calls
  // ensurePlay/ensurePause — it FOLLOWS the player, it doesn't drive it.
  const EXTERNAL_RECONCILE_MS = 5000;
  useEffect(() => {
    const mismatch =
      (state === "playing" && !isPlaying) || (state === "lifted" && isPlaying);
    if (!mismatch) return;
    const id = setTimeout(() => {
      setState((s) => {
        if (s === "playing" && !isPlaying) return "lifted";
        if (s === "lifted" && isPlaying) {
          velRef.current += DROP_NUDGE_DEG_PER_S; // visible micro-settle
          onNeedleDownRef.current?.();
          return "playing";
        }
        return s;
      });
    }, EXTERNAL_RECONCILE_MS);
    return () => clearTimeout(id);
  }, [state, isPlaying]);

  // ── derived render values ───────────────────────────────────────────────────
  // The spring owns the angle; "lifted" now includes the cue swing, so the arm
  // rises for the whole approach and the translateY drop lands WITH the audio.
  const lifted = state === "lifted" || state === "dragging" || state === "cueing";
  const motorOn = state !== "parked"; // platter spins through lift/drag/return

  return {
    state,
    angleDeg: animAngle,
    lifted,
    motorOn,
    start,
    stop,
    cue,
    cueTo,
    step,
    onArmPointerDown,
  };
}
