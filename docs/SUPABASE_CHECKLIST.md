# Supabase checklist (what you may need to do)

This is a short list of Supabase-related things to verify or run so the app works as intended. You don’t have to do all of these if your project is already set up; use it as a checklist.

---

## 1. Run migrations (if you haven’t)

The app expects these tables and columns. If you created the DB from the repo migrations, run them in order:

- **Matches and room state:** `matches` with columns like `status`, `board_state`, `move_turn_identity_id`, `countdown_started_at`, `countdown_seconds`, `round_intermission_until`, etc.
- **Room chat:** `match_messages` (match_id, sender_identity_id, sender_display_name, message, created_at).
- **Crowd chat:** `spectate_messages` (same shape as above).
- **Realtime:** `match_messages` and `spectate_messages` must be in the Realtime publication (see below).

Relevant migration files under `supabase/migrations/` (run in order by name):

- `20250312180000_spectate_messages.sql` – creates `spectate_messages`
- `20250312210000_matches_match_messages_indexes.sql` – indexes
- `20250313100000_rls_select_only_security_model.sql` – RLS (SELECT only for anon/authenticated)
- `20250313120000_schema_setup_triggers_realtime.sql` – adds tables to Realtime publication

If you use a single schema file instead, ensure it includes the same objects (see `supabase/kasroyal_schema.sql` and the migrations above).

---

## 2. Realtime publication

For **room chat** and **spectator/crowd chat** to update live, these tables must be in the Realtime publication:

- `match_messages`
- `spectate_messages`

The migration `20250313120000_schema_setup_triggers_realtime.sql` adds them. You can confirm in the Supabase dashboard: **Database → Replication** (or **Realtime**) and check that `match_messages` and `spectate_messages` are published.

If they’re missing, add them:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.spectate_messages;
```

---

## 3. RLS (Row Level Security)

The app assumes:

- **match_messages:** SELECT allowed for `anon` and `authenticated`; inserts go through the API (service role).
- **spectate_messages:** Same – SELECT for anon/authenticated; inserts via API (service role).

So clients can **read** chat; only the backend can **write**. If you added custom policies that block SELECT on these tables, the chat list won’t load. The migration `20250313100000_rls_select_only_security_model.sql` sets this up.

---

## 4. Status values for matches

Ready → Live transition (including RPS) uses these status values in the DB:

- “Ready” phase (countdown): `status = 'ready'` or `'countdown'`.
- After transition: `status = 'live'`.

The app maps these to UI labels (“Ready to Start”, “Live”). If your `matches.status` uses different values, the tick/start logic may not transition; keep values consistent with the code (see `lib/rooms/db-status.ts` and `lib/engine/match/types.ts`).

---

## 5. No extra steps for “RPS” or “chat” in Supabase

- **RPS:** No separate Supabase config. It uses the same `matches` row and tick/start API; no new tables or policies.
- **Room vs crowd chat:** Both use normal tables (`match_messages`, `spectate_messages`) and the same Realtime publication; no extra setup beyond migrations and Realtime above.

---

**TL;DR:** Run the migrations (or apply the same schema), ensure `match_messages` and `spectate_messages` are in the Realtime publication, and leave RLS as SELECT-only for anon/authenticated on those two tables. Then the app’s room chat, crowd chat, and RPS flow can work as designed.
