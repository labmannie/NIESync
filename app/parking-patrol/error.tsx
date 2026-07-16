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
      title="Parking Patrol Offline"
      description="We couldn't load parking reports right now. Your data is safe — try again in a moment."
    />
  );
}
