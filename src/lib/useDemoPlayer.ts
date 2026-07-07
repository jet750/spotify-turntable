// useDemoPlayer.ts
// Shuffled, auto-advancing playlist player driving the turntable visual from a
// single <audio> element. Lazy loading: preload="none" means nothing is fetched
// until the user hits play; each subsequent track loads when reached. The next
// cover image is prefetched so label crossfades are instant.
//
// Exposes the same SpotifyTrack shape so TurntableVisual renders it identically.

import { useEffect, useRef, useState, useCallback } from "react";
import type { SpotifyTrack } from "./useSpotify";
import { DEMO_TRACKS, DemoTrackMeta } from "./demoMeta";

export interface DemoPlayer {
  track: SpotifyTrack;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (ms: number) => void;
  play: () => void;
  pause: () => void;
  // True playback-rate change (45 RPM Easter egg, Item 6). Pitch shifts with
  // speed — preservesPitch is disabled — exactly like real vinyl.
  setRate: (rate: number) => void;
}

function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FALLBACK: DemoTrackMeta = {
  src: "",
  cover: "",
  name: "No demo tracks",
  artist: "Add files to /public/demo",
  album: "",
  attribution: "",
};

export function useDemoPlayer(): DemoPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orderRef = useRef<number[]>([]);
  const pendingPlayRef = useRef(false);
  const endedRef = useRef<() => void>(() => {});

  const [pos, setPos] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // One-time shuffle of indices into DEMO_TRACKS.
  if (orderRef.current.length === 0 && DEMO_TRACKS.length > 0) {
    orderRef.current = shuffle(DEMO_TRACKS.length);
  }

  const metaIndex = orderRef.current[pos] ?? 0;
  const meta = DEMO_TRACKS[metaIndex] ?? FALLBACK;

  const go = useCallback((dir: number, autoplay: boolean) => {
    const len = orderRef.current.length;
    if (len === 0) return;
    pendingPlayRef.current = autoplay;
    setPos((p) => (p + dir + len) % len);
  }, []);

  const next = useCallback(() => go(1, true), [go]);
  const prev = useCallback(() => go(-1, true), [go]);

  // Keep the latest auto-advance handler reachable from the once-bound listener.
  endedRef.current = () => go(1, true);

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none"; // lazy — fetch only when played
    audioRef.current = audio;

    const onMeta = () => setDurationMs((audio.duration || 0) * 1000);
    const onTime = () => setProgressMs(audio.currentTime * 1000);
    const onEnded = () => endedRef.current();

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // Load the current track when it changes; autoplay if we arrived via next/prev/ended.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !meta.src) return;
    audio.src = meta.src;
    audio.load();
    setProgressMs(0);

    if (pendingPlayRef.current) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      pendingPlayRef.current = false;
    }

    // Prefetch the next cover so the label crossfade is instant.
    const order = orderRef.current;
    if (order.length > 1) {
      const nextMeta = DEMO_TRACKS[order[(pos + 1) % order.length]];
      if (nextMeta?.cover) {
        const img = new Image();
        img.src = nextMeta.cover;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaIndex]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !meta.src) return;
    if (!audio.src) audio.src = meta.src;
    if (audio.paused) {
      // Requires a user gesture — this runs from the play click.
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [meta.src]);

  const track: SpotifyTrack = {
    id: `demo-${metaIndex}`, // changes per song -> triggers the label crossfade
    name: meta.name,
    artist: meta.artist,
    album: meta.album,
    albumId: null, // demo tracks have no Spotify album to look up
    albumArt: meta.cover,
    durationMs,
    progressMs,
    isPlaying,
  };

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio || !meta.src) return;
    const dur = (audio.duration || 0) * 1000;
    const clamped = Math.max(0, Math.min(ms, dur || ms));
    audio.currentTime = clamped / 1000;
    setProgressMs(clamped);
  }, [meta.src]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !meta.src) return;
    if (!audio.src) audio.src = meta.src;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [meta.src]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  // 45 RPM Easter egg (Item 6): a real HTMLMediaElement rate change, with pitch
  // following speed (vinyl physics, not a time-stretch). defaultPlaybackRate is
  // set too so the rate survives the load() of the next track.
  const setRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    try {
      (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    } catch {
      /* older engines: pitch-corrected rate change is still better than nothing */
    }
  }, []);

  return { track, toggle, next, prev, seek, play, pause, setRate };
}
