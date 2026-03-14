# RPS & Features — Live Verification Checklist

Use this to verify the RPS fix and related features in a real browser. The codebase has no e2e tests; this checklist is for manual runs.

---

## Live-debug mode (RPS transition)

Temporary diagnostics are in place to capture the **exact failing condition** in one test run. All logs are **development-only** (not in production builds).

### Files changed for diagnostics

| File | What was added |
|------|----------------|
| `lib/rooms/sync-policy.ts` | Log on every accept/reject when status is Ready to Start or Live (current or incoming): `[sync-policy]` with source, current_updatedAt/status, incoming_updatedAt/status, decision. Surfaces Ready→Waiting overwrites on joiner. |
| `app/api/rooms/start/route.ts` | One log per Ready→Live attempt: `[start Ready->Live]` with room_id, previous_status, countdown_end_ms, server_now_ms, client_time_ms, transition_allowed, db_rows_affected, final_returned_room_status. |
| `app/api/rooms/tick/route.ts` | Same for tick: `[tick Ready->Live]` with the same fields. |
| `app/arena/match/[id]/page.tsx` | `[start response]` payload; `[tick response]` when tick returns Ready or ready_to_live; throttled `[RPS render]`; **pregame:** `[pregame phrase] interval` (ref_status, advanced) every 5s; throttled `[pregame phrase] state` (role, phrase_index, match_status, shell_visible, etc.) when status is Ready to Start. |

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
- `[sync-policy]` — source, current_updatedAt, current_status, incoming_updatedAt, incoming_status, decision (accept/reject). Shows whether a refetch or realtime update was accepted or rejected (e.g. Live overwritten by Ready, or Ready overwritten by Waiting on joiner).
- `[pregame phrase] interval` — every 5s: ref_status (matchStatusRef when timer fired), advanced (true if phrase index incremented). On joiner, ref_status often not "Ready to Start" explains static phrase.
- `[pregame phrase] state` — throttled when Ready to Start: role, phrase_index, phrase_rotation_active, match_status, runtime_phase, bettingSecondsLeft, countdown_started_at, updated_at, shell_visible.
- `[RPS stuck diagnostic]` — (existing) once when countdown has ended but status still Ready: full client state.

**Server logs (terminal where `npm run dev` runs):**

- `[start Ready->Live]` — room_id, previous_status, countdown_end_ms, server_now_ms, client_time_ms, transition_allowed, db_rows_affected, final_returned_room_status.
- `[tick Ready->Live]` — same fields. Confirms whether the server allowed the transition and whether the DB update matched rows.

### What to paste back

After one run (whether the shell disappeared or stayed stuck), paste:

1. **Every line containing** `[RPS render]`, `[start response]`, `[tick response]`, `[sync-policy]`, `[pregame phrase]`, and if present `[RPS stuck diagnostic]` from the **browser console** on **both host and joiner** (from the moment the second player joins until ~10 seconds after countdown hits 0).
2. **Every line containing** `[start Ready->Live]` and `[tick Ready->Live]` from the **server terminal**.

That will show: which branch the page is rendering, what start/tick returned, whether sync-policy rejected an update, and what the server did (transition_allowed, db_rows_affected, final_returned_room_status). No further speculative fixes until this run is reviewed.

---

## Pregame phrase mismatch (host vs challenger) — diagnosis

**Observed:** Host sees rotating pregame phrases during the 30s countdown; the joiner (challenger) does not. This is treated as a **debugging signal** for the same client-state/render divergence that may cause RPS to stay stuck.

### Exact reason the joiner does not get rotating phrases (hypothesis)

The phrase rotation interval advances `countdownLineIndex` **only when** `matchStatusRef.current === "Ready to Start"`. The ref is updated in the render body (`matchStatusRef.current = match?.status ?? ""`), so it always holds the **last rendered** `match.status`.

- **Host:** After the challenger joins, the host’s `match` is updated (realtime or refetch) to "Ready to Start" and stays that way. So `matchStatusRef.current` is "Ready to Start" whenever the 5s interval fires → phrase advances.
- **Joiner:** The joiner’s first load calls `refreshRoom()`; that first read can return the room **before** the join is visible (e.g. replication lag), so `match` is "Waiting for Opponent". Later refetches may return "Ready to Start", but if refetch or realtime **overwrites** "Ready to Start" with "Waiting for Opponent" (e.g. stale read with newer `updated_at`, or no sync rule protecting Ready→Waiting), then the joiner’s `match.status` (and thus `matchStatusRef.current`) is often "Waiting for Opponent". When the 5s interval runs, it sees `ref_status !== "Ready to Start"` and **does not advance** → joiner sees a single static phrase.

So the **exact reason** is: **on the joiner, `matchStatusRef.current` is not "Ready to Start" when the phrase interval fires**, either because (1) the joiner’s `match` is often "Waiting for Opponent" due to refetch/realtime overwriting "Ready to Start", or (2) the joiner never stably receives "Ready to Start" (e.g. first refetch is always stale). Diagnostics will confirm which.

### Does this share the same root cause as the stuck RPS shell?

**Yes, likely.** Both depend on the client holding **stable "Ready to Start"** (and then "Live") state:

- **Phrase rotation:** Needs `match.status === "Ready to Start"` so the ref is "Ready to Start" when the interval fires.
- **RPS transition:** Needs `match.status` to become "Live" and stay Live (not overwritten by refetch/realtime with "Ready to Start" or "Waiting for Opponent").

If the joiner’s state is often overwritten by stale refetch/realtime (e.g. "Ready to Start" → "Waiting for Opponent", or Live → Ready), then (1) the phrase never rotates, and (2) the RPS shell can stay "Ready to Start" or flip back. So fixing one (e.g. sync policy or initial hydration for joiner) may fix both.

### Files changed for pregame phrase diagnostics

| File | What was added |
|------|----------------|
| `app/arena/match/[id]/page.tsx` | **Interval callback:** Every 5s the phrase timer logs `[pregame phrase] interval` with `ref_status` (value of `matchStatusRef.current`) and `advanced` (true if index was incremented). **State log:** When `match.status === "Ready to Start"`, throttled `[pregame phrase] state` with role, phrase_index, phrase_rotation_active, match_status, runtime_phase, bettingSecondsLeft, countdown_started_at, updated_at, shell_visible. |
| `lib/rooms/sync-policy.ts` | Sync-policy log now also runs when **current** status is "Ready to Start" (so we see when incoming "Waiting for Opponent" is accepted/rejected and could overwrite the joiner’s Ready state). |

### Live-debug instructions for phrase mismatch

1. **Host:** Open match page, create RPS, wait for joiner. In DevTools console, note `[pregame phrase] interval` (should show `ref_status: "Ready to Start"`, `advanced: true` every 5s) and `[pregame phrase] state` (role: host, phrase_index increasing).
2. **Joiner:** In a second browser/incognito, join the same match. In DevTools console, note:
   - `[pregame phrase] interval` — if you see `ref_status: "Waiting for Opponent"` and `advanced: false` every 5s, that confirms the ref is never "Ready to Start" when the interval fires.
   - `[pregame phrase] state` — role: challenger, match_status (Ready to Start vs Waiting for Opponent), phrase_index (likely stuck at 0).
   - `[sync-policy]` — if you see `current_status: "Ready to Start"`, `incoming_status: "Waiting for Opponent"`, `decision: "accept"`, then refetch/realtime is overwriting Ready with Waiting on the joiner.
3. **Paste back:** From **both** host and joiner consoles (from join until ~30s after): every line containing `[pregame phrase]`, and every `[sync-policy]` line where current_status or incoming_status is "Ready to Start" or "Waiting for Opponent".

### Exact strings to search for (pregame phrase)

**Browser console (both host and joiner):**

- `[pregame phrase] interval` — ref_status, advanced. On joiner, if ref_status is never "Ready to Start", rotation is blocked.
- `[pregame phrase] state` — role, phrase_index, phrase_rotation_active, match_status, runtime_phase, bettingSecondsLeft, countdown_started_at, updated_at, shell_visible.
- `[sync-policy]` — when current_status is "Ready to Start" and incoming_status is "Waiting for Opponent", decision shows whether we allowed the overwrite.

### After logs: logic pass checklist

When logs are back, use them to:

1. **Confirm the joiner’s phrase rotation path**  
   Compare host vs joiner: same status/effect conditions or different gating?
   - Does the joiner ever log `[pregame phrase] state` with `match_status: "Ready to Start"` and `role: "challenger"`?
   - On the joiner, does `[pregame phrase] interval` show `ref_status: "Ready to Start"` at any time, or always something else (e.g. `"Waiting for Opponent"`)?
   - If the joiner’s `ref_status` is never "Ready to Start", then the **effect/interval is the same** for both; the difference is **state** (joiner’s `match.status` / ref not staying "Ready to Start"). If the joiner sometimes has `match_status: "Ready to Start"` in state but `ref_status` is still not "Ready to Start" when the interval fires, that suggests timing (ref updated after interval read) or a different render path.

2. **Check for different gating**  
   - Is phrase rotation (or the CountdownOverlay that shows the phrase) gated by host-only or challenger-only logic (e.g. `isHostUser` / `isChallengerUser`, or `challenger` presence) in `app/arena/match/[id]/page.tsx`?
   - Today the phrase interval is keyed only by `[matchId]` and uses `matchStatusRef.current === "Ready to Start"` with no role check. The CountdownOverlay is shown when `match.status === "Ready to Start" && challenger` — same condition for both. So if logs show the joiner’s `match_status` often "Waiting for Opponent", the divergence is state/sync, not a different code gate. If logs show the joiner often "Ready to Start" but phrase still doesn’t rotate, re-check for any other branch (e.g. different overlay or effect dependency) that could apply only to the joiner.

3. **RPS**  
   Use the same logs to see why the shell stays "Ready to Start" and controls never show (start/tick response, sync-policy, RPS render branch).

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
