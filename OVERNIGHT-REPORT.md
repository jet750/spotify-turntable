# Overnight structural batch — report

Branch: `overnight-structural` (off `main`). **Not merged. Not force-pushed.**
Every commit builds clean (`tsc --noEmit` + `vite build`). Worked items 1–10 in order,
one commit each, building after every item. No item was blocked; no `// TODO overnight`
notes were needed.

## ⚠️ Pre-existing uncommitted work was preserved

The tree was **dirty** at the start (the batch assumed it was clean): `src/lib/useSpotify.ts`
held an uncommitted **session-longevity / refresh-token** implementation (PKCE refresh tokens:
proactive ~60s-ahead silent refresh, 401 retry backstop, `apiFetch` wrapper, single-init SDK).
That work was **not** produced by this batch. To avoid destroying it while keeping `main`
untouched, it was committed verbatim as the first commit on this branch:

- `a3d1c6e` — preserve pre-existing uncommitted refresh-token work

Review/keep/squash that separately from the structural items below.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | State rehydration on load | ✅ done | `035b572` |
| 2 | Local progress clock | ✅ done | `ec53d54` |
| 3 | Page Visibility pause | ✅ done | `77c98ee` |
| 4 | GPU-friendly motion refactor | ✅ done | `879108c` |
| 5 | prefers-reduced-motion branch | ✅ done | `1782080` |
| 6 | ARIA + keyboard control | ✅ done | `76096ad` |
| 7 | Media Session API | ✅ done | `7b58bcd` |
| 8 | Lazy-load BrowsePanel | ✅ done | `3ff9c61` |
| 9 | Dynamic deck fill | ✅ done | `5935221` |
| 10 | Contrast fix (WCAG AA) | ✅ done | `05cc857` |

### Item 1 — State rehydration on load
`useTonearm` now takes an authoritative `isPlaying` signal and runs a **one-directional
parked → playing reconcile**, gated to *before* the first manual transport action so it can
never fight a STOP/lift. It consumes the `GET /me/player` state `useSpotify` already fetches on
mount (immediate poll) and agrees with `player_state_changed` rather than fighting it. Result:
returning mid-playback (or a silent token restore, or playback started from the LIBRARY/another
device) drops the needle and spins the platter instead of leaving the arm parked over live audio.
Nothing playing → stays parked.

### Item 2 — Local progress clock
`TurntableVisual` keeps a local anchor `{pos, t}` and extrapolates `progressMs` every animation
frame (in the existing platter rAF loop — one loop, math only). Polls / `player_state_changed`
are **corrections** that reset the anchor; **seek / lift / drop / stop set the anchor instantly**
(no lag). A `SEEK_SETTLE_MS` window shields a just-issued seek from a stale in-flight poll. The
smoothed value drives both the %-bar + timecode and `progress01` (arm sweep). The old `width 1s
linear` CSS transition on the bar was removed (the rAF drives it now).

### Item 3 — Page Visibility pause
The single rAF loop now **starts/stops on demand** (`runningRef` + `ensureLoop`/`stopLoop`). It
halts via `cancelAnimationFrame` when `document.hidden` **or** when the deck is fully idle
(platter stopped + clock not advancing), and is re-armed on `visibilitychange` → visible and on
any arm/play-state change. Audio is untouched — visual loop only.

### Item 4 — GPU-friendly motion refactor (mechanical; no timing changes)
Promoted the spinning platter+label SVG and the tonearm to their own compositor layers
(`will-change: transform`). Converted the progress-bar fill from a per-frame `width` animation
(layout/paint) to a composited `transform: scaleX`. rAF stays math-only; the compositor paints.
No durations/easings touched.

### Item 5 — prefers-reduced-motion branch
`matchMedia("(prefers-reduced-motion: reduce)")` (with a live `change` listener). When set, the
rAF rpm target → 0 so the platter coasts to a **static** rest; the progress clock, tonearm
positioning and all transport controls keep working. Clean branch, visually coherent.

### Item 6 — ARIA + keyboard control
Keyboard transport on the deck: **Space** = start/stop, **←/→** = seek ±`SEEK_STEP_MS`,
**Shift+←/→ or `[`/`]`** = prev/next. Guarded so it never fires while typing in the search /
passphrase fields and never double-fires when a transport button is focused. `aria-label`s on
CUE / START-STOP / prev / next / CONNECT / THIS-DEVICE; the progress bar is a proper
`role="slider"` (focusable, `aria-valuemin/max/now/valuetext`); the deck is `role="region"`.
Global `:focus-visible` ring (in `index.css`) for visible keyboard focus. Pointer behaviour
unchanged.

### Item 7 — Media Session API
`navigator.mediaSession` action handlers — play / pause / previoustrack / nexttrack / stop /
seekto — mapped to the deck transport (play from parked drops the needle via `arm.start`).
Metadata (title/artist/album/artwork) updates on track change; `playbackState` + `setPositionState`
sync at poll cadence. Feature-guarded for browsers without `mediaSession`/`MediaMetadata`; each
handler set defensively (unsupported actions ignored). Laptop media keys + the OS now-playing
widget now control the turntable.

### Item 8 — Lazy-load BrowsePanel
`BrowsePanel` is code-split with `React.lazy` + `Suspense`, mounted only on first open (then kept
mounted so the close animation runs), with a lightweight right-edge fallback. It + `useSpotifyLibrary`
moved to their own chunk (**9.19 kB / 3.48 kB gzip**); the main bundle dropped from **193.65 →
186.11 kB** (61.46 → 59.69 kB gzip). Library still opens normally.

### Item 9 — Dynamic deck fill (sizing math only)
`DeckScaler` no longer caps the scale at 1.0. It scales by the **smaller of the available column
width and a viewport-height budget**, clamped to `[MIN_SCALE, MAX_SCALE]`, so the deck grows past
1× on large screens while staying bounded by both dimensions (no off-screen spill, no horizontal
scroll at 380px). Uniform scalar → aspect ratio preserved; centering unchanged; the placeholder
still reserves the scaled footprint (no layout jump); the scale is still handed to `useTonearm` so
drag-to-seek lands after scaling.

### Item 10 — Contrast fix (WCAG AA, color only)
Raised the measured-failing pairs to ≥4.5:1 within the brass/cream palette:

| element | before | after | ratio |
|---|---|---|---|
| timecode + NO TRACK LOADED | `#6a5028` | `#b89a5e` | 2.20 → 6.17 |
| track artist | `#a08040` | `#b0905a` | 4.46 → 5.51 |
| prev / next (enabled) | `#d4a843` | `#e0b450` | 4.43 → 5.05* |
| THIS DEVICE | `#c49a3c` | `#e0b450` | 3.75 → 5.05 |
| CONNECT/LOGOUT button bg | `#8a6828→#6a4e18` | `#6a4e18→#523a10` | 4.36 → 5.17 (text `#f0d080`) |
| status line (ACTIVE/READY) | `#5a3800` @0.8α | `#140a00` @1α | 3.28 → 4.86 |

\* worst-case (lighter end of the strip gradient). Track title already passed (10.19) — unchanged.
Disabled controls left as-is — WCAG 1.4.3 exempts inactive components.

## Left intentionally NEUTRAL for in-person feel-tuning

These are mechanisms with named constants at neutral defaults — tune the exact feel later, no
logic change needed:

- **`SEEK_SETTLE_MS = 1500`** (`TurntableVisual.tsx`, Item 2) — how long the local clock ignores a
  stale poll after a seek. Raise if Spotify's echo proves slower.
- **`SEEK_STEP_MS = 5000`** (`TurntableVisual.tsx`, Item 6) — keyboard ←/→ seek step size.
- **`MAX_SCALE = 2`** and **`VERTICAL_MARGIN = 180`** (`DeckScaler.tsx`, Item 9) — how big the deck is
  allowed to grow and how much viewport height is reserved. These set the *ceiling*; pick the exact
  "fill" you want in-browser.
- **Item 10 tones** are *minimal-pass* values chosen to clear AA with margin; they can be nudged
  lighter/darker for taste as long as they stay ≥4.5:1.

## Minor behavioural notes (not feel values)

- Item 1 reconcile is disabled permanently after the first manual transport action, so after you
  press STOP the deck won't auto-engage on externally-started playback again until reload. This is
  deliberate (prevents any STOP/lift bounce).
- Item 4: the progress-bar fill's right cap is now squared (clipped by the track's rounded,
  `overflow:hidden` rect) instead of a pill — imperceptible at 4px height; the visible fill +
  gradient are otherwise identical.
- Item 5: the gentle album-art opacity crossfade on track change is left intact (it's a one-shot
  fade, not large continuous motion).
- `CallbackPage`'s loading spinner was left as-is (transient page, out of the turntable scope).

## Build / git state

- Final `tsc --noEmit` → clean; `vite build` → clean.
- 11 commits on `overnight-structural` (1 preserve + 10 items). `main` untouched.
- Lint "CSS inline styles" warnings are pre-existing project convention (inline styles by design),
  not errors.
- Commits used `git -c core.autocrlf=false` so files stay LF (the CRLF warnings during commit are
  benign; committed blobs are LF).
