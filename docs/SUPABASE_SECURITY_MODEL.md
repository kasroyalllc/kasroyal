# Supabase Security Model (KasRoyal)

## Rules

1. **RLS on all public tables**  
   Row Level Security is enabled on every public table used by the app.

2. **Client: read-only**  
   Only **SELECT** policies exist for `anon` and `authenticated`.  
   There are **no** INSERT, UPDATE, or DELETE policies for client roles.

3. **Writes only via backend**  
   All inserts, updates, and deletes go through **server-side API routes** using the **Supabase service role key** (`SUPABASE_SERVICE_ROLE_KEY`). The service role bypasses RLS.

This keeps match state, leaderboard data, chat, and wagers under backend control and prevents clients from changing them directly.

---

## Migration

- **`supabase/migrations/20250313100000_rls_select_only_security_model.sql`**
  - Enables RLS on: `profiles`, `matches`, `match_messages`, `spectate_messages`, `moves`, `bets`, `active_identity_matches`.
  - Adds **SELECT only** (to `anon`, `authenticated`) for: `profiles`, `matches`, `match_messages`, `spectate_messages`, `moves`, `bets`.
  - **Drops** the previous client **INSERT** policy on `spectate_messages` (writes go through API).
  - **No** policies for `active_identity_matches` (server-only; only service role can read/write).

Run this migration after the tables exist (including `match_messages`, `moves`, `bets` if you use them).

---

## Server-side write paths (already correct)

These use `createAdminClient()` (service role) and are the only place that should mutate data:

- **Matches:** create, join, start, tick, move, cancel, forfeit (`app/api/rooms/*`).
- **Room chat:** send (`app/api/chat/send` → `sendRoomMessage`).
- **Spectate chat:** send (`app/api/spectate/chat` → `sendSpectateMessage`).
- **Profiles:** display name updates (`app/api/profile/display-name`).

---

## Client write that must move to API

- **Bets:** `lib/db/bets.ts` uses the **anon** client for `placeBet()`. After RLS, client-side insert on `bets` is **denied**. Add an API route (e.g. `app/api/bets/place/route.ts`) that uses `createAdminClient()` and calls the same insert, and have the match page call that API instead of `placeBet()` from `lib/db/bets.ts`. `getMatchBets()` (SELECT) continues to work from the client thanks to the new SELECT policy.
