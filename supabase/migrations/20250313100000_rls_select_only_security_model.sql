-- KasRoyal RLS security model:
-- - All public tables have RLS enabled.
-- - Only SELECT policies for anon/authenticated (public read-only data).
-- - No INSERT, UPDATE, or DELETE policies for client roles.
-- - All writes go through server routes using the service role key.
--
-- Ensure tables match_messages, moves, bets exist before running (create them if your project uses them).
-- After this migration, client-side inserts/updates/deletes will be denied; use API routes with service role.

-- =============================================================================
-- PROFILES (public: leaderboard, display names)
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE for anon/authenticated; server uses service role.

-- =============================================================================
-- MATCHES (public: arena list, spectate, history, match page)
-- =============================================================================
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matches_select" ON public.matches;
CREATE POLICY "matches_select" ON public.matches
  FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- MATCH_MESSAGES (public: room chat)
-- =============================================================================
ALTER TABLE public.match_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_messages_select" ON public.match_messages;
CREATE POLICY "match_messages_select" ON public.match_messages
  FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- SPECTATE_MESSAGES (public: crowd chat) — REMOVE client INSERT
-- =============================================================================
ALTER TABLE public.spectate_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spectate_messages_insert" ON public.spectate_messages;
-- (Remove client insert; server uses service role for sends.)

DROP POLICY IF EXISTS "spectate_messages_select" ON public.spectate_messages;
CREATE POLICY "spectate_messages_select" ON public.spectate_messages
  FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- MOVES (public: match page realtime / move history if needed)
-- =============================================================================
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moves_select" ON public.moves;
CREATE POLICY "moves_select" ON public.moves
  FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- BETS (public: match page / bets page read)
-- =============================================================================
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bets_select" ON public.bets;
CREATE POLICY "bets_select" ON public.bets
  FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- ACTIVE_IDENTITY_MATCHES (internal: no client read/write)
-- =============================================================================
ALTER TABLE public.active_identity_matches ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE for anon or authenticated.
-- Only service role (bypasses RLS) can read/write this table.

COMMENT ON TABLE public.active_identity_matches IS 'One active match per identity. RLS: no client policies; only service role can read/write.';
