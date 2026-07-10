// useVinylNoise.ts
// Web Audio overlay for the physical side of vinyl (Item 4). Two layers:
//   (a) a ONE-SHOT needle-drop crackle that swells out of silence exactly as
//       the stylus lands (Item 3's landing moment), then fades under the music;
//   (b) a TOGGLEABLE ambient surface-noise bed that loops, very low, while the
//       needle is on a spinning record. The toggle lives in the Settings
//       drawer (Item 4 relocation): the page owns the on/off state via
//       loadSavedCrackle/saveCrackle and passes it down; this hook just
//       follows the value it's given.
//
// NOTE: the Spotify stream itself CANNOT be processed — the Web Playback SDK
// plays through its own media element (DRM'd, not routable into an
// AudioContext). This is a purely additive overlay mixed on top.
//
// All sources are generated procedurally (no assets): a warm filtered-noise
// hiss plus sparse random pops. Sources/gains are disconnected when stopped,
// and the AudioContext is closed on unmount.

import { useCallback, useEffect, useRef, useState } from "react";

// ─── FEEL constants — tune by eye (well, ear) ────────────────────────────────
// FEEL: tune by eye — crackle levels + timing. Gains are linear amplitude:
// 0.032 ≈ -30 dBFS. Keep the bed barely-there; it should be felt, not heard.
const BED_GAIN = 0.032;        // ambient bed level while the needle rides (~-30 dB feel)
const BED_FADE_S = 0.7;        // bed fade in/out on toggle / needle lift
const BED_LOOP_S = 6;          // generated bed loop length (longer = less repetitive)
const BED_HISS_GAIN = 0.5;     // hiss vs. pops balance inside the bed buffer
const BED_POPS_PER_S = 7;      // sparse tick density in the bed
const DROP_GAIN = 0.16;        // one-shot needle-drop peak level
const DROP_LEN_S = 1.5;        // one-shot total length (swell + decay into the music)
const DROP_SWELL_S = 0.14;     // silence → full crackle as the stylus seats
const DROP_POPS_PER_S = 34;    // dense initial crackle of a fresh drop
const DROP_THUMP_HZ = 82;      // the soft low "thump" of the needle seating
const DROP_THUMP_GAIN = 0.5;   // thump level inside the drop buffer
const HISS_WARMTH = 0.18;      // one-pole lowpass coefficient: lower = darker hiss

const BED_KEY = "vinyl_crackle_bed"; // localStorage: "1" = bed enabled

// Persisted crackle preference (Settings → Crackle). Same load/save shape as
// woods/metals/dimmer so the pages wire it up identically.
export function loadSavedCrackle(): boolean {
  try {
    return localStorage.getItem(BED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCrackle(on: boolean): void {
  try {
    localStorage.setItem(BED_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable — session-only preference */
  }
}

// ─── Procedural buffers ──────────────────────────────────────────────────────

// Warm hiss + sparse pops. Used for the looping bed (envelope-free, loopable).
function makeBedBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(BED_LOOP_S * rate);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  // Hiss: white noise through a one-pole lowpass so it reads "dusty", not "TV".
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += HISS_WARMTH * (Math.random() * 2 - 1 - lp);
    d[i] = lp * BED_HISS_GAIN;
  }
  // Pops: short exponential-decay impulses at random spots, random polarity.
  const pops = Math.floor(BED_LOOP_S * BED_POPS_PER_S);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.random() * n);
    const amp = (Math.random() * 2 - 1) * (0.35 + Math.random() * 0.65);
    const tau = rate * (0.001 + Math.random() * 0.005); // 1–6ms tail
    const len = Math.min(Math.floor(tau * 5), n - at);
    for (let k = 0; k < len; k++) d[at + k] += amp * Math.exp(-k / tau);
  }
  return buf;
}

// One-shot needle drop: a soft seating thump + dense crackle whose density and
// level decay over the buffer. The swell/decay envelope is baked into the
// samples, so playback is just "start it".
function makeDropBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(DROP_LEN_S * rate);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  // Hiss base.
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += HISS_WARMTH * (Math.random() * 2 - 1 - lp);
    d[i] = lp * 0.6;
  }
  // Crackle, denser at the start (fresh dust under a fresh needle).
  const pops = Math.floor(DROP_LEN_S * DROP_POPS_PER_S);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.pow(Math.random(), 1.7) * n); // biased early
    const amp = (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6);
    const tau = rate * (0.0008 + Math.random() * 0.004);
    const len = Math.min(Math.floor(tau * 5), n - at);
    for (let k = 0; k < len; k++) d[at + k] += amp * Math.exp(-k / tau);
  }
  // Seating thump: one decaying low sine right at the touch.
  const thumpLen = Math.min(Math.floor(0.12 * rate), n);
  for (let i = 0; i < thumpLen; i++) {
    d[i] +=
      DROP_THUMP_GAIN *
      Math.sin((2 * Math.PI * DROP_THUMP_HZ * i) / rate) *
      Math.exp(-i / (0.03 * rate));
  }
  // Envelope: swell from silence, then ease down into the (starting) music.
  const swell = Math.floor(DROP_SWELL_S * rate);
  for (let i = 0; i < n; i++) {
    const env =
      i < swell
        ? i / swell
        : Math.exp(-(i - swell) / ((n - swell) * 0.45));
    d[i] *= env;
  }
  return buf;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface VinylNoise {
  setBedActive: (on: boolean) => void; // "needle is riding a spinning record"
  playNeedleDrop: () => void;   // fire exactly at stylus touchdown
}

// `bedEnabled` is the user's Settings toggle, owned by the page (see
// loadSavedCrackle/saveCrackle above).
export function useVinylNoise(bedEnabled: boolean): VinylNoise {
  const [bedActive, setBedActiveState] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const bedBufRef = useRef<AudioBuffer | null>(null);
  const dropBufRef = useRef<AudioBuffer | null>(null);
  const bedNodesRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null);

  // Lazy AudioContext: first needed on a user-gesture-driven code path (arm
  // drop / toggle click), so autoplay policy is satisfied. resume() covers the
  // "created while suspended" rehydration edge — cosmetic layer, never throws up.
  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const setBedActive = useCallback((on: boolean) => setBedActiveState(on), []);

  // Bed lifecycle: audible only while enabled AND the needle is riding. Each
  // start makes a fresh source (they're one-shot by spec); each stop ramps the
  // gain down and releases the nodes — no reuse races, nothing left connected.
  useEffect(() => {
    const shouldPlay = bedEnabled && bedActive;
    if (shouldPlay) {
      const ctx = getCtx();
      if (!ctx || bedNodesRef.current) return;
      if (!bedBufRef.current) bedBufRef.current = makeBedBuffer(ctx);
      const src = ctx.createBufferSource();
      src.buffer = bedBufRef.current;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(BED_GAIN, ctx.currentTime + BED_FADE_S);
      src.connect(gain).connect(ctx.destination);
      src.start();
      bedNodesRef.current = { src, gain };
    } else if (bedNodesRef.current) {
      const ctx = ctxRef.current;
      const { src, gain } = bedNodesRef.current;
      bedNodesRef.current = null;
      if (ctx) {
        gain.gain.setTargetAtTime(0, ctx.currentTime, BED_FADE_S / 4);
        src.stop(ctx.currentTime + BED_FADE_S);
      } else {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
    }
  }, [bedEnabled, bedActive, getCtx]);

  const playNeedleDrop = useCallback(() => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      if (!dropBufRef.current) dropBufRef.current = makeDropBuffer(ctx);
      const src = ctx.createBufferSource();
      src.buffer = dropBufRef.current;
      const gain = ctx.createGain();
      gain.gain.value = DROP_GAIN; // envelope is baked into the buffer
      src.connect(gain).connect(ctx.destination);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
      src.start();
    } catch {
      /* audio unavailable — the deck works fine silent */
    }
  }, [getCtx]);

  // Full teardown on unmount: stop the bed and close the context.
  useEffect(
    () => () => {
      if (bedNodesRef.current) {
        try {
          bedNodesRef.current.src.stop();
        } catch {
          /* already stopped */
        }
        bedNodesRef.current.src.disconnect();
        bedNodesRef.current.gain.disconnect();
        bedNodesRef.current = null;
      }
      if (ctxRef.current) {
        void ctxRef.current.close();
        ctxRef.current = null;
      }
    },
    []
  );

  return { setBedActive, playNeedleDrop };
}
