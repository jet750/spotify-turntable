// Live.tsx — private live page (route "/live")
// The turntable is wired to the real Spotify Web Playback SDK via useSpotify.
// The turntable + CONNECT button render immediately for anyone who reaches this
// page — access is enforced solely by Spotify's development-mode allowlist:
// only allowlisted Premium accounts can complete OAuth (see the README
// "Security model" section).

import { lazy, Suspense, useRef, useState } from "react";
import TurntableVisual from "../components/TurntableVisual";
import DeckScaler from "../components/DeckScaler";
import SettingsPanel, { SettingsSection, WoodPicker } from "../components/SettingsPanel";
import DeckTab, { TAB_RESERVE } from "../components/DeckTab";
import { useSpotify } from "../lib/useSpotify";
import type { PlayContextOpts } from "../lib/useSpotify";
import { loadSavedWood, saveWood, WoodName } from "../lib/woods";

// Code-split the LIBRARY drawer (Item 8): it + its data hook (useSpotifyLibrary)
// stay out of the initial bundle and only load on first open. Default export ->
// React.lazy-compatible.
const BrowsePanel = lazy(() => import("../components/BrowsePanel"));

export default function Live() {
  const spotify = useSpotify();

  const [browseOpen, setBrowseOpen] = useState(false);
  // Stays false until the user first opens the library, which is what triggers the
  // lazy chunk to load; once true the panel stays mounted so its close animation runs.
  const [browseRequested, setBrowseRequested] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wood, setWood] = useState<WoodName>(() => loadSavedWood());

  const toggleBrowse = () => {
    setBrowseRequested(true);
    setSettingsOpen(false);
    setBrowseOpen((o) => !o);
  };
  const toggleSettings = () => {
    setBrowseOpen(false);
    setSettingsOpen((o) => !o);
  };
  const handleWoodChange = (next: WoodName) => {
    setWood(next);
    saveWood(next);
  };

  // Browse is live-only: it needs a connected account.
  const canBrowse = spotify.isAuthenticated;

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

  const settingsSections: SettingsSection[] = [
    {
      id: "about",
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
      label: "Access",
      content: (
        <>
          Playback runs through a connected Spotify&nbsp;
          <b style={{ color: "#e8c870" }}>Premium</b> account. Hit{" "}
          <b style={{ color: "#e8c870" }}>CONNECT</b> and authorize Spotify — the
          deck then plays through that account on this device. Access is
          controlled by the Spotify allowlist: only whitelisted accounts can
          complete authorization.
        </>
      ),
    },
    {
      id: "deck",
      label: "Deck",
      content: <WoodPicker wood={wood} onWoodChange={handleWoodChange} />,
    },
  ];

  return (
    <div className="stage">
      <DeckScaler extraWidth={TAB_RESERVE}>
        {(scale) => (
          // 560-wide relative box = the deck; the LIBRARY/SETTINGS tabs pin to
          // its right edge and live INSIDE the scaled layer so they stay
          // attached as the deck shrinks. (Drawers themselves render outside —
          // they're fixed.)
          <div style={{ position: "relative", display: "flex", width: 560 }}>
            <TurntableVisual
              mode="live"
              scale={scale}
              deckWood={wood}
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
            />

            {/* LIBRARY / SETTINGS: stacked vertical brass tabs on the deck's
                right edge. Library needs a connected account; Settings is
                always available. */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "100%", // flush against the deck's right edge
                transform: "translateY(-50%)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {canBrowse && (
                <DeckTab
                  label="▤ Library"
                  ariaLabel="Open your library"
                  expanded={browseOpen}
                  onClick={toggleBrowse}
                />
              )}
              <DeckTab
                label="⚙ Settings"
                ariaLabel="Open settings"
                expanded={settingsOpen}
                onClick={toggleSettings}
              />
            </div>
          </div>
        )}
      </DeckScaler>

      {/* Drawers live OUTSIDE DeckScaler: they're position:fixed, and a CSS
          transform on an ancestor would re-anchor them away from the viewport.
          Library is lazy-mounted on first open (Item 8) with a lightweight
          fallback while the chunk loads; Settings is small enough to mount
          directly. */}
      {canBrowse && browseRequested && (
        <Suspense fallback={<BrowseFallback />}>
          <BrowsePanel
            spotify={spotifyForBrowse}
            open={browseOpen}
            onClose={() => setBrowseOpen(false)}
          />
        </Suspense>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sections={settingsSections}
      />
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
