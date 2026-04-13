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
    if (error && !/auth session missing/i.test(String(error.message || ""))) {
      return { user: null, errorMessage: String(error.message || "Unable to fetch user.") };
    }
  } catch (error: any) {
    const message = String(error?.message || "");
    if (!/auth session missing/i.test(message)) {
      console.error("[Supabase] resolveClientUser(getUser) failed:", message || error);
    }
  }

  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      timeoutMs,
      "auth.getSession"
    );
    if (data?.session?.user) {
      return { user: data.session.user, errorMessage: "" };
    }
    return {
      user: null,
      errorMessage: String(error?.message || ""),
    };
  } catch (error: any) {
    const message = String(error?.message || "Unable to resolve session.");
    console.error("[Supabase] resolveClientUser(getSession) failed:", message);
    return { user: null, errorMessage: message };
  }
}
