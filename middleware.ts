import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseFetch, getPublicSupabaseConfig } from "@/utils/supabase/config";

const TRANSIENT_AUTH_ERROR_REGEX =
  /timed out|timeout|network|fetch|abort|econnreset|enotfound|temporar|gateway|503|504/i;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function isPublicRoute(pathname: string) {
  if (pathname === "/") return true;
  const publicPrefixes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/about",
    "/contact",
    "/founders",
    "/faq",
    "/terms-of-service",
    "/privacy-policy",
    "/auth",
    "/resolve",
    "/_next",
    "/favicon",
  ];

  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function copySupabaseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value);
  });
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) =>
    /^sb-.*(?:auth-token|access-token|refresh-token)/i.test(cookie.name)
  );
}

function getErrorMessage(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "message" in value) {
    return String((value as { message?: unknown }).message || "");
  }
  return String(value);
}

function isExpectedMissingSessionError(message: string) {
  return /auth session missing/i.test(String(message || ""));
}

function isTransientAuthError(message: string) {
  return TRANSIENT_AUTH_ERROR_REGEX.test(String(message || ""));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPrefetch =
    request.headers.get("x-middleware-prefetch") === "1" ||
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";

  if (isPrefetch || pathname.startsWith("/api") || isPublicRoute(pathname)) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  const { url, anonKey } = getPublicSupabaseConfig("middleware");
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    global: {
      fetch: createSupabaseFetch(),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user: any = null;
  let authLookupErrorMessage = "";
  let authLookupHadTransientFailure = false;

  try {
    const { data, error } = await withTimeout(supabase.auth.getUser(), 4200, "auth.getUser");
    const errorMessage = getErrorMessage(error);
    if (error) {
      authLookupErrorMessage = errorMessage;
      if (!isExpectedMissingSessionError(errorMessage) && !isTransientAuthError(errorMessage)) {
        console.error("auth.getUser failed:", errorMessage);
      } else if (isTransientAuthError(errorMessage)) {
        authLookupHadTransientFailure = true;
      }
    }
    user = data?.user ?? null;
  } catch (error: unknown) {
    authLookupErrorMessage = getErrorMessage(error);
    if (isTransientAuthError(authLookupErrorMessage)) {
      authLookupHadTransientFailure = true;
    } else {
      console.error("auth.getUser crashed:", error);
    }
  }

  if (!user) {
    try {
      const { data, error } = await withTimeout(supabase.auth.getSession(), 3000, "auth.getSession");
      const errorMessage = getErrorMessage(error);
      if (errorMessage && !authLookupErrorMessage) {
        authLookupErrorMessage = errorMessage;
      }
      if (errorMessage && isTransientAuthError(errorMessage)) {
        authLookupHadTransientFailure = true;
      }
      user = data?.session?.user ?? null;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message && !authLookupErrorMessage) {
        authLookupErrorMessage = message;
      }
      if (isTransientAuthError(message)) {
        authLookupHadTransientFailure = true;
      }
    }
  }

  if (!user) {
    const authCookiePresent = hasSupabaseAuthCookie(request);
    if (authCookiePresent && authLookupHadTransientFailure) {
      return supabaseResponse;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copySupabaseCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  // Session-device tracking runs in background and never blocks navigation.
  void (async () => {
    try {
      const { data: sessionData } = await withTimeout(
        supabase.auth.getSession(),
        1500,
        "auth.getSession"
      );
      const session = sessionData?.session ?? null;
      if (!session?.access_token) return;

      const payload = session.access_token.split(".")[1];
      if (!payload) return;

      let sessionId = "";
      try {
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const parsed = JSON.parse(atob(normalized));
        sessionId = String(parsed?.session_id || "");
      } catch {
        return;
      }
      if (!sessionId) return;

      const { data: sessionRow, error: sessionRowError } = await supabase
        .from("auth_session_devices")
        .select("session_id, revoked_at, last_seen_at, user_agent, ip_address, location_label")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (sessionRowError && sessionRowError.code !== "42P01") return;

      if (sessionRow?.revoked_at) {
        await supabase.auth.signOut({ scope: "local" });
        return;
      }

      const userAgent = request.headers.get("user-agent") || "Unknown Device";
      const forwardedFor = request.headers.get("x-forwarded-for");
      const ipAddress = forwardedFor
        ? forwardedFor.split(",")[0]?.trim() || null
        : request.headers.get("x-real-ip");
      const city = request.headers.get("x-vercel-ip-city") || request.headers.get("x-appengine-city") || "";
      const country =
        request.headers.get("x-vercel-ip-country") || request.headers.get("x-appengine-country") || "";
      const locationLabel = [city, country].filter(Boolean).join(", ") || null;

      const lastSeenMs = sessionRow?.last_seen_at ? new Date(String(sessionRow.last_seen_at)).getTime() : 0;
      const shouldRefresh = !lastSeenMs || Date.now() - lastSeenMs >= 5 * 60 * 1000;
      const metaChanged =
        String(sessionRow?.user_agent || "") !== userAgent ||
        String(sessionRow?.ip_address || "") !== String(ipAddress || "") ||
        String(sessionRow?.location_label || "") !== String(locationLabel || "");

      if (!sessionRow || shouldRefresh || metaChanged) {
        await supabase.from("auth_session_devices").upsert(
          {
            user_id: user.id,
            session_id: sessionId,
            user_agent: userAgent,
            ip_address: ipAddress,
            location_label: locationLabel,
            last_seen_at: new Date().toISOString(),
            revoked_at: null,
          },
          { onConflict: "session_id" }
        );
      }
    } catch {
      // Never fail request due to telemetry.
    }
  })();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
