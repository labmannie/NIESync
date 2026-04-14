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
  const quickTimeoutMs = Math.min(1200, timeoutMs);

  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      quickTimeoutMs,
      "auth.getSession"
    );
    if (data?.session?.user) {
      return { user: data.session.user, errorMessage: "" };
    }
    if (error && !/auth session missing/i.test(String(error.message || ""))) {
      return { user: null, errorMessage: String(error.message || "Unable to fetch session.") };
    }
  } catch (error: any) {
    const message = String(error?.message || "");
    const isExpected = /auth session missing|timed out/i.test(message);
    if (!isExpected) {
      console.warn("[Supabase] resolveClientUser(getSession) failed:", message || error);
    }
  }

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
