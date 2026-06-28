// demoMeta.ts
// Playlist for the public demo. The demo plays LOCAL audio files (no Spotify,
// no auth), shuffled, auto-advancing — so staying on the page feels like a live
// set rather than one song on repeat.
//
// LEGAL: this page is PUBLIC, so every track must be audio you have the right to
// distribute publicly. Owning a CD does NOT grant that. Use Creative Commons or
// public-domain recordings (+ matching art). See /public/demo/README.md.
//
// HOW TO ADD/REMOVE SONGS: just edit this array. 4-6 entries at 128-160 kbps is
// the sweet spot (see the load-time notes). Files go in /public/demo/.
// Tracks are loaded lazily (current track loads on play, others on demand), so
// the count barely affects first-paint cost.

export interface DemoTrackMeta {
  src: string;
  cover: string;
  name: string;
  artist: string;
  album: string;
  // Required by most CC licenses (e.g. CC BY). Keep accurate; shown as a caption.
  attribution: string;
}

export const DEMO_TRACKS: DemoTrackMeta[] = [
  {
    src: "/demo/track1.mp3",
    cover: "/demo/cover1.jpg",
    name: "Track One",
    artist: "Artist",
    album: "Source",
    attribution: "\u201cTrack One\u201d by Artist \u2014 CC BY 4.0 \u00b7 source.example",
  },
  {
    src: "/demo/track2.mp3",
    cover: "/demo/cover2.jpg",
    name: "Track Two",
    artist: "Artist",
    album: "Source",
    attribution: "\u201cTrack Two\u201d by Artist \u2014 CC BY 4.0 \u00b7 source.example",
  },
  {
    src: "/demo/track3.mp3",
    cover: "/demo/cover3.jpg",
    name: "Track Three",
    artist: "Artist",
    album: "Source",
    attribution: "\u201cTrack Three\u201d by Artist \u2014 CC BY 4.0 \u00b7 source.example",
  },
  {
    src: "/demo/track4.mp3",
    cover: "/demo/cover4.jpg",
    name: "Track Four",
    artist: "Artist",
    album: "Source",
    attribution: "\u201cTrack Four\u201d by Artist \u2014 CC BY 4.0 \u00b7 source.example",
  },
];
