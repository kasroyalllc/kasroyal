# Round-end / intermission UX polish

Short summary of the timing and display approach used for round-end and intermission UX. No server or move-pipeline changes.

---

## Timing / display approach

1. **Final winning move visibility**  
   The server already enters intermission for 5 seconds (`round_intermission_until` = now + 5s) when a round ends. The UI splits this into two phases:
   - **Celebrate** (first ~3 seconds): Show “Round over — [Name] won!” (or “Round N was a draw”) and “Next round in a moment…”. The **board stays visible**; no full-screen overlay. The numeric “Round N starts in X” countdown is not shown yet so attention stays on the winning result.
   - **Countdown** (remaining ~2 seconds): Show “Round N starts in X” with the same board still visible. When the server’s intermission expires, tick starts the next round and the board resets.

   So the “winning board visible briefly” behavior is achieved by **reusing the existing 5s intermission**: we only change what text we show in each part of that window (celebrate vs numeric countdown). No extra client-side delay and no fake state.

2. **Between-round countdown**  
   A dedicated **IntermissionBanner** (amber/gold, “Between rounds” label) appears above the board during intermission. Copy:
   - Celebrate phase: “Round N over — [Name] won!” / “Round N was a draw.” plus “Next round in a moment…”
   - Countdown phase: “Round N starts in X…”

   This is clearly separate from the pregame countdown (which uses a full overlay and “Match Starting Soon” / fuchsia styling).

3. **Pregame countdown**  
   The overlay now uses **PREGAME_COUNTDOWN_LINES**: short, rotating lines (e.g. “Match locked in.”, “Arena syncing.”, “Players ready.”, “Bets closing.”, “Game begins in…”) that change every ~1.2s. The big countdown number and “Match Starting Soon” remain; only the rotating hype line is sourced from this premium set.

4. **Distinct states**  
   Phase pill and StatCard “Phase” now show:
   - **Pregame countdown** (fuchsia) when in Ready-to-Start countdown
   - **Between rounds** (amber) when in intermission
   - **Paused** (sky) when match is paused
   - **Live** (or existing format) when playing

   Overlays/banners already had distinct labels (Match Starting Soon, Between rounds, Match Paused); the phase pill and Phase stat now match so the four states are obvious at a glance.

---

## Server timing: unchanged

- **No server or API changes.**  
  Move route, tick route, move-pipeline, and lifecycle are unchanged. Intermission length is still 5 seconds (`INTERMISSION_SECONDS` in move-pipeline). No new DB fields or timestamps.

- **UI-only.**  
  All behavior is driven by existing `round_intermission_until` and `last_round_winner_identity_id`. The client derives `intermissionPhase` from `intermissionSecondsLeft >= 3` (celebrate) vs &lt; 3 (countdown). No client-held delay timers and no desync with server.

---

## Files touched

- `lib/countdown-phrases.ts`: Added `PREGAME_COUNTDOWN_LINES` (short premium lines for pregame overlay).
- `app/arena/match/[id]/page.tsx`:
  - `IntermissionBanner` component (celebrate vs countdown copy; board stays visible).
  - `intermissionPhase`, `roundJustEnded`, `intermissionRoundWinnerName`, `nextRoundNumber` derived from existing match state.
  - Pregame overlay uses shuffled `PREGAME_COUNTDOWN_LINES` for rotating hype line.
  - Phase pill and Phase StatCard show Pregame countdown / Between rounds / Paused / Live.
  - IntermissionBanner rendered in Connect 4, Tic-Tac-Toe, and Rock Paper Scissors board shells when `isIntermission`.
  - Status paragraph copy for intermission updated to celebrate vs countdown phase.
