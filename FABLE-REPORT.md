# FABLE-REPORT — systems build (branch `fable-systems`)

Session: 2026-07-07 · base: `main` @ `abf1d54` (overnight-structural, merged) · **not merged to main**.
Every item builds green (`tsc --noEmit` + `vite build`) and is committed separately.

## Per-item status

| Item | Status | Commit | Summary |
|---|---|---|---|
| 1 — Manual tonearm-to-play | ✅ done | `49af003` | Arm grabbable from ANY settled state (incl. the rest, and catches mid-return). Grab from rest spins the platter up; releasing **on** the record seeks to that groove radius and plays; releasing **off** the record (past the outer edge + slop, or on the rest) pauses and returns the arm while the platter coasts down. START/STOP kept as backups. Off-record release deliberately does NOT reset to 0 (unlike STOP) — lifting the record off shouldn't lose your place. Arm obeys the same enablement gate as the transport buttons (dead when locked/disconnected). |
| 2 — Spring-physics arm | ✅ done | `e60828c` | CSS transitions replaced by a semi-implicit-Euler damped spring in `useTonearm`. Per-phase constants: cue swing and drops are underdamped (visible overshoot + micro-settle), STOP return is heavy/overdamped, in-play tracking stiffens after the settle so seeks glide. Drag is 1:1 but records velocity, so a release hands the throw into the settle. The spring is stepped from TurntableVisual's existing rAF (`arm.step(dt)`) — still ONE animation loop, one render per frame, transform-only. `returning → parked` and `cueing → playing` are now settle/landing-detected instead of timers (a 2.6 s fallback timer covers hidden tabs). Cueing now counts as "lifted", so the translateY needle-drop lands together with the audio. |
| 3 — Needle-drop delay | ✅ done | `b6e3c0d` | Scoped exactly: (a) FIRST start after page load — START runs the cue silently and `ensurePlay` fires only at stylus touchdown; (b) Library pick — `playContext` is intercepted in `Live.tsx`, current audio pauses, local clock zeroes (arm targets the outer groove), and the real `playContext` fires at touchdown. Ordinary resume/pause mid-session has NO delay (any first manual needle-down consumes the "first start" flag). Aborted cues (STOP mid-swing) clear the deferred action so it can never fire stale. |
| 4 — Web Audio crackle | ✅ done | `58c9359` | New `src/lib/useVinylNoise.ts`. (a) One-shot needle-drop crackle — procedurally generated (seating thump + dense decaying pops + warm hiss, swell envelope baked in) — fired at every physical needle-down. (b) Toggleable ambient bed: 6 s generated loop, plays only while the needle rides a spinning record (`arm.state === "playing"`), gain-ramped in/out, persisted in `localStorage["vinyl_crackle_bed"]`. CRACKLE ON/OFF plate on the deck above SPEED. Sources/gains disconnected on stop; AudioContext closed on unmount. Judgment call: the one-shot also fires on drag drop-to-play and DROP-button drops (physically a needle-down), not only Item 3 cue landings — trivial to narrow if you disagree. |
| 5 — Library now-playing | ✅ done | `bbe304c` | New "Now" tab (first tab) in BrowsePanel: full cover art, track, artist, album + facts line (release year · track count · label) from `GET /albums/{id}` — cached per album, stale-response-guarded, only shown when it matches the current track's album. `SpotifyTrack` gained `albumId` (REST: `album.id`; SDK: parsed from `album.uri` since the SDK object has no id; demo: null). No deprecated endpoints touched. |
| 6 — 45 RPM toggle | ✅ done | `00fab83` | SPEED plate is now a real 33⅓/45 switch. Platter visual speed always follows (motor-ramped, not a jump). Audio: **demo mode gets a genuine rate change** (`HTMLMediaElement.playbackRate` + `preservesPitch = false` → true vinyl pitch-up; survives track changes via `defaultPlaybackRate`), and the local progress clock advances at the real rate. **Live mode is visual-only — see API limitations.** |
| 7 — Groove motion-blur | ✅ done | `5d1929f` | Tangential smear: two ghost copies of the label art rotated ±`BLUR_GHOST_DEG` inside the already-composited spinning SVG layer, opacity fading in with the motor (heavier at 45). Opacity only changes on spin-state transitions with a CSS ease — zero per-frame filter/repaint cost. Note: the groove rings themselves are rotation-invariant circles, so the label is the only element that *can* visibly blur — which is also what the eye tracks on real vinyl. The crossfade ghost record gets `blur01={0}`. |

## FEEL-tagged constants (tune by eye)

### `src/lib/useTonearm.ts` — arm timing, drop tolerance, springs
| Constant | Line | Value | What it does |
|---|---|---|---|
| `CUE_FALLBACK_MS` | 32 | 2600 | Hard cap on a cue swing (hidden-tab safety); spring landing normally ends it (~0.75 s) |
| `DROP_EDGE_SLOP_PX` | 35 | 14 | How far past the outer groove a release still counts as ON the record |
| `SPRING_CUE` | 41 | k=36, c=8.5 | START auto-cue swing (ζ≈0.71 → slight overshoot) |
| `SPRING_DROP` | 42 | k=60, c=9.5 | Needle drop / drag release settle (ζ≈0.61 → visible micro-settle) |
| `SPRING_RETURN` | 43 | k=9, c=7.5 | STOP / off-record return (ζ≈1.25, heavy, no bounce, ~2 s) |
| `SPRING_TRACK` | 44 | k=160, c=26 | Groove tracking + seek glides once settled (ζ≈1.03) |
| `DROP_NUDGE_DEG_PER_S` | 45 | 5 | Impulse on a DROP-button drop so a zero-distance drop still settles |
| `LAND_EPS_DEG` | 46 | 0.6 | Cue-landing detection window ("stylus touched") |
| `SETTLE_EPS_DEG` / `SETTLE_EPS_VEL` | 47–48 | 0.02 / 0.05 | When the spring counts as at rest |
| `MAX_DT_MS` | 49 | 50 | Integrator dt clamp (stability, not feel) |

### `src/components/TurntableVisual.tsx` — platter, blur, lift
| Constant | Line | Value | What it does |
|---|---|---|---|
| `RPM_33` / `RPM_45` | 18–19 | 33.333 / 45 | Platter speeds; the ratio is also the demo audio playbackRate |
| `SPIN_UP_MS` / `SPIN_DOWN_MS` | 20–21 | 800 / 3200 | Motor spin-up / coast-down times |
| `BLUR_GHOST_DEG` | 29 | 2.6 | Smear angle of each label ghost |
| `BLUR_MAX_OPACITY` | 30 | 0.3 | Ghost opacity at full blur (45 RPM) |
| `BLUR_33_LEVEL` | 31 | 0.7 | Fraction of full blur at 33⅓ |
| `BLUR_FADE_MS` | 32 | 700 | Blur fade-in/out time (match spin-up feel) |
| `LIFT_PX` / `LIFT_RAISE_MS` / `LIFT_DROP_MS` | 190–192 | 5 / 180 / 220 | Vertical needle lift height + raise/drop easing (the drop is the audible touchdown moment) |

### `src/lib/useVinylNoise.ts` — crackle levels (tune by ear)
| Constant | Line | Value | What it does |
|---|---|---|---|
| `BED_GAIN` | 21 | 0.032 | Ambient bed level (~−30 dB feel) |
| `BED_FADE_S` | 22 | 0.7 | Bed fade in/out |
| `BED_LOOP_S` | 23 | 6 | Generated loop length |
| `BED_HISS_GAIN` | 24 | 0.5 | Hiss vs. pops balance in the bed |
| `BED_POPS_PER_S` | 25 | 7 | Tick density in the bed |
| `DROP_GAIN` | 26 | 0.16 | One-shot needle-drop peak |
| `DROP_LEN_S` | 27 | 1.5 | One-shot length (swell + decay into the music) |
| `DROP_SWELL_S` | 28 | 0.14 | Silence → full crackle as the stylus seats |
| `DROP_POPS_PER_S` | 29 | 34 | Initial crackle density of a drop |
| `DROP_THUMP_HZ` / `DROP_THUMP_GAIN` | 30–31 | 82 / 0.5 | The soft seating thump |
| `HISS_WARMTH` | 32 | 0.18 | Lowpass coefficient — lower = darker hiss |

## API limitations hit

- **Item 6 (the big one): the Spotify Web Playback SDK exposes NO playback-rate or pitch control.** The stream is DRM'd (EME) and fixed at 1×; there is no `playbackRate` on the SDK player and the Web API has no rate endpoint. Simulating speed via periodic seek-nudges would just stutter, so per the work item's fallback the 45 setting in **live mode changes the visual spin only** — documented in the `onSetPlaybackRate` prop comment in `TurntableVisual.tsx`. Demo mode (plain `<audio>`) gets the real thing, pitch shift included.
- **Item 4: the Spotify audio cannot be routed into Web Audio** for the same DRM reason — the crackle is an additive overlay mixed on top, exactly as specified.
- **Item 5: the SDK's `player_state_changed` album object has no `id` field** — only `uri`, which I parse (`spotify:album:<id>`). The REST poll provides `album.id` directly. Facts come from `GET /albums/{id}` only (confirmed-available endpoint); no recommendations / audio-features / new-releases calls anywhere.
- **Autoplay policy (Item 4):** the AudioContext is created lazily on gesture-driven paths and `resume()`d defensively; if the page rehydrates mid-playback with the bed enabled, the bed stays silent until the first user gesture (cosmetic layer — accepted).

## Notes for tuning session

- All arm motion feel lives in the four `SPRING_*` pairs. ζ = damping / (2·√stiffness); push damping down for more wobble, stiffness up for faster arrival.
- The needle-drop *silence length* is emergent: spring cue time (~0.75 s) + Spotify start latency. To lengthen it artificially, soften `SPRING_CUE` (lower stiffness).
- `BLUR_MAX_OPACITY` at 0.3 is deliberately shy of "smear" — raise toward 0.45 if you want it louder at 45 RPM.
