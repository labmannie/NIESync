import { createClient } from "@supabase/supabase-js";
import { createSupabaseFetch, getServiceRoleConfig } from "@/utils/supabase/config";

export function createAdminClient() {
  const { url, serviceRoleKey } = getServiceRoleConfig("admin client");

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: createSupabaseFetch() },
  });
}
