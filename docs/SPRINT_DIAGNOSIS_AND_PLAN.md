# KasRoyal Productization Sprint — Diagnosis & Implementation Plan

## 1. Diagnosis: Current Architecture Risks

### 1.1 Fragmented state and duplicate derivation
- **Risk**: Match state is derived in many places (match page, room-adapter, API routes) from raw DB fields. Same concepts (e.g. "is countdown", "can move", "is intermission") are recomputed with slightly different conditions.
- **Evidence**: `isCountdown`, `isPaused`, `isIntermission`, `canHostMove`, `canChallengerMove`, `moveSecondsLeft` and game-specific `getConnect4State` / `getTttState` / `getRpsState` live in the match page; room-adapter builds a different shape (ArenaMatch) with overlapping semantics.
- **Impact**: Regression when one place is updated and another is not (e.g. RPS stuck on countdown shell).

### 1.2 Game-specific logic scattered across layers
- **Risk**: Tic-Tac-Toe, Connect 4, and Rock Paper Scissors are handled with separate branches in move route, tick route, start route, and match page. RPS is a frequent exception (no turn timer, different board shape).
- **Evidence**: move/route.ts has ~300+ lines of per-game blocks; tick has RPS early-return; match page has three separate board/state parsers and three render branches.
- **Impact**: Adding a new game (Checkers, Battleship, etc.) requires touching many files and risks missing a branch.

### 1.3 Lifecycle duplication
- **Risk**: Ready→Live transition is implemented in both start route and tick route with similar (but not shared) update payloads. Round-end and intermission logic are repeated for each game in the move route.
- **Evidence**: start/route.ts and tick/route.ts both set status, board_state, round 1, scores 0, turn; move route has six near-identical "round ended, series not over" blocks (RPS, C4 winner, C4 draw, TTT winner, TTT draw).
- **Impact**: Fixing a bug in one transition may leave the other wrong; intermission/round reset bugs are easy to introduce.

### 1.4 Sync and stale overwrite
- **Risk**: Multiple sources update client match state (tick response, refreshRoom, realtime, 2s poll, pause/resume/move responses) with no ordering or recency policy. A stale refetch can overwrite a newer mutation response.
- **Evidence**: refreshRoom() is called on realtime, poll, and (previously) after ready_to_live; setMatch is always a full replace. No updated_at or version compare.
- **Impact**: RPS and other transitions can "flip back" to pre-live or wrong round if refetch returns cached/stale data.

### 1.5 Legacy and canonical name mix
- **Risk**: DB and types use canonical names (round_number, host_score, challenger_score, is_paused, round_intermission_until) but mapDbRowToRoom still reads legacy fallbacks (current_round, host_round_wins, challenger_round_wins). Legacy names remain in migrations and docs.
- **Evidence**: mapDbRowToRoom uses round_number ?? current_round, host_score ?? host_round_wins; API routes write only canonical names.
- **Impact**: Confusion and bugs if a code path writes legacy names or a new reader assumes only canonical.

### 1.6 Weak observability and recovery
- **Risk**: No structured lifecycle logging; no explicit recovery for impossible states (e.g. Live with missing board_state, Finished with move controls enabled).
- **Evidence**: logRoomAction is used ad hoc; match page and adapter do not validate room shape or clamp to safe defaults in one place.
- **Impact**: Hard to debug production issues; bad data can cause confusing UI or client errors.

---

## 2. Prioritized Implementation Plan

| Phase | Deliverable | Priority | Dependencies |
|-------|-------------|----------|--------------|
| **1** | Canonical match runtime layer: single normalized object (status, gameKey, series, pause, intermission, move permissions, winner, view flags) built from Room; match page consumes it. | P0 | None |
| **2** | Game driver/adapter contract: interface (createInitialBoardState, validateMove, applyMove, round outcome, next round board, parse for UI); TTT, C4, RPS implementations; move/tick use driver. | P0 | None |
| **3** | Lifecycle consolidation: lifecycle phase enum (waiting, ready, countdown, live_round, intermission, next_round_setup, finished); shared transition helpers; start/tick use shared Ready→Live. | P0 | 1, 2 |
| **4** | Sync/refresh policy: when to trust mutation vs refetch vs realtime; updated_at compare to avoid stale overwrite; reconciliation for impossible states. | P0 | 1 |
| **5** | Series UX: clear scoreboard, round winner callout, "first to 2/3", round number, intermission presentation, final result summary. | P1 | 1, 3 |
| **6** | Pause as first-class control: audit DB/routes/tick/UI; 30s countdown, who paused, remaining pauses, manual unpause, fair timer, spectator visibility. | P1 | 1, 4 |
| **7** | Invariants and observability: structured lifecycle/round/pause/intermission logs; suspicious-state detection; safe recovery (no crash). | P1 | 1, 3 |
| **8** | UI/state cleanup: remove dead controls; consolidate status pills; hide controls that have no real behavior. | P2 | 1 |
| **9** | Future-game readiness: document driver contract; remove hidden "grid game" assumptions. | P2 | 2 |
| **10** | Naming/type consistency: canonical names only in API and runtime; legacy reads isolated in mapDbRowToRoom. | P2 | 1 |

---

## 3. Implementation Order (This Sprint)

1. **Phase 1** — `lib/engine/match-runtime.ts`: Build canonical view from Room (status, gameKey, seriesState, pauseState, intermissionState, movePermissions, winnerResult, viewFlags). Export `getMatchRuntime(room)` and types.
2. **Phase 2** — `lib/rooms/game-drivers.ts`: Define `GameDriver` and registry; implement for TTT, C4, RPS (delegate to existing game-board.ts). Move route and tick use `getGameDriver(gameType)` for init board and round outcome.
3. **Phase 3** — `lib/rooms/lifecycle.ts`: LifecyclePhase enum, `getLifecyclePhase(room)`, `getReadyToLivePayload(room, now)` for shared Ready→Live payload. Tick and start use it.
4. **Phase 4** — Sync policy in `lib/rooms/sync-policy.ts`: `shouldAcceptRoomUpdate(current, incoming, source)`, `reconcileRoom(room)` for impossible states. Match page uses it before setMatch.
5. **Phase 7** — Logging and recovery: structured logs in tick/move/pause/resume; `reconcileRoom` in room-adapter or match-runtime to clamp bad state.
6. **Phase 5/6/8** — Incremental: series UX and pause UX improvements in match page using runtime view; remove Reset Board and other dead controls (already done where applicable).

---

## 4. Files to Create or Modify

| File | Action |
|------|--------|
| `docs/SPRINT_DIAGNOSIS_AND_PLAN.md` | Create (this doc) |
| `lib/engine/match-runtime.ts` | Create — canonical runtime view |
| `lib/rooms/game-drivers.ts` | Create — game driver interface + TTT/C4/RPS |
| `lib/rooms/lifecycle.ts` | Create — lifecycle phases + shared Ready→Live |
| `lib/rooms/sync-policy.ts` | Create — accept/reconcile policy |
| `lib/engine/match/types.ts` | Minor — ensure Room has updated_at |
| `lib/rooms/room-adapter.ts` | Modify — use match-runtime for derived flags; call reconcile |
| `app/arena/match/[id]/page.tsx` | Modify — consume MatchRuntime; apply sync policy |
| `app/api/rooms/tick/route.ts` | Modify — use lifecycle + game driver where applicable |
| `app/api/rooms/move/route.ts` | Modify — use game driver for init board and round outcome |
| `app/api/rooms/start/route.ts` | Modify — use lifecycle getReadyToLivePayload if shared |
| No migration SQL required | Schema already has canonical columns |

---

## 5. How This Pass Improves KasRoyal

- **Single source of truth for "what phase are we in" and "what can the user do"**: UI and routes both use the same runtime view and lifecycle phase, reducing conditional bugs.
- **One place to add a new game**: Implement a GameDriver and register it; move/tick/start use the driver instead of new branches everywhere.
- **Stale overwrite addressed**: Sync policy and updated_at comparison prevent a late refetch from undoing a successful transition.
- **Observability and recovery**: Structured logs and reconcileRoom make debugging and production safety better; impossible states are clamped instead of crashing.
- **Clearer contract**: Canonical names and a single mapping layer (mapDbRowToRoom) reduce confusion and regression when changing DB or API.
