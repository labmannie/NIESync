import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseRequestTimeoutMs } from "@/utils/supabase/config";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
    }),
  ]);
}

export async function resolveClientUser(supabase: SupabaseClient): Promise<{
  user: User | null;
  errorMessage: string;
}> {
  const timeoutMs = Math.min(4000, getSupabaseRequestTimeoutMs());

  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      timeoutMs,
      "auth.getUser"
    );
    if (data?.user) {
      return { user: data.user, errorMessage: "" };
    }
    return {
      user: null,
      errorMessage: String(error?.message || ""),
    };
  } catch (error: any) {
    const message = String(error?.message || "Unable to resolve user.");
    const isExpected = /auth session missing|timed out/i.test(message);
    if (!isExpected) {
      console.warn("[Supabase] resolveClientUser(getUser) failed:", message);
    }
    return { user: null, errorMessage: message };
  }
}
