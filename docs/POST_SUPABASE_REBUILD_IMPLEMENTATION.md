# Post-Supabase Rebuild Implementation Pass

This document summarizes the implementation pass that aligns KasRoyal with the upgraded Supabase schema and product rules.

---

## 1. Diagnosis (What Was Likely Broken)

After reviewing the code against the updated DB shape:

| Area | Issue | Fix |
|------|--------|-----|
| **Status values** | Code wrote/queried "Waiting for Opponent", "Ready to Start", "Live", "Finished". New DB supports `waiting`, `ready`, `countdown`, `live`, `finished`, `forfeited`, `canceled`. | Introduced `lib/rooms/db-status.ts` with canonical DB status; list/create/join/start/tick/move/cancel/forfeit now write and query using both legacy and canonical values for compatibility. |
| **Series columns** | Code used only `host_round_wins`, `challenger_round_wins`, `current_round`. New DB has `round_number`, `host_score`, `challenger_score`. | `mapDbRowToRoom` reads from both sets; all series writes now set `round_number`, `host_score`, `challenger_score` alongside legacy columns. |
| **active_identity_matches** | Not used. One active match per identity was enforced only via `listActiveRooms` in create/join. | Table created in migration; `claimActiveMatch` on create/join, `releaseActiveMatchByMatch` on cancel/forfeit/finish (move + tick timeout). |
| **Countdown consistency** | Room adapter used hardcoded 30s for `bettingClosesAt`; match page used `match.bettingWindowSeconds ?? 30`. Server uses `room.countdownSeconds`. | Adapter now uses `room.countdownSeconds` for countdown end and passes `bettingWindowSeconds` from it so client and server use the same duration. |
| **Connect 4 input** | Already unified (column headers only, same `dropConnect4(col)` for both sides). | Confirmed; added `isSpectatorOnly` to column-button `disabled` so spectators cannot trigger the drop UI. |
| **History list** | Queried only `status === "Finished"`. New DB uses `finished`, `forfeited`, `canceled`. | `listHistoryRooms` and `listRecentResolvedRooms` now use `FINISHED_STATUS_VALUES` (canonical + legacy). |
| **Cancel/forfeit status** | Wrote `status: "Finished"` with `win_reason`. New DB has distinct `canceled` / `forfeited`. | Cancel writes `status: canceled`, forfeit writes `status: forfeited`; both release active match. |

---

## 2. Schema Assumptions (Aligned With Upgraded DB)

- **matches.status**: Canonical values `waiting` | `ready` | `countdown` | `live` | `finished` | `forfeited` | `canceled`. Code still accepts legacy strings for reads; writes use canonical where applicable.
- **matches series**: Both column sets supported:
  - Legacy: `host_round_wins`, `challenger_round_wins`, `current_round`
  - New: `round_number`, `host_score`, `challenger_score`
- **active_identity_matches**: `identity_id` (PK), `match_id`, `created_at`. One row per identity; claim on create/join, release on cancel/forfeit/finish.
- **match_messages** / **spectate_messages**: Unchanged; room chat and crowd chat paths unchanged.
- **Realtime**: Publication includes `matches`, `moves`, `match_messages`, `spectate_messages`, `bets`; no code changes required for that.

---

## 3. Implementation Summary

### New files

- **`lib/rooms/db-status.ts`** — Canonical DB status constants and lists for active/finished/spectate.
- **`supabase/migrations/20250313000000_active_identity_matches.sql`** — Adds `round_number`, `host_score`, `challenger_score` to `matches` if missing; creates `active_identity_matches` and index.

### Modified files

- **`lib/engine/match/types.ts`** — `ROOM_STATUS_TO_UI` includes `countdown` → "Ready to Start"; series fields read from `host_score`/`challenger_score`/`round_number` with fallback to legacy.
- **`lib/rooms/rooms-service.ts`** — List/query use DB status arrays (with legacy); createRoom/joinRoom write canonical status and series columns; `claimActiveMatch` / `releaseActiveMatchByMatch`; cancelRoom/forfeitRoom write `canceled`/`forfeited` and release.
- **`lib/rooms/room-adapter.ts`** — Countdown uses `room.countdownSeconds` for `bettingClosesAt` and `bettingWindowSeconds`.
- **`app/api/rooms/start/route.ts`** — Writes `status: DB_STATUS.LIVE`, series columns, and filters with `.in("status", ["ready", "countdown", "Ready to Start"])`.
- **`app/api/rooms/tick/route.ts`** — Same status and filter; timeout finish writes `DB_STATUS.FINISHED` and calls `releaseActiveMatchByMatch`; timeout strike filter `.in("status", ["Live", "live"])`.
- **`app/api/rooms/cancel/route.ts`** — Uses `cancelRoom()` from rooms-service (status canceled + release).
- **`app/api/rooms/move/route.ts`** — All finished transitions use `DB_STATUS.FINISHED`, `.in("status", ["Live", "live"])`, `releaseActiveMatchByMatch` after finish, and write `round_number`/`host_score`/`challenger_score` in all series updates.
- **`app/arena/match/[id]/page.tsx`** — Connect 4 column buttons disabled when `isSpectatorOnly`.

### Behaviors

- **Countdown**: Server and client use the same duration via `countdownSeconds`; adapter passes it through; no change to server-time sync or tick polling.
- **BO3/BO5**: Already correct in move route; now also persisted to `round_number`, `host_score`, `challenger_score`.
- **Room chat / crowd chat**: No changes; already use `match_messages` and `spectate_messages` with send API and realtime.
- **One active match per identity**: Enforced via `active_identity_matches` (claim on create/join, release on cancel/forfeit/finish). Create/join still use `listActiveRooms` as a pre-check; if the table is missing, claim/release are no-ops (log only).

---

## 4. SQL Migrations

Run in order:

1. Existing migrations (through `20250312210000_matches_match_messages_indexes.sql`).
2. **`20250313000000_active_identity_matches.sql`**  
   - Adds `round_number`, `host_score`, `challenger_score` to `matches` if not present.  
   - Creates `active_identity_matches` (identity_id PK, match_id, created_at) and index on `match_id`.

---

## 5. Testing Checklist (Concise)

- **Create / join**: Create room → join as challenger; both see ready/countdown; countdown uses same duration on both clients.
- **Countdown**: No early transition; host and challenger see same countdown; refresh during countdown rehydrates and keeps same end time.
- **Live / move**: Connect 4 and Tic-Tac-Toe moves apply for both; only current turn can move; spectators cannot drop.
- **BO3/BO5**: Win rounds; round score and round_number advance; match finishes only at 2 (BO3) or 3 (BO5) wins; board resets between rounds.
- **Finish**: Move win/draw, timeout, forfeit, cancel all set correct status and release `active_identity_matches`.
- **History**: Finished/forfeited/canceled matches appear in history with correct status and series score where applicable.
- **One active match**: With `active_identity_matches` in place, creating or joining while already in an active match should be blocked by the existing create/join checks (and optionally by DB once you enforce uniqueness).

---

## 6. Optional Next Steps

- **Enforce one active match in DB**: e.g. trigger or app logic that rejects insert into `active_identity_matches` when identity already has a row (or use a unique constraint and handle conflict in create/join).
- **Mobile chat**: Audit fixed bottom input, keyboard overlap, and scroll padding on the match page (no code changes in this pass).
- **Result UX**: Expand “Match Over” copy (e.g. win reason, series summary) if desired; data is already available on the room object.
