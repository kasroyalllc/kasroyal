import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client with service role key.
 * Bypasses RLS — use only in trusted API routes for room/matches writes.
 * Do NOT expose this client to the browser or use NEXT_PUBLIC_ for the key.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY

  if (!url) {
    throw new Error(
      "Supabase URL is missing. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL."
    )
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for server-side room actions. " +
        "Add it to .env.local with the service_role key from Supabase Dashboard → Settings → API. " +
        "Use the exact name SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_). Restart the dev server after adding it. " +
        "On Vercel/hosted deploy, add the variable in the project environment settings."
    )
  }

  return createClient(url, serviceRoleKey)
}
