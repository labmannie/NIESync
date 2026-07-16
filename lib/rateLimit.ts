import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for API routes.
 *
 * Production (recommended): set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * (from a free Upstash Redis database — https://upstash.com) and this uses
 * @upstash/ratelimit with a sliding window, which works correctly across Vercel's
 * serverless/edge instances.
 *
 * Local dev / no Upstash configured: falls back to an in-memory sliding window.
 * This is NOT safe for a multi-instance production deployment (each instance has
 * its own counters, so real limits are effectively multiplied by instance count) —
 * it exists purely so the app still works locally without extra setup. A console
 * warning is logged once so this isn't silently relied on in prod.
 */

type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms
};

type Limiter = {
  limit: (key: string) => Promise<RateLimitResult>;
};

const memoryStore = new Map<string, { count: number; resetAt: number }>();
let warnedAboutMemoryFallback = false;

function memoryLimiter(maxRequests: number, windowMs: number): Limiter {
  return {
    async limit(key: string) {
      if (!warnedAboutMemoryFallback) {
        warnedAboutMemoryFallback = true;
        console.warn(
          "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — using an in-memory rate limiter. " +
            "This does NOT work correctly across multiple serverless instances. Set up Upstash Redis for production."
        );
      }

      const now = Date.now();
      const existing = memoryStore.get(key);

      if (!existing || existing.resetAt <= now) {
        memoryStore.set(key, { count: 1, resetAt: now + windowMs });
        return { success: true, limit: maxRequests, remaining: maxRequests - 1, reset: now + windowMs };
      }

      existing.count += 1;
      const success = existing.count <= maxRequests;
      return {
        success,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - existing.count),
        reset: existing.resetAt,
      };
    },
  };
}

const upstashUrl = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
const upstashToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const upstashConfigured = Boolean(upstashUrl && upstashToken);

const limiterCache = new Map<string, Limiter>();

function getLimiter(name: string, maxRequests: number, windowSeconds: number): Limiter {
  const cacheKey = `${name}:${maxRequests}:${windowSeconds}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  if (!upstashConfigured) {
    const limiter = memoryLimiter(maxRequests, windowSeconds * 1000);
    limiterCache.set(cacheKey, limiter);
    return limiter;
  }

  // Lazy-initialized on first use rather than at module load, so a missing
  // UPSTASH_REDIS_REST_URL/TOKEN never breaks environments that don't need it
  // (the memory fallback above already returned before we get here).
  const redis = new Redis({ url: upstashUrl, token: upstashToken });
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
    analytics: false,
    prefix: `niesync:${name}`,
  });

  const limiter: Limiter = {
    async limit(key: string) {
      const result = await ratelimit.limit(key);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    },
  };

  limiterCache.set(cacheKey, limiter);
  return limiter;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown-ip";
}

export type RateLimitConfig = {
  /** Unique name for this limiter (used as part of the Redis key prefix). */
  name: string;
  /** Max requests allowed within the window. */
  requests: number;
  /** Window size in seconds. */
  windowSeconds: number;
  /** Optional extra identifier (e.g. authenticated user id) to key by, in addition to IP. */
  identifier?: string | null;
};

/**
 * Enforce a rate limit for the given request. Returns null if the request is
 * allowed, or a ready-to-return 429 NextResponse if it should be blocked.
 *
 * Usage in a route handler:
 *   const limited = await enforceRateLimit(request, { name: "claims", requests: 10, windowSeconds: 60 });
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const limiter = getLimiter(config.name, config.requests, config.windowSeconds);
  const ip = getClientIp(request);
  const key = config.identifier ? `${ip}:${config.identifier}` : ip;

  try {
    const result = await limiter.limit(key);

    if (!result.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many requests. Please slow down and try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
          },
        }
      );
    }

    return null;
  } catch (error) {
    // Deliberate trade-off: if the rate limiter's own infra fails (e.g. a Redis
    // outage), we log loudly but let the request through rather than taking the
    // whole app down. When the limiter *does* run successfully and the caller is
    // over the limit, we always fail closed with an explicit 429 above — this
    // catch only covers the limiter being unreachable, not the limit being hit.
    console.error(`[rateLimit] limiter "${config.name}" failed:`, error);
    return null;
  }
}
