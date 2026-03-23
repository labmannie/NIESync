import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { updateSessionWithOptions } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedRoutes = ['/lost-and-found', '/parking-patrol', '/leaderboard', '/profile'];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const shouldIncludeProfileChecks =
    isProtectedRoute || pathname.startsWith('/login') || pathname.startsWith('/signup');
  const shouldTrackSessionDevice =
    isProtectedRoute ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth/callback');

  let sessionState:
    | Awaited<ReturnType<typeof updateSessionWithOptions>>
    | null = null;

  try {
    // Let the Supabase SSR middleware handle session cookie refresh and fetch user.
    sessionState = await updateSessionWithOptions(request, {
      includeProfile: shouldIncludeProfileChecks,
      includeSessionTracking: shouldTrackSessionDevice,
    });
  } catch (error) {
    console.error('middleware updateSession failed:', error);
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  const { response, user, hasProfile, needsOnboarding, sessionRevoked, authLookupFailed } =
    sessionState;

  if (
    sessionRevoked &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/signup') &&
    !pathname.startsWith('/auth/callback')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'session-revoked');
    return NextResponse.redirect(url);
  }

  // 1. Unauthenticated users hitting protected routes -> Go to Login
  if (isProtectedRoute && !user) {
    if (authLookupFailed) {
      // Avoid forced logout loops during transient auth API failures.
      return response;
    }

    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 2. Authenticated but profile missing required onboarding fields
  if (
    user &&
    needsOnboarding &&
    !pathname.startsWith('/signup/complete') &&
    !pathname.startsWith('/auth/callback') &&
    !pathname.startsWith('/forgot-password') &&
    !pathname.startsWith('/reset-password')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/signup/complete';
    return NextResponse.redirect(url);
  }

  // 3. Fully Authenticated and Complete Profile hitting Login/Signup -> Dashboard
  if (
    (pathname.startsWith('/login') || pathname.startsWith('/signup')) &&
    user &&
    hasProfile &&
    !needsOnboarding
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/lost-and-found';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
