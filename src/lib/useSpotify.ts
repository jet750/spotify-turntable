// useSpotify.ts
// Handles: OAuth PKCE flow, token management, Web Playback SDK init,
// currently-playing polling, and playback controls.
//
// SETUP:
// 1. Create a .env file in your project root with:
//    VITE_SPOTIFY_CLIENT_ID=your_client_id
//    VITE_SPOTIFY_REDIRECT_URI=https://localhost:5173/callback
// 2. Add the redirect URI to your Spotify app's Redirect URIs.
//
// SESSION LONGEVITY (refresh tokens):
// The PKCE flow returns a refresh_token alongside the ~1h access token. We now
// persist it and silently mint fresh access tokens — proactively ~60s before
// expiry, and reactively if any API call 401s — so a logged-in user stays signed
// in for weeks instead of getting bounced to Spotify's login + 2FA every hour.
//
// ⚠️ ONE-TIME MIGRATION: users who logged in under the OLD code have no stored
// refresh_token (it was discarded), so the first access token they're holding
// will still expire and drop them to CONNECT once. After they log in ONE more
// time post-deploy, a refresh_token is captured and every renewal thereafter is
// silent. SCOPES are unchanged, so that single login asks for no new consent.

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  // Spotify album id (for GET /albums/{id} detail lookups — Item 5). Null when
  // the source can't provide one (demo mode).
  albumId: string | null;
  albumArt: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
}

export interface PlayContextOpts {
  contextUri?: string; // album/playlist URI to play
  uris?: string[]; // explicit list of track URIs
  offsetUri?: string; // start the context at this track URI
}

export interface SpotifyState {
  isAuthenticated: boolean;
  isSDKReady: boolean;
  isConnected: boolean; // true when this tab is the active Spotify device
  track: SpotifyTrack | null;
  deviceId: string | null;
  accessToken: string | null;
  error: string | null;
  // Human-readable "why the deck isn't doing what you expect" line (session
  // expired, playback left this device, no active device...). Informational,
  // not an error: shown as a dismissible strip, auto-cleared when the
  // condition resolves (login / reconnect). See the failure-state notes below.
  notice: string | null;
  dismissNotice: () => void;
  dismissError: () => void;
  login: () => void;
  logout: () => void;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  transferPlayback: () => Promise<void>;
  playContext: (opts: PlayContextOpts) => Promise<void>;
  seek: (ms: number) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string;
// Where to land after a successful token exchange. The live turntable lives here.
const APP_ROUTE = "/live";

// Bump this string ANY TIME you change the SCOPES list below. A stored token is
// stamped with the version that minted it; on load, a token whose stamp doesn't
// match SCOPES_VERSION is discarded so the user falls back to CONNECT and
// re-consents — i.e. bumping this auto-prompts everyone to reconnect and pick up
// the new scopes. (Adding scopes never upgrades an already-issued token.)
const SCOPES_VERSION = "2";

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "streaming",
  "user-read-email",
  "user-read-private",
  // Library / browse scopes (added for the BrowsePanel):
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-top-read",
  "user-read-recently-played",
].join(" ");

const TOKEN_KEY = "spotify_access_token";
const REFRESH_KEY = "spotify_refresh_token";
const EXPIRY_KEY = "spotify_token_expiry";
const VERIFIER_KEY = "spotify_code_verifier";
const SCOPES_VERSION_KEY = "spotify_scopes_version";
const POLL_INTERVAL = 3000; // ms between currently-playing polls
const REFRESH_LEAD_MS = 60_000; // refresh this far ahead of expiry

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Token Storage ────────────────────────────────────────────────────────────

function saveToken(token: string, expiresIn: number) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
  // Stamp the token with the scope set it was minted under (see SCOPES_VERSION).
  localStorage.setItem(SCOPES_VERSION_KEY, SCOPES_VERSION);
}

function saveRefreshToken(refreshToken: string) {
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!token || !expiry) return null;
  // Scope-version gate: a token minted before the current scope set is missing
  // permissions we now need. Drop everything (incl. the refresh token, which is
  // also bound to the old scopes) and re-prompt with CONNECT, rather than
  // limping along — or silently refreshing — into endpoints that 403.
  if (localStorage.getItem(SCOPES_VERSION_KEY) !== SCOPES_VERSION) {
    clearToken();
    return null;
  }
  if (Date.now() > parseInt(expiry) - REFRESH_LEAD_MS) {
    // Expired or expiring within the lead window — clear just the access token.
    // The refresh token is intentionally left in place so the caller can mint a
    // new access token silently instead of forcing a re-login.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return token;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(SCOPES_VERSION_KEY);
}

// ─── Spotify API Helpers ──────────────────────────────────────────────────────

async function exchangeCodeForToken(code: string, verifier: string): Promise<string> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = await res.json();
  saveToken(data.access_token, data.expires_in);
  // Capture the refresh token so future renewals are silent. (Old builds dropped
  // this — see the ONE-TIME MIGRATION note at the top of the file.)
  if (data.refresh_token) saveRefreshToken(data.refresh_token);
  return data.access_token;
}

// Outcome of a refresh attempt:
//  - refreshed: got a new access token (already persisted)
//  - revoked:   terminal — no/invalid refresh token; all tokens cleared → CONNECT
//  - transient: network/5xx — tokens left intact, safe to retry later
type RefreshOutcome =
  | { status: "refreshed"; token: string }
  | { status: "revoked" }
  | { status: "transient" };

// Swap the stored refresh_token for a fresh access token. Public PKCE client, so
// NO client secret is sent. On success the new access token + expiry are saved
// (and a rotated refresh_token, if Spotify returns one — it MAY). Never throws;
// it reports terminal vs. transient failure so callers know whether to drop to
// CONNECT or just retry. Never loops on its own.
async function refreshAccessToken(): Promise<RefreshOutcome> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return { status: "revoked" };

  let res: Response;
  try {
    res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });
  } catch {
    // Network down — keep the refresh token and let a later attempt retry.
    return { status: "transient" };
  }

  if (res.status >= 400 && res.status < 500) {
    // 400 invalid_grant (user revoked access / refresh token expired) and other
    // 4xx are terminal: retrying won't help. Clear everything and fall back to
    // CONNECT so the user does a clean, single re-login.
    clearToken();
    return { status: "revoked" };
  }
  if (!res.ok) {
    // 5xx etc. — transient. Preserve tokens; try again later.
    return { status: "transient" };
  }

  const data = await res.json();
  saveToken(data.access_token, data.expires_in);
  // Spotify may rotate the refresh token; persist the new one if present,
  // otherwise the existing one stays valid.
  if (data.refresh_token) saveRefreshToken(data.refresh_token);
  return { status: "refreshed", token: data.access_token };
}

async function fetchCurrentlyPlaying(
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<SpotifyTrack | null> {
  const res = await apiFetch("https://api.spotify.com/v1/me/player?additional_types=track");
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Playback fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data?.item) return null;

  return {
    id: data.item.id,
    name: data.item.name,
    artist: data.item.artists.map((a: { name: string }) => a.name).join(", "),
    album: data.item.album.name,
    albumId: data.item.album.id ?? null,
    albumArt: data.item.album.images[0]?.url ?? "",
    durationMs: data.item.duration_ms,
    progressMs: data.progress_ms ?? 0,
    isPlaying: data.is_playing,
  };
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

export function useSpotify(): SpotifyState {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isSDKReady, setIsSDKReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const playerRef = useRef<Spotify.Player | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sdkInitedRef = useRef(false);
  // Always-current token, read by the SDK's getOAuthToken so a refreshed token
  // is picked up without re-initialising the player.
  const tokenRef = useRef<string | null>(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  // Lets scheduleRefresh invoke the latest performRefresh without a render-time
  // dependency cycle between the two (they reference each other).
  const performRefreshRef = useRef<() => Promise<string | null>>(async () => null);

  // ── Refresh machinery ───────────────────────────────────────────────────────
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Arm a proactive refresh to fire ~60s before the stored token expires. Reads
  // EXPIRY_KEY each time so it always targets the newest token.
  const scheduleRefresh = useCallback(() => {
    clearRefreshTimer();
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (!expiry) return;
    const delay = Math.max(0, parseInt(expiry) - Date.now() - REFRESH_LEAD_MS);
    refreshTimerRef.current = setTimeout(() => {
      void performRefreshRef.current();
    }, delay);
  }, [clearRefreshTimer]);

  // Refresh now and push the result into React state. Returns the new token, or
  // null on failure. On terminal failure (revoked / no refresh token) it drops to
  // CONNECT. On a transient failure it leaves auth state untouched — the current
  // token is still valid for a bit (proactive case) and the 401 backstop / next
  // poll will retry — so a blip never logs anyone out. Never loops.
  const performRefresh = useCallback(async (): Promise<string | null> => {
    // Whether an actual session existed going in — distinguishes "your session
    // expired" (worth telling the user) from "first visit, nothing to refresh".
    const hadSession = !!getStoredRefreshToken();
    const outcome = await refreshAccessToken();
    if (outcome.status === "refreshed") {
      setToken(outcome.token); // → schedule effect re-arms the next refresh
      return outcome.token;
    }
    if (outcome.status === "revoked") {
      clearRefreshTimer();
      setToken(null); // → CONNECT
      // A real session just died (refresh token revoked/expired) — say so
      // instead of silently resetting the deck to the CONNECT state.
      if (hadSession) setNotice("Session expired — press CONNECT to sign back in.");
    }
    return null;
  }, [clearRefreshTimer]);

  useEffect(() => {
    performRefreshRef.current = performRefresh;
  }, [performRefresh]);

  // Authenticated Spotify fetch with a single transparent refresh-and-retry on
  // 401. Belt-and-suspenders to the proactive timer: even if a call races an
  // expired token, it refreshes once and retries once rather than failing.
  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const withAuth = (t: string): RequestInit => ({
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${t}`,
        },
      });
      let res = await fetch(url, withAuth(token ?? ""));
      if (res.status === 401) {
        const fresh = await performRefresh();
        if (fresh) res = await fetch(url, withAuth(fresh));
      }
      return res;
    },
    [token, performRefresh]
  );

  // ── Login: PKCE flow ──────────────────────────────────────────────────────
  const login = useCallback(async () => {
    setNotice(null); // the user is acting on it — retire the prompt
    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem(VERIFIER_KEY, verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearRefreshTimer(); // cancel any pending silent refresh
    playerRef.current?.disconnect();
    sdkInitedRef.current = false; // allow the player to re-init on next login
    clearToken(); // removes access, refresh, expiry, verifier and scope stamp
    setToken(null);
    setDeviceId(null);
    setIsSDKReady(false);
    setIsConnected(false);
    setTrack(null);
    setNotice(null); // deliberate logout needs no explanation strip
  }, [clearRefreshTimer]);

  // ── Handle OAuth callback ─────────────────────────────────────────────────
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const verifier = localStorage.getItem(VERIFIER_KEY);

    if (code && verifier) {
      // Clean the code out of the URL, staying on the live route.
      window.history.replaceState({}, "", APP_ROUTE);
      exchangeCodeForToken(code, verifier)
        .then(setToken)
        .catch((e) => setError(e.message));
    }
  }, []);

  // ── Silent restore on load ────────────────────────────────────────────────
  // Returning visitor whose access token already expired (the ~hourly case) but
  // who still has a refresh_token: mint a fresh access token silently instead of
  // bouncing them to Spotify's login + 2FA. Skipped while an OAuth redirect
  // (?code=) is in flight (that path mints its own token) and when there's no
  // refresh token (→ CONNECT). Self-limiting: success flips token non-null and
  // this returns early; failure never re-arms here → no login loop.
  useEffect(() => {
    if (token) return;
    const handlingOAuthRedirect = new URL(window.location.href).searchParams.has("code");
    if (handlingOAuthRedirect) return;
    if (getStoredRefreshToken()) void performRefresh();
  }, [token, performRefresh]);

  // ── Keep a silent refresh armed ~60s before expiry ────────────────────────
  // Re-runs whenever the token rotates (a refresh swaps in a new string), so each
  // token gets its own renewal timer; torn down on logout (token→null) and
  // unmount. Proactive half; apiFetch's 401-retry is the reactive backstop.
  useEffect(() => {
    if (!token) return;
    scheduleRefresh();
    return clearRefreshTimer;
  }, [token, scheduleRefresh, clearRefreshTimer]);

  // ── Load & init the Web Playback SDK (once) ───────────────────────────────
  // Inits the player the first time we hold a token. Deliberately does NOT
  // re-init when the token rotates: getOAuthToken reads the live token from
  // tokenRef, so silent refreshes are picked up without tearing the player down.
  // (The old effect disconnected on every token change — now an hourly event.)
  useEffect(() => {
    if (!token || sdkInitedRef.current) return;
    sdkInitedRef.current = true;

    const initPlayer = () => {
      const player = new window.Spotify.Player({
        name: "Vinyl Turntable",
        getOAuthToken: (cb) => cb(tokenRef.current ?? ""),
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id);
        setIsSDKReady(true);
      });

      player.addListener("not_ready", () => {
        setIsSDKReady(false);
        setIsConnected(false);
      });

      player.addListener("player_state_changed", (state) => {
        if (!state) {
          setIsConnected(false);
          return;
        }
        setIsConnected(true);
        const t = state.track_window.current_track;
        // The SDK's album object has no `id`, only a uri ("spotify:album:<id>").
        const albumUri = t.album.uri ?? "";
        setTrack({
          id: t.id ?? "",
          name: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
          album: t.album.name,
          albumId: albumUri.startsWith("spotify:album:") ? albumUri.split(":")[2] : null,
          albumArt: t.album.images[0]?.url ?? "",
          durationMs: t.duration_ms,
          progressMs: state.position,
          isPlaying: !state.paused,
        });
      });

      player.addListener("initialization_error", ({ message }) => setError(message));
      player.addListener("authentication_error", ({ message }) => setError(message));
      player.addListener("account_error", ({ message }) => setError(message));

      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      if (!document.getElementById("spotify-sdk")) {
        const script = document.createElement("script");
        script.id = "spotify-sdk";
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, [token]);

  // Disconnect the player only on unmount (not on every token refresh), and reset
  // the init guard so a remount re-creates the player against the loaded SDK.
  useEffect(
    () => () => {
      playerRef.current?.disconnect();
      sdkInitedRef.current = false;
    },
    []
  );

  // ── Polling fallback (when not the active device) ─────────────────────────
  // When the SDK player_state_changed fires we get real-time updates.
  // When another device is playing, we fall back to polling the REST API.
  useEffect(() => {
    if (!token) return;

    const poll = async () => {
      try {
        const current = await fetchCurrentlyPlaying(apiFetch);
        // Only update from poll if SDK isn't the active device
        if (!isConnected) setTrack(current);
      } catch {
        // Transient playback-fetch error (network / 5xx / parse). We intentionally
        // do NOT clear the session here — token expiry is handled inside apiFetch
        // (401 → silent refresh, or → CONNECT only if the refresh token is
        // revoked). The old code logged users out on every poll error, which is
        // what bounced them to Spotify login every ~hour.
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, isConnected, apiFetch]);

  // ── Failure-state notices (backlog item 4) ────────────────────────────────
  // If this deck WAS the active device and stopped being it (playback moved to
  // another device, or the SDK connection dropped), explain it — the deck
  // otherwise just goes quiet, which reads as "stuck". Cleared automatically
  // when the deck becomes the active device again.
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
      // The condition any device-related notice described has resolved.
      setNotice((n) => (n && n.includes("THIS DEVICE") ? null : n));
      return;
    }
    if (wasConnectedRef.current && token) {
      wasConnectedRef.current = false;
      setNotice("Playback left this deck — press ▶ THIS DEVICE to bring it back.");
    }
  }, [isConnected, token]);

  // REST transport fallback with device recovery: Spotify answers 404 when no
  // device is active. Instead of a dead button, hand playback to the turntable
  // (silently, play:false — the retried command decides whether sound starts)
  // and retry once; only if that still fails does the deck say so.
  const restTransport = useCallback(
    async (url: string, init: RequestInit): Promise<Response> => {
      let res = await apiFetch(url, init);
      if (res.status === 404 && deviceId) {
        await apiFetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_ids: [deviceId], play: false }),
        });
        res = await apiFetch(url, init);
      }
      if (res.status === 404) {
        setNotice("No active Spotify device — press ▶ THIS DEVICE to play here.");
      }
      return res;
    },
    [apiFetch, deviceId]
  );

  // ── Playback Controls ─────────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (playerRef.current && isConnected) {
      await playerRef.current.togglePlay();
    } else if (token) {
      // Fallback to REST API if SDK not active device
      const endpoint = track?.isPlaying
        ? "https://api.spotify.com/v1/me/player/pause"
        : "https://api.spotify.com/v1/me/player/play";
      await restTransport(endpoint, { method: "PUT" });
    }
  }, [isConnected, token, track, restTransport]);

  const nextTrack = useCallback(async () => {
    if (playerRef.current && isConnected) {
      await playerRef.current.nextTrack();
    } else if (token) {
      await restTransport("https://api.spotify.com/v1/me/player/next", { method: "POST" });
    }
  }, [isConnected, token, restTransport]);

  const prevTrack = useCallback(async () => {
    if (playerRef.current && isConnected) {
      await playerRef.current.previousTrack();
    } else if (token) {
      await restTransport("https://api.spotify.com/v1/me/player/previous", { method: "POST" });
    }
  }, [isConnected, token, restTransport]);

  // ── Transfer playback to this device ─────────────────────────────────────
  const transferPlayback = useCallback(async () => {
    if (!token) return;
    if (!deviceId) {
      // SDK hasn't announced a device yet (still initialising, or it failed).
      // Say so rather than being a button that does nothing.
      setNotice("The turntable device isn't ready yet — give it a second and try again.");
      return;
    }
    const res = await apiFetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play: true }),
    });
    if (!res.ok && res.status !== 202 && res.status !== 204) {
      setNotice(`Couldn't move playback here (${res.status}) — try again in a moment.`);
    }
  }, [token, deviceId, apiFetch]);

  // ── Play a specific album / playlist / track set ──────────────────────────
  // Targets the SDK device so playback starts ON the turntable. If Spotify
  // reports no active device (404), we transfer playback to this device once
  // and retry.
  const playContext = useCallback(
    async (opts: PlayContextOpts) => {
      if (!token) return;

      const body: Record<string, unknown> = {};
      if (opts.contextUri) {
        body.context_uri = opts.contextUri;
        if (opts.offsetUri) body.offset = { uri: opts.offsetUri };
      } else if (opts.uris) {
        body.uris = opts.uris;
      } else {
        return; // nothing to play
      }

      const sendPlay = () =>
        apiFetch(
          `https://api.spotify.com/v1/me/player/play${deviceId ? `?device_id=${deviceId}` : ""}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

      let res = await sendPlay();
      if (res.status === 404) {
        // No active device — hand playback to the turntable, then retry once.
        await transferPlayback();
        res = await sendPlay();
      }
      if (!res.ok && res.status !== 202 && res.status !== 204) {
        setError(`Couldn't start playback (${res.status})`);
      }
    },
    [token, deviceId, transferPlayback, apiFetch]
  );

  // ── Seek to a position (ms) ───────────────────────────────────────────────
  const seek = useCallback(
    async (ms: number) => {
      const position = Math.max(0, Math.round(ms));
      if (playerRef.current && isConnected) {
        await playerRef.current.seek(position);
      } else if (token) {
        await apiFetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${position}`, {
          method: "PUT",
        });
      }
    },
    [isConnected, token, apiFetch]
  );

  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissError = useCallback(() => setError(null), []);

  return {
    isAuthenticated: !!token,
    isSDKReady,
    isConnected,
    track,
    deviceId,
    accessToken: token,
    error,
    notice,
    dismissNotice,
    dismissError,
    login,
    logout,
    togglePlay,
    nextTrack,
    prevTrack,
    transferPlayback,
    playContext,
    seek,
  };
}

// ─── Global type augmentation for Spotify SDK ────────────────────────────────
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: typeof Spotify;
  }
}
