-- Standalone snippet: add room_version to matches (monotonic version for sync).
-- If using Supabase migrations, prefer supabase/migrations/20250314100000_room_version.sql.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS room_version BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.matches.room_version IS 'Monotonic version; incremented on every room mutation for sync ordering.';
