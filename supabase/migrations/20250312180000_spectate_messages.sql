-- Main schema: spectate_messages table (crowd chat). shared messages per match, visible to all spectators via realtime.
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

-- RLS and Realtime: enabled and SELECT policy in 20250313100000_rls_select_only_security_model.sql;
-- Realtime publication in 20250313120000_schema_setup_triggers_realtime.sql. No client INSERT.
