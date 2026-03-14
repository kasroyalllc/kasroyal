# Architecture

This document describes the current KasRoyal architecture: Next.js app, Supabase backend, realtime model, room/match flow, runtime and game-driver layers, lifecycle, sync policy, and move pipeline.

---

## High-level

- **Next.js (App Router)** serves pages and API routes. Pages are client-heavy (match room, arena, history); API routes are the only writers to Supabase for match state.
- **Supabase** is the source of truth: matches, match_events, match_rounds, match_messages, profiles, bets, active_identity_matches. Realtime broadcasts changes on subscribed tables.
- **Room flow**: Create → Join → (countdown) → Live → moves and/or tick → intermission or series finish → Finished. Pause and forfeit are explicit API calls.
- **Game logic** is centralized in **game drivers** and a **move pipeline** so that all supported games share the same lifecycle, series, and intermission behavior.

---

## Next.js app

- **Pages**: Arena (`/arena`), match room (`/arena/match/[id]`), history (`/history`), spectate (`/spectate`). Match room loads room by ID, subscribes to Supabase realtime for that match, and polls or uses start/tick/move APIs to drive transitions and moves.
- **API routes** under `app/api/rooms/`: create, join, start, move, tick, pause, resume, forfeit, cancel. Plus `app/api/rooms/[id]/timeline` for events and rounds. These use the Supabase **admin (service role)** client so RLS does not block backend writes. Reads for the UI can use the anon client or server-side admin client.
- **State**: Match page keeps a single `Room`-derived state (as ArenaMatch). Updates come from mutation responses (create, join, move, etc.), refetches, and realtime. **Sync policy** decides when to accept an incoming room over current state (see below).

---

## Supabase as backend authority

- All persistent match state is in Supabase: status, board_state, scores, winner, win_reason, turn_expires_at, is_paused, round_intermission_until, etc. API routes perform the only updates to these fields.
- **active_identity_matches** enforces “one active match per identity”; create/join claim a slot, and cancel/forfeit/finish release it. No client policy; only service role writes.
- **match_events** and **match_rounds** store the event timeline and per-round results; written by the same API routes that update matches. Used for history, result UI, and future audit/settlement.
- See [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md) for tables and canonical fields.

---

## Realtime model

- **Publication**: Tables `matches`, `match_messages`, `spectate_messages`, and optionally `match_events` are in the Supabase realtime publication.
- **Usage**: Clients subscribe to `matches` (e.g. filter by `id=eq.<roomId>`) and optionally to `match_messages` for in-room chat. When a row changes (e.g. after move or tick), the client gets the new row and can refresh or merge; sync policy decides whether to accept it over local state.
- **Writes**: Always via API routes (service role). Realtime only propagates what the backend wrote.

---

## Room / match flow

1. **Create** (`POST /api/rooms/create`): Inserts a row in `matches` (status waiting), claims `active_identity_matches` for host. Emits `room_created`.
2. **Join** (`POST /api/rooms/join`): Sets challenger, status ready, countdown_started_at, countdown_seconds, betting_closes_at. Claims active match for challenger. Emits `challenger_joined`, `countdown_started`.
3. **Start** (`POST /api/rooms/start`) or **tick** (`POST /api/rooms/tick`): When status is Ready to Start and countdown has expired, transition to Live: set board_state (from game driver), move_turn_identity_id, turn_expires_at, round 1, scores 0. Emits `match_live`.
4. **Move** (`POST /api/rooms/move`): Only when Live, not paused, not in intermission. Driver applies move; move pipeline returns either in-round update, intermission (next round later), or series_finished. DB updated once; on round end, match_rounds and match_events are written. Emits `move_applied`, and on round end `round_won`/`round_draw`, `intermission_started` or `match_finished`.
5. **Tick** (same route): If Live and intermission_until is set and in the past, clear intermission and set next round board and turn. Emits `next_round_started`. If Live and turn expired, apply timeout strike or finish match (timeout); on finish, write match_rounds and match_finished. If paused and pause_expires_at passed, auto-resume.
6. **Pause / Resume / Forfeit**: Pause (turn-holder only, limited per side), Resume, Forfeit. Forfeit sets winner, win_reason, status finished, releases active match, writes forfeit + match_finished + one match_rounds row.
7. **Cancel**: Host only, no challenger; status canceled, release active match.

---

## Runtime layer

- **lib/engine/match-runtime.ts**: Builds a canonical view from a `Room`: series state (bestOf, currentRound, hostRoundWins, challengerRoundWins, requiredWins, seriesOver), pause state, intermission state, move permissions, winner result, and view flags (isWaitingForOpponent, isCountdown, isLiveRound, isIntermission, isFinished, isPaused). UI and logic use this instead of raw DB field combinations.
- **lib/engine/match/types.ts**: Defines `Room` (UI-facing shape from DB) and `mapDbRowToRoom` (maps DB row to Room, with legacy column fallbacks).
- **lib/rooms/room-adapter.ts**: Converts `Room` to `ArenaMatch` for the existing arena UI (roundScore, status, boardState, pauseState, etc.).

So: **DB row → mapDbRowToRoom → Room → (optional reconcile) → roomToArenaMatch → ArenaMatch**. Sync policy operates on Room/updated_at and acceptance of refetch/realtime vs mutation/tick.

---

## Game-driver layer

- **lib/rooms/game-drivers.ts**: Each supported game (Tic-Tac-Toe, Connect 4, Rock Paper Scissors) has a **GameDriver** with:
  - `createInitialBoardState()`: initial board for a new round.
  - `getMoveSeconds()`: seconds per turn (0 for RPS).
  - `hasTurnTimer`: true for C4 and TTT, false for RPS.
  - `applyMove(room, payload)`: returns either a **RoundOutcome** (newBoardState, roundWinner, isDraw, roundEnded, nextTurnIdentityId, optional winReason) or `{ error }`.
- **RoundOutcome** is game-agnostic: the move route and move pipeline only branch on “in-round” vs “round ended” and winner/draw. See [GAME_RUNTIME.md](GAME_RUNTIME.md).

---

## Lifecycle layer

- **lib/rooms/lifecycle.ts**: Defines **LifecyclePhase** (waiting, ready, countdown, live_round, intermission, next_round_setup, finished) and **getLifecyclePhase(room)**. Provides **getReadyToLivePayload(room, now)** for the Ready→Live transition (board, turn, turn_expires_at, round 1, scores 0) and **canTransitionReadyToLive(room, nowMs)**. Used by both start and tick routes so behavior is identical.
- **lib/rooms/db-status.ts**: Canonical DB status values (waiting, ready, live, finished, forfeited, canceled) and helpers (DB_ACTIVE_STATUSES, DB_FINISHED_STATUSES, READY_LIKE_STATUSES for updates).

---

## Sync policy

- **lib/rooms/sync-policy.ts**: **shouldAcceptRoomUpdate(current, incomingRoom, source)** returns true for mutation or tick (we trust the response), and for refetch/realtime returns true if incoming updated_at >= current updated_at so newer data wins. **reconcileRoom(room)** normalizes impossible or missing state (e.g. invalid status, missing board for Live, score cap). **acceptAndReconcile(incomingRoom, currentMatch, source)** reconciles, then accepts or keeps current, then maps to ArenaMatch. The match page uses this when applying refetches and realtime so that a stale refetch does not overwrite a fresh mutation.

---

## Move pipeline

- **lib/rooms/move-pipeline.ts**: **getSeriesUpdate(room, roundWinner)** computes hostRoundWins, challengerRoundWins, seriesOver, winnerIdentityId, winReason, next currentRound. **resolveMoveToDbUpdate(room, outcome, nowIso, nowMs, driver)** returns:
  - **in_round**: update board_state, move_turn_*, turn_expires_at, updated_at.
  - **intermission**: update status Live, round_number, host_score, challenger_score, round_intermission_until, last_round_winner_identity_id, updated_at; and a **roundRecord** (roundNumber, winnerIdentityId, resultType, hostScoreAfter, challengerScoreAfter) for match_rounds.
  - **series_finished**: update status finished, winner_identity_id, win_reason, board_state, round_number, scores, finished_at, ended_at, updated_at; same **roundRecord** for match_rounds.

The move route calls the driver, then resolveMoveToDbUpdate; writes one update to matches; then writes match_events and match_rounds when the update is intermission or series_finished. Tick route handles intermission expiry (next round) and timeout (match finish + round record). See [MOVE_ROUTE_REFACTOR.md](MOVE_ROUTE_REFACTOR.md) and [MATCH_LIFECYCLE.md](MATCH_LIFECYCLE.md).

---

## Where DB rows become UI state

1. **Read**: Supabase (direct or via API) returns match row(s).
2. **Normalize**: `mapDbRowToRoom(row)` in `lib/engine/match/types.ts` produces a `Room` (camelCase, ms timestamps, canonical status strings). Legacy columns (host_wallet, wager, started_at, ended_at) are used as fallbacks where needed.
3. **Reconcile** (optional): `reconcileRoom(room)` in sync-policy fixes invalid/edge state.
4. **Accept** (client): `shouldAcceptRoomUpdate(current, incomingRoom, source)` decides whether to replace current state.
5. **UI shape**: `roomToArenaMatch(room)` in room-adapter produces `ArenaMatch` (roundScore, status, boardState, pauseState, etc.) for components.
6. **Canonical view** (optional): `getMatchRuntime(room)` in match-runtime gives series, pause, intermission, permissions, and flags for UI logic.

---

## Series, intermission, and pause (where they are handled)

- **Series**: **getSeriesUpdate** in move-pipeline computes scores and series-over; move route writes host_score, challenger_score, round_number, and on series over winner_identity_id, win_reason, status finished. **Tick** does not compute series; it only starts the next round when intermission_until has passed.
- **Intermission**: Move pipeline sets **round_intermission_until** (now + INTERMISSION_SECONDS) when a round ends and series is not over. **Tick** checks this; when now >= round_intermission_until it clears intermission, sets new board and turn, and emits next_round_started. Intermission is only for BO3/BO5 (conceptually; BO1 can still use the same path with one round).
- **Pause**: Pause route sets is_paused, paused_by, pause_expires_at, increments pause_count_host/challenger. **Tick** skips turn-timeout processing when is_paused; when pause_expires_at has passed, tick clears pause and extends turn_expires_at. Resume route clears pause and optionally extends turn. All writes are in API routes; client only sends pause/resume requests.
