import { createClient as createJsClient } from "@supabase/supabase-js"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

/**
 * Shared Supabase client. Uses only publishable (anon) key.
 *
 * Env (must be set):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  (publishable key, e.g. sb_publishable_...)
 *
 * In browser: reuses singleton from lib/supabase/client.
 * On server: creates client with same anon key (for legacy reads). Never uses service role here.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export const supabase =
  typeof window !== "undefined"
    ? createBrowserClient()
    : createJsClient(supabaseUrl, supabaseAnonKey)
