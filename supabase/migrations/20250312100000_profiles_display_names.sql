-- Main schema: profiles table (users/leaderboard display names). Enforces globally unique (case-insensitive) display names.
-- identity_id = wallet address or guest id; only wallet users should persist here for ranked.

CREATE TABLE IF NOT EXISTS public.profiles (
  identity_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique display name (case-insensitive). Two users cannot share "Israel" and "israel".
CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_lower_key
  ON public.profiles (LOWER(TRIM(display_name)));

-- RLS: enabled in 20250313100000 (single users/leaderboard read-only block); do not add RLS here.

COMMENT ON TABLE public.profiles IS 'KasRoyal display names. identity_id = wallet; display_name globally unique (case-insensitive).';
