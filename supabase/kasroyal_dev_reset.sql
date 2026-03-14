-- =============================================================================
-- kasroyal_dev_reset.sql — Dev-only table row wipe. Do not run in production.
-- Clears match-related data in FK-safe order. No schema changes. No debug queries.
-- =============================================================================

DELETE FROM public.bets;
DELETE FROM public.spectate_messages;
DELETE FROM public.match_messages;
DELETE FROM public.moves;
DELETE FROM public.active_identity_matches;
DELETE FROM public.matches;
