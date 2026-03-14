# KasRoyal Implementation Plan: Two Buckets

This document tracks **BUCKET A** (critical bug fixes) and **BUCKET B** (new game delivery) so both are explicitly tracked and executed.

---

## BUCKET A — Current Critical Fixes

**Order of work (do first):**

| # | Item | Status | Notes |
|---|------|--------|--------|
| 1 | Pre-game countdown still effectively stopping around 4 seconds | In progress / Verify | Server-time polling every 1s during countdown + tick every 1s when Ready. Verify it runs to 0. |
| 2 | Room chat only usable by players instead of everyone in the room | In progress / Verify | API has no participant check; client shows errors. Verify spectators can send. |
| 3 | Mobile room chat still not fully working | Pending | Audit mobile chat composer (portal, keyboard, focus). |
| 4 | Connect 4 host/challenger input consistency | Pending | Audit drop targets and turn/state for host vs challenger. |
| 5 | Pre-game wording/state sync | Pending | Copy and state labels for countdown/betting. |
| 6 | Crowd talk / spectator chat reliability | Pending | Spectate chat vs room chat; delivery and UI. |
| 7 | History/result/final board quality | Pending | History cards and result view for all game types. |

**Exact files involved (Bucket A):**

- Pre-game countdown: `app/arena/match/[id]/page.tsx` (server-time poll, tick interval), `app/api/rooms/tick/route.ts`, `app/api/rooms/start/route.ts`
- Room chat: `app/api/chat/send/route.ts`, `app/arena/match/[id]/page.tsx` (handleChatSubmit, chat form)
- Mobile chat: `app/arena/match/[id]/page.tsx` (portal, input, focus)
- Connect 4: `app/arena/match/[id]/page.tsx` (board, turn, dropConnect4)
- Pre-game wording: `app/arena/match/[id]/page.tsx`, `lib/mock/arena-data.ts`
- Crowd/spectator chat: `app/spectate/page.tsx`, `app/api/spectate/chat` (if any)
- History/result: `app/history/page.tsx`, `lib/mock/arena-data.ts` (getWinnerDisplayLine, getWinReasonLabel, etc.)

---

## BUCKET B — New Game Delivery

**Order (implement in this order):**

1. **Rock Paper Scissors** — DONE (see below). Verify end-to-end.
2. **Checkers**
3. **Battleship**
4. **Pong**
5. **Darts**

### Rock Paper Scissors — Implementation Complete

RPS is implemented as a full arena game. Delivered behavior:

- Selectable as a real game type in create-game and filters.
- Create/join like other matches; pre-game countdown; both players lock choice; reveal only after both submit; winner/draw and win_reason; result in history; spectators can watch (same match page).

**Exact files where RPS exists (for reference and verification):**

| Area | File | What |
|------|------|------|
| Types | `lib/engine/match-types.ts` | `GameType` includes `"Rock Paper Scissors"` |
| Types | `lib/engine/match/types.ts` | `RpsChoice`, `RpsBoardState`, `GameBoardState` |
| Types | `lib/db/types.ts` | `DbGameType` includes `"Rock Paper Scissors"` |
| Engine | `lib/engine/game-constants.ts` | `getMoveSecondsForGame("Rock Paper Scissors")` → 0 |
| Engine | `lib/rooms/game-board.ts` | `createInitialBoardState` RPS branch, `resolveRps`, `getRpsWinReason` |
| API | `app/api/rooms/start/route.ts` | RPS allowed; null turn fields |
| API | `app/api/rooms/tick/route.ts` | Ready→Live RPS; Live RPS no timeout |
| API | `app/api/rooms/move/route.ts` | RPS move = rock/paper/scissors; update board; on both set → reveal, winner, finish |
| Meta | `lib/engine/featured-markets.ts` | RPS in `gameDisplayOrder` |
| Meta | `lib/mock/arena-data.ts` | `gameMeta["Rock Paper Scissors"]`, RPS board helpers, `dbGameTypeToGameType` RPS |
| Arena | `app/arena/page.tsx` | RPS in create-game list and game filter |
| Match page | `app/arena/match/[id]/page.tsx` | `PersistedRpsBoardState`, `getRpsState`, `submitRpsChoice`, RPS UI (choices, reveal, result), move/turn labels |
| History/Spectate | History and Spectate use `match.game` and `gameDisplayOrder`/`gameMeta`; RPS appears automatically. |

**Bug fix applied this session:** `lib/mock/arena-data.ts` — `dbGameTypeToGameType` now maps `"Rock Paper Scissors"` so history/loaded rooms show the correct game type.

**RPS verification checklist:**

- [ ] Create match → select Rock Paper Scissors → start; second user joins.
- [ ] Pre-game countdown runs to 0 then match goes Live.
- [ ] Both players see three choices (Rock, Paper, Scissors); each locks one; no reveal until both locked.
- [ ] After both submit: both choices revealed, winner or draw and win_reason correct.
- [ ] Match finishes; result appears in History with game "Rock Paper Scissors", winner/draw, win reason.
- [ ] Spectator can open the match and see the reveal/result.

### Checkers, Battleship, Pong, Darts — To Be Implemented

Each will follow the same integration pattern as RPS and Connect 4 / Tic-Tac-Toe:

- Add to `GameType` and `DbGameType`.
- Add board state type and `createInitialBoardState` (and any move/win helpers).
- Add to `gameDisplayOrder`, `gameMeta`, and arena create/filter lists.
- Implement `/api/rooms/start`, `/api/rooms/tick`, `/api/rooms/move` branches.
- Add match page board UI (and any game-specific logic).
- Add to `dbGameTypeToGameType` and any history/spectate game-specific display if needed.

**Exact files to change per new game (template):**

- `lib/engine/match-types.ts` — add to `GameType`
- `lib/db/types.ts` — add to `DbGameType`
- `lib/engine/match/types.ts` — board state type(s), `GameBoardState` union
- `lib/engine/game-constants.ts` — move seconds (or 0 for simultaneous)
- `lib/rooms/game-board.ts` — `createInitialBoardState`, any resolve/win helpers
- `app/api/rooms/start/route.ts` — allow game, set turn/timer if needed
- `app/api/rooms/tick/route.ts` — Ready→Live and Live branches
- `app/api/rooms/move/route.ts` — move payload and state update
- `lib/engine/featured-markets.ts` — add to `gameDisplayOrder`
- `lib/mock/arena-data.ts` — `gameMeta`, board helpers, `dbGameTypeToGameType`, etc.
- `app/arena/page.tsx` — create-game list and filter
- `app/arena/match/[id]/page.tsx` — persisted state type, getState, submit/handler, board UI

Full copy-paste code for each new game will be produced when implementing that game.

---

## Summary

- **Bug fixes first:** Bucket A items 1–2 (countdown, room chat) have been worked on; verify and complete. Then 3–7 in order.
- **Rock Paper Scissors:** Already added. Fix `dbGameTypeToGameType` (done). Run verification checklist above.
- **Next games:** Checkers → Battleship → Pong → Darts, each with the same file list and full implementation (not left as ideas).
