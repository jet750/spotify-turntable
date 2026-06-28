# OAK & BRASS — Turntable

A vintage top-down record player that syncs to live Spotify playback. Two routes:

- **`/`** — public **demo**: the turntable spins a local Creative-Commons track. No
  Spotify, no login, nothing that can break in front of a visitor.
- **`/live`** — private **live** build: wired to the Spotify Web Playback SDK, so the
  platter, tonearm and label sync to whatever you're actually playing. The CONNECT
  button is gated by a passphrase (see _Security model_).

Stack: React + Vite + TypeScript. The components use inline styles, so there's **no
Tailwind / shadcn** to configure.

```
src/
  App.tsx                 path-based router ( / , /live , /callback )
  components/
    TurntableVisual.tsx   the turntable UI (props-driven; shared by both modes)
  lib/
    useSpotify.ts         OAuth PKCE + Web Playback SDK + controls
    useDemoPlayer.ts      local <audio> harness for demo mode
    demoMeta.ts           demo track metadata + attribution  ← edit this
  pages/
    Home.tsx              demo  (/)
    Live.tsx              live  (/live), passphrase gate
    CallbackPage.tsx      OAuth redirect handler (/callback)
public/demo/              drop track.mp3 + cover.jpg here  ← see its README
```

## 1. Run locally

```bash
pnpm install
cp .env.example .env      # then fill in values
pnpm dev                  # serves https://localhost:5173
```

The dev server runs **HTTPS on port 5173** on purpose, to match the redirect URI you
registered with Spotify and because the Web Playback SDK requires a secure context.
Your browser will warn about the self-signed certificate the first time — click through.

Add the demo asset before testing `/`: see `public/demo/README.md`.

## 2. Spotify dashboard

In your app at https://developer.spotify.com/dashboard:

- **Redirect URIs** — add both:
  - `https://localhost:5173/callback` (local dev)
  - `https://music.jaxontravis.com/callback` (production)
- **APIs used** — Web API + Web Playback SDK.
- **Allowlist** — add the Spotify accounts that may use `/live` (you + your friends).
  In development mode this is the real gate: only allowlisted **Premium** accounts can
  authenticate, and the Web Playback SDK only works for Premium.

## 3. Deploy to Vercel (music.jaxontravis.com)

1. Push this folder to its **own GitHub repo**.
2. Vercel → **New Project** → import the repo. It auto-detects Vite
   (build `vite build`, output `dist`). `vercel.json` already adds the SPA rewrite so
   `/live` and `/callback` survive refreshes.
3. **Settings → Environment Variables** — add:
   - `VITE_SPOTIFY_CLIENT_ID`
   - `VITE_SPOTIFY_REDIRECT_URI = https://music.jaxontravis.com/callback`
   - `VITE_STUDIO_PASS = <your access code>`
4. **Settings → Domains** — add `music.jaxontravis.com` (a new Vercel project is fine;
   Hobby allows up to 200 projects and 50 domains per project, so this doesn't crowd
   out your other subdomains).

> Hobby is for personal, non-commercial use — keep that in mind if the portfolio ever
> turns into paid client work.

## Security model (important)

`VITE_STUDIO_PASS` is a `VITE_`-prefixed variable, so it is **baked into the client
bundle and is publicly readable.** The passphrase is therefore a **cosmetic gate** — it
stops `/live` from showing a broken-looking failed login to a random visitor. It is not
real security.

Your **real** access control is the Spotify allowlist: even with the passphrase, only
allowlisted Premium accounts can complete OAuth. For a personal toy that's plenty.

### Hardening the gate (optional)

To make the passphrase itself non-extractable, move the check server-side: add a Vercel
Edge Middleware that protects `/live`, compares against a **non-`VITE_`** secret (e.g.
`STUDIO_PASS`), and sets a signed cookie. Then the code never ships to the browser. Runs
on Hobby. Ask Claude Code for this if you want it.

## Finishing in Claude Code

Everything builds and runs as-is. Good follow-up prompts:

- _"Add a Vercel Edge Middleware that password-protects the `/live` route server-side
  using a non-VITE `STUDIO_PASS` env var and a signed cookie, so the passphrase isn't in
  the client bundle. Keep the in-app gate as a fallback."_
- _"In demo mode, make the ⏮/⏭ buttons restart the local track instead of being
  disabled."_
- _"Add a subtle 'now playing on my account' read-only widget to `/` that shows my live
  Spotify track via a tiny serverless function holding a refresh token."_ (a flex, needs
  a backend token store)
- _"Tighten responsive scaling so the 480px turntable fits small mobile screens."_
