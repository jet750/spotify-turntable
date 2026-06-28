// Home.tsx — public demo page (route "/")
// Renders the turntable in demo mode, driven by a shuffled local playlist
// (useDemoPlayer). No Spotify, no auth — anyone visiting sees it "playing a set."

import { useState } from "react";
import TurntableVisual from "../components/TurntableVisual";
import { useDemoPlayer } from "../lib/useDemoPlayer";
import { DEMO_TRACKS } from "../lib/demoMeta";

const noop = () => {};

export default function Home() {
  const demo = useDemoPlayer();
  const [showInfo, setShowInfo] = useState(true);

  // De-duplicated attribution lines (CC licenses require visible credit).
  const credits = Array.from(
    new Set(DEMO_TRACKS.map((t) => t.attribution).filter(Boolean))
  );

  return (
    <div className="stage">
      {showInfo && (
        <div className="explainer">
          <button className="close" onClick={() => setShowInfo(false)} aria-label="Dismiss">
            ×
          </button>
          <b>Demo mode.</b> Press play for a shuffled set. The full build connects to
          Spotify via the Web&nbsp;Playback&nbsp;SDK and turns this turntable into a real
          playback device — the platter, tonearm and label sync to whatever I&apos;m
          actually listening to.
        </div>
      )}

      <TurntableVisual
        mode="demo"
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

      {credits.length > 0 && (
        <div className="attribution">
          {credits.map((c, i) => (
            <div key={i}>{c}</div>
          ))}
        </div>
      )}
    </div>
  );
}
