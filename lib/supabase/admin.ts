import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client for privileged writes (bypasses RLS).
 * Use only in API routes. Do not import from client components.
 *
 * Env (server only; do not use NEXT_PUBLIC_ for the secret):
 *   NEXT_PUBLIC_SUPABASE_URL  or  SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  = Supabase secret key (sb_secret_...). Not the publishable key.
 *
 * If you see "Invalid API key", ensure SUPABASE_SERVICE_ROLE_KEY is the secret key,
 * not NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable). Restart dev server after changing .env.local.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient must not be called in the browser. Use createClient from @/lib/supabase/client for client-side code."
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error(
      "Supabase URL is missing. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL."
    )
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required. Set it to your Supabase secret key (sb_secret_...) in .env.local. Do not use NEXT_PUBLIC_. Restart the dev server."
    )
  }

  return createClient(url, serviceRoleKey)
}
