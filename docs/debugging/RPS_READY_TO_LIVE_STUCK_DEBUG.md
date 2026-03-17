# RPS Ready→Live Stuck – In-Depth Debug Summary

**Use this document to help fix the bug where Rock Paper Scissors gets stuck on "Match is starting… / READY TO START" and never transitions to the hand-selection screen.**

---

## 1. Symptom

- UI shows: **"Match is starting… Stay here — the arena will go live shortly."** and status badge **"READY TO START"**.
- Countdown reaches **0** (or shows a loading/ellipsis state).
- The match **never** transitions to **Live**; the RPS hand-selection screen never appears.
- Both players are seated (host + challenger); it’s a **Ready → Live transition** failure, not a general RPS start bug.

---

## 2. High-Level Flow (Ready → Live)

1. **Challenger joins** → `joinRoom()` in `lib/rooms/rooms-service.ts` writes DB: `status: "ready"`, `countdown_started_at`, `countdown_seconds: 30`, `betting_closes_at`. DB status is lowercase `"ready"`.
2. **Client** gets room via initial load or realtime; `mapDbRowToRoom()` maps DB `"ready"` → UI `"Ready to Start"`. Client shows countdown using `countdownEndMs = countdownStartedAt + countdownSeconds*1000` (or `bettingClosesAt`).
3. **When countdown reaches 0**, two client paths can trigger the transition:
   - **Tick** (every 1s): `POST /api/rooms/tick` with `{ room_id, client_time_ms: Date.now() }`.
   - **Start** (every 2s): `POST /api/rooms/start` with `{ room_id, client_time_ms: Date.now() }` when `countdownEndMsRef.current > 0` and `Date.now() >= countdownEndMsRef.current`.
4. **Server** (tick or start) checks:
   - `canTransitionReadyToLive(room, nowMs)` → true only if `room.status === "Ready to Start"`, `challengerIdentityId` set, `countdownStartedAt` set, `nowMs >= countdownEndMs`, and `getGameDriver(room.game)` non-null.
   - **Or** `clientSaysGo`: `clientTimeMs >= countdownEndMs` (or if `countdownEndMs === 0`, then `clientTimeMs - roomUpdatedAtMs > 35000`).
5. If transition allowed, server calls `getReadyToLivePayload(room, now)` (builds `status: "live"`, `board_state` for RPS via `createRpsRoundBoard(...)`), then:
   - `supabase.from("matches").update(payload).eq("id", roomId).in("status", READY_LIKE_STATUSES).select("*")`.
6. **Critical**: The DB **status** column must match one of `READY_LIKE_STATUSES`: `["ready", "countdown", "Ready to Start", "Ready To Start"]`. When the challenger joins, the DB is set to `DB_STATUS.READY` = `"ready"`, so the update **should** match. If the DB had a different value (e.g. legacy `"Waiting for Opponent"` or a typo), the update would affect **0 rows** and the room would stay Ready.
7. **Client** receives `{ ok: true, room, transition: "ready_to_live", server_time_ms }`. It runs `setMatch(prev => acceptAndReconcile(reconciled, prev, "tick"))`. So the client applies the room from the tick/start response **only if** the sync policy accepts it.
8. **Sync policy** (`lib/rooms/sync-policy.ts`):
   - For **tick**: accept if `incomingUpdatedAt >= currentUpdatedAt`, **or** (for RPS) if the incoming room is a "fresh round" board (both choices null) and current has choices (special case for next-round, not Ready→Live).
   - For **ej** (refetch): **never** accept when `current.status === "Live"` and `incoming.status === "Ready to Start"` (prevents stale refetch from overwriting Live).
9. **Refetch (ej)** runs every **2s** via `setInterval(() => refreshRoom(), 2000)` and on **realtime** `postgres_changes` on `matches`. So: tick might set Live, then ~2s later (or immediately on realtime) `refreshRoom()` runs → `getRoomById()` → `acceptAndReconcile(room, prev, "ej")`. If that refetch returns a room that is **still Ready** (e.g. request was in-flight before the tick updated the DB), the sync policy should **reject** it so we don’t overwrite Live with Ready.

---

## 3. Where It Can Break

### A. Server never transitions (tick/start return Ready)

- **`canTransitionReadyToLive` returns false**
  - `room.countdownStartedAt` is null → check DB and `mapDbRowToRoom`: `countdown_started_at` must be set by `joinRoom` and read as `new Date(...).getTime()`.
  - `room.countdownSeconds` wrong or missing → Room uses `Number(row.countdown_seconds ?? 30)`; join sets `countdown_seconds: 30`. So countdown end = start + 30_000 ms.
  - **Server clock behind**: `nowMs < countdownEndMs` so server thinks countdown not finished. The client sends `client_time_ms`; server uses `clientSaysGo = clientTimeMs >= countdownEndMs` so if client clock is ahead, transition can still happen.
- **`client_time_ms` not sent**
  - Tick effect only adds `body.client_time_ms = Date.now()` when `match?.status === "Ready to Start"`. If the effect closed over an old match or the request doesn’t include it, server won’t have client time and will rely only on `serverSaysGo`.
- **`getReadyToLivePayload` returns null**
  - Happens if `getGameDriver(room.game)` is null. Game type is normalized in lifecycle (`normalizeGameForDriver`); DB stores `game_type` (e.g. "Rock Paper Scissors"). If the DB has a different string (e.g. "rock paper scissors" or typo), driver might be null.
- **Update affects 0 rows**
  - `.in("status", READY_LIKE_STATUSES)` must match the row. DB has `"ready"` after join. If something else wrote a different status (e.g. `"Waiting for Opponent"` or `"live"` already), the update won’t match. Check server log: `[tick Ready→Live] update affected 0 rows` and `refetched_status`.

### B. Client rejects the Live update (tick/start response)

- **Sync policy for tick**: `incomingUpdatedAt >= currentUpdatedAt`. If the **tick response** room has an **older** `updated_at` than the client’s current match (e.g. current came from a later refetch or mutation), the client **rejects** the tick and keeps the old state. So the client could stay on Ready if the "current" match had a newer `updated_at` than the room that just went Live. (Unlikely for Ready→Live because the Live room’s `updated_at` is the transition time; current Ready room should be older.)
- **Bug**: If the server returns the room **without** updating `updated_at` in the response (e.g. payload has `updated_at: nowIso` but the returned row from `.select("*")` has an old value), then `incomingUpdatedAt` could be old and we’d reject.

### C. Refetch (ej) overwrites Live with Ready

- **Intended**: When current is Live and incoming is Ready, `shouldAcceptRoomUpdate` returns **false** for source `"ej"` so we don’t apply the refetch.
- **If that’s wrong**: e.g. we pass a different source, or the comparison is reversed, then a stale refetch (room still Ready) could overwrite Live. Check browser for `[R] REJECTED` with `source: "ej"` and `ej_overwrote_live: true` — that means we correctly rejected an overwrite. If you see `[R] ACCEPTED` with `source: "ej"` and `mapped_status: "Ready to Start"` **after** a tick had set Live, that’s the bug.

### D. Client never gets a response with Live (network / no apply)

- Tick or start request fails or doesn’t return `transition: "ready_to_live"`.
- Client applies only when `data.ok && data.room`; if the server returns an error or no room, we don’t call `acceptAndReconcile`.

### E. Countdown / timer wrong so "0" never triggers transition

- **`countdownEndMsRef`** is set in **render** when `match.status === "Ready to Start"`:  
  `endMs = match.bettingClosesAt ?? (match.countdownStartedAt + (match.countdownSeconds ?? match.bettingWindowSeconds ?? 30) * 1000)`;  
  `countdownEndMsRef.current = endMs`.
- If **`match.countdownStartedAt`** or **`match.bettingClosesAt`** is missing or wrong (e.g. room loaded before challenger joined, or wrong timezone), `endMs` can be 0 or in the past. Then:
  - `countdownEndMsRef.current <= 0` → the **start** effect returns early and never calls `/api/rooms/start`.
  - Tick still runs and sends `client_time_ms`; server can still transition via `clientSaysGo` if `clientTimeMs >= countdownEndMs` (or 35s fallback when `countdownEndMs === 0`).
- **Display**: `bettingSecondsLeft` is derived from `countdownEndMs` and server-time sync. If `countdownEndMs` is 0, we show 0; if server time is used and is behind, we might show positive seconds until the server catches up.

---

## 4. Key Files and Locations

| What | File | Notes |
|------|------|--------|
| Tick Ready→Live branch | `app/api/rooms/tick/route.ts` | ~lines 64–170: `room.status === "Ready to Start"`, countdown check, `getReadyToLivePayload`, `.update(payload).in("status", READY_LIKE_STATUSES)"`. |
| Start route | `app/api/rooms/start/route.ts` | Same logic: countdown check, payload, `.in("status", READY_LIKE_STATUSES)"`. |
| Transition allowed? | `lib/rooms/lifecycle.ts` | `canTransitionReadyToLive(room, nowMs)` (needs countdownStartedAt, nowMs >= countdownEndMs, driver); `getReadyToLivePayload(room, now)` (driver, RPS uses `createRpsRoundBoard`). |
| DB status for update | `lib/rooms/lifecycle.ts` | `READY_LIKE_STATUSES = ["ready", "countdown", "Ready to Start", "Ready To Start"]`. |
| Join room (sets countdown) | `lib/rooms/rooms-service.ts` | `joinRoom`: writes `status: DB_STATUS.READY` (`"ready"`), `countdown_started_at`, `countdown_seconds`, `betting_closes_at`. |
| DB row → Room | `lib/engine/match/types.ts` | `mapDbRowToRoom`: `status = ROOM_STATUS_TO_UI[statusRaw]`; `"ready"` → `"Ready to Start"`, `"live"` → `"Live"`. `countdownStartedAt` from `countdown_started_at` (Date → getTime()). |
| Accept or reject update | `lib/rooms/sync-policy.ts` | `shouldAcceptRoomUpdate` (tick: incomingUpdatedAt >= currentUpdatedAt; ej: reject if current Live and incoming Ready). `acceptAndReconcile` logs `[R] ACCEPTED` / `[R] REJECTED`. |
| Client tick loop | `app/arena/match/[id]/page.tsx` | Effect with deps `[matchId, match?.id, match?.status, ...]`; `runTick()` fetches `/api/rooms/tick` with `client_time_ms` when status is Ready to Start; then `setMatch(prev => acceptAndReconcile(..., "tick"))`. |
| Client start loop | `app/arena/match/[id]/page.tsx` | Effect when `match?.status === "Ready to Start"`; every 2s if `countdownEndMsRef.current > 0` and `Date.now() >= countdownEndMsRef.current` calls `/api/rooms/start` and then `refreshRoom()`. |
| countdownEndMsRef set | `app/arena/match/[id]/page.tsx` | In render: when `match.status === "Ready to Start"`, `countdownEndMsRef.current = endMs` (from bettingClosesAt or countdownStartedAt + seconds). |
| refreshRoom (ej) | `app/arena/match/[id]/page.tsx` | `getRoomById(supabase, matchId)` then `acceptAndReconcile(reconciled, prev, "ej")`. Called every 2s and on realtime. |

---

## 5. Logs to Check (in order)

1. **Server (Node / API logs)**  
   - `[tick Ready→Live] countdown branch` — `server_says_go`, `client_says_go`, `will_attempt_transition`, `countdown_end_ms`, `server_now_ms`, `client_time_ms`.  
   - If `will_attempt_transition: false`: server thinks countdown not finished or driver null; fix server time or payload.  
   - `[tick Ready→Live] update succeeded` — confirms update ran, `resulting_status`, `has_board_state`.  
   - `[tick Ready→Live] update affected 0 rows` — update didn’t match; check `refetched_status` and that DB `status` is in `READY_LIKE_STATUSES`.

2. **Browser console**  
   - `[R] ACCEPTED` with `source: "tick"`, `mapped_status: "Live"` → client applied Live from tick/start; if UI still Ready, something else overwrote state or render is wrong.  
   - `[R] REJECTED` with `source: "tick"` → client rejected tick (e.g. older `updated_at`); check `incoming_updatedAt` vs `current_updatedAt`.  
   - `[R] REJECTED` with `source: "ej"`, `ej_overwrote_live: true` → refetch tried to overwrite Live with Ready and was correctly rejected.  
   - `[match page] refreshRoom (ej) got room` — refetch result: `raw_status`, `updatedAt`. If you see `raw_status: "Ready to Start"` after tick had set Live, refetch is stale and should be rejected by sync policy.

3. **Client countdown**  
   - If `countdownEndMsRef.current` stays 0: room likely missing `countdownStartedAt` / `bettingClosesAt` (e.g. loaded before join). Then start effect never fires; rely on tick + `client_time_ms` and server `clientSaysGo`.

---

## 6. Possible Root Causes (concise)

1. **DB status mismatch**  
   Row status not in `READY_LIKE_STATUSES` → update matches 0 rows. Fix: ensure join (and any other path) writes `"ready"` (or one of the other allowed values).

2. **Server clock vs client clock**  
   Server `nowMs < countdownEndMs` so `serverSaysGo` false, and `client_time_ms` not sent or not used → transition never allowed. Fix: ensure tick/start send `client_time_ms` and server uses `clientSaysGo` when client time >= countdownEndMs.

3. **Stale refetch overwrites Live**  
   Sync policy bug or wrong source so ej overwrites Live with Ready. Fix: enforce in `shouldAcceptRoomUpdate`: when source is ej/refetch and current is Live and incoming is Ready, return false; verify with `[R]` logs.

4. **Tick response has old `updated_at`**  
   Client rejects tick because `incomingUpdatedAt < currentUpdatedAt`. Fix: ensure tick/start response room has `updated_at` set to the transition time (payload has `updated_at: nowIso`; confirm `.select("*")` returns it).

5. **countdownEndMsRef never set**  
   Room without `countdownStartedAt`/`bettingClosesAt` → endMs 0 → ref 0 → start effect never runs. Tick still runs; server can still use `clientSaysGo` (e.g. 35s fallback). Fix: ensure after join the client gets a room with `countdown_started_at` and `countdown_seconds` (or equivalent) so ref and display are correct.

6. **getGameDriver(room.game) null**  
   e.g. DB `game_type` string doesn’t normalize to "Rock Paper Scissors". Fix: normalize in lifecycle; ensure DB and driver keys match.

---

## 7. Quick Verification Checklist

- [ ] Server log shows `will_attempt_transition: true` when countdown should be 0.  
- [ ] Server log shows `update succeeded` (not `update affected 0 rows`) or, if 0 rows, refetched status is `"live"`.  
- [ ] Browser shows `[R] ACCEPTED` with `source: "tick"` and `mapped_status: "Live"` after countdown.  
- [ ] If browser shows `[R] REJECTED` for tick: compare `incoming_updatedAt` and `current_updatedAt`.  
- [ ] If browser shows `[R] REJECTED` for ej with `ej_overwrote_live: true`: refetch overwrite was blocked (correct).  
- [ ] DB row after join has `status = 'ready'` and `countdown_started_at` set.  
- [ ] Tick request body includes `client_time_ms` when status is Ready to Start.

Use this summary together with the code references and logs to narrow down whether the failure is server-side (transition never happens), client-side (reject or overwrite), or countdown/timing (ref/server time).
