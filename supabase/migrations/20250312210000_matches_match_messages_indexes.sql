-- Indexes for matches and match_messages to support list active/history and room chat.
-- Improves listActiveRooms, listHistoryRooms, listSpectateRooms, getRoomById (id is PK), listRoomMessages.

-- matches: filter by status and order by created_at (arena list, spectate list)
CREATE INDEX IF NOT EXISTS idx_matches_status_created_at
  ON public.matches (status, created_at DESC);

-- matches: filter by status and order by finished_at (history, recent resolved)
CREATE INDEX IF NOT EXISTS idx_matches_status_finished_at
  ON public.matches (status, finished_at DESC NULLS LAST);

-- match_messages: list messages by match and time (room chat)
CREATE INDEX IF NOT EXISTS idx_match_messages_match_id_created_at
  ON public.match_messages (match_id, created_at ASC);
