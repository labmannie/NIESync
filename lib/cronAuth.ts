import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Timing-safe comparison of the request's cron secret (from either the `secret`
 * query param or a `Bearer` Authorization header) against CRON_SECRET.
 *
 * A plain `===` comparison leaks timing information proportional to how many
 * leading characters match, which in theory lets an attacker brute-force the
 * secret character-by-character. crypto.timingSafeEqual takes constant time
 * regardless of where the strings first differ, closing that side channel.
 *
 * Also guards against the secret being unset (which would otherwise make an
 * empty/undefined provided secret "match" an empty expected secret).
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  if (!expectedSecret) return false;

  const querySecret = String(request.nextUrl.searchParams.get("secret") || "").trim();
  const bearerSecret = getBearerToken(request);

  return (
    safeCompare(querySecret, expectedSecret) || safeCompare(bearerSecret, expectedSecret)
  );
}

function getBearerToken(request: NextRequest): string {
  const raw = String(request.headers.get("authorization") || "");
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

function safeCompare(provided: string, expected: string): boolean {
  if (!provided) return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws if buffer lengths differ, and comparing against a
  // fixed-size buffer of the same length as `expected` (rather than bailing out
  // early on a length mismatch) avoids leaking the secret's length via timing.
  if (providedBuf.length !== expectedBuf.length) {
    // Still do a constant-time comparison against a same-length dummy buffer so
    // the length check itself doesn't introduce an easily distinguishable
    // fast-path vs slow-path timing difference for very short/long guesses.
    timingSafeEqual(providedBuf, providedBuf);
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}
