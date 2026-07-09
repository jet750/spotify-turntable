import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS + host/port pinned so the dev origin matches the redirect URI
// registered in the Spotify dashboard: https://127.0.0.1:5173/callback
// The Web Playback SDK requires a secure context to initialize — plain
// http://127.0.0.1 is NOT enough (that's why "This Device" was failing) —
// so basicSsl provides a local self-signed cert for dev.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true,
    host: "127.0.0.1",
    port: 5173,
  },
});
