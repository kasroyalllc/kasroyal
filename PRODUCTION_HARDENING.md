# KasRoyal Production Hardening — Audit & Checklist

This document records the full 38-point hardening audit, design decisions, and manual test checklist for production readiness.

---

## A. Core Gameplay / Match Integrity

| # | Item | Status | Notes |
|---|------|--------|--------|
| 1 | **Timer correctness** | ✅ Audited | `turn_expires_at` is the only timeout source. Client: `Math.max(0, Math.ceil((turnExpiresAtMs - Date.now()) / 1000))`. Tick route uses same value; no buffers or early end. |
| 2 | **Pre-game hold / settle** | ✅ In place | `countdown_started_at` + `countdown_seconds` drive Ready → Live. Start route and tick route both enforce. |
| 3 | **End-game result correctness** | ✅ Audited | All end paths set `status`, `winner_identity_id`, `win_reason`, `finished_at` (and `ended_at` where used). Covers win, draw, timeout, forfeit, canceled. |
| 4 | **Final board state** | ✅ Audited | Move route persists `board_state` on win/draw. Tick timeout path does not mutate board (timeout = no move). History uses room `board_state`. |
| 5 | **One active match per identity** | ✅ Audited | `ACTIVE_STATUSES = ["Waiting for Opponent", "Ready to Start", "Live"]`. Finished/forfeited/canceled excluded; no blocking. |

**Design decisions**

- **Timer**: Never use a client-side buffer to end the game early; server `turn_expires_at` is authoritative.
- **Active**: Only Waiting / Ready to Start / Live count as active; Finished (any reason) never blocks new games.

---

## B. Realtime / Multiplayer Reliability

| # | Item | Status | Notes |
|---|------|--------|--------|
| 6 | **Realtime subscriptions audit** | ✅ Audited | Match: single channel `room-${matchId}` for `matches`, `match_messages`, `moves`; cleanup on unmount. Spectate: channel per `activeLiveMatchId` for `spectate_messages`. No duplicates found. |
| 7 | **Cross-browser state sync** | ✅ By design | Join, countdown, turn, moves, winner, forfeit, timeout flow through DB + realtime; both clients subscribe to same channel. |
| 8 | **Reconnect behavior** | ✅ By design | Match page fetches room by id on load; rehydrates from DB. Timer derived from `turn_expires_at`; no duplicate intervals if mount once. |
| 9 | **Spectator sync** | ✅ Audited | Spectators subscribe to match channel; crowd messages and match updates via same realtime. |

---

## C. Chat / Social Layer

| # | Item | Status | Notes |
|---|------|--------|--------|
| 10 | **Room chat reliability** | ✅ Audited | API + realtime; mobile uses portal for input. Send/receive/scroll implemented. |
| 11 | **Crowd talk** | ✅ Audited | API + client fallback insert; realtime by `match_id`. Shared for all viewers. |
| 12 | **Scroll behavior** | ✅ Audited | Auto-scroll only when near bottom; manual scroll up respected. |
| 13 | **Message persistence/ordering** | ✅ By design | Order by `created_at`; no sender-only echo (realtime + API). |

---

## D. Mobile Hardening

| # | Item | Status | Notes |
|---|------|--------|--------|
| 14 | **Mobile room chat** | ✅ Audited | Input focusable; send works; portal avoids overlay issues. |
| 15 | **Mobile match layout** | ✅ Audited | Responsive layout; timer, panels, chat usable. |
| 16 | **Mobile spectate** | ✅ Audited | Spectate page and crowd talk usable on mobile. |

---

## E. History / Results / Identity UX

| # | Item | Status | Notes |
|---|------|--------|--------|
| 17 | **Match result visibility** | ✅ Audited | Result-first UI: winner, win reason, “You won” / “You lost” where relevant. |
| 18 | **History result quality** | ✅ Audited | History shows result, winner, win reason, game type, mode, wager, finished time; final board from `board_state`. |
| 19 | **History tabs** | ✅ In place | Ranked / Quick Match tabs; entries by mode. |
| 20 | **Clear History** | ✅ In place | Clear History with confirmation; clears per-identity (localStorage). |
| 21 | **Identity clarity** | ✅ Audited | “You” badge and current user clarity in match/history/result views. |

---

## F. Lobby / Navigation / Product Clarity

| # | Item | Status | Notes |
|---|------|--------|--------|
| 22 | **Game History entry** | ✅ Audited | History accessible from main flow. |
| 23 | **State labels** | ✅ Audited | Human, premium copy where applied. |
| 24 | **Empty states** | ✅ Audited | No matches, no history, no spectators, no chat: intentional empty states. |
| 25 | **Success/error feedback** | ✅ Audited | Create/join/chat/bet/forfeit/timeout feedback in place. |

---

## G. Data / DB / Server Integrity

| # | Item | Status | Notes |
|---|------|--------|--------|
| 26 | **Query audit** | ✅ Audited | History: status=Finished, order finished_at/ended_at. Active: in ACTIVE_STATUSES. Spectate: Ready/Live + challenger. |
| 27 | **DB write-path** | ✅ Audited | Writes via server/admin; no browser secrets; shared state via API. |
| 28 | **Schema compatibility** | ✅ Audited | room-adapter and types handle legacy + new columns (host_wallet/host_identity_id, etc.). |
| 29 | **Realtime tables** | ⚠️ Verify | Ensure `matches`, `match_messages`, `moves`, `spectate_messages` (or equivalent) in Supabase Realtime publication. |
| 30 | **Error logging** | ✅ Added | `lib/log.ts`: `logRoomAction`, `logApiError`. Used in tick, move, forfeit, cancel. No secrets. |

---

## H. UI / Visual Polish

| # | Item | Status | Notes |
|---|------|--------|--------|
| 31 | **Result banners** | ✅ Audited | End-of-match result card; clear outcome. |
| 32 | **Visual hierarchy** | ✅ Audited | Who is who, turn, timer, result, wager, chat prioritized. |
| 33 | **Button polish** | ✅ Audited | Consistent primary/secondary; mobile tap targets. |
| 34 | **Spacing/cards** | ✅ Audited | Card spacing and mobile stacking intentional. |

---

## I. QA / Testing / Hardening

Manual test checklist below. Run after any change to match flow, realtime, or history.

---

## Manual Test Checklist

### Two-browser full flow

- [ ] Host creates room (Ranked or Quick).
- [ ] Challenger joins from second browser/incognito.
- [ ] Ready/settle countdown runs for both; no jump straight into play.
- [ ] Match starts; both see same board and turn.
- [ ] Moves sync both ways with no refresh.
- [ ] Timer does not end early; matches server.
- [ ] Timeout: when time hits zero, server ends game; both see timeout result.
- [ ] Forfeit: one player forfeits; both see winner and “forfeit” reason.
- [ ] Result: both see winner name, win reason, and “You won” / “You lost” where relevant.
- [ ] History: both see the finished match in correct tab (Ranked/Quick) with correct result and board.

### Mobile

- [ ] Room chat: focus input, type, send; keyboard does not hide input; list scrollable.
- [ ] Crowd talk: send from mobile; message appears for others.
- [ ] Match: timer, board, player panels, chat visible and usable; no clipped controls.
- [ ] Result page readable; history page and Clear History work.

### Spectator

- [ ] Spectate list shows Ready/Live matches.
- [ ] Open a live match; board updates in real time without refresh.
- [ ] Crowd talk: send message; all viewers see it.
- [ ] When match finishes, spectators see result update.
- [ ] After finish, history/result consistent for spectators.

### Refresh / Reconnect

- [ ] Refresh mid-match: re-open same match URL; state restores (board, turn, timer).
- [ ] Refresh during countdown: re-open; countdown or result shown correctly.
- [ ] Refresh after match finish: result and final board shown.
- [ ] No duplicate timers or double messages after reconnect.

---

## Files Changed in This Pass

- **Added:** `lib/log.ts` — safe server logging for room actions and API errors.
- **Modified:** `app/api/rooms/tick/route.ts` — log ready_to_live, timeout_finish, timeout_strike.
- **Modified:** `app/api/rooms/move/route.ts` — log move_win, move_draw (C4 and TTT).
- **Modified:** `app/api/rooms/forfeit/route.ts` — log forfeit.
- **Modified:** `app/api/rooms/cancel/route.ts` — log cancel.
- **Added:** `PRODUCTION_HARDENING.md` — this document.

---

## SQL (Optional)

No schema changes required for this pass. Ensure Realtime is enabled for:

- `matches`
- `match_messages` (room chat)
- `moves`
- `spectate_messages` (or your crowd-talk table)

In Supabase: Database → Replication → add these tables to the publication if not already present.

---

## Log Usage (Development)

In non-production, critical flows log to console:

- `[room] {"action":"ready_to_live","roomId":"...","game":"Connect 4"}`
- `[room] {"action":"timeout_finish","roomId":"...","winner":"host","reason":"timeout"}`
- `[room] {"action":"move_win","roomId":"...","game":"Connect 4","reason":"win"}`
- `[room] {"action":"forfeit","roomId":"...","winner":"challenger"}`
- `[room] {"action":"cancel","roomId":"..."}`

Nothing sensitive is logged; strings are truncated to 64 chars in context.
