# Backlog Completion Report — branch `fable-systems`

All items done, one commit per item (`backlog: …`), `tsc --noEmit` + `vite build`
green at every commit. (The batch as given had no item 2; numbering below follows
the brief.) A baseline commit landed first: the pending wood-picker + Settings/Info
merge work that was sitting uncommitted in the tree, so the backlog commits stay
clean per item.

---

## 1 · Metal finish picker — DONE

Gold / Silver / Bronze in **Settings → Metal**, persisted to `localStorage["deck_metal"]`,
default gold.

- `src/lib/metals.ts` mirrors `woods.ts`: a `METALS` map of **semantic color roles**
  (bright/base/dim/deep/plate/textOn/glow…), exposed as `--m-*` CSS custom properties
  on each page's stage. Every component that hardcoded a brass hex now reads
  `var(--m-role, <original brass>)` — **gold is the original brass values verbatim**,
  so the default renders pixel-identical.
- SVG gradient stops can't carry `var()` in presentation attributes, so the tonearm's
  gradients use `style={{ stopColor }}` instead.
- Glows/insets use an `--m-glow-rgb` triplet composed via `rgba(var(...), α)`.
- **Judgment calls:** the picker itself is Live-only (same placement logic as the wood
  picker) but Home applies the persisted finish so the unit matches across pages.
  The whole hardware chrome follows the finish — tabs, drawers, library play-discs —
  not just the deck, so silver doesn't leave brass drawers behind. Disabled/unpowered
  controls keep their warm "dead" tone deliberately (reads as *off*, not as a finish).

## 3 · How-to tutorial — DONE

`src/components/HowTo.tsx`, mounted as **Settings → How-To** on both pages. Four
screens: **Connect · Controls · The Arm** (drag-to-play; landing spot = position)
**· Extras**. Prev/next arrow buttons, dot indicators, horizontal pointer swipe
(`touch-action: pan-y` so vertical drawer scroll survives), and ←/→ while the pager
has focus.

- **Judgment call:** the pager's arrow-key handler calls `stopPropagation()` —
  the deck binds document-level ←/→ to seek, and paging the tutorial must not
  also scrub the record.

## 4 · Failure-state handling — DONE

The existing silent-refresh flow (proactive timer + 401 retry + terminal/transient
outcomes) was already correct and was **not** touched (nor `SCOPES`/OAuth). What was
missing was visibility and recovery:

- **Session expiry:** if a *real* session's refresh token is revoked (had a refresh
  token going in), the deck now shows a dismissible amber strip — *"Session expired —
  press CONNECT to sign back in."* — instead of silently resetting. First-visit
  "nothing to refresh" stays silent.
- **No active device:** REST transport fallbacks (play/pause/next/prev) recover from
  Spotify's 404 by silently transferring playback to the turntable (`play:false`,
  the retried command decides about sound) and retrying once. Only if that fails does
  the strip say *"No active Spotify device — press ▶ THIS DEVICE."*
  `transferPlayback` also reports SDK-not-ready and HTTP failures instead of no-oping.
- **External interruption:** if the deck stops being the active device, the strip
  explains it (*"Playback left this deck…"*, auto-cleared on reconnect). And
  `useTonearm` now reconciles with the player: audio paused externally for a
  sustained beat → the needle lifts; audio resumed remotely while lifted → it drops.
- **Judgment calls:** the reconcile debounce is **5s** — deliberately longer than the
  3s REST poll + latency, so a local lift/drop whose pause/play echo arrives on the
  *next* poll is never fought. It follows the player (never calls play/pause itself).
  Notices are a single slot, `role="status"`, dismissible, auto-cleared on positive
  signals; errors stay red and are now dismissible too.

## 5 · Brightness / dim mode — DONE

**Settings → Brightness** (both pages): Bright / Soft / Dim, persisted to
`localStorage["deck_dim"]` (`src/lib/dimmer.ts`).

- **Judgment call — no page-wide CSS filter.** A filter on the stage would (a) crush
  text contrast and (b) create a containing block that re-anchors the `position:fixed`
  drawers (same trap the code already documents for transforms). Instead three
  targeted `--dim-*` properties: a black **scrim over the wood surface only** (painted
  above wood+grain, below every control, so labels keep full contrast), a multiplier
  on the **metal glow alphas**, and a `brightness()` pull on the **record + label art**.
  Text is never dimmed, so AA survives every level.

## 6 · First-run / empty state — DONE

- Unauthenticated live deck: the CONNECT button breathes a slow metal-tinted glow
  (CSS keyframes, disabled under `prefers-reduced-motion`), and the empty track bar
  reads **"CONNECT YOUR SPOTIFY TO PUT A RECORD ON"**; once connected with nothing
  playing it reads **"NO TRACK LOADED — PICK ONE FROM LIBRARY"**. Demo keeps plain
  "NO TRACK LOADED".
- Competing UI was already gone (info popovers merged into Settings in the baseline
  commit; LIBRARY tab hidden until authenticated). Transport stays visibly inert
  until connect, per the existing enablement logic.

## 7 · Contrast / type hierarchy pass — DONE

Wrote a WCAG 2.x checker and audited **every text/background pair × all three metal
finishes** (~27 pairs each). Findings & fixes (final audit: **0 failures at 4.5:1**):

- Worst offenders were pre-existing: inactive speed/crackle chips and the RPM label
  were **1.3–2.2:1** (dim-on-plate). Their text is now `brightest`; "inactive" reads
  through the thin border + no fill instead of dark text.
- SPEED plate, deck tabs, library active tab, and the reconnect button re-graded to
  the darker `plateTop→plateBottom` gradient (same as CONNECT/CRACKLE) — labels now
  clear AA across the whole plate, and all plates share one finish.
- Model plate re-graded lighter (`mid→base`) for its engraved dark text.
- New **`dimText` role** per metal for muted labels on walnut (drawer section headers,
  credits, pager arrows, library secondary text) — the decorative `dim` role fails on
  the drawer background and is now reserved for non-text accents.
- Bronze `accent` brightened `#cd9660 → #dcaa78` so enabled transport glyphs pass.
- **Texture note:** no text sits directly on the wood photos — every label lives on a
  solid plate/strip that covers the texture — so solid-background ratios are the true
  effective contrast. The dim-mode scrim sits *under* all text layers and doesn't
  change any text ratio.
- Type hierarchy left as designed (serif bold titles / mono caps labels / muted mono
  secondary) — it was already coherent; only colors moved.

---

### Not verified live

Per the brief, no local run: every commit was gated on `tsc --noEmit` + `vite build`
only. Worth eyeballing on the preview deploy: the silver/bronze finishes at deck
scale, dim-mode levels at night, and the arm auto-lift by pausing from a phone.
