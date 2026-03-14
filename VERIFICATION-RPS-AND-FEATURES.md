# RPS & Features — Live Verification Checklist

Use this to verify the RPS fix and related features in a real browser. The codebase has no e2e tests; this checklist is for manual runs.

---

## Live-debug mode (RPS transition)

Temporary diagnostics are in place to capture the **exact failing condition** in one test run. All logs are **development-only** (not in production builds).

### Files changed for diagnostics

| File | What was added |
|------|----------------|
| `lib/rooms/sync-policy.ts` | Log on every accept/reject when status is Ready or Live: `[sync-policy]` with source, current_updatedAt/status, incoming_updatedAt/status, decision. |
| `app/api/rooms/start/route.ts` | One log per Ready→Live attempt: `[start Ready->Live]` with room_id, previous_status, countdown_end_ms, server_now_ms, client_time_ms, transition_allowed, db_rows_affected, final_returned_room_status. |
| `app/api/rooms/tick/route.ts` | Same for tick: `[tick Ready->Live]` with the same fields. |
| `app/arena/match/[id]/page.tsx` | `[start response]` payload (ok, room_status, room_updatedAt, countdownNotExpired, alreadyLive, willApply); `[tick response]` when tick returns Ready or ready_to_live; one throttled `[RPS render]` (shell_visible, controls_visible, match_status, updatedAt, board_state_mode, runtime flags). |

### How to run one RPS test and what to paste back

1. **Start dev server**  
   `npm run dev`

2. **Open browser DevTools**  
   Console tab visible; ensure “Preserve log” is on so refresh doesn’t clear.

3. **Optional: terminal for server logs**  
   If you run `npm run dev` in a terminal, keep it visible to see server-side `[start Ready->Live]` and `[tick Ready->Live]`.

4. **Create RPS match**  
   Arena → Create match → Rock Paper Scissors → Create. Copy the match URL.

5. **Second player joins**  
   Incognito (or second browser), same URL, sign in as another user, Join.

6. **Wait for countdown to hit 0**  
   Do not refresh. Wait ~30 seconds.

7. **Capture logs**  
   - **Browser console:** Filter or scroll to the relevant lines (see search strings below). Copy all matching lines (or a screenshot).  
   - **Server terminal:** Copy any lines containing the search strings below.

### Exact strings to search for

**Browser console (client):**

- `[RPS render]` — shell_visible, controls_visible, match_status, updatedAt, board_state_mode, runtime (isCountdown, bettingSecondsLeft, countdownEndMs, etc.). Tells you which branch is rendering and current state.
- `[start response]` — after each /api/rooms/start call: room_status, room_updatedAt, countdownNotExpired, alreadyLive, willApply.
- `[tick response]` — when tick returns room in Ready or transition ready_to_live: room_status, transition, server_time_ms, room_updatedAt.
- `[sync-policy]` — source, current_updatedAt, current_status, incoming_updatedAt, incoming_status, decision (accept/reject). Shows whether a refetch or realtime update was accepted or rejected (e.g. Live overwritten by Ready).
- `[RPS stuck diagnostic]` — (existing) once when countdown has ended but status still Ready: full client state.

**Server logs (terminal where `npm run dev` runs):**

- `[start Ready->Live]` — room_id, previous_status, countdown_end_ms, server_now_ms, client_time_ms, transition_allowed, db_rows_affected, final_returned_room_status.
- `[tick Ready->Live]` — same fields. Confirms whether the server allowed the transition and whether the DB update matched rows.

### What to paste back

After one run (whether the shell disappeared or stayed stuck), paste:

1. **Every line containing** `[RPS render]`, `[start response]`, `[tick response]`, `[sync-policy]`, and if present `[RPS stuck diagnostic]` from the **browser console** (from the moment the second player joins until ~10 seconds after countdown hits 0).
2. **Every line containing** `[start Ready->Live]` and `[tick Ready->Live]` from the **server terminal**.

That will show: which branch the page is rendering, what start/tick returned, whether sync-policy rejected an update, and what the server did (transition_allowed, db_rows_affected, final_returned_room_status). No further speculative fixes until this run is reviewed.

---

## 1. RPS full flow (create → join → countdown → Live → submit → BO3/BO5 → refresh)

### Steps

1. **Create RPS match**  
   Arena → Create match → choose **Rock Paper Scissors** → Create. Note the match URL.

2. **Join with second player**  
   Open the same match URL in an incognito (or second) browser, signed in as a different user. Join as challenger.

3. **Wait for countdown**  
   Do not refresh. Wait until the 30s (or configured) countdown reaches 0.

4. **Confirm shell disappears**  
   - The “Ready to Start” shell (e.g. “Match starts when the timer hits zero” / “…”) should disappear.  
   - If it stays: open DevTools → Console and look for logs below.

5. **Confirm RPS controls appear**  
   Rock / Paper / Scissors buttons (or equivalent controls) should be visible for both players.

6. **Both submit choices**  
   Each player picks; confirm both submissions are accepted and the round resolves (winner or draw).

7. **BO3 / BO5**  
   Play multiple rounds; confirm round counter and match end (first to 2 or 3 wins, or draw logic) work.

8. **Refresh / reconnect**  
   Refresh the page (or close and reopen the match). The match should **not** go back to “Ready to Start”; it should stay **Live** (or Finished) and show current round/state.

### Dev logs to check (browser console)

- **RPS render branch:** `[RPS render]` — shell_visible, controls_visible, match_status, updatedAt, board_state_mode, runtime (isCountdown, isIntermission, bettingSecondsLeft, countdownEndMs). Throttled; log when state changes or every 3s.
- **When countdown has ended but UI is still “Ready”** you may see **once**: `[RPS stuck diagnostic] client state after countdown ended:` with status, game, updatedAt, countdownStartedAt, bettingClosesAt, bettingWindowSeconds, board_state_mode, rps_hasPersistedState.
- **After calling start:** `[start response]` with ok, room_status, room_updatedAt, countdownNotExpired, alreadyLive, willApply. **Successful transition:** room_status `"Live"`, countdownNotExpired false, willApply true.
- **Tick responses:** `[tick response]` when tick returns room in Ready or transition ready_to_live: room_status, transition, server_time_ms, room_updatedAt.
- **Sync decisions:** `[sync-policy]` — source, current_updatedAt/status, incoming_updatedAt/status, decision (accept/reject). If you see decision "reject" with current_status "Live" and incoming_status "Ready to Start", a refetch/realtime tried to overwrite Live with Ready and was correctly rejected.

### Server logs (dev only)

- **Ready→Live attempts:** `[start Ready->Live]` and `[tick Ready->Live]` with room_id, previous_status, countdown_end_ms, server_now_ms, client_time_ms, transition_allowed, db_rows_affected, final_returned_room_status. Use these to see if the server allowed the transition and whether the DB update matched rows (1) or not (0).
- If server blocks transition: `transition_allowed: false`, `db_rows_affected: 0`, `final_returned_room_status: "Ready to Start"`.
- When client time is used: `[start] using client time; server clock may be behind` (unchanged).

### If it still sticks

Paste back all lines matching the **Exact strings to search for** in the Live-debug section above (browser + server). That gives the exact branch/value that is wrong.

---

## 2. Final winning move / piece visibility (BO3/BO5 intermission)

- After a round ends, the **first 4 seconds** of intermission should show: **“Round over — [Winner] won!”** (or draw) so the winning board/move is visible.
- The **next 4 seconds** should show: **“Round N starts in Xs”**.
- Total intermission = 8s (`INTERMISSION_SECONDS` in `lib/rooms/move-pipeline.ts`).  
Verify the final winning state is visible before the “Round N starts in” message dominates.

---

## 3. Pregame countdown — rotating lines

- While status is **“Ready to Start”**, the pregame overlay should show **rotating phrases** (from `COUNTDOWN_PHRASES` / `PREGAME_COUNTDOWN_LINES`) every **5 seconds**.
- Both **host and challenger** should see the line change (not one static line).  
If the challenger still sees one stuck line, the interval may be tied to refetch; the fix uses a single interval keyed by `matchId` and `matchStatusRef.current === "Ready to Start"`.

---

## 4. Spectator / crowd chat

- **Room Chat:** players can send; stored in `match_messages`; realtime + polling.
- **Crowd Chat:** **spectators only** can send; stored in `spectate_messages`; realtime (INSERT on `spectate_messages`) + polling.
- **Permissions:**  
  - Players: can send Room Chat; Crowd Chat input is **disabled** (read-only).  
  - Spectators: can send Crowd Chat; Room Chat send is restricted (players send).  
- **Verify:** Open match as a **spectator** (not host/challenger). Send a message in Crowd Chat. Confirm it persists and appears in realtime for other viewers. Confirm players see crowd messages but cannot send in Crowd Chat.

---

## Summary

| Item                    | What to verify |
|-------------------------|----------------|
| RPS fix                 | Shell disappears at 0; RPS controls appear; both submit; round resolves; BO3/BO5; refresh does not revert to Ready. |
| Final piece / intermission | 4s “Round over — X won!” then 4s “Round N starts in Xs”; winning board visible. |
| Rotating pregame lines  | Phrases rotate every 5s for both host and challenger. |
| Spectator crowd chat    | Spectators can send; messages persist and appear in realtime; players read-only in Crowd Chat. |

After running the RPS flow, report: (1) whether the transition to Live succeeded, (2) exact `[start-response]` and optional `[RPS stuck diagnostic]` values, (3) any new failing condition if it still sticks.
