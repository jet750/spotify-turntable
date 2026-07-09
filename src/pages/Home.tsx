// Home.tsx — public demo page (route "/")
// Renders the turntable in demo mode, driven by a shuffled local playlist
// (useDemoPlayer). No Spotify, no auth — anyone visiting sees it "playing a set."
//
// The deck is wrapped in DeckScaler so it fills most of the viewport on any
// screen. About + CC-attribution credits live in the SETTINGS drawer (mirrors
// Live's Settings tab) rather than as always-visible captions.

import { useState } from "react";
import TurntableVisual from "../components/TurntableVisual";
import DeckScaler from "../components/DeckScaler";
import SettingsPanel, { DimPicker, SettingsSection } from "../components/SettingsPanel";
import DeckTab, { TAB_RESERVE } from "../components/DeckTab";
import HowToPager from "../components/HowTo";
import { useDemoPlayer } from "../lib/useDemoPlayer";
import { DEMO_TRACKS } from "../lib/demoMeta";
import { loadSavedMetal, metalCssVars } from "../lib/metals";
import { dimCssVars, loadSavedDim, saveDim, DimLevel } from "../lib/dimmer";

const noop = () => {};

export default function Home() {
  const demo = useDemoPlayer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The finish pickers live on /live; the public demo deck just follows the
  // persisted choice so the unit looks the same across pages. Brightness IS
  // adjustable here — it's a viewing preference, not deck customization.
  const [metal] = useState(() => loadSavedMetal());
  const [dim, setDim] = useState<DimLevel>(() => loadSavedDim());
  const handleDimChange = (next: DimLevel) => {
    setDim(next);
    saveDim(next);
  };

  // De-duplicated attribution lines (CC licenses require visible credit).
  const credits = Array.from(
    new Set(DEMO_TRACKS.map((t) => t.attribution).filter(Boolean))
  );

  const settingsSections: SettingsSection[] = [
    {
      id: "about",
      label: "About",
      content: (
        <>
          <b style={{ color: "var(--m-bright, #e8c870)" }}>Demo mode.</b> Press play for a shuffled
          set. The full build connects to Spotify via the Web&nbsp;Playback&nbsp;SDK
          and turns this turntable into a real playback device — the platter,
          tonearm and label sync to whatever I&apos;m actually listening to.
        </>
      ),
    },
    {
      id: "howto",
      label: "How-To",
      content: <HowToPager />,
    },
    {
      id: "brightness",
      label: "Brightness",
      content: <DimPicker level={dim} onLevelChange={handleDimChange} />,
    },
  ];

  if (credits.length > 0) {
    settingsSections.push({
      id: "credits",
      label: "Credits",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {credits.map((c, i) => (
            <div key={i} style={{ color: "#a08040", fontSize: 11, lineHeight: 1.5 }}>
              {c}
            </div>
          ))}
        </div>
      ),
    });
  }

  return (
    <div
      className="stage"
      style={{ ...metalCssVars(metal), ...dimCssVars(dim) } as React.CSSProperties}
    >
      <DeckScaler extraWidth={TAB_RESERVE}>
        {(scale) => (
          // 560-wide relative box = the deck; the SETTINGS tab pins to its
          // right edge and lives INSIDE the scaled layer so it stays attached
          // as the deck shrinks. (The drawer itself renders outside — fixed.)
          <div style={{ position: "relative", display: "flex", width: 560 }}>
            <TurntableVisual
              mode="demo"
              scale={scale}
              track={demo.track}
              isAuthenticated={true}
              isConnected={false}
              onTogglePlay={demo.toggle}
              onSeek={demo.seek}
              onSetPlaybackRate={demo.setRate}
              onPrev={demo.prev}
              onNext={demo.next}
              onTransfer={noop}
              onLogin={noop}
              onLogout={noop}
            />

            {/* SETTINGS: single vertical brass tab on the deck's right edge —
                mirrors Live's tab column, minus LIBRARY (no account here). */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "100%",
                transform: "translateY(-50%)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <DeckTab
                label="⚙ Settings"
                ariaLabel="Open settings"
                expanded={settingsOpen}
                onClick={() => setSettingsOpen((o) => !o)}
              />
            </div>
          </div>
        )}
      </DeckScaler>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sections={settingsSections}
      />
    </div>
  );
}
