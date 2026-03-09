import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define protected routes
  const protectedRoutes = ['/lost-and-found', '/parking-patrol', '/leaderboard'];
  
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // Check for our mock auth cookie or a real Supabase auth cookie
  const isAuthenticated = request.cookies.has('campus-sync-auth') || request.cookies.has('sb-access-token');

  if (isProtectedRoute && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
