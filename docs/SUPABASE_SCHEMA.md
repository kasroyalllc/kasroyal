# Supabase schema and operational assumptions

This document describes the public tables and canonical fields used by KasRoyal, realtime and RLS assumptions, and how schema changes are made. It is the source of truth for “what the DB looks like” and “how we use it.”

---

## Tables overview

| Table | Purpose |
|-------|---------|
| **matches** | Single source of truth for room/match state: status, players, board, scores, timer, pause, intermission, winner. |
| **match_events** | Ordered timeline of events (room_created, challenger_joined, match_live, move_applied, round_won, round_draw, intermission_started, next_round_started, pause_requested, resumed, forfeit, match_finished). |
| **match_rounds** | One row per completed round: round_number, winner_identity_id, result_type (win/draw/timeout/forfeit), host_score_after, challenger_score_after. |
| **match_messages** | In-room chat (match_id, sender_identity_id, sender_display_name, message, created_at). |
| **spectate_messages** | Crowd/spectator chat. |
| **profiles** | Display names keyed by identity_id (wallet/guest). |
| **moves** | Optional move log (match_id, move_number, player_identity_id, move_data, created_at). |
| **bets** | Spectator bets (match_id, bettor, side, amount, etc.). |
| **active_identity_matches** | One active match per identity (identity_id, match_id). Used to block create/join when already in a match. No client RLS; service role only. |

Matches, match_messages, moves, and bets are assumed to exist (created by earlier migrations or project setup). The main schema file and migrations add columns and new tables (profiles, spectate_messages, active_identity_matches, match_events, match_rounds).

---

## Matches: canonical fields

These are the fields the app and API use as authoritative. Legacy names (host_wallet, wager, started_at, ended_at) are still read in mapDbRowToRoom for backward compatibility but new code should use the canonical names.

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key. |
| game_type | TEXT | Game (e.g. "Tic-Tac-Toe", "Connect 4", "Rock Paper Scissors"). |
| status | TEXT | waiting \| ready \| countdown \| live \| finished \| forfeited \| canceled. |
| mode | TEXT | quick \| ranked. |
| host_identity_id, challenger_identity_id | TEXT | Player identities (wallet/guest). |
| host_display_name, challenger_display_name | TEXT | Display names. |
| wager_amount | NUMERIC | Wager (ranked). |
| best_of | INTEGER | 1, 3, or 5. |
| round_number | INTEGER | Current (or next) round, 1-based. |
| host_score, challenger_score | INTEGER | Round wins (canonical). |
| board_state | JSONB | Game-specific (connect4-live, ttt-live, rps-live). |
| move_turn_identity_id | TEXT | Whose turn (null for RPS). |
| move_turn_started_at, move_turn_seconds | TIMESTAMPTZ, INTEGER | Turn timer. |
| turn_expires_at | TIMESTAMPTZ | DB-authoritative turn deadline; tick uses this for timeout. |
| host_timeout_strikes, challenger_timeout_strikes | INTEGER | Incremented on turn timeout; match loss at 3. |
| winner_identity_id, win_reason | TEXT | Set when match ends. |
| finished_at, ended_at | TIMESTAMPTZ | When match ended. |
| is_paused, paused_at, paused_by, pause_expires_at | BOOLEAN, TIMESTAMPTZ, TEXT | Pause state. |
| pause_count_host, pause_count_challenger | INTEGER | Pauses used per side. |
| round_intermission_until | TIMESTAMPTZ | When intermission ends; tick starts next round when expired. |
| last_round_winner_identity_id | TEXT | Set during intermission for “X won Round N”. |
| countdown_started_at, countdown_seconds | TIMESTAMPTZ, INTEGER | Pre-live countdown. |
| betting_open, betting_closes_at | BOOLEAN, TIMESTAMPTZ | Betting window. |
| live_started_at | TIMESTAMPTZ | When match went live. |
| created_at, updated_at | TIMESTAMPTZ | Timestamps; updated_at used for sync policy. |

Legacy columns still present and used as fallback in mapping: host_wallet, challenger_wallet, wager, started_at, ended_at. New writes use host_identity_id, wager_amount, live_started_at, finished_at.

---

## match_events

- **id**, **match_id**, **event_type**, **payload** (JSONB), **created_at**.
- **event_type**: room_created, challenger_joined, countdown_started, match_live, move_applied, round_won, round_draw, intermission_started, next_round_started, pause_requested, resumed, forfeit, match_finished.
- Index: (match_id, created_at ASC). Used for timeline API and audit.

---

## match_rounds

- **id**, **match_id**, **round_number**, **winner_identity_id** (nullable), **result_type** (win \| draw \| timeout \| forfeit), **host_score_after**, **challenger_score_after**, **created_at**.
- Unique on (match_id, round_number). One row per completed round. Used for round-by-round UI and future settlement/audit.

---

## profiles

- **identity_id** (PK), **display_name**, **updated_at**. Display names; identity_id = wallet or guest id. Unique display_name (case-insensitive).

---

## active_identity_matches

- **identity_id** (PK), **match_id**, **created_at**. One row per identity; create/join set it, cancel/forfeit/finish clear by match_id. No client RLS; only service role reads/writes.

---

## Realtime publication

- **matches**, **match_messages**, **spectate_messages** are in the Supabase realtime publication (supabase_realtime). **match_events** is added to the publication when the migration runs (if the publication exists).
- Clients subscribe to changes (e.g. matches filter by id) to refresh room state. Writes are only via API routes (service role).

---

## RLS philosophy

- **Read-only for clients**: SELECT policies for anon and authenticated on profiles, matches, match_messages, spectate_messages, moves, bets, match_events, match_rounds. Clients can read; they cannot INSERT/UPDATE/DELETE these tables.
- **Backend-only writes**: All mutations go through API routes using the Supabase **service role** key (admin client). The service role bypasses RLS.
- **active_identity_matches**: No policies for anon/authenticated; only the service role can read and write. This prevents clients from claiming or releasing slots.

See [SUPABASE_SECURITY_MODEL.md](SUPABASE_SECURITY_MODEL.md) for details and migration references.

---

## Canonical naming vs legacy compatibility

- **Writing**: API routes and services write only canonical columns (e.g. host_identity_id, wager_amount, host_score, challenger_score, round_number, best_of, turn_expires_at, round_intermission_until, last_round_winner_identity_id).
- **Reading**: mapDbRowToRoom in lib/engine/match/types.ts prefers canonical names and falls back to legacy (host_wallet → host_identity_id, wager → wager_amount, started_at → live_started_at, ended_at → finished_at, host_round_wins → host_score, current_round → round_number). This allows old rows and any remaining legacy columns to still render correctly.
- **Status**: DB stores lowercase (waiting, ready, live, finished, forfeited, canceled). UI uses "Waiting for Opponent", "Ready to Start", "Live", "Finished". Mapping is in ROOM_STATUS_TO_UI in match/types.

---

## Migrations and schema changes

- **Location**: supabase/kasroyal_schema.sql is the consolidated schema (tables, indexes, RLS, triggers, realtime). Incremental migrations live in supabase/migrations/ (e.g. 20250312000000_matches_minimal_columns.sql, 20250313000000_match_events_and_rounds.sql).
- **When to add a migration**: When adding or changing tables or columns that affect the running app. Use a new timestamped file; do not edit already-applied migrations. Document in this file or in a short migration comment.
- **Applying**: Run migrations against your Supabase project (Supabase dashboard SQL editor, or CLI). For a fresh project, run the migrations in order or apply kasroyal_schema.sql and then any later migrations that add columns/tables not in the consolidated file.
- **Drift**: Keep kasroyal_schema.sql and migrations in sync so that (1) new installs can run the consolidated schema and (2) existing installs can run only new migrations. See [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md).
