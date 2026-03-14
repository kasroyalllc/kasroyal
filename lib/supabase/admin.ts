import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client for privileged writes (bypasses RLS).
 * Use only in API routes. Do not import from client components.
 *
 * Required env (server-side; set in Vercel Project Settings > Environment Variables):
 *   NEXT_PUBLIC_SUPABASE_URL  or  SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  = Supabase service role secret (Settings > API > service_role).
 *     Do NOT use the anon/publishable key. Must be set for Production and Preview if you use both.
 *
 * If you see "No API key found in request", SUPABASE_SERVICE_ROLE_KEY is missing or empty at runtime.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient must not be called in the browser. Use createClient from @/lib/supabase/client for client-side code."
    )
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim()
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const serviceRoleKey = typeof rawKey === "string" ? rawKey.trim() : ""

  if (!url) {
    throw new Error(
      "Supabase URL is missing. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL in Vercel (Production + Preview)."
    )
  }
  if (!serviceRoleKey || serviceRoleKey.length < 20) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing or invalid. In Vercel: Project Settings > Environment Variables. Add SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard > Settings > API > service_role secret). Set for Production and Preview. Do not use the anon key."
    )
  }
  if (serviceRoleKey.toLowerCase() === "undefined") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is the literal string 'undefined'. Set the real service_role secret in Vercel Environment Variables."
    )
  }

  return createClient(url, serviceRoleKey)
}
