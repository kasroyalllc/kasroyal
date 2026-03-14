-- =============================================================================
-- VERIFICATION / DEBUG ONLY — Run ad hoc; not part of migrations.
-- Use for schema checks, publication checks, and match inspection.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. information_schema: column checks (public tables)
-- -----------------------------------------------------------------------------
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('matches', 'profiles', 'match_messages', 'spectate_messages', 'moves', 'bets', 'active_identity_matches')
ORDER BY table_name, ordinal_position;

-- -----------------------------------------------------------------------------
-- 2. Realtime publication: which tables are in supabase_realtime
-- -----------------------------------------------------------------------------
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- -----------------------------------------------------------------------------
-- 3. Match inspection: sample active + terminal state checks
-- -----------------------------------------------------------------------------
-- Active matches (not terminal)
SELECT id, status, host_wallet, challenger_wallet, winner_identity_id, win_reason, finished_at
FROM public.matches
WHERE status NOT IN ('finished', 'forfeited', 'canceled', 'Finished')
ORDER BY created_at DESC
LIMIT 10;

-- Terminal matches (should have win_reason and finished_at)
SELECT id, status, winner_identity_id, win_reason, finished_at
FROM public.matches
WHERE status IN ('finished', 'forfeited', 'canceled', 'Finished')
ORDER BY finished_at DESC NULLS LAST
LIMIT 10;
