import { createClient as createJsClient } from "@supabase/supabase-js"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

/**
 * Single Supabase client for the app. In the browser we reuse the singleton
 * from lib/supabase/client to avoid "Multiple GoTrueClient instances" warning.
 * On the server we create one with @supabase/supabase-js (e.g. for legacy db/matches usage).
 */
export const supabase =
  typeof window !== "undefined"
    ? createBrowserClient()
    : createJsClient(supabaseUrl, supabaseAnonKey)