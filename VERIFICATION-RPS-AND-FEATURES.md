# RPS & Features — Live Verification Checklist

Use this to verify the RPS fix and related features in a real browser. The codebase has no e2e tests; this checklist is for manual runs.

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

- **When countdown has ended but UI is still “Ready”** you should see **once**:
  - `[RPS stuck diagnostic] client state after countdown ended:` with `status`, `game`, `updatedAt`, `countdownStartedAt`, `bettingClosesAt`, `bettingWindowSeconds`, `board_state_mode`, `rps_hasPersistedState`.

- **After calling start** (when countdown hits 0):
  - `[start-response]` with `ok`, `roomStatus`, `countdownNotExpired`, `alreadyLive`, `willApply`.
  - **Successful transition:** `roomStatus` or returned room should become `"Live"`, `countdownNotExpired` false, `willApply` true. Shell should disappear and RPS controls show.

### Server logs (dev only)

- If server thinks countdown not expired: `[start] countdown not expired` with `roomId`, `countdownStartedAt`, `countdownEndMs`, `nowMs`, `clientTimeMs`, `serverSaysGo`, `clientSaysGo`.
- When client time is used to allow transition: `[start] using client time; server clock may be behind` with `roomId`, `nowMs`, `clientTimeMs`, `countdownEndMs`.

### If it still sticks

Note and report:

- Exact `[RPS stuck diagnostic]` and `[start-response]` values.
- Whether you see `[start] countdown not expired` or `using client time` in server logs.
- Whether a **tick** request is also sent when status is “Ready to Start” (and if so, what the tick route returns).

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
