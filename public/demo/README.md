# Demo assets go here

The demo is a shuffled playlist. For each entry in `src/lib/demoMeta.ts`, drop a
matching pair into this folder:

```
track1.mp3   cover1.jpg
track2.mp3   cover2.jpg
track3.mp3   cover3.jpg
track4.mp3   cover4.jpg
```

Add or remove songs by editing the `DEMO_TRACKS` array in `src/lib/demoMeta.ts`
(filenames there must match what you put here). 4-6 tracks at 128-160 kbps is the
sweet spot — tracks load lazily, so the count barely affects first-paint cost.
Keep covers small (~400px WebP/JPG).

## This page is PUBLIC — use audio you can legally distribute

Owning a CD lets you listen privately. It does NOT let you put a track (or its
cover art) on a public website. So CD rips are out. Use instead:

- Creative Commons audio — Free Music Archive, ccMixter, Pixabay Music. Most CC
  licenses (e.g. CC BY) require visible attribution; keep each `attribution` line
  in demoMeta.ts accurate (title, creator, license, source).
- Public-domain recordings — a public-domain *composition* is not the same as a
  public-domain *recording* (the master has its own copyright). Under the U.S.
  Music Modernization Act, recordings first published before 1923 entered the
  public domain in 2022 — pre-1923 jazz/ragtime is safe and on-theme.
- Your own recordings, or anything you've explicitly licensed.

(Not legal advice — but the ownership-vs-distribution distinction is settled.)
