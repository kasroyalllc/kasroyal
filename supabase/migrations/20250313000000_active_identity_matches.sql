-- Optional: if your matches table uses round_number/host_score/challenger_score (post-rebuild), add them.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS round_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS host_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenger_score INTEGER NOT NULL DEFAULT 0;

-- One active match per identity: enforce at DB level.
-- identity_id = host or challenger; one row per identity; claim on create/join, release on cancel/forfeit/finish.
CREATE TABLE IF NOT EXISTS public.active_identity_matches (
  identity_id TEXT PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_identity_matches_match_id ON public.active_identity_matches (match_id);

COMMENT ON TABLE public.active_identity_matches IS 'One active match per identity; used to block create/join when already in a match.';
