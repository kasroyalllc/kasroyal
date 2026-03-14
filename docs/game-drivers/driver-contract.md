# Game driver contract

This document defines the driver interface requirements, RoundOutcome shape, and the differences between turn-based and simultaneous games. Use it when adding new games (e.g. Battleship, Darts).

See also: [../GAME_RUNTIME.md](../GAME_RUNTIME.md) (flat reference), [../architecture/system-architecture.md](../architecture/system-architecture.md).

---

## Driver interface

Defined in **lib/rooms/game-drivers.ts**. Each driver implements:

| Member | Type | Requirement |
|--------|------|-------------|
| gameKey | CanonicalGameKey | "Tic-Tac-Toe" \| "Connect 4" \| "Rock Paper Scissors" |
| gameType | GameType | Same value for engine/match types |
| createInitialBoardState() | () => unknown | Initial board for a new round (or match start). Stored in matches.board_state. |
| getMoveSeconds() | () => number | Seconds per turn; 0 = no turn timer (RPS). |
| hasTurnTimer | boolean | true = turn-based (TTT, C4); false = simultaneous (RPS). |
| applyMove(room, payload) | (Room, Record<string, unknown>) => ApplyMoveResult | Returns RoundOutcome or { error: string }. |

---

## createInitialBoardState

- Returns the board state for a new round. Shape is game-specific (Connect4BoardState, TttBoardState, RpsBoardState in `lib/engine/match/types.ts`).
- Used by: Ready→Live transition (lifecycle.getReadyToLivePayload) and intermission→next round (tick route).
- For RPS: must return `{ mode: "rps-live", hostChoice: null, challengerChoice: null, revealed: false, winner: null }` so both players can choose again each round.

---

## applyMove and RoundOutcome

When a move is accepted, the driver returns a **RoundOutcome**:

| Field | Type | Meaning |
|-------|------|---------|
| newBoardState | unknown | Board after the move (written to DB). |
| roundWinner | "host" \| "challenger" \| null | Who won the round (null for draw or round not ended). |
| isDraw | boolean | Round ended in a draw. |
| isBoardFull | boolean | For grid games, board full; for RPS, both chose. |
| roundEnded | boolean | This move ended the round (drives intermission or series_finished). |
| nextTurnIdentityId | string \| null | For turn-based when round not ended, identity id of next mover; null for RPS or when round ended. |
| winReason? | string | Optional (e.g. RPS "Rock crushes Scissors"). |

The move pipeline uses only this shape; it does not branch on game type. It calls getSeriesUpdate and resolveMoveToDbUpdate to produce: in_round, intermission, or series_finished.

---

## resolveRound / series behavior

- There is no separate “resolveRound” function. Round resolution is inside **applyMove**: the driver returns roundEnded, roundWinner, isDraw. The **move pipeline** (resolveMoveToDbUpdate, getSeriesUpdate) handles series scoring, intermission, and match finish.
- **Series**: getSeriesUpdate(room, roundWinner) in move-pipeline computes new scores and series-over; the move route writes host_score, challenger_score, round_number, and on series over winner_identity_id, win_reason, status finished.

---

## hasTurnTimer expectations

| hasTurnTimer | Turn-based | Simultaneous (e.g. RPS) |
|--------------|------------|--------------------------|
| true | One move_turn_identity_id; move route enforces “current turn”; tick applies turn timeout. | — |
| false | — | Both sides can submit; no move_turn_identity_id in Ready→Live or in payloads; tick does not apply turn timeout. |

**Critical**: For hasTurnTimer false, the **Ready→Live payload** must **not** include move_turn_identity_id, move_turn_started_at, move_turn_seconds, or turn_expires_at. The DB column move_turn_seconds may be NOT NULL; writing null for RPS caused tick 500s. Lifecycle builds the payload only with turn fields when `driver.hasTurnTimer` is true.

---

## Turn-based vs simultaneous

**Turn-based (TTT, Connect 4)**

- One move_turn_identity_id; move route rejects if caller is not the turn holder.
- Driver returns nextTurnIdentityId when round has not ended. Tick compares now to turn_expires_at and applies timeout strike or match loss.
- Ready→Live and intermission→next round payloads **include** move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at.

**Simultaneous (Rock Paper Scissors)**

- hasTurnTimer false. No move_turn_identity_id; both players submit. Driver accepts payload with side and choice; when both hostChoice and challengerChoice are set, resolves winner and returns roundEnded true.
- No turn_expires_at; tick does not apply turn timeout for RPS.
- Ready→Live and intermission→next round payloads **omit** all turn fields. Board state is reset each round so both choices are null.

---

## Adding a new game

1. **Board state and types**: Add board state shape in `lib/engine/match/types.ts` (and `lib/rooms/game-board.ts` if needed).
2. **Game logic**: Implement initial state, apply move, winner/draw/full checks. One move can end the round or not; if not, return nextTurnIdentityId (turn-based).
3. **Driver**: In `lib/rooms/game-drivers.ts`, add driver and register in DRIVERS and getGameDriver. Set hasTurnTimer correctly; for simultaneous, omit turn fields in lifecycle (already conditional on hasTurnTimer).
4. **Constants**: In `lib/engine/game-constants.ts`, add getMoveSecondsForGame if the game has a turn timer.
5. **Lifecycle**: getReadyToLivePayload uses getGameDriver(room.game). Normalize game type if needed (e.g. casing) in lifecycle so the driver is found.
6. **No route changes**: Move route, tick route, and move pipeline stay game-agnostic.
