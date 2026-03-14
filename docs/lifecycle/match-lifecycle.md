# Match lifecycle

This document details the match lifecycle: ready→live transition, round lifecycle, intermission, series progression (BO1/BO3/BO5), timeout handling, pause/resume, forfeit, and special cases for turn-based vs simultaneous games.

See also: [../MATCH_LIFECYCLE.md](../MATCH_LIFECYCLE.md) (flat reference), [../architecture/system-architecture.md](../architecture/system-architecture.md).

---

## Status and phases

**DB status** (`lib/rooms/db-status.ts`): `waiting` | `ready` | `countdown` | `live` | `finished` | `forfeited` | `canceled`.

**UI status** (Room / ArenaMatch): `Waiting for Opponent` | `Ready to Start` | `Live` | `Finished`. mapDbRowToRoom maps DB → UI (e.g. ready/countdown → Ready to Start).

**Lifecycle phases** (`lib/rooms/lifecycle.ts`): waiting, ready, countdown, live_round, intermission, next_round_setup, finished.

---

## Ready → Live transition

- **Condition**: Status Ready to Start, challenger set, `countdown_started_at + countdown_seconds <= now`, and `getGameDriver(room.game)` not null.
- **Payload**: `getReadyToLivePayload(room, now)` in `lib/rooms/lifecycle.ts`:
  - **Turn-based (TTT, C4)**: status live, live_started_at, betting_open false, board_state from driver, **move_turn_identity_id** (host), move_turn_started_at, move_turn_seconds, turn_expires_at, round_number 1, host_score 0, challenger_score 0, updated_at.
  - **Simultaneous (RPS)**: Same **except** no move_turn_identity_id, move_turn_started_at, move_turn_seconds, or turn_expires_at (driver.hasTurnTimer false). Omitting these avoids DB NOT NULL errors on move_turn_seconds.
- **Who**: Start route or Tick route; both use the same payload.

---

## Round lifecycle

1. **Live round**: Players move (turn-based: one at a time; simultaneous: both choose then resolve).
2. **Round ends**: Move pipeline returns round outcome (win/draw). getSeriesUpdate computes new scores; if series not over, pipeline returns **intermission**.
3. **Intermission**: DB gets round_intermission_until (now + INTERMISSION_SECONDS, 8s), last_round_winner_identity_id, updated scores and round_number. No moves allowed during intermission.
4. **Next round**: When `now >= round_intermission_until`, **tick** clears intermission, sets board_state to driver.createInitialBoardState(), and sets move_turn_* for the new round (turn-based only). For RPS, board is reset so both hostChoice and challengerChoice are null.

---

## Intermission behavior

- **Duration**: 8 seconds (`INTERMISSION_SECONDS` in `lib/rooms/move-pipeline.ts`).
- **Purpose**: Short delay between rounds in BO3/BO5 so UI can show “X won Round N” and countdown.
- **DB fields**: round_intermission_until, last_round_winner_identity_id.
- **Tick**: When status is Live and now >= round_intermission_until, tick clears those fields, sets new board_state (and turn/timer for turn-based games), emits next_round_started.

---

## Series progression (BO1 / BO3 / BO5)

- **getSeriesUpdate(room, roundWinner)** in move-pipeline:
  - bestOf 1: one round; draw → series over, winner null; win → series over, winner set.
  - bestOf 3: first to 2 wins; bestOf 5: first to 3. Scores increment; series over when either score >= required.
- **Move route**: On series_finished, updates status finished, winner_identity_id, win_reason, finished_at; releases active_identity_matches; writes match_events and match_rounds.
- **Intermission**: Only when a round ends and series is **not** over (scores have not reached required wins).

---

## Timeout handling

- **Turn-based only**: Tick compares now to turn_expires_at. If expired, tick applies one timeout strike (host_timeout_strikes or challenger_timeout_strikes). At 3 strikes, match ends (winner = other side, win_reason timeout); match_rounds row with result_type timeout.
- **RPS**: No turn timer; hasTurnTimer false. Tick does not apply turn timeout for RPS.

---

## Pause / resume

- **When**: Only when Live; only the player whose turn it is can pause. Each side has a limited number of pauses per match.
- **DB**: Pause route sets is_paused, paused_at, paused_by, pause_expires_at, increments pause_count_host or pause_count_challenger.
- **Tick**: When is_paused, tick does **not** apply turn timeout. When pause_expires_at has passed, tick clears pause and extends turn_expires_at.
- **Resume**: Resume route clears pause and extends turn (same effect as tick when pause expires).

---

## Forfeit logic

- Forfeit route sets winner (opponent), win_reason "forfeit", status finished, finished_at; releases active_identity_matches; writes forfeit + match_finished events and one match_rounds row (result_type forfeit).

---

## Special cases

### Turn-based games (Tic-Tac-Toe, Connect 4)

- One move_turn_identity_id; move route rejects if caller is not the turn holder.
- Driver returns nextTurnIdentityId when round has not ended. Tick applies turn timeout (strikes, then match loss).
- Ready→Live payload **includes** move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at.

### Simultaneous games (Rock Paper Scissors)

- **hasTurnTimer** false. No move_turn_identity_id; both players can submit.
- Driver accepts payload with side and choice; when both hostChoice and challengerChoice are set, resolves winner and returns roundEnded true.
- Ready→Live payload must **omit** move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at (DB move_turn_seconds can be NOT NULL).
- Between rounds, board_state is reset to hostChoice: null, challengerChoice: null so both can pick again. Client must receive the updated room (sync policy and intermission-end refresh ensure this).

---

## Canonical DB fields (matches) for lifecycle

| Field | Purpose |
|-------|---------|
| status | waiting \| ready \| countdown \| live \| finished \| forfeited \| canceled |
| best_of, round_number, host_score, challenger_score | Series state |
| board_state | Game-specific JSONB |
| move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at | Turn timer (null for RPS) |
| host_timeout_strikes, challenger_timeout_strikes | Timeout strikes |
| round_intermission_until, last_round_winner_identity_id | Intermission |
| is_paused, paused_at, paused_by, pause_expires_at, pause_count_* | Pause |
| countdown_started_at, countdown_seconds | Pre-live countdown |
| winner_identity_id, win_reason, finished_at | Match end |
