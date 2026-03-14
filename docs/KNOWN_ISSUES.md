# Known issues

A concise list of unresolved issues and watchpoints. Do not treat items here as “done” until they are verified or fixed and removed from this list.

---

## Gameplay and product

- **RPS still reported stuck in live testing**: Rock Paper Scissors is implemented in the game driver and move pipeline (both choose, then reveal; round ends). User testing has previously reported it stuck on the pre-start shell or not progressing. Until verified in live product behavior, consider RPS “needs verification.” Check: both players can submit choice, reveal happens, round and series complete for BO1/BO3/BO5.
- **Pause needs user-perspective verification**: Pause/resume and pause-expiry logic exist in the API and tick route. End-to-end verification from a user perspective (pause as turn-holder, resume, auto-resume when time expires, pause count and per-side limits) is recommended before marking pause “done.”
- **Chess Duel not implemented**: Chess Duel is not in the game-driver layer. getGameDriver("Chess Duel") returns null. Create/start/move do not support it. Do not assume Chess works until a driver and board/move logic are added.

---

## Architecture and data

- **Tick 500 and arena store in production**: Fixes are in code (tick error capture, storage quota-safe persistence). Verify deploy and production behavior; if tick still 500s or storage errors recur, use docs/PRODUCTION-STABILIZATION.md and docs/DEPLOY-AND-VERIFY.md to capture payloads and next steps.
- **History/event timeline**: The event timeline and round record (match_events, match_rounds) and timeline API are implemented. Any future “deeper architecture pass” for history (e.g. event log UI, audit views) should build on this; do not replace it with UI-only summaries.
- **Legacy compatibility reads**: mapDbRowToRoom and related mapping still read legacy columns (host_wallet, wager, started_at, ended_at, host_round_wins, current_round) as fallbacks. This is intentional for backward compatibility. New features should use canonical columns only; avoid adding new legacy fallbacks.
- **Bets write path**: If RLS is enabled with SELECT-only for clients, placing a bet must go through an API route (service role). See SUPABASE_SECURITY_MODEL.md for the note on moving placeBet to an API route.

---

## Future work (not bugs, but not done)

- **Spectator betting settlement**: Match result and round data are stored for future settlement. The full flow (resolve bet → payout / wallet) is not yet wired.
- **Wallet / Igra integration**: Planned; not used for live match settlement today. Gameplay remains off-chain.
- **New games**: Adding a game requires implementing a driver and registering it; no open bug, but “future games” are not yet implemented beyond TTT, C4, RPS.
- **Observability**: Structured logging and event emission exist; a dedicated observability/audit pass (e.g. consistent log shape, dispute diagnosis) could build on match_events and logs.

---

## How to use this list

- **Triage**: When fixing something, remove it from this list or move it to “resolved” with a one-line note and the PR/commit that fixed it.
- **Don’t pretend things are done**: If RPS or pause is still unverified, say so. If Chess is not implemented, don’t document it as supported.
- **Update after verification**: Once RPS and pause are verified in production or staging, move them out of “known issues” and note the verification in CURRENT_STATUS.md.
