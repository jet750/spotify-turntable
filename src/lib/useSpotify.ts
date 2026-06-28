// useSpotify.ts
// Handles: OAuth PKCE flow, token management, Web Playback SDK init,
// currently-playing polling, and playback controls.
//
// SETUP:
// 1. Create a .env file in your project root with:
//    VITE_SPOTIFY_CLIENT_ID=your_client_id
//    VITE_SPOTIFY_REDIRECT_URI=https://localhost:5173/callback
// 2. Add the redirect URI to your Spotify app's Redirect URIs.

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
}

export interface SpotifyState {
  isAuthenticated: boolean;
  isSDKReady: boolean;
  isConnected: boolean; // true when this tab is the active Spotify device
  track: SpotifyTrack | null;
  deviceId: string | null;
  error: string | null;
  login: () => void;
  logout: () => void;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  transferPlayback: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string;
// Where to land after a successful token exchange. The live turntable lives here.
const APP_ROUTE = "/live";
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "streaming",
  "user-read-email",
  "user-read-private",
].join(" ");

const TOKEN_KEY = "spotify_access_token";
const EXPIRY_KEY = "spotify_token_expiry";
const VERIFIER_KEY = "spotify_code_verifier";
const POLL_INTERVAL = 3000; // ms between currently-playing polls

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
}

function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry) - 60_000) {
    // Expired or expiring within 60s — clear it
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return token;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(VERIFIER_KEY);
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
  return data.access_token;
}

async function fetchCurrentlyPlaying(token: string): Promise<SpotifyTrack | null> {
  const res = await fetch("https://api.spotify.com/v1/me/player?additional_types=track", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Playback fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data?.item) return null;

  return {
    id: data.item.id,
    name: data.item.name,
    artist: data.item.artists.map((a: { name: string }) => a.name).join(", "),
    album: data.item.album.name,
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
  const playerRef = useRef<Spotify.Player | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Login: PKCE flow ──────────────────────────────────────────────────────
  const login = useCallback(async () => {
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
    playerRef.current?.disconnect();
    clearToken();
    setToken(null);
    setDeviceId(null);
    setIsSDKReady(false);
    setIsConnected(false);
    setTrack(null);
  }, []);

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

  // ── Load Spotify Web Playback SDK ─────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    if (document.getElementById("spotify-sdk")) return; // already loaded

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Vinyl Turntable",
        getOAuthToken: (cb) => cb(token),
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
        setTrack({
          id: t.id ?? "",
          name: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
          album: t.album.name,
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

    const script = document.createElement("script");
    script.id = "spotify-sdk";
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      playerRef.current?.disconnect();
    };
  }, [token]);

  // ── Polling fallback (when not the active device) ─────────────────────────
  // When the SDK player_state_changed fires we get real-time updates.
  // When another device is playing, we fall back to polling the REST API.
  useEffect(() => {
    if (!token) return;

    const poll = async () => {
      try {
        const current = await fetchCurrentlyPlaying(token);
        // Only update from poll if SDK isn't the active device
        if (!isConnected) setTrack(current);
      } catch {
        // Token likely expired — clear and force re-login
        clearToken();
        setToken(null);
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, isConnected]);

  // ── Playback Controls ─────────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (playerRef.current && isConnected) {
      await playerRef.current.togglePlay();
    } else if (token) {
      // Fallback to REST API if SDK not active device
      const endpoint = track?.isPlaying
        ? "https://api.spotify.com/v1/me/player/pause"
        : "https://api.spotify.com/v1/me/player/play";
      await fetch(endpoint, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }, [playerRef, isConnected, token, track]);

  const nextTrack = useCallback(async () => {
    if (playerRef.current && isConnected) {
      await playerRef.current.nextTrack();
    } else if (token) {
      await fetch("https://api.spotify.com/v1/me/player/next", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }, [playerRef, isConnected, token]);

  const prevTrack = useCallback(async () => {
    if (playerRef.current && isConnected) {
      await playerRef.current.previousTrack();
    } else if (token) {
      await fetch("https://api.spotify.com/v1/me/player/previous", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }, [playerRef, isConnected, token]);

  // ── Transfer playback to this device ─────────────────────────────────────
  const transferPlayback = useCallback(async () => {
    if (!token || !deviceId) return;
    await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device_ids: [deviceId], play: true }),
    });
  }, [token, deviceId]);

  // ── Seek to a position (ms) ───────────────────────────────────────────────
  const seek = useCallback(async (ms: number) => {
    const position = Math.max(0, Math.round(ms));
    if (playerRef.current && isConnected) {
      await playerRef.current.seek(position);
    } else if (token) {
      await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${position}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }, [isConnected, token]);

  return {
    isAuthenticated: !!token,
    isSDKReady,
    isConnected,
    track,
    deviceId,
    error,
    login,
    logout,
    togglePlay,
    nextTrack,
    prevTrack,
    transferPlayback,
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
