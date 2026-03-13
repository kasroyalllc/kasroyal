-- Profiles table for display names. Enforces globally unique (case-insensitive) display names.
-- identity_id = wallet address or guest id; only wallet users should persist here for ranked.

CREATE TABLE IF NOT EXISTS public.profiles (
  identity_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique display name (case-insensitive). Two users cannot share "Israel" and "israel".
CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_lower_key
  ON public.profiles (LOWER(TRIM(display_name)));

-- Optional: RLS so users can only update their own row (identity_id = auth.uid or app-level check).
-- For now we use service role in API; no RLS.
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.profiles IS 'KasRoyal display names. identity_id = wallet; display_name globally unique (case-insensitive).';
