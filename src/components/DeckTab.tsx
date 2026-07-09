// DeckTab.tsx
// Vertical brass tab pinned to the deck's right edge — Live shows LIBRARY +
// SETTINGS, Home shows SETTINGS only. Shared so both pages render identical
// hardware. TAB_RESERVE is the horizontal room (in unscaled deck px) a caller
// should pass to DeckScaler's extraWidth so a tab column never causes a
// horizontal scrollbar.

export const TAB_RESERVE = 34;

export default function DeckTab({
  label,
  ariaLabel,
  expanded,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      style={{
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
        writingMode: "vertical-rl",
      }}
    >
      {label}
    </button>
  );
}
