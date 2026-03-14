# Match History / Event Timeline / Result Quality Sprint

This document summarizes the match history and result-trust work: diagnosis, new model, and how it supports betting resolution and auditability.

## Current weaknesses (before this sprint)

- **No canonical event timeline**: Match state lived only in `matches` (status, scores, winner, win_reason). There was no ordered log of *what happened* (room created, challenger joined, match live, round won, intermission, match finished).
- **No round memory**: For BO3/BO5, only the final `host_score` and `challenger_score` were stored. You could not reconstruct which round was won by whom or how (win/draw/timeout/forfeit).
- **History UX**: History cards showed game, mode, winner line, and win reason but not best-of, final series score, or round-by-round progression.
- **Final result surface**: Match page showed “X wins the series 2–1” and win reason but no round-by-round breakdown from persisted data.
- **Spectator trust**: Spectators saw the same match page; there was no canonical event/round data to resolve disputes or future bets against.
- **Audit**: No structured event persistence for “why did this match end?” or “what was the exact sequence?”.

## New model

### 1. Match events (`match_events`)

- **Purpose**: Ordered timeline of major state transitions and outcomes.
- **Schema**: `match_id`, `event_type`, `payload` (jsonb), `created_at`.
- **Event types**:  
  `room_created`, `challenger_joined`, `countdown_started`, `match_live`, `move_applied`, `round_won`, `round_draw`, `intermission_started`, `next_round_started`, `pause_requested`, `resumed`, `forfeit`, `match_finished`.
- **Emitted from**: Create room, join room, start route, tick (ready→live, intermission→next round, timeout finish), move route (move_applied, round_won/round_draw, intermission_started, match_finished), pause, resume, forfeit.
- **Use**: Timeline API, audit, and future UI (e.g. “Event log” tab).

### 2. Round result record (`match_rounds`)

- **Purpose**: One row per *completed* round so the platform has round memory, not only final match state.
- **Schema**: `match_id`, `round_number`, `winner_identity_id` (nullable for draw), `result_type` (win, draw, timeout, forfeit), `host_score_after`, `challenger_score_after`, `created_at`.
- **Written when**: A round ends—from the move pipeline (win/draw → intermission or series_finished), from tick (timeout → match finish), and from forfeit route (one forfeit round row).
- **Use**: Round-by-round display on match page and history, and as canonical input for betting resolution.

### 3. API and UX

- **GET `/api/rooms/[id]/timeline`**: Returns `{ events, rounds }` for a match. Used by the match page when finished to show round-by-round and can be used by spectate or dispute tools.
- **History**: History cards show BO3/BO5, final series score (e.g. “BO3 • 2–1”), plus existing result/win-reason.
- **Match page (final result)**: When status is Finished, the page fetches the timeline and shows “Match Over”, series score, winner, win reason, and a **Round-by-round** list (Round 1: X won — 1–0, etc.). Same view for players and spectators.
- **Spectator result trust**: Spectators see the same final result block and round-by-round data from the same API; no separate “spectator-only” result logic.

## How this supports future betting and trust

- **Settlement**: A future spectator-betting flow can resolve outcomes using:
  - `matches.winner_identity_id` and `win_reason` for the match result,
  - `match_rounds` for per-round outcomes (who won which round, scores after each round),
  - `match_events` for order of events (e.g. forfeit then match_finished).
- **Consistency**: Round rows have `host_score_after` and `challenger_score_after`; these can be checked against `matches.host_score` / `challenger_score` at the end for consistency.
- **Audit**: Disputes (“I didn’t forfeit”, “round 2 was a draw”) can be checked against:
  - Event sequence (e.g. `forfeit` then `match_finished`),
  - Round rows (round number, winner, result_type, scores),
  - Optional structured logs (event emission can double as audit trail).
- **Future readiness**: The design keeps canonical event and result data in the DB; UI (history cards, match page, round list) reads from that. Betting and dispute tooling can use the same timeline API and tables without relying on UI-only summaries.

## Implementation summary

- **Schema**: Migration `20250313000000_match_events_and_rounds.sql` adds `match_events` and `match_rounds`; main `kasroyal_schema.sql` updated for fresh installs. RLS: SELECT for anon/authenticated; inserts via service role in API routes.
- **Service**: `lib/rooms/match-events.ts` — `insertMatchEvent`, `insertMatchRound`, `listMatchEvents`, `listMatchRounds`.
- **Move pipeline**: `resolveMoveToDbUpdate` returns `roundRecord` (round number, winner, result type, scores) when update type is intermission or series_finished.
- **Emission**: room_created/challenger_joined/countdown_started in rooms-service; match_live in start and tick; move_applied + round_won/round_draw + intermission_started/match_finished + match_rounds in move route; next_round_started in tick; pause_requested in pause; resumed in resume; forfeit + match_finished + match_round in forfeit; timeout finish in tick (match_finished + match_round).
- **API**: GET `/api/rooms/[id]/timeline` implemented in `app/api/rooms/[id]/timeline/route.ts`.
- **UX**: History cards show BO and series score; match page shows round-by-round when finished using timeline API.

No gameplay logic was changed; only additive event/round persistence and UX on top of existing match state.
