# KasRoyal — Next 3 Games Expansion: Implementation Plan (Phase 1)

This document is the **architecture audit and implementation plan** for adding **Darts**, **Checkers**, and **Battleship** to KasRoyal. It was produced after inspecting the shared driver layer, move pipeline, runtime, lifecycle, move/tick routes, match page, and room adapter.

---

## 1. How Each Game Maps to the Shared Architecture

### 1.1 Darts

| Aspect | Design |
|--------|--------|
| **Board state shape** | `{ mode: "darts-live", startingScore: 301, hostScore: number, challengerScore: number, currentTurn: "host" \| "challenger", throwsThisTurn: Array<{ segment: string, multiplier: 1\|2\|3, score: number }>, turnDeadlineTs: number \| null }`. One leg = one round. |
| **Move payload** | `{ move: { throws: Array<{ segment: string, multiplier: 1\|2\|3 }> }, side: "host" \| "challenger" }`. Up to 3 throws per turn. Segment e.g. "S20", "D10", "T15", "BULL". |
| **Player turn model** | Turn-based. `move_turn_identity_id` = current player. After applying move, if round not ended, `nextTurnIdentityId` = opponent. |
| **Round end condition** | One player reaches exactly 0 with a double (or as per ruleset). Bust = score goes below 0 or to 0 without valid finish → turn ends, no score change for that throw sequence, turn passes. |
| **Full match/series** | One darts leg = one round. BO3/BO5 = first to 2/3 legs. |
| **Timeout behavior** | Turn timer per turn; on timeout treat as pass (0 score this turn) and hand turn to opponent. Use existing strike logic. |
| **Draw** | Not used for 301; round always has a winner. If we ever support tie-break legs, treat as round draw. |
| **Spectators** | See both scores, current turn, throws this turn, full throw history (stored in state or events). No hidden info. |
| **Hidden information** | None. |

**Ruleset commitment:** 301, double-in optional (we'll start double-out only for simplicity), exact finish required, bust = score reverts to start-of-turn value and turn passes. Up to 3 throws per turn.

---

### 1.2 Checkers

| Aspect | Design |
|--------|--------|
| **Board state shape** | `{ mode: "checkers-live", board: CheckerCell[][], turn: "host" \| "challenger", turnDeadlineTs: number \| null }`. 8×8. Cell: `null` \| `{ side: "host"\|"challenger", king: boolean }`. |
| **Move payload** | `{ move: { from: { r, c }, to: { r, c } } or { from: { r, c }, jumps: [{ r, c }, ...] }, side: "host" \| "challenger" }`. Multi-jump as one move. |
| **Player turn model** | Turn-based. `move_turn_identity_id` = current player. After move, `nextTurnIdentityId` = opponent (or same if mandatory capture chain continues—we treat full chain as one move). |
| **Round end condition** | Win: opponent has no pieces or no legal moves. Draw: stalemate (no legal moves) or agreed draw (optional), or N-move rule if we add it. |
| **Full match/series** | One full checkers game = one round. BO3/BO5 = first to 2/3 games. |
| **Timeout behavior** | Per-turn timer; timeout = forfeit turn (or loss, policy TBD—start with forfeit turn / strike). |
| **Draw** | Stalemate = draw round. Optional: 40-move rule, repetition (later). |
| **Spectators** | Full board, last move highlight, kings marked, current turn, captured counts derivable. No hidden info. |
| **Hidden information** | None. |

**Ruleset commitment:** American checkers (8×8). Mandatory captures; if multiple captures available, any legal full chain. King moves diagonally any distance; man moves forward one or capture. King promotion on last rank. Win = no pieces or no legal moves. Draw = stalemate. We will not implement forced draw by repetition in v1 (document as limitation).

---

### 1.3 Battleship

| Aspect | Design |
|--------|--------|
| **Board state shape** | **Authoritative (server-only / never sent raw to client):** `{ mode: "battleship-live", phase: "placement" \| "battle", turn: "host" \| "challenger", hostShips: ShipPlacement[], challengerShips: ShipPlacement[], hostAttacks: { r, c }[], challengerAttacks: { r, c }[], hostResults: Record<string, "hit"\|"miss"\|"sunk">, challengerResults: Record<string, "hit"\|"miss"\|"sunk">, turnDeadlineTs: number \| null }`. Grid keys e.g. "r0c1". |
| **Move payload** | Placement: `{ move: { placements: { shipId: string, cells: { r, c }[] }[] }, side: "host" \| "challenger" }`. Attack: `{ move: { attack: { r, c } }, side: "host" \| "challenger" }`. |
| **Player turn model** | Placement: both place (we can do alternating or simultaneous; alternating is simpler and reuses turn). Battle: turn-based; after attack, turn passes. |
| **Round end condition** | All of opponent's ships sunk. One full game = one round. |
| **Full match/series** | One Battleship game = one round. BO3/BO5 = first to 2/3 games. |
| **Timeout behavior** | Per-turn timer in placement and battle; timeout = forfeit turn (placement) or miss (battle). |
| **Draw** | Not applicable (elimination). |
| **Spectators** | See: phase, current turn, attack grid (hits/misses/sunks per cell), no ship positions until match end. Optional: after match end, full reveal via separate endpoint or event. |
| **Hidden information** | **Critical.** Ship positions are hidden from opponent and spectators during play. Host must not see challenger ships; challenger must not see host ships; spectators must not see either. |

**Visibility (mandatory):** Current architecture has **no per-viewer projection**. The match page and all clients receive the same `board_state` (via Supabase or any API that returns the match row). So we **must not** store raw Battleship state with ship positions in `board_state` and send it to the client. Two options:

- **Option A — Projection API:** Store full state in `board_state`; add a **room-for-viewer API** (e.g. `GET /api/rooms/[id]` or `/api/arena/match/[id]/room`) that loads the room server-side, computes `projectBoardStateForViewer(room, game, viewerIdentityId)` and returns the room with `board_state` replaced by the projected view. The match page, for Battleship, must **only** fetch room via this API (and on realtime updates, re-fetch from this API instead of trusting the subscription payload). No raw `board_state` with ships ever sent to client.
- **Option B — Split storage:** Store only public Battleship state in `board_state` (phase, turn, attack results, no ship positions). Store ship positions in a separate server-only store (e.g. `match_hidden_state` table or server-side cache keyed by match id). Move route reads hidden state for validation only. Clients never receive ship positions until we explicitly reveal after match end.

**Recommendation:** Option A. Single source of truth in `board_state`; one projection function; room-for-viewer API used for Battleship (and can be used for all games for consistency). Realtime: on `matches` update, client refetches room from the viewer API for Battleship so it never renders raw state.

---

## 2. Risks and Mitigations

| Game | Risk | Mitigation |
|------|------|------------|
| **Darts** | Score/bust logic bugs | Single place for applyMove; unit-test bust and exact finish. |
| **Darts** | Turn timer / turn handoff | Reuse existing turn timer and move pipeline; no RPS-style dual move. |
| **Checkers** | Mandatory capture and chain captures | Implement full legal-move generator; reject illegal moves in driver. |
| **Checkers** | King movement and multi-step | Legal moves include multi-jump as one move; validate entire path. |
| **Checkers** | Draw detection | Ship stalemate only in v1; document no repetition/50-move in v1. |
| **Battleship** | **Hidden-state leakage** | Never send unprojected `board_state` to client for Battleship. Implement projection + room-for-viewer API before shipping. |
| **Battleship** | Placement validation (overlap, shape, count) | Validate in driver; standard fleet (e.g. 5 ships, fixed sizes). |
| **All** | Route special-casing | No game-specific branches in move route beyond existing `hasTurnTimer` and payload shape; all game logic in driver. |
| **All** | Board reset / intermission | Tick and lifecycle use `driver.createInitialBoardState()`; each new game implements it for clean round resets. |

---

## 3. Shared Helpers Needed

- **Coordinates:** None beyond existing `{ r, c }` or `{ row, col }`; Checkers and Battleship can use same convention.
- **Board serializers:** Not required for persistence (we store JSON); optional for logging (e.g. compact string for checkers).
- **Move validators:** Each driver implements validation inside `applyMove` (returns error outcome or applies and returns RoundOutcome). No shared validator needed beyond driver contract.
- **Hidden-state sanitizer (Battleship):** `projectBoardStateForViewer(room, game, viewerIdentityId)`: if game !== Battleship return `room.board_state`; else return object with phase, turn, attack grids (and optionally sunk ship list without positions), no ship positions. Used only by room-for-viewer API.
- **Status display helpers:** Optional small helpers per game for "current score", "remaining score", "last move" for timeline/header; can live next to driver or in a small game-status module.
- **Game-specific projection:** Only Battleship; see above.

---

## 4. Recommended Rollout Order

**Order: Darts → Checkers → Battleship.**

- **Darts** has no hidden state, no complex move legality, and fits the existing turn-based pipeline with minimal new concepts (score, throws, bust). Fastest to ship and validates the pipeline.
- **Checkers** is fully visible but has higher complexity (legal moves, captures, kings). Doing it second avoids blocking Battleship on checkers and avoids mixing hidden-state work with complex rules.
- **Battleship** last: implement **visibility/projection layer first** (room-for-viewer API + `projectBoardStateForViewer`), then add Battleship driver and UI so we never ship a version that leaks ship positions.

If the codebase already had a projection layer, Battleship could be reordered; given it does not, the recommended sequence stands.

---

## 5. Implementation Checklist (High Level)

1. **Types:** Extend `GameType` and board state types in `lib/engine/match/types.ts` (and match-types if needed). Extend `CanonicalGameKey` and driver registry in `lib/rooms/game-drivers.ts`.
2. **Darts:** Add Darts board state type, Darts driver (`createInitialBoardState`, `applyMove` with 301 + bust + exact finish), `getMoveSeconds` in game-constants, match page branch for Darts (board + move controls + permissions). No route changes beyond using existing move pipeline.
3. **Checkers:** Add Checkers board state type, legal-move generator, Checkers driver (apply move, win/draw detection), game-constants, match page branch. No route changes.
4. **Battleship foundation:** Add `projectBoardStateForViewer(room, game, viewerIdentityId)` and `GET /api/rooms/[id]/room` (or equivalent) that returns room with projected `board_state` for the authenticated or passed viewer. For non-Battleship games, projection is identity. Match page for Battleship: fetch room only via this API; on realtime, refetch from this API.
5. **Battleship:** Add Battleship board state type (full shape), placement and attack validation, Battleship driver, game-constants, match page branch using projected state only.
6. **Lifecycle / tick:** Ensure `getGameDriver(room.game)` and `driver.createInitialBoardState()` are used for new games (already generic). Tick intermission already uses driver; no game-specific tick logic.
7. **Events / history:** Use existing `move_applied`, `round_won`, `round_draw`, `intermission_started`, `next_round_started`, `match_finished`. Add game-specific payload only where needed for display (e.g. last throw, last move); no change to event names or pipeline.
8. **Verification:** Re-test TTT and Connect 4 (no regressions). Test Darts: turn order, score, bust, exact finish, BO3/BO5. Test Checkers: moves, captures, kings, win/draw, BO3/BO5. Test Battleship: placement, attacks, hit/miss/sunk, no ship leak to opponent/spectator, BO3/BO5.

---

## 6. Files to Touch (Summary)

| Area | Files |
|------|--------|
| Types | `lib/engine/match/types.ts`, possibly `lib/engine/match-types.ts` |
| Drivers | `lib/rooms/game-drivers.ts` |
| Board init | `lib/rooms/game-board.ts` (if still used for createInitialBoardState fallback; else driver only) |
| Constants | `lib/engine/game-constants.ts` |
| Runtime | `lib/engine/match-runtime.ts` (CANONICAL_GAME_KEYS, toCanonicalGameKey) |
| Visibility | New: `lib/rooms/board-projection.ts` or similar; new API route `app/api/rooms/[id]/room/route.ts` or `app/api/arena/match/[id]/room/route.ts` |
| Move/tick | No structural changes; move route already uses driver; tick uses driver for intermission |
| Lifecycle | Uses getGameDriver; no change |
| Match page | `app/arena/match/[id]/page.tsx`: add branches for Darts, Checkers, Battleship (board UI, move permissions, and for Battleship use room-from-API with projection) |
| Room adapter | Optional: call projection in adapter when game is Battleship and viewer known; alternatively keep projection only in API and have page fetch from API for Battleship |

---

## 7. Limitations to Document

- **Checkers:** No forced draw by repetition or 50-move rule in v1; stalemate = draw. Optional future: N-move or repetition.
- **Battleship:** After match end, full board reveal (for spectators) can be a follow-up; not required for launch if projection is correct during play.
- **Darts:** Single ruleset (301) only; no 501 or cricket in this sprint.

This plan is the Phase 1 deliverable. Implementation will follow Phases 2–8 (game design standards, implementation rules, UI/UX, data/spectator, timers/series, events, testing) as specified in the task.
