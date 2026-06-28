// useSpotifyLibrary.ts
// Lazy fetchers for the BrowsePanel: playlists, saved albums, recently played,
// and album search. Each tab caches its results and exposes its own
// loading/error state. Results are normalized into a single card shape so the
// UI can render every tab with the same component.
//
// API NOTE: Spotify's dev-mode catalog was cut down in late 2024 and again in
// Feb 2026 — Recommendations, Related Artists, Featured/Editorial Playlists,
// New Releases and audio-features are gone. Only the endpoints used below are
// confirmed available, and /search now caps `limit` at 10.

import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = "https://api.spotify.com/v1";

// ─── Card shape (shared by every tab) ──────────────────────────────────────
export type CardKind = "album" | "playlist" | "track";

export interface BrowseCard {
  uri: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  kind: CardKind;
}

// ─── Per-tab state ──────────────────────────────────────────────────────────
export interface TabState {
  cards: BrowseCard[];
  loading: boolean;
  error: string | null;
  loaded: boolean; // has this tab been fetched at least once?
}

const EMPTY_TAB: TabState = { cards: [], loading: false, error: null, loaded: false };

export interface SpotifyLibrary {
  expired: boolean; // token rejected (401) — user should reconnect
  playlists: TabState;
  collection: TabState;
  recent: TabState;
  searchResults: TabState;
  loadPlaylists: () => void;
  loadCollection: () => void;
  loadRecent: () => void;
  search: (q: string) => void;
}

// ─── Raw API response shapes (only the fields we read) ──────────────────────
interface SpImage {
  url: string;
}
interface SpArtist {
  name: string;
}
interface SpPlaylist {
  id: string;
  name: string;
  uri: string;
  images: SpImage[] | null;
  tracks: { total: number } | null;
  owner: { display_name?: string } | null;
}
interface SpAlbum {
  id: string;
  name: string;
  uri: string;
  images: SpImage[] | null;
  artists: SpArtist[];
  total_tracks: number;
}
interface SpTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: SpArtist[];
  album: { name: string; uri: string; images: SpImage[] | null };
}

interface PlaylistsResponse {
  items: SpPlaylist[];
}
interface SavedAlbumsResponse {
  items: { album: SpAlbum }[];
}
interface RecentlyPlayedResponse {
  items: { track: SpTrack }[];
}
interface SearchResponse {
  albums?: { items: SpAlbum[] };
}

// ─── Normalizers ────────────────────────────────────────────────────────────
function joinArtists(artists: SpArtist[] | undefined): string {
  return (artists ?? []).map((a) => a.name).join(", ");
}

function normalizePlaylist(p: SpPlaylist): BrowseCard {
  const owner = p.owner?.display_name;
  const total = p.tracks?.total ?? 0;
  const subtitle = [owner, `${total} track${total === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");
  return {
    uri: p.uri,
    title: p.name,
    subtitle,
    imageUrl: p.images?.[0]?.url ?? null,
    kind: "playlist",
  };
}

function normalizeAlbum(a: SpAlbum): BrowseCard {
  return {
    uri: a.uri,
    title: a.name,
    subtitle: joinArtists(a.artists),
    imageUrl: a.images?.[0]?.url ?? null,
    kind: "album",
  };
}

function normalizeTrack(t: SpTrack): BrowseCard {
  return {
    uri: t.uri,
    title: t.name,
    subtitle: joinArtists(t.artists),
    imageUrl: t.album?.images?.[0]?.url ?? null,
    kind: "track",
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────
export function useSpotifyLibrary(token: string | null): SpotifyLibrary {
  const [expired, setExpired] = useState(false);
  const [playlists, setPlaylists] = useState<TabState>(EMPTY_TAB);
  const [collection, setCollection] = useState<TabState>(EMPTY_TAB);
  const [recent, setRecent] = useState<TabState>(EMPTY_TAB);
  const [searchResults, setSearchResults] = useState<TabState>(EMPTY_TAB);

  // Guards so lazy tabs fetch exactly once per token (survives re-renders /
  // React strict-mode double-invocation). Reset when the token changes.
  const playlistsStarted = useRef(false);
  const collectionStarted = useRef(false);
  const recentStarted = useRef(false);
  const searchSeq = useRef(0);

  // ── Shared GET helper ──────────────────────────────────────────────────
  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      if (!token) throw new Error("Not connected");
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setExpired(true);
        throw new Error("Session expired — reconnect");
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as T;
    },
    [token]
  );

  // ── Reset all caches when the token changes (login / logout / reconnect) ──
  useEffect(() => {
    playlistsStarted.current = false;
    collectionStarted.current = false;
    recentStarted.current = false;
    searchSeq.current++;
    setExpired(false);
    setPlaylists(EMPTY_TAB);
    setCollection(EMPTY_TAB);
    setRecent(EMPTY_TAB);
    setSearchResults(EMPTY_TAB);
  }, [token]);

  // ── Playlists ──────────────────────────────────────────────────────────
  const loadPlaylists = useCallback(() => {
    if (playlistsStarted.current) return;
    playlistsStarted.current = true;
    setPlaylists((s) => ({ ...s, loading: true, error: null }));
    get<PlaylistsResponse>("/me/playlists?limit=50")
      .then((data) => {
        const cards = (data.items ?? []).map(normalizePlaylist);
        setPlaylists({ cards, loading: false, error: null, loaded: true });
      })
      .catch((e) => {
        playlistsStarted.current = false; // allow a retry
        setPlaylists((s) => ({ ...s, loading: false, error: e.message }));
      });
  }, [get]);

  // ── Saved albums (Collection) ──────────────────────────────────────────
  const loadCollection = useCallback(() => {
    if (collectionStarted.current) return;
    collectionStarted.current = true;
    setCollection((s) => ({ ...s, loading: true, error: null }));
    get<SavedAlbumsResponse>("/me/albums?limit=50")
      .then((data) => {
        const cards = (data.items ?? []).map((i) => normalizeAlbum(i.album));
        setCollection({ cards, loading: false, error: null, loaded: true });
      })
      .catch((e) => {
        collectionStarted.current = false;
        setCollection((s) => ({ ...s, loading: false, error: e.message }));
      });
  }, [get]);

  // ── Recently played (deduped by track id) ──────────────────────────────
  const loadRecent = useCallback(() => {
    if (recentStarted.current) return;
    recentStarted.current = true;
    setRecent((s) => ({ ...s, loading: true, error: null }));
    get<RecentlyPlayedResponse>("/me/player/recently-played?limit=50")
      .then((data) => {
        const seen = new Set<string>();
        const cards: BrowseCard[] = [];
        for (const item of data.items ?? []) {
          const t = item.track;
          if (!t || seen.has(t.id)) continue; // recently-played returns repeats
          seen.add(t.id);
          cards.push(normalizeTrack(t));
        }
        setRecent({ cards, loading: false, error: null, loaded: true });
      })
      .catch((e) => {
        recentStarted.current = false;
        setRecent((s) => ({ ...s, loading: false, error: e.message }));
      });
  }, [get]);

  // ── Album search (debounced by the caller) ─────────────────────────────
  const search = useCallback(
    (q: string) => {
      const query = q.trim();
      if (!query) {
        searchSeq.current++; // cancel any in-flight request
        setSearchResults(EMPTY_TAB);
        return;
      }
      const seq = ++searchSeq.current;
      setSearchResults((s) => ({ ...s, loading: true, error: null }));
      get<SearchResponse>(`/search?q=${encodeURIComponent(query)}&type=album&limit=10`)
        .then((data) => {
          if (seq !== searchSeq.current) return; // a newer query superseded this
          const cards = (data.albums?.items ?? []).map(normalizeAlbum);
          setSearchResults({ cards, loading: false, error: null, loaded: true });
        })
        .catch((e) => {
          if (seq !== searchSeq.current) return;
          setSearchResults((s) => ({ ...s, loading: false, error: e.message }));
        });
    },
    [get]
  );

  return {
    expired,
    playlists,
    collection,
    recent,
    searchResults,
    loadPlaylists,
    loadCollection,
    loadRecent,
    search,
  };
}
