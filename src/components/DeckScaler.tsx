// DeckScaler.tsx
// Responsive wrapper for the fixed ~560px turntable block. It measures the
// width actually available (ResizeObserver + window resize) and CSS-scales the
// deck down to fit — so the unit fills most of any viewport, down to ~380px
// phones, without horizontal overflow.
//
//   s = clamp(0.5, availableWidth / footprint, 1)   (transform-origin: top center)
//
// "footprint" is the deck's natural width (560) plus any `extraWidth` the caller
// reserves for chrome that hangs off the edge — e.g. Live's LIBRARY side tab —
// so that tab never pushes the page into a horizontal scroll.
//
// The scaled height is reserved in normal flow (a same-size placeholder box) so
// surrounding layout doesn't jump as the scale changes. The current scale is
// handed to children via a render prop; TurntableVisual forwards it to useTonearm
// so drag-to-seek still converts pointer px correctly under scaling.

import { useEffect, useRef, useState } from "react";

const NATURAL_WIDTH = 560; // matches TurntableVisual's minWidth

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
      const s = Math.max(0.5, Math.min(avail / footprint, 1));
      setScale(s);
      // offsetHeight ignores the CSS transform, so this is the deck's natural
      // (unscaled) height — exactly what we scale to reserve flow space.
      setInnerH(inner.offsetHeight);
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
