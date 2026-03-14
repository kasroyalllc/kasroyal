# KasRoyal Production Readiness Audit & System Improvement

Full audit and improvement pass to move the platform toward production-grade multiplayer: hundreds of concurrent matches and spectators, with stable sync, clear authority, and polished UX.

---

## Phase 1 — Full Codebase Audit

### 1. Realtime Synchronization

| Finding | Risk | Status |
|--------|------|--------|
| All Supabase channels (match room, spectate, arena, home, history, leaderboard, bets, Navbar) use `removeChannel` in useEffect cleanup. | Low — no leak if cleanup runs. | Verified |
| Match page subscribes to `matches` + `match_messages` + `moves` on one channel; 2s poll backup. | Redundant but safe; realtime can lag. | Accepted |
| No explicit refetch on channel error. | After reconnect, UI could stay stale until next poll/event. | **Fixed:** match page now refetches room on `CHANNEL_ERROR` / `TIMED_OUT`. |

**Files:** `app/arena/match/[id]/page.tsx`, `app/arena/page.tsx`, `app/spectate/page.tsx`, `app/page.tsx`, `app/history/page.tsx`, `app/bets/page.tsx`, `app/leaderboard/page.tsx`, `components/Navbar.tsx`.

---

### 2. Match Lifecycle Transitions

| Finding | Risk | Status |
|--------|------|--------|
| DB status values: "Waiting for Opponent", "Ready to Start", "Live", "Finished". Cancel/forfeit set status "Finished" with win_reason "canceled" / "forfeit". | N/A | Documented |
| Legal transitions were not enforced; status filters missing on some updates. | Race double-finish, illegal overwrites. | **Fixed:** `lib/rooms/match-lifecycle.ts` + `assertTransition` in start/tick/cancel/forfeit; `.eq("status", …)` on all relevant updates in move/tick/cancel/forfeit. |

**Legal transitions (enforced):**

- Waiting for Opponent → Ready to Start | Finished  
- Ready to Start → Live | Finished  
- Live → Finished  
- Finished → (none)

---

### 3. Timer Accuracy and Drift

| Finding | Risk | Status |
|--------|------|--------|
| Match page: server time via `/api/rooms/servertime`, polled every 1s during Ready to Start; move timer uses `turnExpiresAt` + synced now. | Outcome is server-authoritative; display may drift slightly. | Accepted |
| List/spectate countdowns use client `Date.now()`. | Display-only; no outcome impact. | Accepted |

---

### 4. Host vs Challenger Role Detection

| Finding | Risk | Status |
|--------|------|--------|
| Role was computed in multiple places (match page, APIs) with slight variation (identity id vs display name fallback). | Inconsistency, duplication. | **Fixed:** Centralized in `lib/rooms/match-role.ts`: `getMatchRole(room, identityId)` → `MatchRoleInfo` (role, isHost, isChallenger, isPlayer, isSpectatorOnly, playerRoleLabel). Match page uses this for gating and labels. |
| APIs (cancel, move, forfeit) validate host/challenger by identity id only. | Correct; no change. | Verified |

---

### 5. Spectator Synchronization

| Finding | Risk | Status |
|--------|------|--------|
| Spectators receive match state via same realtime channel (match row) and poll; no write paths for moves/forfeit/start. | Low. | Verified |
| Spectate page: separate channel per match for crowd chat; list spectate rooms + select match. | Correct. | Verified |

---

### 6. Chat System Reliability

| Finding | Risk | Status |
|--------|------|--------|
| Room chat: `match_messages`, send API, listRoomMessages, realtime INSERT + refreshChat. | Stable. | Verified |
| Spectate chat: `spectate_messages`, send API, listSpectateMessages, realtime. | Stable. | Verified |
| Index on `match_messages (match_id, created_at)` for listRoomMessages. | Performance. | **Done** (migration). |

---

### 7. Database Integrity

| Finding | Risk | Status |
|--------|------|--------|
| Duplicate moves / illegal order. | Move route validates turn; one update per request. No idempotency key. | Accepted; consider idempotency for scale. |
| Double match completion. | **Fixed:** All move/tick updates that set Finished use `.eq("status", "Live")`; refetch room when 0 rows updated. | Done |
| Cancel/forfeit overwriting finished match. | **Fixed:** Cancel uses `.eq("status", "Waiting for Opponent")`; forfeit uses `.in("status", ["Ready to Start", "Live"])`. | Done |
| Invalid winner / orphaned state. | Lifecycle + status guards reduce risk; no DB constraint on winner. | Documented |

---

### 8. State Recovery After Refresh

| Finding | Risk | Status |
|--------|------|--------|
| On load, match page calls `getRoomById` and subscribes; no "version" or incremental sync. | Full refetch is correct; works for current payload size. | Accepted |
| Realtime error refetch. | **Fixed:** Subscribe callback refetches on CHANNEL_ERROR / TIMED_OUT. | Done |

---

### 9. Server vs Client Authority

| Finding | Risk | Status |
|--------|------|--------|
| Match status and outcomes are set only by API (start, tick, move, cancel, forfeit). Client only renders. | Correct. | Verified |
| Chess preview reset is UI-only (persistPartialMatch); mock/localStorage path is dev-only. | No server impact. | Documented |

---

### 10. Series Logic (BO3 / BO5)

| Finding | Risk | Status |
|--------|------|--------|
| `host_round_wins`, `challenger_round_wins`, `current_round`, `best_of` in DB and Room type. getSeriesUpdate: BO1=1 win, BO3=2, BO5=3; board reset between rounds. | Correct. | Verified |
| Result UX: series score not shown in "Match Over" for BO3/BO5. | Minor UX gap. | **Fixed:** "Match Over" box shows "Series: Host X — Y Challenger" when bestOf > 1 and round scores present. |

---

## Phase 2 — Match Engine Hardening (Summary)

- **Server authority:** DB + API are source of truth; clients render only.
- **Valid transitions:** Enforced via `lib/rooms/match-lifecycle.ts` and `assertTransition` in start, tick, cancel, forfeit; move route uses `.eq("status", "Live")` on every match update.
- **Best-of series:** BO1/BO3/BO5 with round wins and board reset between rounds; status guards on all move-route updates.

---

## Phase 3 — Realtime Stability (Summary)

- Subscriptions clean up with `removeChannel` and clearInterval where used.
- Match page: refetch on channel error/timed out for reconnect recovery.
- Single subscription per entity per component; no duplicate listeners identified.

---

## Phase 4 — Database Integrity (Summary)

- Status guards on all status-changing updates (move, tick, cancel, forfeit).
- Refetch-on-null for Finished transitions in move route.
- Indexes: `matches (status, created_at)`, `matches (status, finished_at)`, `match_messages (match_id, created_at)`.

---

## Phase 5 — Performance Preparation (Summary)

- Indexes added for list active/history and room chat.
- No large unbounded queries identified; polling intervals (1s/2s) acceptable for current scale.

---

## Phase 6 — Code Quality (Summary)

- **Centralized role detection:** `lib/rooms/match-role.ts` — `getMatchRole(room, identityId)` used on match page for host/challenger/spectator and labels.
- **Centralized lifecycle:** `lib/rooms/match-lifecycle.ts` for transitions and helpers.
- TypeScript: Room and ArenaMatch types aligned; room-adapter maps series fields.

---

## Phase 7 — Platform UX Polish (Summary)

- **Match start / countdown:** Existing countdown overlay with hype line and server-synced timer; no change.
- **Result display:** "Match Over" now shows series score (Host X — Y Challenger) for BO3/BO5 when round scores exist.
- **Series score:** Already shown in Live Arena Board (round score + BO badge); result box enhanced as above.
- **Spectator / rank:** No additional changes in this pass.

---

## Architecture Improvements Implemented

| Area | Improvement |
|------|-------------|
| Lifecycle | `lib/rooms/match-lifecycle.ts`: legal transitions, `assertTransition`, `isActiveStatus`, `isPlayableStatus`. |
| Start/Tick/Cancel/Forfeit | `assertTransition` before status change; status filters on DB updates. |
| Move route | Every update `.eq("status", "Live")`; refetch room when Finished update affects 0 rows. |
| Forfeit room | `forfeitRoom` uses `.in("status", ["Ready to Start", "Live"])`. |
| Role detection | `lib/rooms/match-role.ts`: `getMatchRole(room, identityId)`; match page uses it. |
| Realtime | Match page refetches room on `CHANNEL_ERROR` / `TIMED_OUT`. |
| Result UX | "Match Over" shows series score for best-of matches. |
| DB | Indexes migration for matches and match_messages. |

---

## Files Changed (Full List)

| File | Change |
|------|--------|
| `lib/rooms/match-lifecycle.ts` | **New** — legal transitions, assertTransition, helpers. |
| `lib/rooms/match-role.ts` | **New** — getMatchRole, MatchRoleInfo. |
| `app/api/rooms/start/route.ts` | assertTransition + import. |
| `app/api/rooms/tick/route.ts` | assertTransition; `.eq("status", "Live")` on timeout updates. |
| `app/api/rooms/cancel/route.ts` | assertTransition; `.eq("status", "Waiting for Opponent")` on update. |
| `app/api/rooms/forfeit/route.ts` | assertTransition. |
| `lib/rooms/rooms-service.ts` | forfeitRoom: `.in("status", ["Ready to Start", "Live"])`. |
| `app/api/rooms/move/route.ts` | `.eq("status", "Live")` on all match updates; refetch-on-null for Finished. |
| `app/arena/match/[id]/page.tsx` | getMatchRole; realtime subscribe refetch on error; series score in Match Over. |
| `supabase/migrations/20250312210000_matches_match_messages_indexes.sql` | **New** — indexes. |
| `docs/MULTIPLAYER_ARCHITECTURE_AUDIT.md` | Existing multiplayer audit. |
| `docs/PRODUCTION_READINESS_AUDIT.md` | **New** — this document. |

---

## SQL Migrations

Run in order:

1. Existing: `20250312000000_matches_minimal_columns.sql`, `20250312100000_profiles_display_names.sql`, `20250312180000_spectate_messages.sql`, `20250312200000_matches_series_columns.sql`.
2. **Indexes:** `20250312210000_matches_match_messages_indexes.sql`  
   - `idx_matches_status_created_at`  
   - `idx_matches_status_finished_at`  
   - `idx_match_messages_match_id_created_at`

---

## Manual QA Checklist

### Host vs Challenger Sync

- [ ] Create room as host; challenger joins. Both see "Ready to Start" and same countdown.
- [ ] Countdown ends; both see "Live" and same board/turn.
- [ ] Moves appear for both with same board/turn; no desync.
- [ ] Timeout (if applicable): same winner and Finished.
- [ ] Win/draw: both see Finished and same result.

### Spectator Joining Mid-Match

- [ ] Spectator joins Ready or Live match; sees current board and status.
- [ ] Moves by players appear for spectator (realtime or short delay).
- [ ] Spectator cannot start, move, or forfeit; can send spectate chat / bet if allowed.
- [ ] Match finish: spectator sees Finished and result.

### Refresh During Countdown

- [ ] Host refreshes during "Ready to Start"; page shows same room, countdown continues or Live.
- [ ] Challenger same; no duplicate start or stuck Waiting.

### Refresh During Live Match

- [ ] Host refreshes mid-game; sees current board, turn, timer.
- [ ] Challenger same; no wrong turn or board.
- [ ] Spectator refreshes; sees current state.

### BO3 / BO5 Series Flow

- [ ] BO3: win two rounds; match finishes 2–0/0–2; both see correct series and Finished.
- [ ] BO5: first to 3 wins; correct series and Finished.
- [ ] Draw in a round: round resets; series ends only at required wins.

### Chat Reliability

- [ ] Room chat: host and challenger see each other’s messages in order; history correct after refresh.
- [ ] Spectate chat: multiple spectators see same list; new joiner sees existing messages.

### Reconnect Behavior

- [ ] Brief disconnect/throttle; after reconnect, match page shows updates again (realtime or poll).
- [ ] No permanent stale state; no duplicate messages or duplicate move UI.

### History Accuracy

- [ ] Finished matches appear in History with correct winner, score, and time.
- [ ] History list ordered by finished_at (newest first); no missing or duplicated entries.
- [ ] Re-opening a finished match from history shows correct final board and result.

---

## Appendix: Code Reference

### New files (full copy-paste)

**`lib/rooms/match-lifecycle.ts`** — See repo; exports: `MatchStatus`, `LEGAL_TRANSITIONS` (internal), `canTransition`, `assertTransition`, `ACTIVE_STATUSES`, `isActiveStatus`, `isPlayableStatus`.

**`lib/rooms/match-role.ts`** — See repo; exports: `MatchRole`, `MatchRoleInfo`, `getMatchRole(room, currentIdentityId)`.

**`supabase/migrations/20250312210000_matches_match_messages_indexes.sql`** — See repo (three `CREATE INDEX IF NOT EXISTS` statements).

### Modified files (summary of changes)

- **start/route.ts:** Add `import { assertTransition } from "@/lib/rooms/match-lifecycle"`. After `if (room.status !== "Ready to Start")` block, add `assertTransition(room.status, "Live", "start")`.
- **tick/route.ts:** Add assertTransition import; before Ready→Live update add `assertTransition(room.status, "Live", "tick_ready_to_live")`; before each timeout-finish update add `assertTransition(room.status, "Finished", "tick_timeout_finish")`; add `.eq("status", "Live")` to both timeout-finish updates and to the timeout-strike update.
- **cancel/route.ts:** Add assertTransition import; after status check add `assertTransition(room.status, "Finished", "cancel")`; in update chain add `.eq("status", "Waiting for Opponent")`.
- **forfeit/route.ts:** Add assertTransition import; after status check add `assertTransition(room.status, "Finished", "forfeit")`.
- **rooms-service.ts (forfeitRoom):** In update, add `.in("status", ["Ready to Start", "Live"])` before `.select("*")`; change error message to "Room not found or already finished".
- **move/route.ts:** Every `.update(...).eq("id", roomId)` that touches match state must also have `.eq("status", "Live")` (or for RPS single-submit the same). For every branch that sets `status: "Finished"`, when `data` is null return `(await getRoomById(supabase, roomId)) ?? room` instead of `room`.
- **arena/match/[id]/page.tsx:** Add `import { getMatchRole } from "@/lib/rooms/match-role"`. Replace inline role computation with `useMemo(() => getMatchRole(match, getCurrentIdentity().id), [match, getCurrentIdentity().id])` and destructure `isHost`, `isChallenger`, `isPlayer`, `isSpectatorOnly`, `playerRoleLabel` (use `roleInfo.playerRoleLabel` for spectator label). In channel `.subscribe()` add callback `(status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void refreshRoom() }`. In "Match Over" box, add series line when `match.bestOf > 1` and round scores exist: "Series: {hostName} {host} — {challenger} {challengerName}".

Full file contents for modified files are in the repository; the above summarizes every logical change.

---

*End of Production Readiness Audit.*
