// App.tsx — minimal path-based routing (no router dependency needed).
//   /          -> public demo (local audio)
//   /live      -> private live turntable (Spotify, passphrase-gated)
//   /callback  -> Spotify OAuth redirect handler

import CallbackPage from "./pages/CallbackPage";
import Home from "./pages/Home";
import Live from "./pages/Live";

export default function App() {
  const path = window.location.pathname;
  if (path === "/callback") return <CallbackPage />;
  if (path === "/live") return <Live />;
  return <Home />;
}
