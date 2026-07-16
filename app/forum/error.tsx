"use client";

import RouteError from "@/components/RouteError";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Forum Unreachable"
      description="We couldn't load the forum right now. Your posts and comments are safe — try again in a moment."
    />
  );
}
