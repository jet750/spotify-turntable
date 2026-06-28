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

import { useState } from "react";
import TurntableVisual from "../components/TurntableVisual";
import { useSpotify } from "../lib/useSpotify";

const PASS = import.meta.env.VITE_STUDIO_PASS;
const UNLOCK_KEY = "studio_unlocked";

export default function Live() {
  const spotify = useSpotify();

  // If no passphrase is configured, treat the page as unlocked (handy in dev).
  const initialUnlocked = !PASS || sessionStorage.getItem(UNLOCK_KEY) === "1";
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [showPrompt, setShowPrompt] = useState(false);
  const [entry, setEntry] = useState("");
  const [err, setErr] = useState("");

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

  return (
    <div className="stage">
      <TurntableVisual
        mode="live"
        locked={!unlocked}
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
