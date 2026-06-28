// Home.tsx — public demo page (route "/")
// Renders the turntable in demo mode, driven by a shuffled local playlist
// (useDemoPlayer). No Spotify, no auth — anyone visiting sees it "playing a set."
//
// The deck is wrapped in DeckScaler so it fills most of the viewport on any
// screen. The old always-visible explainer + CC-attribution captions are now
// tucked into a compact row of round info buttons under the deck.

import TurntableVisual from "../components/TurntableVisual";
import DeckScaler from "../components/DeckScaler";
import InfoButtonRow, { InfoItem, infoMutedStyle } from "../components/InfoButtons";
import { useDemoPlayer } from "../lib/useDemoPlayer";
import { DEMO_TRACKS } from "../lib/demoMeta";

const noop = () => {};

export default function Home() {
  const demo = useDemoPlayer();

  // De-duplicated attribution lines (CC licenses require visible credit).
  const credits = Array.from(
    new Set(DEMO_TRACKS.map((t) => t.attribution).filter(Boolean))
  );

  const infoItems: InfoItem[] = [
    {
      id: "about",
      icon: "ⓘ",
      label: "About",
      content: (
        <>
          <b style={{ color: "#e8c870" }}>Demo mode.</b> Press play for a shuffled
          set. The full build connects to Spotify via the Web&nbsp;Playback&nbsp;SDK
          and turns this turntable into a real playback device — the platter,
          tonearm and label sync to whatever I&apos;m actually listening to.
        </>
      ),
    },
  ];

  if (credits.length > 0) {
    infoItems.push({
      id: "credits",
      icon: "♪",
      label: "Credits",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {credits.map((c, i) => (
            <div key={i} style={infoMutedStyle()}>
              {c}
            </div>
          ))}
        </div>
      ),
    });
  }

  return (
    <div className="stage">
      <DeckScaler>
        {(scale) => (
          <div style={{ position: "relative", display: "flex", width: 560 }}>
            <TurntableVisual
              mode="demo"
              scale={scale}
              track={demo.track}
              isAuthenticated={true}
              isConnected={false}
              onTogglePlay={demo.toggle}
              onSeek={demo.seek}
              onPrev={demo.prev}
              onNext={demo.next}
              onTransfer={noop}
              onLogin={noop}
              onLogout={noop}
            />
          </div>
        )}
      </DeckScaler>

      <InfoButtonRow items={infoItems} />
    </div>
  );
}
