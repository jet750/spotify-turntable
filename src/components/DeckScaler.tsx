// DeckScaler.tsx
// Responsive wrapper for the fixed ~560px turntable block. It measures the
// width actually available (ResizeObserver + window resize) and CSS-scales the
// deck BOTH ways — down to fit ~380px phones, and up until it fills the
// viewport on large monitors:
//
//   s = max(MIN_SCALE, min(availWidth / footprint, heightBudget / naturalH))
//                                                  (transform-origin: top center)
//
// There is deliberately NO arbitrary upper cap: the deck grows until it runs
// out of viewport width or height, whichever binds first, so a big monitor
// gets a genuinely big deck. Uniform scalar => aspect ratio preserved.
//
// "footprint" is the deck's natural width (560) plus any `extraWidth` the caller
// reserves for chrome that hangs off the edge — e.g. Live's LIBRARY side tab —
// so that tab never pushes the page into a horizontal scroll.
//
// The placeholder div reserves the SCALED footprint in normal flow, so layout
// never jumps and the deck itself never spawns scrollbars. The scale is handed
// to children so drag interactions (tonearm) convert pointer px back into
// unscaled deck coordinates — the same compensation covers shrink and growth.

import { useEffect, useRef, useState } from "react";

const NATURAL_WIDTH = 560; // matches TurntableVisual's minWidth
const MIN_SCALE = 0.5; // floor so the deck stays legible on ~380px phones
// Viewport height reserved before computing the height-limited scale: the
// .stage's 32px top + bottom padding plus a sliver of breathing room, so the
// grown deck fills the screen without ever forcing a vertical scrollbar.
const VERTICAL_MARGIN = 72;

export default function DeckScaler({
  extraWidth = 0,
  children,
}: {
  extraWidth?: number;
  children: (scale: number) => React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [innerH, setInnerH] = useState(0);

  const footprint = NATURAL_WIDTH + extraWidth;

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const recompute = () => {
      const avail = outer.clientWidth;
      // offsetHeight ignores the CSS transform, so this is the deck's natural
      // (unscaled) height — exactly what we scale to reserve flow space, and the
      // basis for the height-limited scale.
      const naturalH = inner.offsetHeight;
      const widthScale = avail / footprint;
      const heightScale =
        naturalH > 0 ? Math.max(0, window.innerHeight - VERTICAL_MARGIN) / naturalH : Infinity;
      // Bounded by BOTH dimensions — never wider than the column, never taller
      // than the viewport budget — and by nothing else: the viewport itself is
      // the ceiling. Only the legibility floor clamps from below.
      const s = Math.max(MIN_SCALE, Math.min(widthScale, heightScale));
      setScale(s);
      setInnerH(naturalH);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(outer); // available width changes
    ro.observe(inner); // deck height changes (error bar, etc.)
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [footprint]);

  return (
    <div ref={outerRef} style={{ width: "100%" }}>
      {/* Placeholder sized to the SCALED footprint keeps layout from jumping. */}
      <div
        style={{
          position: "relative",
          width: footprint * scale,
          height: innerH * scale,
          margin: "0 auto",
        }}
      >
        <div
          ref={innerRef}
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            width: footprint,
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          {children(scale)}
        </div>
      </div>
    </div>
  );
}
