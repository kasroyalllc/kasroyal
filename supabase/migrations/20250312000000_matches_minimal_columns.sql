-- Minimal matches table for KasRoyal room creation.
-- Run this only if your matches table is missing required columns or you need a fresh schema.
-- Adjust if you already have some columns (e.g. use ADD COLUMN only for missing ones).

-- Example: ensure matches has at least these columns for create/join to work.
-- If creating from scratch, uncomment and run the CREATE TABLE.
-- If table exists, run only the ALTER TABLE blocks for missing columns.

/*
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL,
  status TEXT NOT NULL,
  host_wallet TEXT NOT NULL,
  challenger_wallet TEXT,
  wager NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
*/

-- Add optional columns if your table only has the minimal set (id, game_type, status, host_wallet, wager, created_at, updated_at):
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'quick';
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS host_display_name TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenger_display_name TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS countdown_started_at TIMESTAMPTZ;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS countdown_seconds INTEGER DEFAULT 30;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS betting_open BOOLEAN DEFAULT false;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS betting_closes_at TIMESTAMPTZ;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS board_state JSONB;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS move_turn_identity_id TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS move_turn_started_at TIMESTAMPTZ;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS move_turn_seconds INTEGER;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS host_timeout_strikes INTEGER DEFAULT 0;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenger_timeout_strikes INTEGER DEFAULT 0;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS winner_identity_id TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS win_reason TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
