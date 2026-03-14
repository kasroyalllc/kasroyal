-- KasRoyal match integrity: DB rejects impossible competitive states.
-- Invariants: winner in (host, challenger, null); terminal states have win_reason + finished_at;
-- host != challenger; series scores and round_number within best_of; auto-clean active_identity_matches;
-- auto-stamp finished_at for terminal status.

-- =============================================================================
-- 1. winner_identity_id must be host, challenger, or NULL
-- =============================================================================
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_winner_must_be_participant;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_winner_must_be_participant
  CHECK (
    winner_identity_id IS NULL
    OR winner_identity_id = COALESCE(host_identity_id, host_wallet)
    OR winner_identity_id = COALESCE(challenger_identity_id, challenger_wallet)
  );

-- =============================================================================
-- 2. Terminal states (finished, forfeited, canceled) require win_reason and finished_at
-- =============================================================================
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_terminal_requires_reason_and_finished_at;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_terminal_requires_reason_and_finished_at
  CHECK (
    ( status NOT IN ('finished', 'forfeited', 'canceled', 'Finished') )
    OR ( win_reason IS NOT NULL AND finished_at IS NOT NULL )
  );

-- =============================================================================
-- 3. Host and challenger cannot be the same identity (when challenger is set)
-- =============================================================================
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_host_challenger_different;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_host_challenger_different
  CHECK (
    ( COALESCE(challenger_identity_id, challenger_wallet) IS NULL )
    OR (
      COALESCE(host_identity_id, host_wallet) IS NOT NULL
      AND COALESCE(challenger_identity_id, challenger_wallet) IS NOT NULL
      AND LOWER(TRIM(COALESCE(host_identity_id, host_wallet)::text)) <> LOWER(TRIM(COALESCE(challenger_identity_id, challenger_wallet)::text))
    )
  );

-- =============================================================================
-- 4. Series score within best_of limits (BO1=1, BO3=2, BO5=3 max wins each)
-- =============================================================================
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_series_score_limits;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_series_score_limits
  CHECK (
    best_of IN (1, 3, 5)
    AND host_score >= 0
    AND challenger_score >= 0
    AND host_score <= (best_of + 1) / 2
    AND challenger_score <= (best_of + 1) / 2
  );

-- =============================================================================
-- 5. round_number within [1, best_of]
-- =============================================================================
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_round_number_limits;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_round_number_limits
  CHECK ( round_number >= 1 AND round_number <= GREATEST(1, best_of) );

-- =============================================================================
-- 6. Auto-clean active_identity_matches when match becomes terminal
-- =============================================================================
CREATE OR REPLACE FUNCTION public.matches_clean_active_on_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('finished', 'forfeited', 'canceled', 'Finished') THEN
    DELETE FROM public.active_identity_matches WHERE match_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_clean_active_on_terminal ON public.matches;
CREATE TRIGGER trg_matches_clean_active_on_terminal
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW
  WHEN ( OLD.status IS DISTINCT FROM NEW.status )
  EXECUTE PROCEDURE public.matches_clean_active_on_terminal();

-- =============================================================================
-- 7. Auto-stamp finished_at for terminal status when omitted
-- =============================================================================
CREATE OR REPLACE FUNCTION public.matches_stamp_finished_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('finished', 'forfeited', 'canceled', 'Finished') AND NEW.finished_at IS NULL THEN
    NEW.finished_at := now();
    NEW.ended_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_stamp_finished_at ON public.matches;
CREATE TRIGGER trg_matches_stamp_finished_at
  BEFORE UPDATE OF status ON public.matches
  FOR EACH ROW
  EXECUTE PROCEDURE public.matches_stamp_finished_at();
