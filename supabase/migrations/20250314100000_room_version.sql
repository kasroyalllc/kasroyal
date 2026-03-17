-- Monotonic room version for conflict-proof client/server sync.
-- Incremented on every lifecycle mutation (Ready->Live, move, intermission, next round, timeout, pause/resume).
-- Client reconcile prefers higher room_version over updated_at; refetch never overwrites a higher version.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS room_version BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.matches.room_version IS 'Monotonic version; incremented on every room mutation for sync ordering.';
