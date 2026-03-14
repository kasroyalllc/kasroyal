-- =============================================================================
-- DEV RESET ONLY — Do not run in production.
-- Clears match-related data in FK-safe order. Run only against dev/local DBs.
-- =============================================================================

-- Children first (depend on matches or other tables), then matches.
DELETE FROM public.bets;
DELETE FROM public.spectate_messages;
DELETE FROM public.match_messages;
DELETE FROM public.moves;
DELETE FROM public.active_identity_matches;
DELETE FROM public.matches;
