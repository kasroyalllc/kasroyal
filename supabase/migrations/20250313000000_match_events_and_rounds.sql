-- =============================================================================
-- Match events timeline and round result record
-- For history quality, auditability, and future betting resolution.
-- =============================================================================

-- Match events: canonical timeline of major state transitions and outcomes.
CREATE TABLE IF NOT EXISTS public.match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_events_match_id_created_at
  ON public.match_events (match_id, created_at ASC);

COMMENT ON TABLE public.match_events IS 'Canonical timeline of match events: room_created, challenger_joined, match_live, move_applied, round_won, round_draw, intermission_started, next_round_started, pause_requested, resumed, forfeit, match_finished.';

-- Round result record: one row per completed round (BO3/BO5). Reconstruct series progression.
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

COMMENT ON TABLE public.match_rounds IS 'One row per completed round: round_number, winner (null = draw), result_type (win, draw, timeout, forfeit), scores after round.';

-- RLS: same as matches — read for anon/authenticated; writes via service role only.
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "match_events_select" ON public.match_events;
CREATE POLICY "match_events_select" ON public.match_events FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.match_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "match_rounds_select" ON public.match_rounds;
CREATE POLICY "match_rounds_select" ON public.match_rounds FOR SELECT TO anon, authenticated USING (true);

-- Realtime: allow clients to subscribe to new events for a match.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'match_events') THEN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
    END IF;
  END IF;
END
$$;
