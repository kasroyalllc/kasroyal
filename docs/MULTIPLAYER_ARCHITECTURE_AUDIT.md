# KasRoyal Multiplayer Architecture Audit & Production Hardening

This document summarizes the full codebase audit and the architectural improvements applied to improve stability for hundreds of concurrent matches and spectators.

**See also:** [Production Readiness Audit](./PRODUCTION_READINESS_AUDIT.md) for the full production-readiness pass (all phases, role centralization, realtime resilience, UX polish, extended QA checklist).

---

## 1. Audit Summary

### 1.1 State Authority

- **Finding:** The database (Supabase) and API routes are the single source of truth. Clients do not set match status or decide outcomes.
- **Minor exception:** The match page uses `persistPartialMatch` for **Chess preview only** (UI-only state reset); this does not affect server state. The deprecated mock/localStorage path in `lib/mock/arena-data.ts` uses `normalizeArenaMatches` only for local dev; production uses Supabase.
- **Risks:** Low. No client authority over match outcome or status.
- **Fixes applied:** None required; reinforced by lifecycle validation and status guards in API.

### 1.2 Realtime Synchronization

- **Finding:** All Supabase realtime subscriptions (match room, spectate, arena list, home, history, leaderboard, bets, Navbar) were audited. Each uses proper cleanup: `supabase.removeChannel(channel)` (and `clearInterval` where used) in useEffect teardown.
- **Risks:** Stale subscriptions or duplicate handlers could cause duplicate UI updates or desync if cleanup were missing. Audit found cleanup present everywhere.
- **Fixes applied:** No code changes; documented as verified. Recommendation: keep a single subscription per logical entity per component and always return a cleanup that removes the channel.

### 1.3 Timer Accuracy

- **Finding:** Match page uses server-synced time for pre-game countdown and move timer (servertime poll every 1s during Ready to Start; tick every 1s when Ready). List/spectate use client `Date.now()` for countdown display only (non-authoritative).
- **Risks:** Client-only timers could show drift; actual transitions are driven by API (start/tick) using server time. Risk is limited to display, not outcome.
- **Fixes applied:** None required. Recommendation: continue using server time for any transition or expiry logic.

### 1.4 Match Lifecycle Consistency

- **Finding:** Transitions were driven only by API (start, tick, move, cancel, forfeit). There was no centralized validation of *legal* status transitions, and status filters were missing on some DB updates, allowing theoretical double-finish or illegal overwrites under race conditions.
- **Risks:** Two concurrent requests (e.g. move and tick, or two moves) could both try to set `Finished`; without `.eq("status", "Live")` the second update could overwrite the first. Cancel could theoretically run after a match had already finished if not guarded.
- **Fixes applied:**
  - **Lifecycle module:** `lib/rooms/match-lifecycle.ts` defines `MatchStatus`, `LEGAL_TRANSITIONS`, `canTransition()`, `assertTransition()`, `ACTIVE_STATUSES`, `isActiveStatus()`, `isPlayableStatus()`.
  - **Legal transitions enforced:** `Waiting for Opponent` → `Ready to Start` | `Finished`; `Ready to Start` → `Live` | `Finished`; `Live` → `Finished`; `Finished` → (none).
  - **API guards:** start, tick, cancel, forfeit now call `assertTransition(currentStatus, newStatus)` before performing status-changing updates. Move route uses `.eq("status", "Live")` on every update that modifies match state (including transitions to Finished and next-round resets), and refetches room when the Finished update affects 0 rows (race lost).

### 1.5 Spectator Handling

- **Finding:** Spectators are correctly gated from moves, forfeit, and start; they can only send chat and place bets. Spectate subscriptions are separate from player channel.
- **Risks:** Low. No spectator path can mutate game state.
- **Fixes applied:** None required.

### 1.6 Chat System

- **Finding:** Room chat uses `match_messages` (send API, listRoomMessages, realtime + 1.5s poll). Spectate uses `spectate_messages` and realtime. No critical issues identified.
- **Fixes applied:** None required. Index added for `match_messages (match_id, created_at)` for efficient listRoomMessages.

### 1.7 Database Schema & Integrity

- **Finding:** Tables in use: `profiles`, `matches`, `moves` (if used), `match_messages`, `bets`, `spectate_messages`. Matches table had no indexes on `status` or `created_at`/`finished_at` in migrations; spectate_messages already had indexes.
- **Risks:** List active/history and room chat could be slow at scale without indexes.
- **Fixes applied:**
  - **Indexes:** New migration `20250312210000_matches_match_messages_indexes.sql`: `idx_matches_status_created_at`, `idx_matches_status_finished_at`, `idx_match_messages_match_id_created_at`.
  - **Data integrity:** All move-route updates that set `Finished` or change in-progress state now include `.eq("status", "Live")`. Cancel update includes `.eq("status", "Waiting for Opponent")`. Forfeit uses `.in("status", ["Ready to Start", "Live"])`. Tick timeout finish and timeout strike use `.eq("status", "Live")`. When a Finished update returns no row (race), the API refetches the room and returns that instead of stale in-memory state.

### 1.8 Series Logic (BO3 / BO5)

- **Finding:** Series tracking exists: `host_round_wins`, `challenger_round_wins`, `current_round`, `best_of`. Logic in move route and getSeriesUpdate: BO3 ends at 2 wins, BO5 at 3 wins; board resets between rounds without closing the match.
- **Risks:** Already correct; no change required beyond ensuring move-route updates are status-guarded (done).

---

## 2. Architecture Risks (Remaining / Recommendations)

- **Multiple active matches per identity:** Not enforced at DB level (e.g. unique partial index on `(host_identity_id)` where status in active). Consider adding application-level or DB constraint if one-match-per-identity is required.
- **Duplicate moves:** Move route validates turn and applies one move per request; no idempotency key. For extreme concurrency, consider idempotency keys or version/optimistic locking on `matches`.
- **Reconnect / refresh:** Clients re-subscribe and re-fetch room on load; no explicit “version” or “since” rehydration beyond full room fetch. For very large payloads, consider incremental sync later.
- **Polling:** Some flows use both realtime and short-interval polling (e.g. servertime). Acceptable for now; consider reducing polling when realtime is healthy.

---

## 3. Fixes Applied (Summary)

| Area | Fix |
|------|-----|
| Lifecycle | New `lib/rooms/match-lifecycle.ts`: legal transitions, `assertTransition`, helpers. |
| Start API | `assertTransition(room.status, "Live")` before Ready → Live update. |
| Tick API | `assertTransition` before Ready → Live and before Live → Finished (timeout); `.eq("status", "Live")` on timeout finish and timeout strike updates. |
| Cancel API | `assertTransition(room.status, "Finished")`; update now `.eq("status", "Waiting for Opponent")`. |
| Forfeit API | `assertTransition(room.status, "Finished")`. `forfeitRoom` now `.in("status", ["Ready to Start", "Live"])`. |
| Move API | Every match update uses `.eq("status", "Live")`; all transitions to Finished refetch room when update affects 0 rows and return that room. |
| DB indexes | Migration adds indexes on `matches (status, created_at)`, `matches (status, finished_at)`, `match_messages (match_id, created_at)`. |

---

## 4. Files Changed

- `lib/rooms/match-lifecycle.ts` — **new**
- `lib/rooms/match-role.ts` — **new** (centralized host/challenger/spectator detection)
- `app/api/rooms/start/route.ts` — lifecycle assert + import
- `app/api/rooms/tick/route.ts` — lifecycle assert, `.eq("status", "Live")` on timeout updates
- `app/api/rooms/cancel/route.ts` — lifecycle assert, `.eq("status", "Waiting for Opponent")` on update
- `app/api/rooms/forfeit/route.ts` — lifecycle assert
- `lib/rooms/rooms-service.ts` — `forfeitRoom`: `.in("status", ["Ready to Start", "Live"])`
- `app/api/rooms/move/route.ts` — `.eq("status", "Live")` on all match updates; refetch-on-null for Finished transitions
- `app/arena/match/[id]/page.tsx` — getMatchRole; realtime refetch on CHANNEL_ERROR/TIMED_OUT; series score in Match Over
- `supabase/migrations/20250312210000_matches_match_messages_indexes.sql` — **new**
- `docs/MULTIPLAYER_ARCHITECTURE_AUDIT.md` — this file
- `docs/PRODUCTION_READINESS_AUDIT.md` — **new** (full production readiness audit)

---

## 5. SQL Migrations

Run in order:

1. Existing migrations (matches minimal columns, profiles display names, spectate_messages, matches series columns).
2. **New:** `supabase/migrations/20250312210000_matches_match_messages_indexes.sql` — creates:
   - `idx_matches_status_created_at`
   - `idx_matches_status_finished_at`
   - `idx_match_messages_match_id_created_at`

---

## 6. Manual Test Checklist

Use this to verify host/challenger sync, spectators, refresh, series, chat, and reconnect.

### 6.1 Host vs Challenger Sync

- [ ] Create room as host; challenger joins. Both see status “Ready to Start” and same countdown.
- [ ] When countdown ends, both see “Live” and same board/turn.
- [ ] Each move appears for both players with same board and turn; no desync after several moves.
- [ ] Timeout (if applicable): both see the same winner and Finished state.
- [ ] End a match by win/draw: both see Finished and same winner/result.

### 6.2 Spectators Joining Mid-Match

- [ ] Spectator opens spectate page and joins a Ready or Live match. Sees current board and status without needing to refresh.
- [ ] While spectating, host/challenger make moves; spectator sees updates in real time (or after short delay).
- [ ] Spectator cannot start match, move, or forfeit; can send spectate chat and place bet if allowed.
- [ ] When match finishes, spectator sees Finished state and result.

### 6.3 Refresh During Countdown

- [ ] During “Ready to Start” countdown, host refreshes. Page reloads and shows same room, countdown continues (or already expired and shows Live).
- [ ] Challenger refreshes during countdown; same behavior. No duplicate start or stuck “Waiting”.

### 6.4 Refresh During Live Match

- [ ] Host refreshes mid-game. After load, sees current board, turn, and timer consistent with server.
- [ ] Challenger refreshes mid-game; same. No “Not your turn” or wrong board after refresh.
- [ ] Spectator refreshes during Live; sees current state after reload.

### 6.5 BO3 / BO5 Series Flow

- [ ] Create BO3 match. Win first round; both see round wins 1–0 and new board. Win second round; match finishes 2–0 and status Finished.
- [ ] Create BO5 match. Play until one side has 3 wins; match finishes and both see correct series score and Finished.
- [ ] Draw in a round (if supported): round resets, no winner; next round starts. Series ends only at required wins (BO3=2, BO5=3).

### 6.6 Chat Reliability

- [ ] Room chat: host and challenger send messages; both see each other’s messages in order. Refresh and re-open room; message history still correct.
- [ ] Spectate crowd chat: multiple spectators send messages; all see the same list. New spectator joining mid-match sees existing messages.

### 6.7 Reconnect Behavior

- [ ] Disconnect network briefly (or throttle). After reconnect, match page continues to show updates (realtime or poll). No permanent “stale” state.
- [ ] If realtime reconnects, no duplicate messages or duplicate UI updates (e.g. same move applied twice).

---

*End of audit document.*
