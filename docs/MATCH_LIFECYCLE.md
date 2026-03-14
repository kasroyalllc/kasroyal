# Match lifecycle

This document describes the match lifecycle model: statuses, phases, transitions, and the canonical DB fields involved. It also covers pause, intermission, Ready→Live, next-round progression, and series finish.

---

## Status and phases

**DB status values** (see lib/rooms/db-status.ts): `waiting` | `ready` | `countdown` | `live` | `finished` | `forfeited` | `canceled`.  
**UI status** (Room / ArenaMatch): `Waiting for Opponent` | `Ready to Start` | `Live` | `Finished`.  
MapDbRowToRoom maps DB status to UI (e.g. waiting → Waiting for Opponent, ready/countdown → Ready to Start, live → Live, finished/forfeited/canceled → Finished).

**Lifecycle phases** (lib/rooms/lifecycle.ts):

- **waiting**: No challenger yet (status Waiting for Opponent).
- **ready**: Challenger joined, status Ready to Start, countdown not yet started or not expired (treated as “ready” for transition checks).
- **countdown**: Status Ready to Start, countdown_started_at + countdown_seconds > now.
- **live_round**: Status Live, not in intermission (no round_intermission_until or it’s in the past).
- **intermission**: Status Live, round_intermission_until is set and now < round_intermission_until.
- **next_round_setup**: Conceptual; tick transitions from intermission to “next round” by clearing intermission and setting new board/turn.
- **finished**: Status Finished (DB finished/forfeited/canceled).

---

## Transitions

| From | To | How |
|------|----|-----|
| waiting | ready | Join route: set challenger, status ready, countdown_started_at, countdown_seconds, betting_closes_at. |
| ready | live | Start route or Tick route: when countdown has expired, getReadyToLivePayload + update matches (status live, board_state, move_turn_*, turn_expires_at, round 1, scores 0). |
| live | intermission | Move route: round ends (win/draw), series not over; move pipeline returns intermission; DB gets round_intermission_until (now + 5s), last_round_winner_identity_id, scores, round_number. |
| intermission | live (next round) | Tick route: when now >= round_intermission_until, clear round_intermission_until and last_round_winner_identity_id, set new board_state, move_turn_*, turn_expires_at. |
| live | finished | Move route (series_finished) or Tick route (timeout) or Forfeit route. |
| ready / live | finished | Forfeit route: set winner, win_reason, status finished, finished_at; release active_identity_matches. |
| waiting | canceled | Cancel route: host only, no challenger; status canceled; release active match. |

---

## Pause

- **When**: Only when status is Live and the match has a challenger. Only the player whose turn it is can pause. Each side has a limited number of pauses (e.g. 2) per match.
- **DB**: Pause route sets is_paused true, paused_at, paused_by (host/challenger), pause_expires_at (e.g. now + 30s), and increments pause_count_host or pause_count_challenger.
- **Tick**: When is_paused is true, tick does **not** apply turn timeout. When pause_expires_at has passed, tick clears is_paused, paused_at, paused_by, pause_expires_at and extends move_turn_started_at and turn_expires_at (full turn time from now).
- **Resume**: Resume route clears pause and optionally extends turn_expires_at. Same effect as tick when pause expires, but triggered by player.
- **Canonical fields**: is_paused, paused_at, paused_by, pause_expires_at, pause_count_host, pause_count_challenger.

---

## Intermission

- **Purpose**: Between rounds in BO3/BO5, a short delay (e.g. 5 seconds) before the next round starts. UI can show “X won Round N” and countdown.
- **When**: Move pipeline returns “intermission” when a round ends (win or draw) and the series is not over (scores have not reached required wins).
- **DB**: round_intermission_until (timestamptz), last_round_winner_identity_id. Optionally round_number already advanced (convention: round_number is the *next* round to play; last_round_winner is who won the previous round).
- **Tick**: When status is Live and round_intermission_until is set and now >= round_intermission_until, tick clears round_intermission_until and last_round_winner_identity_id, sets board_state to driver.createInitialBoardState(), sets move_turn_identity_id and turn_expires_at for the new round.
- **Canonical fields**: round_intermission_until, last_round_winner_identity_id.

---

## Ready → Live transition

- **Condition**: Room status is Ready to Start, challenger is set, countdown_started_at + countdown_seconds <= now, and getGameDriver(room.game) is not null.
- **Payload**: From getReadyToLivePayload(room, now): status live, live_started_at, started_at, betting_open false, board_state from driver.createInitialBoardState(), move_turn_identity_id (host if hasTurnTimer), move_turn_started_at, move_turn_seconds, turn_expires_at, round_number 1, host_score 0, challenger_score 0, updated_at.
- **Who**: Start route (POST when user clicks start or client polls) or Tick route (when client/server calls tick and countdown has expired). Both use the same payload so behavior is identical.

---

## Next-round progression

- After intermission, **tick** sets the next round’s board and turn. It does **not** increment round_number in the intermission payload from the move route; the move route already set round_number to the next round when it wrote intermission. So when tick runs, the row already has the correct round_number; tick only clears intermission and sets board_state and move_turn_*.
- **Series scoring**: getSeriesUpdate in move-pipeline computes new host_score and challenger_score when a round ends. For “next round”, currentRound in SeriesUpdate is the next round index (1-based). Move route writes host_score, challenger_score, round_number (and intermission); tick only starts that round’s board.

---

## Series finish logic

- **getSeriesUpdate(room, roundWinner)** (move-pipeline):
  - bestOf 1: one round; if roundWinner null (draw), series over, winner null, winReason "draw". If roundWinner set, series over, winner that side, winReason "win".
  - bestOf 3: first to 2 wins; bestOf 5: first to 3. Increment host/challenger score by roundWinner; series over when either score >= required; winner and winReason set accordingly.
- **Move route**: When series_finished, update status finished, winner_identity_id, win_reason, board_state, round_number, host_score, challenger_score, finished_at, ended_at, updated_at; release active_identity_matches; write match_events (round_won/round_draw, match_finished) and match_rounds.
- **Tick (timeout)**: When turn timeout causes match loss, tick sets winner to the other side, win_reason "timeout", status finished, finished_at; release active match; write match_finished and one match_rounds row (result_type timeout).
- **Forfeit**: Forfeit route sets winner (opponent), win_reason "forfeit", status finished; write forfeit + match_finished events and one match_rounds row (result_type forfeit).

---

## Canonical DB fields (matches)

| Field | Purpose |
|-------|---------|
| status | waiting \| ready \| countdown \| live \| finished \| forfeited \| canceled |
| best_of | 1, 3, or 5 |
| round_number | Current (or next) round, 1-based |
| host_score, challenger_score | Round wins (canonical; legacy host_round_wins/challenger_round_wins read from these in mapping) |
| board_state | JSONB; shape per game (connect4-live, ttt-live, rps-live) |
| move_turn_identity_id | Whose turn (null for RPS) |
| move_turn_started_at, move_turn_seconds, turn_expires_at | Turn timer; tick uses turn_expires_at for timeout |
| host_timeout_strikes, challenger_timeout_strikes | Incremented on turn timeout; match loss at 3 |
| winner_identity_id, win_reason, finished_at | Set when match ends |
| is_paused, paused_at, paused_by, pause_expires_at, pause_count_host, pause_count_challenger | Pause state |
| round_intermission_until, last_round_winner_identity_id | Intermission between rounds |
| countdown_started_at, countdown_seconds, betting_closes_at | Pre-live countdown |
| live_started_at, updated_at | Timestamps |

The UI and API use these as the source of truth; legacy columns (host_wallet, wager, started_at, ended_at) are only for backward-compatible reads in mapDbRowToRoom where new columns are missing.
