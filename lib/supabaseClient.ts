import { createClient } from '@supabase/supabase-js'
import { createSupabaseFetch, getPublicSupabaseConfig } from '@/utils/supabase/config'

const { url: supabaseUrl, anonKey: supabaseAnonKey } = getPublicSupabaseConfig('legacy client')

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createSupabaseFetch() },
})
