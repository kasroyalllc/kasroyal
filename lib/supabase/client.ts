import { createBrowserClient } from "@supabase/ssr"

let browserClient: ReturnType<typeof createBrowserClient> | null = null

/**
 * Browser-only Supabase client. Use for client-side code only.
 * Uses NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key, e.g. sb_publishable_...).
 * Do not use on server; do not use SUPABASE_SERVICE_ROLE_KEY or any secret here.
 */
export function createClient() {
  if (typeof window === "undefined") {
    throw new Error(
      "createClient() from @/lib/supabase/client is for browser only. " +
        "In API routes use createAdminClient from @/lib/supabase/admin. " +
        "On server use createClient from @/lib/supabase/server or createAdminClient."
    )
  }
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}
