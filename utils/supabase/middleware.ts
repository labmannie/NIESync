import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function extractSessionIdFromJwt(accessToken?: string | null) {
  if (!accessToken) return '';
  const payload = accessToken.split('.')[1];
  if (!payload) return '';

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    const parsed = JSON.parse(decoded);
    return String(parsed?.session_id || '');
  } catch {
    return '';
  }
}

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }
  return request.headers.get('x-real-ip');
}

function getRequestLocation(request: NextRequest) {
  const city =
    request.headers.get('x-vercel-ip-city') ||
    request.headers.get('x-appengine-city') ||
    '';
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('x-appengine-country') ||
    '';

  const parts = [city, country].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // refreshing the auth token and fetching user
  let {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let hasProfile = false;
  let needsOnboarding = false;
  let sessionRevoked = false;

  if (user && session?.access_token) {
    const sessionId = extractSessionIdFromJwt(session.access_token);
    if (sessionId) {
      const { data: sessionRow, error: sessionRowError } = await supabase
        .from('auth_session_devices')
        .select('session_id, revoked_at')
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .maybeSingle();

      if (sessionRowError?.code !== '42P01' && sessionRowError) {
        console.error('Session tracking read failed:', sessionRowError.message);
      }

      if (sessionRow?.revoked_at) {
        sessionRevoked = true;
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Ignore local signout errors in middleware.
        }
        user = null;
      } else if (!sessionRowError || sessionRowError.code !== '42P01') {
        const userAgent = request.headers.get('user-agent') || 'Unknown Device';
        const ipAddress = getRequestIp(request);
        const locationLabel = getRequestLocation(request);

        const { error: upsertSessionError } = await supabase
          .from('auth_session_devices')
          .upsert(
            {
              user_id: user.id,
              session_id: sessionId,
              user_agent: userAgent,
              ip_address: ipAddress,
              location_label: locationLabel,
              last_seen_at: new Date().toISOString(),
              revoked_at: null,
            },
            { onConflict: 'session_id' }
          );

        if (upsertSessionError && upsertSessionError.code !== '42P01') {
          console.error('Session tracking write failed:', upsertSessionError.message);
        }
      }
    }
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, user_type, role, usn, has_vehicle, vehicle_no')
      .eq('id', user.id)
      .maybeSingle();
    
    if (profile) {
      hasProfile = true;

      const resolvedUserType =
        profile.user_type || (profile.role === 'Faculty' ? 'Faculty' : 'Student');

      const studentNeedsUsn =
        resolvedUserType === 'Student' &&
        (!profile.usn || !String(profile.usn).trim());

      let hasAnyVehicle = !!profile.vehicle_no;
      if (profile.has_vehicle && !hasAnyVehicle) {
        const { count } = await supabase
          .from('profile_vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', user.id);

        hasAnyVehicle = (count || 0) > 0;
      }

      needsOnboarding = studentNeedsUsn || (!!profile.has_vehicle && !hasAnyVehicle);
    } else {
      needsOnboarding = true;
    }
  }

  return { response, user, hasProfile, needsOnboarding, sessionRevoked };
}
