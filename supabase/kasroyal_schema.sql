-- =============================================================================
-- kasroyal_schema.sql — Main schema only.
-- Tables, add-column upgrades, indexes, RLS, updated_at trigger, realtime.
-- Users/leaderboard read-only RLS (single block). No DELETE. No debug queries.
-- =============================================================================
-- Prerequisite: public.matches, match_messages, moves, bets must exist (create elsewhere if needed).

-- =============================================================================
-- 1. MATCHES — optional add-column upgrades (if table already has minimal columns)
-- =============================================================================
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'quick';
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS host_display_name TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenger_display_name TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS host_identity_id TEXT;
-- ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenger_identity_id TEXT;
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

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS round_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS host_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenger_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS best_of INTEGER NOT NULL DEFAULT 1;
-- Pause: server-authoritative; tick skips turn timeout when is_paused.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS paused_by TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS pause_expires_at TIMESTAMPTZ;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS pause_count_host INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS pause_count_challenger INTEGER NOT NULL DEFAULT 0;
-- Between-round intermission: 5s pause before next round in BO3/BO5. Tick clears and starts next round when expired.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS round_intermission_until TIMESTAMPTZ;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS last_round_winner_identity_id TEXT;

-- =============================================================================
-- 1b. MATCH_EVENTS + MATCH_ROUNDS (timeline and round result record)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_events_match_id_created_at ON public.match_events (match_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.match_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  winner_identity_id TEXT,
  result_type TEXT NOT NULL,
  host_score_after INTEGER NOT NULL,
  challenger_score_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_rounds_match_id ON public.match_rounds (match_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_rounds_match_round ON public.match_rounds (match_id, round_number);

-- =============================================================================
-- 2. PROFILES (users/leaderboard display names)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  identity_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_lower_key
  ON public.profiles (LOWER(TRIM(display_name)));

COMMENT ON TABLE public.profiles IS 'KasRoyal display names. identity_id = wallet; display_name globally unique (case-insensitive).';

-- =============================================================================
-- 3. SPECTATE_MESSAGES (crowd chat)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.spectate_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  sender_identity_id TEXT NOT NULL,
  sender_display_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spectate_messages_match_id ON public.spectate_messages (match_id);
CREATE INDEX IF NOT EXISTS idx_spectate_messages_created_at ON public.spectate_messages (match_id, created_at ASC);

-- =============================================================================
-- 4. ACTIVE_IDENTITY_MATCHES (one active match per identity)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.active_identity_matches (
  identity_id TEXT PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_identity_matches_match_id ON public.active_identity_matches (match_id);

COMMENT ON TABLE public.active_identity_matches IS 'One active match per identity; used to block create/join when already in a match.';

-- =============================================================================
-- 5. INDEXES (matches, match_messages)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_matches_status_created_at
  ON public.matches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status_finished_at
  ON public.matches (status, finished_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_match_messages_match_id_created_at
  ON public.match_messages (match_id, created_at ASC);

-- =============================================================================
-- 6. RLS — enable + read-only policies. Writes via service role only.
-- =============================================================================

-- USERS / LEADERBOARD (profiles) — single read-only RLS block; do not duplicate
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);

-- MATCHES
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "matches_select" ON public.matches;
CREATE POLICY "matches_select" ON public.matches FOR SELECT TO anon, authenticated USING (true);

-- MATCH_MESSAGES
ALTER TABLE public.match_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "match_messages_select" ON public.match_messages;
CREATE POLICY "match_messages_select" ON public.match_messages FOR SELECT TO anon, authenticated USING (true);

-- SPECTATE_MESSAGES (no client INSERT)
ALTER TABLE public.spectate_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "spectate_messages_insert" ON public.spectate_messages;
DROP POLICY IF EXISTS "spectate_messages_select" ON public.spectate_messages;
CREATE POLICY "spectate_messages_select" ON public.spectate_messages FOR SELECT TO anon, authenticated USING (true);

-- MOVES
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moves_select" ON public.moves;
CREATE POLICY "moves_select" ON public.moves FOR SELECT TO anon, authenticated USING (true);

-- BETS
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bets_select" ON public.bets;
CREATE POLICY "bets_select" ON public.bets FOR SELECT TO anon, authenticated USING (true);

-- MATCH_EVENTS, MATCH_ROUNDS (read-only for anon/authenticated)
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "match_events_select" ON public.match_events;
CREATE POLICY "match_events_select" ON public.match_events FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.match_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "match_rounds_select" ON public.match_rounds;
CREATE POLICY "match_rounds_select" ON public.match_rounds FOR SELECT TO anon, authenticated USING (true);

-- ACTIVE_IDENTITY_MATCHES (no client policies; service role only)
ALTER TABLE public.active_identity_matches ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.active_identity_matches IS 'One active match per identity. RLS: no client policies; only service role can read/write.';

-- =============================================================================
-- 7. updated_at trigger (profiles, matches)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_on_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_on_profiles
  BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_on_matches ON public.matches';
    EXECUTE 'CREATE TRIGGER set_updated_at_on_matches BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END;
$$;

-- =============================================================================
-- 8. Realtime publication
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['matches', 'match_messages', 'spectate_messages'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
