# Move Route Refactor — Game-Driver Pipeline

## 1. Previous Weaknesses

- **Game-specific blocks**: The move route had three large branches (RPS, Connect 4, Tic-Tac-Toe), each with its own validation, apply logic, series update, intermission, and DB payload construction. Duplication and drift between games were high.
- **Mixed concerns**: Validation, move application, round result detection, series scoring, intermission setup, and next-round setup were interleaved in each branch instead of being layered.
- **Per-game board assumptions**: The route assumed grid games (column/index) and RPS (choice/side) in the same handler, so adding a new game type meant touching this large file in many places.
- **Repeated round/series logic**: `getSeriesUpdate` and the same intermission/series-finished DB payload pattern were copy-pasted for each game and each sub-case (win vs draw).
- **Weak observability**: Only a few `logRoomAction` calls; rejections and invalid states were not consistently logged.
- **No shared invariants**: Pause, intermission, and turn checks were repeated and easy to miss when adding a new path.

## 2. Refactor Plan

1. **Canonical driver result** — Extend `RoundOutcome` with `roundEnded` and `nextTurnIdentityId` so the route can branch only on “in-round” vs “round ended” without game-specific logic.
2. **Single move pipeline module** — Add `lib/rooms/move-pipeline.ts` with `getSeriesUpdate(room, roundWinner)` and `resolveMoveToDbUpdate(room, outcome, nowIso, nowMs, driver)` returning one of: `in_round`, `series_finished`, or `intermission` with a canonical DB payload.
3. **Move route as thin pipeline** — Load room → reject invalid state (not live, paused, intermission) → get driver → reject wrong turn if turn-based → build `{ move, side }` → `driver.applyMove(room, payload)` → on success, `resolveMoveToDbUpdate` → single `supabase.update(dbUpdate.payload)` → release match if series finished → return room.
4. **Canonical DB writes only** — All updates use only: `board_state`, `move_turn_identity_id`, `move_turn_started_at`, `move_turn_seconds`, `turn_expires_at`, `round_number`, `host_score`, `challenger_score`, `winner_identity_id`, `win_reason`, `round_intermission_until`, `last_round_winner_identity_id`, `status`, `updated_at`, `finished_at`, `ended_at`.
5. **Invariants and logging** — Reject move when not live, paused, or in intermission; when turn-based, reject if not current turn; log `move_rejected` (reason), `move_applied`, `round_ended_intermission`, `round_draw_intermission`, `series_finished`, `suspicious_driver_result`; guard on `newBoardState == null`.

## 3. Key Files Changed

| File | Change |
|------|--------|
| `lib/rooms/game-drivers.ts` | `RoundOutcome` extended with `roundEnded`, `nextTurnIdentityId`. C4/TTT/RPS drivers return them. Drivers accept `payload.move` (and `payload.side` for RPS) for a unified request shape. |
| `lib/rooms/move-pipeline.ts` | **New.** `getSeriesUpdate(room, roundWinner)`, `INTERMISSION_SECONDS`, `resolveMoveToDbUpdate(room, outcome, nowIso, nowMs, driver)` → `MoveDbUpdate` (`in_round` \| `series_finished` \| `intermission`) with canonical payloads. |
| `app/api/rooms/move/route.ts` | **Replaced.** Single flow: validate state → get driver → apply move via driver → resolve to DB update → persist once. No per-game branches; logging and invariants as above. |

## 4. How This Reduces Future Bugs for New Games

- **One place for round/series/intermission** — New games only implement `GameDriver.applyMove` and return the canonical `RoundOutcome`. All series scoring, intermission timing, and DB payloads are shared.
- **No hidden assumptions** — The route never branches on game type for persistence; the driver abstracts column/index/choice and turn vs simultaneous.
- **Easier to add a game** — Implement a driver (createInitialBoardState, getMoveSeconds, hasTurnTimer, applyMove with the same result shape), register it, and the move route works without further changes.
- **Consistent invariants** — Pause, intermission, and turn checks are applied once for all games, so new games automatically get the same protection.
- **Debuggability** — Structured logs (move_rejected, move_applied, round_ended_intermission, series_finished, suspicious_driver_result) make it clear where a move failed or how the match progressed.
