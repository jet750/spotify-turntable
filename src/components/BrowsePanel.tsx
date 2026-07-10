// BrowsePanel.tsx
// The LIBRARY — a wood-cabinet overlay that opens over the turntable and lets
// you pick what plays on the live deck. It reuses the deck plinth's exact
// finish recipe (chrome-gradient frame, wood color tile + normal-map grain,
// dim scrim) and follows the SAME wood the user picked for the deck, so it
// reads as a record cabinet from the same piece of furniture. Tabs:
//   Now · Search · Playlists · Collection · Recent
// Cards sit in a responsive auto-fill grid — columns are derived from the
// available width, so there is never horizontal scrolling and typical
// desktop/tablet sizes show two-plus full rows.
//
// Picking a card calls spotify.playContext(...) which starts that album /
// playlist / track ON the turntable device. The turntable's existing state
// polling then picks up the new track (label art + arm re-cue) on its own.
//
// LIVE-MODE ONLY — this never touches the demo player.

import { useEffect, useState } from "react";
import type { SpotifyState, SpotifyTrack } from "../lib/useSpotify";
import { useSpotifyLibrary } from "../lib/useSpotifyLibrary";
import type { AlbumDetailState, BrowseCard, TabState } from "../lib/useSpotifyLibrary";
import {
  DEFAULT_WOOD,
  WOODS,
  WoodName,
  WOOD_TILE_PX,
  WOOD_NORMAL_OPACITY,
  WOOD_NORMAL_BLEND,
} from "../lib/woods";

// ─── Palette (matches TurntableVisual.tsx) ──────────────────────────────────
// Metal tones route through the stage's --m-* custom properties (metals.ts)
// so the cabinet chrome follows the selected finish; walnut stays fixed.
const WALNUT_DARK = "#2a1c08";
const BRASS = "var(--m-base, #c49a3c)";
const BRASS_LIGHT = "var(--m-bright, #e8c870)";
// dim-text role: muted label tone that still clears WCAG AA on the walnut
// drawer background (the plain dim role doesn't — Item 7 audit).
const BRASS_DIM = "var(--m-dim-text, #b8945c)";
const BORDER_DARK = "#3a2808";
const MONO = "'Courier New', monospace";
// Dark backing that keeps text/cards legible on top of the wood tile — the
// cabinet equivalent of the deck's control plates.
const SHELF_BACKING = "rgba(24, 15, 5, 0.55)";
// Small dim-brass labels sit directly on the wood tile; on the light finishes
// (oak/pine) they need this shadow to stay readable.
const WOOD_TEXT_SHADOW = "0 1px 3px rgba(0,0,0,0.85)";

type TabKey = "now" | "search" | "playlists" | "collection" | "recent";

const TABS: { key: TabKey; label: string }[] = [
  { key: "now", label: "Now" },
  { key: "search", label: "Search" },
  { key: "playlists", label: "Playlists" },
  { key: "collection", label: "Collection" },
  { key: "recent", label: "Recent" },
];

// Responsive card grid: auto-fill derives the column count from whatever width
// the cabinet actually has, so cards reflow instead of overflowing sideways.
// 150px minimum keeps covers readable; 1fr stretch removes ragged right edges.
const CARD_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 14,
};

interface BrowsePanelProps {
  spotify: SpotifyState;
  open: boolean;
  onClose: () => void;
  // Deck finish to build the cabinet from — defaults so existing callers keep
  // working, but Live passes its selected wood for a matching set.
  wood?: WoodName;
}

export default function BrowsePanel({ spotify, open, onClose, wood = DEFAULT_WOOD }: BrowsePanelProps) {
  const library = useSpotifyLibrary(spotify.accessToken);
  const [activeTab, setActiveTab] = useState<TabKey>("search");
  const [query, setQuery] = useState("");

  // Lazy-load each tab's data the first time it becomes active while open.
  // (The loaders are idempotent — guarded internally — so re-calls are cheap.)
  useEffect(() => {
    if (!open) return;
    if (activeTab === "playlists") library.loadPlaylists();
    else if (activeTab === "collection") library.loadCollection();
    else if (activeTab === "recent") library.loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  // Now-playing album facts (Item 5): follow the current track's album while
  // the Now tab is visible. Cached per album, so poll-driven re-runs are free.
  const nowAlbumId = spotify.track?.albumId ?? null;
  useEffect(() => {
    if (!open || activeTab !== "now" || !nowAlbumId) return;
    library.loadAlbumDetail(nowAlbumId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab, nowAlbumId]);

  // Debounced search (~350ms) while the Search tab is active.
  useEffect(() => {
    if (!open || activeTab !== "search") return;
    const id = setTimeout(() => library.search(query), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTab, open]);

  // A full overlay should also close on Escape (the drawer never did, but a
  // cabinet covering the whole deck earns the standard dialog behavior).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const stateFor = (tab: TabKey): TabState => {
    switch (tab) {
      case "playlists":
        return library.playlists;
      case "collection":
        return library.collection;
      case "recent":
        return library.recent;
      default:
        return library.searchResults;
    }
  };

  const handlePick = (card: BrowseCard) => {
    if (card.kind === "track") {
      spotify.playContext({ uris: [card.uri] });
    } else {
      spotify.playContext({ contextUri: card.uri });
    }
    onClose();
  };

  const tab = stateFor(activeTab);

  return (
    <>
      <style>{SHIMMER_KEYFRAMES}</style>

      {/* Backdrop — click-away to close (only catches clicks while open).
          Darker than the old drawer's: the cabinet is the whole show. */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
          zIndex: 999,
        }}
      />

      {/* Cabinet — centered over the turntable, sized to the viewport with
          clamps so it reads as furniture, not a fullscreen takeover. It rises
          slightly as it fades in, like a lid opening. */}
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Library"
        aria-hidden={!open}
        style={{
          position: "fixed",
          inset: 0,
          margin: "auto",
          width: "min(1080px, 100vw - 32px)",
          height: "min(88vh, 940px)",
          opacity: open ? 1 : 0,
          transform: open ? "none" : "translateY(18px) scale(0.98)",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.28s ease, transform 0.32s cubic-bezier(0.4,0,0.2,1)",
          // Same outer chrome as the deck (.deck-region): warm gradient frame,
          // dark edge, brass inner top-light.
          background: "linear-gradient(160deg, #7a5228 0%, #5a3c18 40%, #3e2808 100%)",
          border: "2px solid #3a2808",
          borderRadius: 14,
          boxShadow: "0 24px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(232,200,112,0.12)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: MONO,
          zIndex: 1000,
        }}
      >
        {/* Cabinet surface — the deck plinth's fill, verbatim: highlight wash
            over the selected wood's color tile, with the normal map composited
            as a blended overlay child so the grain catches the highlight, and
            the dim scrim above both. Content blocks are position:relative so
            they paint over the decorative layers (same trick as the deck). */}
        <div
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            backgroundImage: [
              "linear-gradient(160deg, rgba(120,80,30,0.15) 0%, rgba(60,35,10,0.2) 100%)",
              `url(${WOODS[wood].color})`,
            ].join(", "),
            backgroundSize: `auto, ${WOOD_TILE_PX}px ${WOOD_TILE_PX}px`,
            backgroundRepeat: "no-repeat, repeat",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${WOODS[wood].normal})`,
              backgroundSize: `${WOOD_TILE_PX}px ${WOOD_TILE_PX}px`,
              backgroundRepeat: "repeat",
              mixBlendMode: WOOD_NORMAL_BLEND,
              opacity: WOOD_NORMAL_OPACITY,
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, var(--dim-scrim, 0))",
              pointerEvents: "none",
            }}
          />

          {/* Header */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 22px 12px",
              borderBottom: `1px solid ${BORDER_DARK}`,
              background: "rgba(24, 15, 5, 0.35)",
            }}
          >
            <span
              style={{
                color: BRASS_LIGHT,
                fontFamily: "Georgia, serif",
                fontWeight: "bold",
                fontSize: 18,
                letterSpacing: "0.12em",
                textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              }}
            >
              ▤ LIBRARY
            </span>
            <button
              onClick={onClose}
              aria-label="Close browse"
              style={{
                background: "none",
                border: "none",
                color: BRASS,
                fontSize: 20,
                cursor: "pointer",
                lineHeight: 1,
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* Tabs — natural-width brass plates on a rail (they'd look stretched
              spanning the full cabinet); wraps rather than overflows. */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "12px 20px 0",
            }}
          >
            {TABS.map((t) => {
              const active = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    background: active
                      ? "linear-gradient(180deg, var(--m-plate-top, #6a4e18) 0%, var(--m-plate-bottom, #523a10) 100%)"
                      : SHELF_BACKING,
                    border: `1px solid ${active ? BRASS : BORDER_DARK}`,
                    borderRadius: 4,
                    padding: "7px 16px",
                    color: active ? "var(--m-brightest, #f0d080)" : BRASS_DIM,
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Search input (Search tab only) */}
          {activeTab === "search" && (
            <div style={{ position: "relative", padding: "14px 20px 4px" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search albums…"
                autoFocus
                style={{
                  width: "100%",
                  maxWidth: 460,
                  boxSizing: "border-box",
                  background: WALNUT_DARK,
                  border: `1px solid ${BRASS}`,
                  borderRadius: 4,
                  padding: "8px 10px",
                  color: BRASS_LIGHT,
                  fontFamily: MONO,
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          )}

          {/* Content — the shelf. Vertical scroll only; the grid reflows. */}
          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "14px 20px 20px",
            }}
          >
            {library.expired ? (
              <ReconnectNotice onReconnect={spotify.login} />
            ) : activeTab === "now" ? (
              <NowPlayingView track={spotify.track} albumDetail={library.albumDetail} />
            ) : (
              <TabBody
                tab={tab}
                activeTab={activeTab}
                query={query}
                onPick={handlePick}
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Now-playing view (Item 5) ──────────────────────────────────────────────
// Full cover art + the facts we can actually get: track/artist/album from the
// player state, release year / track count / label from GET /albums/{id}.
// In the cabinet it lays out side-by-side — sleeve on the left, notes on the
// right — and wraps back to a single column when the cabinet is narrow.
function NowPlayingView({
  track,
  albumDetail,
}: {
  track: SpotifyTrack | null;
  albumDetail: AlbumDetailState;
}) {
  if (!track) {
    return (
      <div style={{ padding: "24px 8px", textAlign: "center", color: BRASS_DIM, fontSize: 12, fontFamily: MONO }}>
        Nothing on the platter.
      </div>
    );
  }

  // Only show detail that belongs to THIS track's album (a stale fetch for the
  // previous record shouldn't caption the new one).
  const detail = albumDetail.id === track.albumId ? albumDetail.detail : null;
  const loadingFacts = albumDetail.id === track.albumId && albumDetail.loading;

  const facts: string[] = [];
  if (detail?.releaseYear) facts.push(detail.releaseYear);
  if (detail?.totalTracks) facts.push(`${detail.totalTracks} track${detail.totalTracks === 1 ? "" : "s"}`);
  if (detail?.label) facts.push(detail.label);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          color: BRASS_DIM,
          textTransform: "uppercase",
          textShadow: WOOD_TEXT_SHADOW,
        }}
      >
        On the platter
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "0 1 340px", minWidth: 220 }}>
          {track.albumArt ? (
            <img
              src={track.albumArt}
              alt={`${track.album} cover art`}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                borderRadius: 6,
                display: "block",
                background: WALNUT_DARK,
                border: `1px solid ${BORDER_DARK}`,
                boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 6,
                background: "radial-gradient(circle at 35% 30%, var(--m-bright, #e8c870), var(--m-base, #c49a3c) 55%, var(--m-deep, #8a6820))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--m-text-on, #3d2100)",
                fontSize: 48,
              }}
            >
              ◉
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 220 }}>
          <div
            style={{
              color: BRASS_LIGHT,
              fontFamily: "Georgia, serif",
              fontWeight: "bold",
              fontSize: 22,
              lineHeight: 1.25,
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          >
            {track.name}
          </div>
          <div style={{ color: BRASS, fontSize: 14, marginTop: 6, fontFamily: MONO }}>{track.artist}</div>
          <div style={{ color: BRASS_DIM, fontSize: 12, marginTop: 10, fontFamily: MONO }}>
            {track.album}
            {detail?.releaseYear ? ` · ${detail.releaseYear}` : ""}
          </div>

          {(facts.length > 0 || loadingFacts) && (
            <div
              style={{
                borderTop: `1px solid ${BORDER_DARK}`,
                marginTop: 14,
                paddingTop: 10,
                color: BRASS_DIM,
                fontSize: 11,
                fontFamily: MONO,
                letterSpacing: "0.05em",
              }}
            >
              {loadingFacts && facts.length === 0 ? "…" : facts.join(" · ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab body: header label, loading, error, empty, or the card grid ────────
function TabBody({
  tab,
  activeTab,
  query,
  onPick,
}: {
  tab: TabState;
  activeTab: TabKey;
  query: string;
  onPick: (card: BrowseCard) => void;
}) {
  const heading =
    activeTab === "search"
      ? "Results"
      : activeTab === "playlists"
      ? "Your Playlists"
      : activeTab === "collection"
      ? "Saved Albums"
      : "Recently Played";

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          color: BRASS_DIM,
          textTransform: "uppercase",
          marginBottom: 10,
          textShadow: WOOD_TEXT_SHADOW,
        }}
      >
        {heading}
      </div>

      {tab.error && (
        <div
          style={{
            fontSize: 11,
            color: "#ff6040",
            fontFamily: MONO,
            padding: "6px 0",
          }}
        >
          ⚠ {tab.error}
        </div>
      )}

      {tab.loading && <SkeletonGrid />}

      {!tab.loading && !tab.error && tab.cards.length === 0 && (
        <div style={{ fontSize: 12, color: BRASS_DIM, padding: "8px 0", textShadow: WOOD_TEXT_SHADOW }}>
          {activeTab === "search"
            ? query.trim()
              ? "No albums found."
              : "Type to search albums."
            : "Nothing here yet."}
        </div>
      )}

      {!tab.loading && tab.cards.length > 0 && (
        <div style={CARD_GRID}>
          {tab.cards.map((card) => (
            <Card key={card.uri} card={card} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── A single browse card ───────────────────────────────────────────────────
// Dark shelf backing at rest (transparent would sink into the wood tile);
// brass tint on hover, like pulling the sleeve forward.
function Card({
  card,
  onPick,
}: {
  card: BrowseCard;
  onPick: (card: BrowseCard) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onPick(card)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${card.title}${card.subtitle ? " — " + card.subtitle : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        textAlign: "left",
        background: hover ? "rgba(196,154,60,0.18)" : SHELF_BACKING,
        border: `1px solid ${hover ? BRASS : BORDER_DARK}`,
        borderRadius: 6,
        padding: 8,
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: MONO,
        boxShadow: hover ? "0 6px 18px rgba(0,0,0,0.45)" : "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <CardCover card={card} />
      <span
        style={{
          color: BRASS_LIGHT,
          fontSize: 12,
          fontFamily: "Georgia, serif",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {card.title}
      </span>
      <span
        style={{
          color: BRASS_DIM,
          fontSize: 10,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {card.subtitle || " "}
      </span>
    </button>
  );
}

// Square cover with a brass placeholder when artwork is missing.
function CardCover({ card }: { card: BrowseCard }) {
  if (card.imageUrl) {
    return (
      <img
        src={card.imageUrl}
        alt=""
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          objectFit: "cover",
          borderRadius: 4,
          display: "block",
          background: WALNUT_DARK,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 4,
        background: "radial-gradient(circle at 35% 30%, var(--m-bright, #e8c870), var(--m-base, #c49a3c) 55%, var(--m-deep, #8a6820))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--m-text-on, #3d2100)",
        fontSize: 26,
      }}
    >
      {card.kind === "playlist" ? "≣" : card.kind === "track" ? "♪" : "◉"}
    </div>
  );
}

// ─── Loading shimmer (skeleton cards) ───────────────────────────────────────
// Same auto-fill grid as the real cards; 12 placeholders so a wide cabinet
// still shows two shimmering rows while loading.
function SkeletonGrid() {
  return (
    <div style={CARD_GRID}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ ...shimmerStyle, width: "100%", aspectRatio: "1 / 1", borderRadius: 4 }} />
          <div style={{ ...shimmerStyle, height: 10, width: "80%", borderRadius: 2 }} />
          <div style={{ ...shimmerStyle, height: 8, width: "55%", borderRadius: 2 }} />
        </div>
      ))}
    </div>
  );
}

const shimmerStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, #3a2808 0%, #5a3c18 50%, #3a2808 100%)",
  backgroundSize: "400px 100%",
  animation: "browseShimmer 1.2s ease-in-out infinite",
};

const SHIMMER_KEYFRAMES = `
@keyframes browseShimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}`;

// ─── Token-expired notice ───────────────────────────────────────────────────
function ReconnectNotice({ onReconnect }: { onReconnect: () => void }) {
  return (
    <div style={{ padding: "20px 8px", textAlign: "center" }}>
      <div style={{ color: "#ff6040", fontSize: 13, marginBottom: 12, fontFamily: MONO }}>
        Session expired.
      </div>
      <div style={{ color: BRASS_DIM, fontSize: 11, marginBottom: 16, fontFamily: MONO }}>
        Reconnect your Spotify account to keep browsing.
      </div>
      <button
        onClick={onReconnect}
        style={{
          background: "linear-gradient(180deg, var(--m-plate-top, #6a4e18) 0%, var(--m-plate-bottom, #523a10) 100%)",
          border: `1px solid ${BRASS}`,
          borderRadius: 3,
          padding: "6px 14px",
          color: "var(--m-brightest, #f0d080)",
          fontSize: 11,
          fontFamily: MONO,
          letterSpacing: "0.14em",
          cursor: "pointer",
          textTransform: "uppercase",
        }}
      >
        Reconnect
      </button>
    </div>
  );
}
