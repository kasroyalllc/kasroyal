-- =============================================================================
-- kasroyal_verify.sql — Inspection/verification only. Run ad hoc; not migrations.
-- Schema checks, publication checks, match inspection. No DELETE. No schema changes.
-- =============================================================================

-- 1. information_schema: column checks (public tables)
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('matches', 'profiles', 'match_messages', 'spectate_messages', 'moves', 'bets', 'active_identity_matches')
ORDER BY table_name, ordinal_position;

-- 2. Realtime publication: which tables are in supabase_realtime
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 3. Match inspection: active vs terminal
SELECT id, status, host_wallet, challenger_wallet, winner_identity_id, win_reason, finished_at
FROM public.matches
WHERE status NOT IN ('finished', 'forfeited', 'canceled', 'Finished')
ORDER BY created_at DESC
LIMIT 10;

SELECT id, status, winner_identity_id, win_reason, finished_at
FROM public.matches
WHERE status IN ('finished', 'forfeited', 'canceled', 'Finished')
ORDER BY finished_at DESC NULLS LAST
LIMIT 10;
