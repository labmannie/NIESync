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
      title="Profile Unreachable"
      description="We couldn't load your profile right now. Try again in a moment."
    />
  );
}
