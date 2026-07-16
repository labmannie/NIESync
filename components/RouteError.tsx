"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";

export default function RouteError({
  error,
  reset,
  title = "System Fault Detected",
  description = "Something went wrong while loading this page. This has been logged automatically.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    // Sentry (if configured, see instrumentation.ts / sentry.*.config.ts) picks
    // up unhandled errors automatically, but error.tsx boundaries intercept the
    // error before it reaches the console by default, so we log it explicitly.
    console.error(`[route-error]${error?.digest ? ` digest=${error.digest}` : ""}`, error);
  }, [error]);

  return (
    <main className="min-h-screen w-full bg-campus-black text-white flex flex-col items-center justify-center relative overflow-hidden px-6 selection:bg-accent-blue/30">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg flex flex-col items-center text-center glass-card rounded-sm p-10 border border-white/10">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-wide mb-3">{title}</h1>
        <p className="text-text-secondary text-sm md:text-base mb-8 max-w-sm">{description}</p>

        {process.env.NODE_ENV !== "production" && error?.message && (
          <pre className="mb-8 w-full overflow-x-auto rounded-sm border border-white/10 bg-black/40 px-4 py-3 text-left text-xs text-red-300">
            {error.message}
          </pre>
        )}

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={() => reset()}
            className="bg-white text-campus-black font-bold uppercase tracking-widest text-sm px-8 py-4 clip-diagonal hover:bg-gray-200 transition-colors duration-200 flex items-center justify-center gap-3"
          >
            <RefreshCcw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
          <Link href="/" className="w-full sm:w-auto">
            <button className="w-full border border-white/20 text-white font-bold uppercase tracking-widest text-sm px-8 py-4 hover:bg-white/5 transition-colors duration-200 flex items-center justify-center gap-3">
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
          </Link>
        </div>
      </div>
    </main>
  );
}
