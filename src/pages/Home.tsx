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
import ArtSidePanel from "../components/ArtSidePanel";
import SettingsPanel, { ArtPanelPicker, CracklePicker, DimPicker, SettingsSection } from "../components/SettingsPanel";
import DeckTab, { TAB_RESERVE } from "../components/DeckTab";
import HowToPager from "../components/HowTo";
import { useDemoPlayer } from "../lib/useDemoPlayer";
import { loadSavedArtPanel, saveArtPanel } from "../lib/artPanel";
import { loadSavedCrackle, saveCrackle } from "../lib/useVinylNoise";
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
  const [crackle, setCrackle] = useState<boolean>(() => loadSavedCrackle());
  const handleCrackleChange = (next: boolean) => {
    setCrackle(next);
    saveCrackle(next);
  };
  const [artPanel, setArtPanel] = useState<boolean>(() => loadSavedArtPanel());
  const handleArtPanelChange = (next: boolean) => {
    setArtPanel(next);
    saveArtPanel(next);
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
      id: "crackle",
      label: "Crackle",
      content: <CracklePicker on={crackle} onChange={handleCrackleChange} />,
    },
    {
      id: "artpanel",
      label: "Art Panel",
      content: <ArtPanelPicker on={artPanel} onChange={handleArtPanelChange} />,
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
            <div key={i} style={{ color: "var(--m-dim-text, #b8945c)", fontSize: 11, lineHeight: 1.5 }}>
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
      {/* Deck row: optional art side panel LEFT of the deck (mirrors Live —
          the right edge belongs to the tab column). Fixed 300px panel; the
          flex cell around DeckScaler absorbs the rest so the deck rescales
          automatically. The panel hides itself below 1100px viewports. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          width: "100%",
        }}
      >
        {artPanel && <ArtSidePanel track={demo.track} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DeckScaler extraWidth={TAB_RESERVE}>
            {(scale) => (
              // 560-wide relative box = the deck; the SETTINGS tab pins to its
              // right edge and lives INSIDE the scaled layer so it stays
              // attached as the deck rescales. (The drawer itself renders
              // outside — fixed.)
              <div style={{ position: "relative", display: "flex", width: 560 }}>
                <TurntableVisual
                  mode="demo"
                  scale={scale}
                  crackleOn={crackle}
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

                {/* SETTINGS: single vertical brass tab on the deck's right
                    edge — mirrors Live's tab column, minus LIBRARY (no
                    account here). */}
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
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sections={settingsSections}
      />
    </div>
  );
}
