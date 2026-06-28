// CallbackPage.tsx — handles the Spotify OAuth redirect (route "/callback").
// It hands the code back to the live route, where useSpotify exchanges it.

import { useEffect, useState } from "react";

export default function CallbackPage() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Connecting to Spotify...");

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(`Spotify auth denied: ${error}`);
      setTimeout(() => (window.location.href = "/live"), 2500);
      return;
    }

    if (code) {
      // useSpotify (mounted on /live) performs the token exchange. We just carry
      // the code over to that route.
      setStatus("success");
      setMessage("Connected — loading your turntable...");
      setTimeout(() => (window.location.href = `/live?code=${code}`), 800);
      return;
    }

    window.location.href = "/live";
  }, []);

  const colors = {
    processing: "#c49a3c",
    success: "#4caf70",
    error: "#e84030",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #3e2808 0%, #1e1008 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Courier New', monospace",
        gap: 20,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "radial-gradient(circle, #1e1e1e 0%, #0d0d0d 100%)",
          border: `3px solid ${colors[status]}`,
          boxShadow: `0 0 20px ${colors[status]}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: status === "processing" ? "spin 2s linear infinite" : "none",
        }}
      >
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: colors[status] }} />
      </div>

      <div style={{ color: colors[status], fontSize: "0.8em", letterSpacing: "0.2em", textTransform: "uppercase" }}>
        {message}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
