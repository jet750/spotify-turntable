import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS + port 5173 so the dev origin matches the redirect URI you registered
// in the Spotify dashboard: https://localhost:5173/callback
// (The Web Playback SDK also requires a secure context.)
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true,
    port: 5173,
    host: "localhost",
  },
});
