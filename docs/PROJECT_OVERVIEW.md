# Project overview

## What KasRoyal is

KasRoyal is a **Kaspa-based competitive skill arena platform**. Players create or join matches, pick a game (Tic-Tac-Toe, Connect 4, Rock Paper Scissors), and play best-of-1, best-of-3, or best-of-5. Spectators can watch live; the product is designed so spectator betting and settlement can be added later using the same match result and event data.

In practice:

- **Host** creates a room (game, mode, best-of, wager for ranked).
- **Challenger** joins; a short countdown runs.
- When countdown ends, the match goes **Live**: turns, move timer, round wins, and—for BO3/BO5—intermission between rounds.
- Match ends when someone wins the series, by timeout (repeated turn overtimes), by forfeit, or—for BO1—by draw.
- **History** and **match result** pages show final score, win reason, and round-by-round breakdown from canonical DB data.

The platform aims to feel like a **premium competitive arena**: clear phases, authoritative results, and a single source of truth (Supabase) so that clients, future wallets, and dispute resolution all agree on what happened.

---

## Short-term vs long-term roadmap

**Short-term (current focus)**

- Stabilize Tic-Tac-Toe and Connect 4 for BO1/BO3/BO5 (done).
- Verify Rock Paper Scissors end-to-end in live product behavior.
- Verify pause/resume end-to-end from a user perspective.
- Rely on event timeline and round records for history and result trust (implemented; see [MATCH_HISTORY_SPRINT.md](MATCH_HISTORY_SPRINT.md)).

**Medium-term**

- Chess Duel in the game-driver layer (board, moves, round/series).
- Spectator betting settlement wired to match_events / match_rounds / winner_identity_id.
- Stronger observability and audit (e.g. structured logs aligned with events).

**Long-term**

- Wallet and Igra integration for real-money settlement.
- Transactional emails, receipts, and other production polish (see [ROADMAP.md](../ROADMAP.md)).

---

## Current product priorities

1. **Gameplay correctness**: Moves, series scoring, intermission, timeout, and forfeit must be correct and consistent with DB state.
2. **Result trust**: Match outcome and round-by-round data are stored and displayed from canonical tables (matches, match_rounds, match_events).
3. **No regressions**: Refactors (game-driver, move pipeline, lifecycle, sync policy) are in place; new work must not revert to per-game branches or client-only outcome state.
4. **Premium feel**: Clear phases, readable result copy, and history that shows BO and series score.

---

## Why gameplay is off-chain now

Match state (board, scores, winner, rounds) lives in Supabase. Moves are submitted via API and applied server-side. There is no on-chain move or round resolution today. This choice:

- Keeps latency and cost low for real-time play.
- Lets the product iterate on game rules, BO, pause, and intermission without blockchain changes.
- Leaves a clear path to wallet/Igra: once a match is finished, settlement can use `winner_identity_id`, `win_reason`, `match_rounds`, and `match_events` as the single source of truth. The same data supports dispute review and betting resolution.

---

## What “premium competitive arena platform” means

In product and UX terms:

- **Clear phases**: Waiting → Ready to Start (countdown) → Live → (intermission) → next round or Finished. Users always know which phase they are in.
- **Authoritative results**: Winner, win reason, and series score come from the DB and are shown consistently on the match page and history. Round-by-round is from match_rounds, not recomputed on the client.
- **Controlled flow**: One active match per identity; create/join/cancel/forfeit and lifecycle transitions are server-enforced. Pause and turn timer are server-authoritative.
- **Trust and audit**: Event timeline and round records exist so that “who won, why, and in what order” can be answered from data, for players and future betting/disputes.
