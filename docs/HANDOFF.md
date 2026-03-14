# Handoff

This document is the internal handoff layer: current mental model, key files to inspect first, current priorities, what not to regress, and how to continue from a fresh chat or new contributor context. Use it so that you, Cursor, future chats, and future contributors operate like one brain.

---

## Current mental model

1. **Supabase is the source of truth** for match state. All create, join, start, move, tick, pause, resume, forfeit, and cancel flows write through API routes using the service role. The client never authors outcome or round wins; it only sends actions and then displays what the server stored.
2. **One pipeline for all games**: Game drivers (lib/rooms/game-drivers.ts) implement board init and applyMove and return a canonical RoundOutcome. The move route calls the driver and then resolveMoveToDbUpdate (lib/rooms/move-pipeline.ts), which produces a single DB update (in_round, intermission, or series_finished). No per-game branches in the route.
3. **Lifecycle is centralized**: Ready→Live and intermission→next round come from lifecycle.ts and the same payload/checks in start and tick. Pause and timeout are handled in the tick route and pause/resume routes. Status and phase are derived from DB fields (status, countdown_started_at, round_intermission_until, turn_expires_at, is_paused).
4. **Sync policy prevents stale overwrites**: When the client gets a room (refetch or realtime), acceptAndReconcile decides whether to accept it over current state (mutation/tick always win; refetch/realtime win only if updated_at is not older). ReconcileRoom fixes invalid or missing state before mapping to UI.
5. **Event timeline and round record**: Every major transition (room_created, challenger_joined, match_live, move_applied, round_won/round_draw, intermission_started, next_round_started, pause_requested, resumed, forfeit, match_finished) is written to match_events. Every completed round is written to match_rounds. The timeline API and match page use these for history and round-by-round display and for future settlement/audit.

---

## Key files to inspect first

- **README.md** — Project identity, stack, what works, doc index.
- **docs/ARCHITECTURE.md** — Next.js, Supabase, realtime, room flow, game-driver, lifecycle, sync, move pipeline.
- **docs/CURRENT_STATUS.md** — What’s working, what was refactored, open issues, next priorities.
- **docs/KNOWN_ISSUES.md** — Unresolved issues and watchpoints.
- **lib/rooms/game-drivers.ts** — GameDriver and RoundOutcome; getGameDriver.
- **lib/rooms/move-pipeline.ts** — getSeriesUpdate, resolveMoveToDbUpdate, RoundRecord, INTERMISSION_SECONDS.
- **lib/rooms/lifecycle.ts** — getLifecyclePhase, getReadyToLivePayload, canTransitionReadyToLive.
- **lib/rooms/sync-policy.ts** — shouldAcceptRoomUpdate, reconcileRoom, acceptAndReconcile.
- **lib/rooms/rooms-service.ts** — createRoom, joinRoom, getRoomById, listActiveRooms, listHistoryRooms, forfeitRoom, cancelRoom, claimActiveMatch, releaseActiveMatchByMatch.
- **lib/rooms/match-events.ts** — insertMatchEvent, insertMatchRound, listMatchEvents, listMatchRounds.
- **lib/engine/match/types.ts** — Room type, mapDbRowToRoom.
- **lib/rooms/room-adapter.ts** — roomToArenaMatch (Room → ArenaMatch).
- **app/api/rooms/move/route.ts** — Single move pipeline: validate → driver.applyMove → resolveMoveToDbUpdate → write matches + events/rounds.
- **app/api/rooms/tick/route.ts** — Ready→Live, intermission→next round, turn timeout, pause expiry.
- **supabase/kasroyal_schema.sql** — Tables, RLS, realtime. **docs/SUPABASE_SCHEMA.md** — Canonical fields and assumptions.

---

## Current priorities

1. **Verify RPS** in live product (no “stuck” state; both choose, reveal, round/series complete).
2. **Verify pause** end-to-end from user perspective.
3. **Keep TTT and C4 stable** — no regressions in BO1/BO3/BO5 or move/timeout behavior.
4. **Optional**: Event log UI or audit view using match_events.
5. **Future**: Chess Duel driver; spectator betting settlement; wallet/Igra.

---

## What not to regress

- **Single move pipeline**: Do not reintroduce per-game branches in the move route. All games go through driver.applyMove and resolveMoveToDbUpdate.
- **Canonical writes**: Do not write match outcome or round wins only on the client. All outcome and round data must be written by API routes to matches, match_events, and match_rounds.
- **Event and round writes**: Do not skip insertMatchEvent/insertMatchRound when a round ends (move route) or when match finishes (move, tick timeout, forfeit).
- **Sync policy**: Do not remove or weaken acceptAndReconcile or shouldAcceptRoomUpdate so that refetch/realtime overwrite a newer mutation/tick response.
- **Lifecycle consistency**: Do not duplicate Ready→Live or intermission→next round logic; keep using getReadyToLivePayload and the same tick behavior for intermission expiry.
- **DB as authority**: Do not rely on client-computed scores or winner for display of final result; read from matches and match_rounds.

---

## How to continue from a fresh chat or new contributor

1. **Start with README and HANDOFF**: Read README.md for identity and doc index; read this file (HANDOFF) for mental model and key files.
2. **Then ARCHITECTURE and CURRENT_STATUS**: Understand the flow (room → driver → pipeline → DB) and what is working vs open.
3. **Before changing move/lifecycle/game logic**: Read game-drivers.ts, move-pipeline.ts, lifecycle.ts, and the move and tick routes. Run through a match locally (create → join → start → move → finish) and optionally pause/forfeit.
4. **Before changing schema**: Read SUPABASE_SCHEMA.md and add a migration; update the doc if you add tables or canonical columns.
5. **After significant work**: Update CURRENT_STATUS.md and, if needed, KNOWN_ISSUES.md and HANDOFF.md so the next person has an accurate “where we are now.”

---

## One-line “state of the repo”

**KasRoyal**: Supabase-backed competitive arena (TTT, C4, RPS); single game-driver + move pipeline; lifecycle and sync policy in place; event timeline and round record for history and result trust; RPS and pause need live verification; Chess and wallet/Igra are future.
