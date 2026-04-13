const SUPABASE_REQUEST_TIMEOUT_MS = 5000;

function sanitizeEnvValue(value?: string) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function missingKeysError(prefix: string, missingKeys: string[]) {
  const joined = missingKeys.join(", ");
  return new Error(
    `[Supabase] Missing ${joined}. Add them to Vercel Environment Variables and redeploy (${prefix}).`
  );
}

export function getPublicSupabaseConfig(prefix: string) {
  const url = sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const missingKeys: string[] = [];

  if (!url) missingKeys.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missingKeys.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missingKeys.length > 0) {
    throw missingKeysError(prefix, missingKeys);
  }

  return { url, anonKey };
}

export function getServiceRoleConfig(prefix: string) {
  const url = sanitizeEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  );
  const serviceRoleKey = sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const missingKeys: string[] = [];

  if (!url) missingKeys.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  if (!serviceRoleKey) missingKeys.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missingKeys.length > 0) {
    throw missingKeysError(prefix, missingKeys);
  }

  return { url, serviceRoleKey };
}

export function createSupabaseFetch(
  timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const onAbort = () => controller.abort();

    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener("abort", onAbort, { once: true });
      }
    }

    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error(
          `Supabase request timed out after ${timeoutMs}ms.`
        ) as Error & { code?: string };
        timeoutError.name = "AbortError";
        timeoutError.code = "ABORT_ERR";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (upstreamSignal) {
        upstreamSignal.removeEventListener("abort", onAbort);
      }
    }
  };
}

export function getSupabaseRequestTimeoutMs() {
  return SUPABASE_REQUEST_TIMEOUT_MS;
}
