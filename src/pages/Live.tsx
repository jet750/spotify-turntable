// Live.tsx — private live page (route "/live")
// The turntable is wired to the real Spotify Web Playback SDK via useSpotify.
// A passphrase gates the CONNECT button so the page never shows a broken-looking
// failed login to a casual visitor.
//
// SECURITY MODEL (read this):
//   VITE_STUDIO_PASS is embedded in the client bundle and is therefore PUBLIC —
//   anyone who inspects the JS can read it. This gate is COSMETIC: it stops the
//   page from looking broken, nothing more. Your REAL access control is Spotify's
//   development-mode allowlist: even with the passphrase, only allowlisted Premium
//   accounts can complete OAuth. To make the passphrase itself non-extractable,
//   move the check server-side (Vercel Edge Middleware + a non-VITE secret) — see
//   the README "Hardening the gate" section.

import { lazy, Suspense, useRef, useState } from "react";
import TurntableVisual from "../components/TurntableVisual";
import DeckScaler from "../components/DeckScaler";
import InfoButtonRow, { InfoItem } from "../components/InfoButtons";
import { useSpotify } from "../lib/useSpotify";
import type { PlayContextOpts } from "../lib/useSpotify";

// Code-split the LIBRARY drawer (Item 8): it + its data hook (useSpotifyLibrary)
// stay out of the initial bundle and only load on first open. Default export ->
// React.lazy-compatible.
const BrowsePanel = lazy(() => import("../components/BrowsePanel"));

const PASS = import.meta.env.VITE_STUDIO_PASS;
const UNLOCK_KEY = "studio_unlocked";

// Horizontal room reserved (in unscaled deck px) for the LIBRARY tab that hangs
// off the deck's right edge, so it never causes a horizontal scrollbar.
const TAB_RESERVE = 34;

export default function Live() {
  const spotify = useSpotify();

  // If no passphrase is configured, treat the page as unlocked (handy in dev).
  const initialUnlocked = !PASS || sessionStorage.getItem(UNLOCK_KEY) === "1";
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [showPrompt, setShowPrompt] = useState(false);
  const [entry, setEntry] = useState("");
  const [err, setErr] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  // Stays false until the user first opens the library, which is what triggers the
  // lazy chunk to load; once true the panel stays mounted so its close animation runs.
  const [browseRequested, setBrowseRequested] = useState(false);

  const toggleBrowse = () => {
    setBrowseRequested(true);
    setBrowseOpen((o) => !o);
  };

  // Browse is live-only: it needs an unlocked page AND a connected account.
  const canBrowse = unlocked && spotify.isAuthenticated;

  // ── Library pick → needle-drop cue (Item 3) ────────────────────────────────
  // A pick from the drawer doesn't start playback directly: it's parked in
  // pendingPickRef and the deck is asked (cueRequestId bump) to run a full cue —
  // the arm swings over in silence and the context starts only as the stylus
  // lands (onCueLand). The BrowsePanel sees a spotify object whose playContext
  // is swapped for this request, so its behavior needs no changes.
  const [cueRequestId, setCueRequestId] = useState(0);
  const pendingPickRef = useRef<PlayContextOpts | null>(null);
  const spotifyForBrowse = {
    ...spotify,
    playContext: async (opts: PlayContextOpts) => {
      pendingPickRef.current = opts;
      setCueRequestId((n) => n + 1);
    },
  };
  const handleCueLand = () => {
    const pick = pendingPickRef.current;
    pendingPickRef.current = null;
    if (pick) void spotify.playContext(pick);
  };

  const tryUnlock = () => {
    if (entry === PASS) {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setUnlocked(true);
      setShowPrompt(false);
      setEntry("");
      setErr("");
    } else {
      setErr("Incorrect code");
    }
  };

  const infoItems: InfoItem[] = [
    {
      id: "about",
      icon: "ⓘ",
      label: "About",
      content: (
        <>
          <b style={{ color: "#e8c870" }}>Live mode.</b> This turntable is wired to
          my real Spotify account through the Web&nbsp;Playback&nbsp;SDK — the
          platter, tonearm and label track whatever&apos;s actually playing. Open{" "}
          <b style={{ color: "#e8c870" }}>LIBRARY</b> on the right edge to pick an
          album, playlist or track and it starts right here.
        </>
      ),
    },
    {
      id: "access",
      icon: "🔑",
      label: "Access",
      content: (
        <>
          Playback runs through a connected Spotify&nbsp;
          <b style={{ color: "#e8c870" }}>Premium</b> account. Hit{" "}
          <b style={{ color: "#e8c870" }}>CONNECT</b>, enter the access code, then
          authorize Spotify — the deck then plays through that account on this
          device.
        </>
      ),
    },
  ];

  return (
    <div className="stage">
      <DeckScaler extraWidth={TAB_RESERVE}>
        {(scale) => (
          // 560-wide relative box = the deck; the LIBRARY tab pins to its right
          // edge and lives INSIDE the scaled layer so it stays attached as the
          // deck shrinks. (The drawer itself is rendered outside — it's fixed.)
          <div style={{ position: "relative", display: "flex", width: 560 }}>
            <TurntableVisual
              mode="live"
              scale={scale}
              locked={!unlocked}
              cueRequestId={cueRequestId}
              onCueLand={handleCueLand}
              track={spotify.track}
              isAuthenticated={spotify.isAuthenticated}
              isConnected={spotify.isConnected}
              error={spotify.error}
              onTogglePlay={spotify.togglePlay}
              onSeek={spotify.seek}
              onPrev={spotify.prevTrack}
              onNext={spotify.nextTrack}
              onTransfer={spotify.transferPlayback}
              onLogin={spotify.login}
              onLogout={spotify.logout}
              onUnlockRequest={() => setShowPrompt(true)}
            />

            {/* LIBRARY: vertical brass tab on the deck's right edge. Toggles the
                same browseOpen state + BrowsePanel as before. Live + connected. */}
            {canBrowse && (
              <button
                onClick={toggleBrowse}
                aria-label="Open your library"
                aria-expanded={browseOpen}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "100%", // flush against the deck's right edge
                  transform: "translateY(-50%)",
                  writingMode: "vertical-rl",
                  background: "linear-gradient(180deg, #8a6828 0%, #6a4e18 100%)",
                  border: "1px solid #c49a3c",
                  borderLeft: "none", // merge into the deck's edge
                  borderRadius: "0 8px 8px 0", // rounded OUTER corners
                  padding: "16px 7px",
                  color: "#f0d080",
                  fontFamily: "'Courier New', monospace",
                  fontSize: 12,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow: "3px 3px 12px rgba(0,0,0,0.5)",
                }}
              >
                ▤ Library
              </button>
            )}
          </div>
        )}
      </DeckScaler>

      <InfoButtonRow items={infoItems} />

      {/* Drawer lives OUTSIDE DeckScaler: it's position:fixed, and a CSS transform
          on an ancestor would re-anchor it away from the viewport. Lazy-mounted on
          first open (Item 8) with a lightweight fallback while the chunk loads. */}
      {canBrowse && browseRequested && (
        <Suspense fallback={<BrowseFallback />}>
          <BrowsePanel
            spotify={spotifyForBrowse}
            open={browseOpen}
            onClose={() => setBrowseOpen(false)}
          />
        </Suspense>
      )}

      {showPrompt && !unlocked && (
        <div className="gate-overlay" onClick={() => setShowPrompt(false)}>
          <div className="gate-card" onClick={(e) => e.stopPropagation()}>
            <h2>Enter access code</h2>
            <p>This connects the turntable to a whitelisted Spotify account.</p>
            <input
              type="password"
              autoFocus
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="access code"
            />
            {err && <div className="gate-err">{err}</div>}
            <div className="gate-row">
              <button className="ghost" onClick={() => setShowPrompt(false)}>
                Cancel
              </button>
              <button onClick={tryUnlock}>Unlock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight fallback shown for the brief moment the lazy LIBRARY chunk loads on
// first open. A thin walnut/brass rail on the right edge, matching the drawer's
// resting position so the real panel slides in over it without a visual jump.
function BrowseFallback() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: 360,
        maxWidth: "100vw",
        background: "linear-gradient(160deg, #3e2808 0%, #2a1c08 100%)",
        borderLeft: "2px solid #c49a3c",
        boxShadow: "-12px 0 48px rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#a08040",
        fontFamily: "'Courier New', monospace",
        fontSize: 12,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        zIndex: 1000,
      }}
    >
      Loading library…
    </div>
  );
}
