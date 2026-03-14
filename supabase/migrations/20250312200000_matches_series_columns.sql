-- Best-of series support: track round wins and current round so BO3/BO5 work.
-- best_of: 1 = one game, 3 = first to 2 wins, 5 = first to 3 wins.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS best_of INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS host_round_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenger_round_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS current_round INTEGER NOT NULL DEFAULT 1;
