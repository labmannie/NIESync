import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Let the Supabase SSR middleware handle session cookie refresh and fetch user
  const { response, user, hasProfile } = await updateSession(request);
  
  const { pathname } = request.nextUrl;
  const protectedRoutes = ['/lost-and-found', '/parking-patrol', '/leaderboard', '/profile'];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // 1. Unauthenticated users hitting protected routes -> Go to Login
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 2. Authenticated but Incomplete Profile -> Force to Signup Complete
  // Blocks them from navigating around the site without finishing profile details
  if (user && !hasProfile) {
    if (isProtectedRoute || pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/signup')) {
      // Don't intercept if they're already on the completion page or auth callback
      if (!pathname.startsWith('/signup/complete') && !pathname.startsWith('/auth/callback')) {
        const url = request.nextUrl.clone();
        url.pathname = '/signup/complete';
        return NextResponse.redirect(url);
      }
    }
  }

  // 3. Fully Authenticated and Complete Profile hitting Login/Signup -> Dashboard
  if ((pathname.startsWith('/login') || pathname.startsWith('/signup')) && user && hasProfile) {
    const url = request.nextUrl.clone();
    url.pathname = '/lost-and-found';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
