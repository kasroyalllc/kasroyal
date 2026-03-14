# Database schema notes

Important constraints, fields that must not be null, turn-based-only fields, lifecycle fields, and how match state is persisted. Use this when changing schema or fixing lifecycle/API bugs.

See also: [../SUPABASE_SCHEMA.md](../SUPABASE_SCHEMA.md) (full tables and RLS).

---

## Tables overview

| Table | Purpose |
|-------|---------|
| matches | Single source of truth: status, players, board, scores, timer, pause, intermission, winner. |
| match_events | Timeline: room_created, challenger_joined, match_live, move_applied, round_won, round_draw, intermission_started, next_round_started, pause_requested, resumed, forfeit, match_finished. |
| match_rounds | One row per completed round: round_number, winner_identity_id, result_type (win/draw/timeout/forfeit), host_score_after, challenger_score_after. |
| active_identity_matches | One active match per identity; create/join set it; cancel/forfeit/finish clear by match_id. Service role only. |

---

## Important constraints

- **matches**: Primary key id (UUID). status is one of waiting, ready, countdown, live, finished, forfeited, canceled. best_of is 1, 3, or 5.
- **match_rounds**: Unique on (match_id, round_number). result_type: win | draw | timeout | forfeit.
- **active_identity_matches**: identity_id is primary key; one row per identity.

---

## Fields that must not be null (matches)

Schema may enforce NOT NULL on:

- **id**, **game_type**, **status**, **host_identity_id**, **best_of**, **round_number**, **host_score**, **challenger_score**, **board_state**, **updated_at**.

**Turn-related columns** (move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at):

- Some migrations or schema may define **move_turn_seconds** (and possibly move_turn_started_at, turn_expires_at) as NOT NULL. For **simultaneous games** (e.g. Rock Paper Scissors), the app does **not** set these; they are omitted from the update payload. If the schema has NOT NULL on these columns, either:
  - Make them nullable for games that have no turn timer, or
  - Ensure lifecycle and tick **never** write to matches for RPS with null in those columns (omit the fields entirely so DB default or previous value is not overwritten by null). Prefer omitting turn fields when driver.hasTurnTimer is false.

---

## Turn-based-only fields

For **turn-based games** (Tic-Tac-Toe, Connect 4), the following are set and used:

- move_turn_identity_id  
- move_turn_started_at  
- move_turn_seconds  
- turn_expires_at  
- host_timeout_strikes, challenger_timeout_strikes  

For **simultaneous games** (Rock Paper Scissors):

- move_turn_identity_id is null; move_turn_started_at, move_turn_seconds, turn_expires_at are **not** set by the app (omit in Ready→Live and intermission→next round). Timeout strikes are not used for RPS.

---

## Lifecycle fields

| Field | When set | Purpose |
|-------|----------|---------|
| status | create → waiting; join → ready; start/tick → live; move/tick/forfeit → finished/forfeited; cancel → canceled | Current phase. |
| countdown_started_at, countdown_seconds | On join | Pre-live countdown. |
| live_started_at | Ready→Live | When match went live. |
| round_intermission_until | Move (round end, series not over) | When intermission ends; tick clears and starts next round. |
| last_round_winner_identity_id | Move (round end) | During intermission; tick clears. |
| round_number, host_score, challenger_score | Move (round end), tick (next round only board/turn) | Series state. |
| winner_identity_id, win_reason, finished_at | Move (series over), tick (timeout), forfeit | Match end. |
| is_paused, paused_at, paused_by, pause_expires_at, pause_count_* | Pause / resume / tick | Pause state. |

---

## How match state is persisted

- **Writes**: All match state changes go through API routes using the Supabase **service role** client. No client-side writes to matches.
- **Reads**: Clients read via getRoomById (or equivalent) and/or realtime subscription. mapDbRowToRoom (lib/engine/match/types.ts) maps DB row → Room; sync policy decides whether to accept an incoming update.
- **Canonical names**: Prefer host_identity_id, challenger_identity_id, wager_amount, host_score, challenger_score, round_number, live_started_at, finished_at. Legacy names (host_wallet, wager, started_at, ended_at, host_round_wins, current_round) are fallbacks in mapping only.

---

## Schema and lifecycle interaction

- **Ready→Live**: Lifecycle builds payload from getReadyToLivePayload(room, now). For hasTurnTimer false, that payload must omit move_turn_* and turn_expires_at to avoid NOT NULL violations.
- **Intermission→next round**: Tick clears round_intermission_until and last_round_winner_identity_id, sets board_state and (for turn-based only) move_turn_* and turn_expires_at. round_number is already advanced by the move route when intermission was set.
- **Timeout**: Tick updates host_timeout_strikes or challenger_timeout_strikes and, at 3, sets winner_identity_id, win_reason, status finished, finished_at. Only for turn-based games (turn_expires_at is set).

When adding columns (e.g. for a new game), consider: nullable vs NOT NULL, and whether turn-based-only columns should be omitted for simultaneous games in all code paths (lifecycle, tick, move pipeline).
