// BrowsePanel.tsx
// A slide-out drawer (right side) that lets you pick what plays on the live
// turntable — instead of only steering the already-active queue. Tabs:
//   Search · Playlists · Collection · Recent
// Picking a card calls spotify.playContext(...) which starts that album /
// playlist / track ON the turntable device. The turntable's existing state
// polling then picks up the new track (label art + arm re-cue) on its own.
//
// LIVE-MODE ONLY — this never touches the demo player.

import { useEffect, useRef, useState } from "react";
import type { SpotifyState, SpotifyTrack } from "../lib/useSpotify";
import { useSpotifyLibrary } from "../lib/useSpotifyLibrary";
import type { AlbumDetailState, BrowseCard, TabState } from "../lib/useSpotifyLibrary";

// ─── Palette (matches TurntableVisual.tsx) ──────────────────────────────────
// Metal tones route through the stage's --m-* custom properties (metals.ts)
// so the drawer chrome follows the selected finish; walnut stays fixed.
const WALNUT_DARK = "#2a1c08";
const WALNUT_DEEP = "#3e2808";
const BRASS = "var(--m-base, #c49a3c)";
const BRASS_LIGHT = "var(--m-bright, #e8c870)";
// dim-text role: muted label tone that still clears WCAG AA on the walnut
// drawer background (the plain dim role doesn't — Item 7 audit).
const BRASS_DIM = "var(--m-dim-text, #b8945c)";
const BORDER_DARK = "#3a2808";
const MONO = "'Courier New', monospace";

type TabKey = "now" | "search" | "playlists" | "collection" | "recent";

const TABS: { key: TabKey; label: string }[] = [
  { key: "now", label: "Now" },
  { key: "search", label: "Search" },
  { key: "playlists", label: "Playlists" },
  { key: "collection", label: "Collection" },
  { key: "recent", label: "Recent" },
];

interface BrowsePanelProps {
  spotify: SpotifyState;
  open: boolean;
  onClose: () => void;
}

export default function BrowsePanel({ spotify, open, onClose }: BrowsePanelProps) {
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

      {/* Backdrop — click-away to close (only catches clicks while open) */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <aside
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 360,
          maxWidth: "100vw",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.32s cubic-bezier(0.4,0,0.2,1)",
          background: `linear-gradient(160deg, ${WALNUT_DEEP} 0%, ${WALNUT_DARK} 100%)`,
          borderLeft: `2px solid ${BRASS}`,
          boxShadow: "-12px 0 48px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          fontFamily: MONO,
          zIndex: 1000,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px 12px",
            borderBottom: `1px solid ${BORDER_DARK}`,
          }}
        >
          <span
            style={{
              color: BRASS_LIGHT,
              fontFamily: "Georgia, serif",
              fontWeight: "bold",
              fontSize: 18,
              letterSpacing: "0.12em",
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

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "10px 12px 0" }}>
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  flex: 1,
                  background: active
                    ? "linear-gradient(180deg, var(--m-plate-top, #6a4e18) 0%, var(--m-plate-bottom, #523a10) 100%)"
                    : "transparent",
                  border: `1px solid ${active ? BRASS : BORDER_DARK}`,
                  borderRadius: 4,
                  padding: "6px 4px",
                  color: active ? "var(--m-brightest, #f0d080)" : BRASS_DIM,
                  fontFamily: MONO,
                  fontSize: 10, // five tabs now share the rail (Item 5)
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
          <div style={{ padding: "12px 12px 4px" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search albums…"
              autoFocus
              style={{
                width: "100%",
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

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px",
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
      </aside>
    </>
  );
}

// ─── Now-playing view (Item 5) ──────────────────────────────────────────────
// Full cover art + the facts we can actually get: track/artist/album from the
// player state, release year / track count / label from GET /albums/{id}.
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
        }}
      >
        On the platter
      </div>

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

      <div>
        <div
          style={{
            color: BRASS_LIGHT,
            fontFamily: "Georgia, serif",
            fontWeight: "bold",
            fontSize: 18,
            lineHeight: 1.25,
          }}
        >
          {track.name}
        </div>
        <div style={{ color: BRASS, fontSize: 13, marginTop: 4, fontFamily: MONO }}>{track.artist}</div>
        <div style={{ color: BRASS_DIM, fontSize: 12, marginTop: 8, fontFamily: MONO }}>
          {track.album}
          {detail?.releaseYear ? ` · ${detail.releaseYear}` : ""}
        </div>
      </div>

      {(facts.length > 0 || loadingFacts) && (
        <div
          style={{
            borderTop: `1px solid ${BORDER_DARK}`,
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
        <div style={{ fontSize: 12, color: BRASS_DIM, padding: "8px 0" }}>
          {activeTab === "search"
            ? query.trim()
              ? "No albums found."
              : "Type to search albums."
            : "Nothing here yet."}
        </div>
      )}

      {!tab.loading && tab.cards.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {tab.cards.map((card) => (
            <Card key={card.uri} card={card} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── A single browse card ───────────────────────────────────────────────────
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
        background: hover ? "rgba(196,154,60,0.12)" : "transparent",
        border: `1px solid ${hover ? BRASS : BORDER_DARK}`,
        borderRadius: 6,
        padding: 8,
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: MONO,
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
        {card.subtitle || " "}
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
function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => (
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
