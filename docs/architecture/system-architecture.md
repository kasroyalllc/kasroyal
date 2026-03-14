# System architecture

This document describes the KasRoyal system architecture: match lifecycle states, server tick flow, room state synchronization, realtime events, driver architecture, and how new games integrate.

See also: [../ARCHITECTURE.md](../ARCHITECTURE.md) (flat reference), [../lifecycle/match-lifecycle.md](../lifecycle/match-lifecycle.md), [../game-drivers/driver-contract.md](../game-drivers/driver-contract.md).

---

## High-level flow

```
Create → Join → (countdown) → Live → [moves / tick] → intermission or series finish → Finished
                ↑                    ↑
                start or tick         move route (driver + pipeline); tick (intermission expiry, timeout, pause)
```

- **Next.js (App Router)** serves pages and API routes. API routes are the only writers to Supabase for match state.
- **Supabase** is the source of truth: matches, match_events, match_rounds, match_messages, profiles, bets, active_identity_matches. Realtime broadcasts changes.
- **Game logic** is centralized in **game drivers** and a **move pipeline** so all supported games share the same lifecycle, series, and intermission behavior.

---

## Match lifecycle states

| DB status   | UI status             | Meaning |
|-------------|------------------------|---------|
| waiting     | Waiting for Opponent   | No challenger yet. |
| ready       | Ready to Start         | Challenger joined; countdown running or not started. |
| countdown   | Ready to Start         | Same as ready; countdown_started_at + countdown_seconds > now. |
| live        | Live                   | Match in progress (round or intermission). |
| finished    | Finished               | Match over (win/draw/timeout/forfeit). |
| forfeited   | Finished               | Match over by forfeit. |
| canceled    | Finished               | Host canceled before challenger joined. |

**Lifecycle phases** (derived in `lib/rooms/lifecycle.ts`): waiting, ready, countdown, live_round, intermission, next_round_setup, finished.

---

## Server tick flow

The **tick** route (`POST /api/rooms/tick`) is the server’s time-based transition handler. It is idempotent and DB-authoritative.

1. **Ready → Live**: When status is Ready to Start, countdown has expired, and a game driver exists, tick (or start) applies `getReadyToLivePayload(room, now)` and updates the match: status live, board_state, move_turn_* (only for turn-based games), round 1, scores 0.
2. **Intermission → next round**: When status is Live and `round_intermission_until` is set and `now >= round_intermission_until`, tick clears intermission, sets `board_state` to `driver.createInitialBoardState()`, and sets move_turn_* for the new round (turn-based only).
3. **Turn timeout**: When Live, not paused, and `now >= turn_expires_at`, tick applies a timeout strike (or match loss at 3 strikes) and updates turn to the other player (or finishes match).
4. **Pause expiry**: When paused and `now >= pause_expires_at`, tick clears pause and extends turn_expires_at.

Tick does **not** compute series outcome; it only advances time-based state (countdown, intermission, turn timeout, pause).

---

## Room state synchronization

- **Writes**: All match state changes go through API routes using the Supabase **service role** client. Clients never write directly to matches.
- **Reads**: Clients read via refetch (e.g. `getRoomById`) or realtime subscription. The match page keeps a single `ArenaMatch` state; updates come from mutation responses, refetches, and realtime.
- **Sync policy** (`lib/rooms/sync-policy.ts`):
  - **Mutation** (move, start, pause, etc.): Always accept the response (we trust the mutation).
  - **Tick**: Accept only if `incoming.updated_at >= current.updated_at` (prevents stale tick from overwriting new-round state).
  - **Refetch / realtime**: Accept only if `incoming.updated_at >= current.updated_at`; never accept a refetch that would regress Live → Ready to Start.

So: **DB row → mapDbRowToRoom → Room → reconcileRoom (optional) → shouldAcceptRoomUpdate → roomToArenaMatch → ArenaMatch**.

---

## Realtime events

- **Publication**: Tables `matches`, `match_messages`, `spectate_messages`, and optionally `match_events` are in the Supabase realtime publication.
- **Usage**: Clients subscribe to `matches` (e.g. filter by `id=eq.<roomId>`). When a row changes (after move or tick), the client receives the new row; sync policy decides whether to accept it over local state.
- **Writes**: Always via API routes (service role). Realtime only propagates what the backend wrote.

---

## Driver architecture

- **Location**: `lib/rooms/game-drivers.ts`.
- **Contract**: Each game implements **GameDriver**: `createInitialBoardState()`, `getMoveSeconds()`, `hasTurnTimer`, `applyMove(room, payload)` returning **RoundOutcome** or `{ error }`.
- **Move pipeline**: `lib/rooms/move-pipeline.ts` uses only RoundOutcome (no game-type branches). It produces: in_round update, intermission (round_intermission_until, scores), or series_finished (winner, win_reason, status finished).
- **Lifecycle**: `lib/rooms/lifecycle.ts` uses `getGameDriver(room.game)` to build Ready→Live payload. For **hasTurnTimer false** (e.g. RPS), the payload must **not** include move_turn_identity_id, move_turn_started_at, move_turn_seconds, or turn_expires_at (DB may have NOT NULL on move_turn_seconds).

See [../game-drivers/driver-contract.md](../game-drivers/driver-contract.md) for the full driver contract and turn-based vs simultaneous games.

---

## How new games integrate

1. **Board state and types**: Add board state shape in `lib/engine/match/types.ts` (and `lib/rooms/game-board.ts` if needed).
2. **Game logic**: Implement initial state, apply move, winner/draw/full checks. One “move” can end the round or not; if not, return next turn.
3. **Driver**: In `lib/rooms/game-drivers.ts`, add a driver (createInitialBoardState, getMoveSeconds, hasTurnTimer, applyMove) and register in DRIVERS and getGameDriver.
4. **Constants**: In `lib/engine/game-constants.ts`, add getMoveSecondsForGame if the game has a turn timer.
5. **Lifecycle**: getReadyToLivePayload uses getGameDriver(room.game); once the driver exists, start and tick create the correct initial board. For simultaneous games, set **hasTurnTimer: false** and do **not** add turn fields to the Ready→Live payload.
6. **No route changes**: Move route, tick route, and move pipeline stay game-agnostic; they only call driver.applyMove and resolveMoveToDbUpdate.

---

## Key file map

| Concern            | Path |
|--------------------|------|
| Game drivers       | `lib/rooms/game-drivers.ts` |
| Move pipeline      | `lib/rooms/move-pipeline.ts` |
| Lifecycle          | `lib/rooms/lifecycle.ts` |
| Sync policy        | `lib/rooms/sync-policy.ts` |
| Match runtime      | `lib/engine/match-runtime.ts` |
| DB → Room          | `lib/engine/match/types.ts` (mapDbRowToRoom) |
| Room → UI          | `lib/rooms/room-adapter.ts` (roomToArenaMatch) |
| API routes         | `app/api/rooms/` (create, join, start, move, tick, pause, resume, forfeit, cancel, timeline) |
