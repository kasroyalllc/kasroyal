# Current status

This page is the “where we are right now” snapshot. It reflects current reality and is updated when major work is completed or priorities shift. Use it to onboard and to avoid repeating finished work or regressing it.

---

## What is working well

- **Tic-Tac-Toe and Connect 4**: Full flow for BO1, BO3, and BO5. Create → join → countdown → live → moves → round wins → intermission (BO3/BO5) → next round or series finish. Turn timer, timeout strikes (3 strikes = match loss), and draw handling are implemented and used in production flow.
- **Move pipeline**: Single route and shared pipeline for all games. Game drivers return a canonical RoundOutcome; resolveMoveToDbUpdate produces in-round, intermission, or series_finished with one DB update. No per-game branches in the route.
- **Lifecycle**: Ready→Live transition (start and tick), intermission expiry (tick starts next round), and timeout handling (tick) are centralized in lifecycle and move-pipeline. DB fields (round_number, host_score, challenger_score, round_intermission_until, last_round_winner_identity_id, turn_expires_at) are the source of truth.
- **Pause and resume**: Server-authoritative. Pause route (turn-holder only, limit per side), resume route, and tick (pause expiry and turn extension) are implemented. Pause state is stored in matches (is_paused, paused_by, pause_expires_at, pause_count_*).
- **Forfeit and cancel**: Forfeit sets winner, win_reason, status finished; releases active match; writes match_events and match_rounds. Cancel (host, no challenger) sets status canceled and releases active match.
- **Sync policy**: acceptAndReconcile and shouldAcceptRoomUpdate prevent stale refetches/realtime from overwriting newer mutation/tick responses. ReconcileRoom normalizes invalid or missing state.
- **Event timeline and round record**: match_events and match_rounds are written from create, join, start, tick, move, pause, resume, forfeit. GET /api/rooms/[id]/timeline returns events and rounds. History page shows BO and series score; match page shows “Match Over” and round-by-round when finished.
- **History and result UX**: History cards show game, mode, BO, series score (e.g. 2–1), result line, win reason. Match page when finished shows series score, winner, win reason, and round-by-round list from timeline API. Same view for players and spectators.

---

## What was recently refactored

- **Game-driver layer**: All supported games go through GameDriver (createInitialBoardState, getMoveSeconds, hasTurnTimer, applyMove). RoundOutcome is game-agnostic (roundEnded, nextTurnIdentityId, roundWinner, isDraw, etc.). See docs/MOVE_ROUTE_REFACTOR.md and docs/GAME_RUNTIME.md.
- **Move route**: Single pipeline: validate → driver.applyMove → resolveMoveToDbUpdate → one update to matches; on round end, write match_events and match_rounds. No per-game branches for persistence.
- **Lifecycle**: getReadyToLivePayload and canTransitionReadyToLive in one place; start and tick use them so Ready→Live behavior is identical.
- **Match history sprint**: Added match_events and match_rounds, timeline API, history card enhancements (BO, series score), and match page round-by-round. See docs/MATCH_HISTORY_SPRINT.md.

---

## Major architectural improvements in place

- **lib/rooms/game-drivers.ts**: Single driver interface; TTT, C4, RPS implemented.
- **lib/rooms/move-pipeline.ts**: getSeriesUpdate, resolveMoveToDbUpdate, RoundRecord for match_rounds.
- **lib/rooms/lifecycle.ts**: getLifecyclePhase, getReadyToLivePayload, canTransitionReadyToLive.
- **lib/rooms/sync-policy.ts**: shouldAcceptRoomUpdate, reconcileRoom, acceptAndReconcile.
- **lib/engine/match-runtime.ts**: Canonical view of Room (series, pause, intermission, permissions, flags).
- **lib/rooms/match-events.ts**: insertMatchEvent, insertMatchRound, listMatchEvents, listMatchRounds.
- **Canonical DB writes**: API routes write only canonical columns; mapDbRowToRoom reads with legacy fallbacks for compatibility.

---

## Production stabilization (recent)

- **Tick production error logging**: Tick route captures errors and returns structured responses so production 500s can be diagnosed (see docs/PRODUCTION-STABILIZATION.md).
- **Storage quota-safe persistence**: Arena store (e.g. kasroyal_arena_store_v3) is written with quota checks and fallbacks so localStorage full does not break the app; see PRODUCTION-STABILIZATION for write paths and what to paste back if issues recur.
- **React hook-order fix**: Client hook order corrected so arena state and subscriptions behave consistently.
- **Verification pending**: RPS and tick 500 behavior should be re-verified in production after deploy; see docs/DEPLOY-AND-VERIFY.md for the checklist.

---

## Current known open issues

- **RPS**: Implemented in the driver and pipeline; user testing has previously reported it “stuck” in the pre-start shell. Live product verification is still recommended before treating RPS as fully resolved.
- **Pause**: Server logic is complete; end-to-end verification from a user perspective (pause mid-game, resume, expiry) is recommended.
- **Chess Duel**: Not in the game-driver layer; create/start/move do not support it yet.
- **Spectator betting settlement**: Data model and timeline/round data are in place for resolving bets against match result; full settlement flow (payouts, wallet) is not wired.
- **Legacy compatibility**: Some mapping still reads legacy column names (host_wallet, wager, started_at, ended_at) where new columns may be missing; this is intentional for backward compatibility but should not be extended for new features.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for a concise list.

---

## Immediate next priorities

1. **Verify RPS** in live product behavior (both players can choose, reveal, round and series complete).
2. **Verify pause** end-to-end (pause as turn-holder, resume, auto-resume on expiry, pause count and limits).
3. **Keep TTT and C4 stable**: Any change to move pipeline or lifecycle should be tested against BO1/BO3/BO5 for both games.
4. **Optional**: Expose event timeline in UI (e.g. “Event log” tab on match page) for transparency and debugging.
5. **Future**: Chess Duel driver; spectator betting settlement against match_events/match_rounds; wallet/Igra integration.

---

## What not to regress

- Do not reintroduce per-game branches in the move route; keep a single driver + pipeline path.
- Do not author match outcome or round wins only on the client; Supabase (matches + match_rounds + match_events) is the source of truth.
- Do not skip writing match_events or match_rounds when a round ends or match finishes (move route, tick timeout, forfeit).
- Do not remove or weaken sync policy (acceptAndReconcile / shouldAcceptRoomUpdate) so that stale refetches overwrite fresh mutation responses.
- Do not change getSeriesUpdate or intermission/series_finished semantics without re-testing all supported games and BO variants.
