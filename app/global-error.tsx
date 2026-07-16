"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, background: "#050505", color: "#fff" }}>
        <main
          style={{
            minHeight: "100vh",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>
            System Fault Detected
          </h1>
          <p style={{ color: "#A1A1AA", maxWidth: 420, marginBottom: 32 }}>
            Something went badly enough wrong that the whole app couldn&apos;t render. This has been logged
            automatically.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#fff",
              color: "#050505",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: 13,
              padding: "16px 32px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </main>
      </body>
    </html>
  );
}
