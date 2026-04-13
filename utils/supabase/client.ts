import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseFetch,
  getPublicSupabaseConfig,
  getSupabaseRequestTimeoutMs,
} from '@/utils/supabase/config';

let client: SupabaseClient | null = null;

const SESSION_TIMEOUT_MS = getSupabaseRequestTimeoutMs();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
    }),
  ]);
}

function patchSafeGetSession(supabase: SupabaseClient) {
  const authWithPatchFlag = supabase.auth as typeof supabase.auth & {
    __niesyncSafeGetSessionPatched?: boolean;
  };

  if (authWithPatchFlag.__niesyncSafeGetSessionPatched) {
    return supabase;
  }

  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);

  (supabase.auth as any).getSession = async () => {
    try {
      return await withTimeout(
        originalGetSession(),
        SESSION_TIMEOUT_MS,
        'supabase.auth.getSession'
      );
    } catch (error: any) {
      console.error('[Supabase] getSession failed:', error?.message || error);
      return {
        data: { session: null },
        error: {
          message: error?.message || 'Unable to resolve session.',
          name: 'SupabaseSessionError',
          status: 0,
        } as any,
      };
    }
  };

  authWithPatchFlag.__niesyncSafeGetSessionPatched = true;
  return supabase;
}

export function createClient() {
  const { url, anonKey } = getPublicSupabaseConfig('browser client');

  if (typeof window === 'undefined') {
    const serverSideClient = createBrowserClient(
      url,
      anonKey,
      {
        global: {
          fetch: createSupabaseFetch(),
        },
      }
    );
    return patchSafeGetSession(serverSideClient);
  }

  if (!client) {
    client = createBrowserClient(
      url,
      anonKey,
      {
        global: {
          fetch: createSupabaseFetch(),
        },
      }
    );
    patchSafeGetSession(client);
  }

  return client;
}
