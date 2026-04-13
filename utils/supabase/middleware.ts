// This file is kept for backwards compatibility only.
// All middleware logic now lives in the root middleware.ts
// Nothing should import from here going forward.

import { type NextRequest } from 'next/server';

// Stub exports so old imports don't crash during transition
export async function updateSession(request: NextRequest) {
  console.warn('updateSession from utils/supabase/middleware is deprecated. Use root middleware.ts directly.');
  return { response: null, user: null, hasProfile: false, needsOnboarding: false, sessionRevoked: false, authLookupFailed: true };
}

export async function updateSessionWithOptions(request: NextRequest, options = {}) {
  console.warn('updateSessionWithOptions is deprecated. Use root middleware.ts directly.');
  return { response: null, user: null, hasProfile: false, needsOnboarding: false, sessionRevoked: false, authLookupFailed: true };
}