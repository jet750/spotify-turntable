/// <reference types="vite/client" />
/// <reference types="spotify-web-playback-sdk" />

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID: string;
  readonly VITE_SPOTIFY_REDIRECT_URI: string;
  readonly VITE_STUDIO_PASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
