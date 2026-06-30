// DeckScaler.tsx
// Responsive wrapper for the fixed ~560px turntable block. It measures the
// width actually available (ResizeObserver + window resize) and CSS-scales the
// deck down to fit — so the unit fills most of any viewport, down to ~380px
// phones, without horizontal overflow.
//
//   s = clamp(MIN_SCALE, min(availWidth / footprint, heightBudget / naturalH), MAX_SCALE)
//                                                          (transform-origin: top center)
//
// "footprint" is the deck's natural width (560) plus any `extraWidth` the caller
// reserves for chrome that hangs off the edge — e.g. Live's LIBRARY side tab —
// so that tab never pushes the page into a horizontal scroll.
//
// The deck now GROWS past 1.0 on roomy screens (MAX_SCALE) to fill more of the
// viewport, but is bounded by BOTH the available width AND a viewport-height budget
// so it never spills off-screen or forces a scrollbar. Uniform scalar => aspect
// ratio preserved; the placeholder reserves the scaled footprint so layout doesn't
// jump; the scale is handed to children so drag-to-seek still converts pointer px.
//
// NOTE: MAX_SCALE / VERTICAL_MARGIN are neutral defaults — tune the exact "fill"
// feel in-browser later. They only change how big the deck is allowed to get.

import { useEffect, useRef, useState } from "react";

const NATURAL_WIDTH = 560; // matches TurntableVisual's minWidth
const MIN_SCALE = 0.5; // floor so the deck stays legible on ~380px phones
const MAX_SCALE = 2; // ceiling so it can grow on large screens (neutral; tunable)
// Viewport height reserved for stage padding + the info-button row + breathing
// room, subtracted before computing the height-limited scale (neutral; tunable).
const VERTICAL_MARGIN = 180;

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
      // Bounded by BOTH dimensions: never wider than the column, never taller than
      // the viewport budget; then clamped to the allowed scale range.
      const s = Math.max(MIN_SCALE, Math.min(widthScale, heightScale, MAX_SCALE));
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
