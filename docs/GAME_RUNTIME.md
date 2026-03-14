# Game runtime

This document describes the current game runtime contract: supported games, the GameDriver interface, round outcome shape, turn-based vs simultaneous games, and how to add new games. It also explains how Rock Paper Scissors fits without becoming special-case chaos.

---

## Supported games

| Game | Driver key | Turn-based | Turn timer | Round end |
|------|------------|------------|------------|-----------|
| **Tic-Tac-Toe** | Tic-Tac-Toe | Yes (X/O) | Yes | Win or full board (draw). |
| **Connect 4** | Connect 4 | Yes (host/challenger) | Yes | Win or full board (draw). |
| **Rock Paper Scissors** | Rock Paper Scissors | No (both choose) | No | When both choices set; resolve to host/challenger/draw. |

Chess Duel is **not** yet in the driver layer; `getGameDriver("Chess Duel")` returns null and start/move routes do not support it.

---

## GameDriver interface

Defined in **lib/rooms/game-drivers.ts**. Each driver implements:

```ts
type GameDriver = {
  gameKey: CanonicalGameKey   // "Tic-Tac-Toe" | "Connect 4" | "Rock Paper Scissors"
  gameType: GameType          // Same value for engine/match types
  createInitialBoardState(): unknown
  getMoveSeconds(): number   // 0 = no turn timer (RPS)
  hasTurnTimer: boolean      // true for C4 and TTT, false for RPS
  applyMove(room: Room, payload: Record<string, unknown>): ApplyMoveResult
}
```

- **createInitialBoardState**: Returns the board state for a new round (or match start). Stored in `matches.board_state`. Shape is game-specific (see engine/match types: Connect4BoardState, TttBoardState, RpsBoardState).
- **getMoveSeconds**: Used by lifecycle and move route to set `turn_expires_at` and by tick for timeout. RPS returns a number from config but `hasTurnTimer` is false so no turn timer is set.
- **hasTurnTimer**: If true, the move route enforces “current turn” and tick handles turn timeout (strikes, then match loss). If false, both sides can submit without turn check (RPS: host and challenger each submit a choice).
- **applyMove(room, payload)**: Returns either a **RoundOutcome** or `{ error: string }`. Payload shape is game-specific (e.g. `move`/`index` for TTT, `move`/`column` for C4, `choice`/`side` for RPS).

---

## Round outcome shape

When a move is accepted, the driver returns a **RoundOutcome**:

```ts
type RoundOutcome = {
  newBoardState: unknown
  roundWinner: "host" | "challenger" | null
  isDraw: boolean
  isBoardFull: boolean
  roundEnded: boolean
  nextTurnIdentityId: string | null
  winReason?: string
}
```

- **newBoardState**: The board after the move (written to DB).
- **roundWinner**: Who won the round (null for draw or round not yet ended).
- **isDraw**: True when the round ended in a draw (BO1 can end match; BO3/BO5 add to scores as draw).
- **isBoardFull**: For grid games, board full; for RPS, both chose (round always ends).
- **roundEnded**: True when this move ended the round (winner, draw, or both chose in RPS). Drives whether the move pipeline produces intermission or series_finished.
- **nextTurnIdentityId**: For turn-based games when round did not end, the identity id of the next mover. Null for RPS or when round ended. Used to set move_turn_identity_id and turn_expires_at.
- **winReason**: Optional (e.g. RPS “Rock crushes Scissors”); can be stored or shown in UI.

The **move pipeline** uses only this shape: it does not branch on game type. It calls **getSeriesUpdate(room, roundWinner)** and then **resolveMoveToDbUpdate** to get one of: in_round, intermission, or series_finished, with a single DB payload and optional roundRecord for match_rounds.

---

## Turn-based vs simultaneous

- **Turn-based (TTT, C4)**: One move_turn_identity_id; move route rejects if the caller is not the turn holder. Driver returns nextTurnIdentityId when round has not ended. Tick compares now to turn_expires_at and applies timeout strike or match loss.
- **Simultaneous (RPS)**: hasTurnTimer false. No move_turn_identity_id; both players can submit. Driver accepts payload with `side` and `choice`; when both hostChoice and challengerChoice are set, it resolves winner and returns roundEnded true. No turn timeout; round always ends after both choices.

So RPS is not “special cased” in the route: it uses the same move route and move pipeline. The only differences are (1) no turn check in the route, (2) driver returns roundEnded only when both have chosen, and (3) no turn_expires_at / timeout in tick for RPS (tick can skip timeout logic when move_turn_identity_id is null or game is RPS).

---

## How new games should be added

1. **Board state and types**: Add any new board state shape in `lib/engine/match/types.ts` (and game-board if needed).
2. **Game logic**: In `lib/rooms/game-board.ts` (or equivalent), implement initial state, apply move, and winner/draw/full checks. Keep the same conceptual contract: one “move” can end the round or not; if not, return next turn.
3. **Driver**: In `lib/rooms/game-drivers.ts`, add a new driver (createInitialBoardState, getMoveSeconds, hasTurnTimer, applyMove) and register it in the DRIVERS map and in getGameDriver. Use CanonicalGameKey and GameType.
4. **Constants**: In `lib/engine/game-constants.ts` (or equivalent), add getMoveSecondsForGame for the new game if it has a turn timer.
5. **Lifecycle**: getReadyToLivePayload in lifecycle.ts uses getGameDriver(room.game); once the driver exists, start and tick will create the correct initial board and turn.
6. **No route changes**: Move route, tick route, and move pipeline stay game-agnostic; they only call driver.applyMove and resolveMoveToDbUpdate.

---

## RPS vs grid games (no special-case chaos)

- **Same pipeline**: RPS uses the same move route and resolveMoveToDbUpdate. The driver returns RoundOutcome with roundEnded true only when both have chosen; then getSeriesUpdate and intermission/series_finished behave the same.
- **No turn in DB**: For RPS, move_turn_identity_id stays null; turn_expires_at is not set. So tick does not apply turn timeout for that match. Pause and intermission still work (intermission is between rounds, not between “choices”).
- **Payload**: Route passes `{ move, side }`; RPS driver reads `payload.choice` and `payload.side` to set hostChoice or challengerChoice. Other games read payload.move (index/column). So the route stays generic; only the driver interprets payload.
- **Board state**: RpsBoardState has hostChoice, challengerChoice, revealed, winner. Driver returns newBoardState with revealed true and winner set when both chose. UI can show “choose” vs “reveal” based on board state; no extra flags in the route.

This keeps RPS inside the same contract (one driver, one outcome shape, one pipeline) so the codebase does not branch on “if RPS then …” outside the driver and UI.
