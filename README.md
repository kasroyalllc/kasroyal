# KasRoyal

**KasRoyal** is a Kaspa-based competitive skill arena platform: players create and join matches, play skill games (Tic-Tac-Toe, Connect 4, Rock Paper Scissors), and spectators can watch and—in the future—bet on outcomes. Think **Chess.com + DraftKings + Twitch**, built for the Kaspa ecosystem.

---

## Product vision

- **Premium competitive arena**: Create match → opponent joins → countdown → live game → clear result. The experience should feel polished and trustworthy.
- **Skill games first**: Tic-Tac-Toe, Connect 4, and Rock Paper Scissors are live. Chess Duel is planned. All use a unified game-driver and move pipeline (BO1/BO3/BO5, intermission, pause).
- **Supabase as source of truth**: Match state, room lifecycle, and moves are authoritative in the database. The Next.js app and API routes read/write via Supabase; no client-only state for match outcome.
- **Future-ready**: Event timeline and round records support history, result trust, and future spectator betting settlement. Wallet and Igra integration are planned; gameplay is currently off-chain.

---

## Current stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind |
| **Backend / DB** | Supabase (Postgres, Auth, Realtime) |
| **Deployment** | Vercel |
| **Ecosystem** | Kaspa, IgraLabs RPC (future) |

---

## Supported games (current)

| Game | Status | BO1/BO3/BO5 | Notes |
|------|--------|-------------|--------|
| **Tic-Tac-Toe** | Working | Yes | Turn-based, move timer, timeout strikes. |
| **Connect 4** | Working | Yes | Turn-based, move timer, timeout strikes. |
| **Rock Paper Scissors** | Implemented | Yes | No turn timer; both choose then reveal. Live product verification still recommended. |
| **Chess Duel** | Planned | — | Not yet in game-driver layer. |

---

## Architecture overview

- **Next.js app**: Pages for Arena, match room, history, spectate. API routes under `app/api/` drive create, join, start, move, tick, pause, resume, forfeit, cancel.
- **Supabase**: Holds `matches`, `match_events`, `match_rounds`, `match_messages`, `profiles`, `bets`, `active_identity_matches`, etc. Realtime is used for room and message updates.
- **Game runtime**: Each supported game has a **driver** (`lib/rooms/game-drivers.ts`) that implements board init, move application, and round outcome. The **move pipeline** (`lib/rooms/move-pipeline.ts`) turns round outcomes into series scoring, intermission, or match finish.
- **Lifecycle**: Waiting → Ready to Start (countdown) → Live → (optional) intermission → next round or Finished. Pause is server-authoritative; tick route handles countdown expiry, intermission expiry, and turn timeout.
- **Sync policy**: Client accepts room updates by source (mutation/tick vs refetch/realtime) and `updated_at` to avoid stale overwrites. DB rows are normalized to a `Room` type and then to UI `ArenaMatch` via `room-adapter`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detail.

---

## What is already working

- **Create / join / cancel**: Host creates room (quick or ranked, game type, best-of). Challenger joins; countdown starts. Host can cancel if no challenger.
- **Ready → Live**: Start route or tick route transitions to Live when countdown has expired; game driver sets initial board and turn/timer.
- **Moves**: Single move route for all games. Driver applies move; move pipeline produces in-round update, intermission, or series finished. Round and series scoring, intermission, and match_events/match_rounds are written.
- **Tick**: Handles ready→live, intermission→next round, turn timeout (strikes then match loss), and pause expiry.
- **Pause / resume / forfeit**: Pause (turn-holder only, limit per side), resume, forfeit (opponent wins). Events and rounds recorded.
- **History and result**: History page with BO and series score; match page shows “Match Over”, series score, win reason, and round-by-round from timeline API.
- **Timeline API**: `GET /api/rooms/[id]/timeline` returns events and rounds for a match (audit and UI).

---

## What is still in progress

- **RPS**: Implemented in driver and pipeline; user testing has reported it “stuck” in pre-start shell in the past. Live verification recommended.
- **Pause**: Server logic is in place; end-to-end product-level verification recommended.
- **Chess Duel**: Not yet in game-driver layer.
- **Wallet / Igra settlement**: Future; not used for live match settlement today.
- **Spectator betting**: UI and data model exist; settlement against timeline/round data is prepared but not fully wired.

See [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) and [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

---

## Run locally

1. **Prerequisites**: Node.js 18+, npm or pnpm.
2. **Install**: `npm install`
3. **Environment**: Copy `.env.example` to `.env.local` and set Supabase URL and anon key (and service role for API routes that use the admin client).
4. **Database**: Apply schema and migrations (see [docs/SUPABASE_SCHEMA.md](docs/SUPABASE_SCHEMA.md) and [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md)).
5. **Run**: `npm run dev` — app at `http://localhost:3000`.

---

## Deployment

- **Vercel**: Connect the GitHub repo; build command `next build`; output Next.js. Set Supabase env vars in Vercel.
- **Supabase**: Use the same project for staging/production or separate projects; apply `supabase/kasroyal_schema.sql` and migrations under `supabase/migrations/`.
- **Branch flow**: Main branch typically deploys to production; use branches and Vercel previews for changes. See [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md).

---

## Where the important code lives

| Area | Path | Purpose |
|------|------|---------|
| **Game drivers** | `lib/rooms/game-drivers.ts` | Per-game board init, move apply, round outcome. |
| **Move pipeline** | `lib/rooms/move-pipeline.ts` | Series update, intermission, DB payloads. |
| **Lifecycle** | `lib/rooms/lifecycle.ts` | Phase derivation, Ready→Live payload. |
| **Sync policy** | `lib/rooms/sync-policy.ts` | When to accept room updates, reconcile bad state. |
| **Match runtime** | `lib/engine/match-runtime.ts` | Canonical view of Room for UI (series, pause, intermission). |
| **Rooms service** | `lib/rooms/rooms-service.ts` | Create, join, cancel, forfeit, get room, list active/history. |
| **Room → UI** | `lib/rooms/room-adapter.ts` | `mapDbRowToRoom` → `Room`; `roomToArenaMatch` → ArenaMatch. |
| **DB → Room** | `lib/engine/match/types.ts` | `mapDbRowToRoom`, `Room` type. |
| **Match events** | `lib/rooms/match-events.ts` | Insert/list events and rounds. |
| **API routes** | `app/api/rooms/` | create, join, start, move, tick, pause, resume, forfeit, cancel, timeline. |
| **Match page** | `app/arena/match/[id]/page.tsx` | Single match room UI (board, score, result, timeline). |
| **Schema** | `supabase/kasroyal_schema.sql`, `supabase/migrations/` | Tables, RLS, realtime. |

---

## Supabase and future wallet integration

- **Supabase today**: Authority for matches, match_events, match_rounds, profiles, match_messages, bets, active_identity_matches. All match state changes go through API routes using the service role where needed. Realtime subscriptions push room and message updates to clients.
- **Wallet / Igra**: Planned. Gameplay and result resolution are designed so that when wallet/Igra settlement is added, it can consume the same canonical match result and event/round data (winner, win_reason, match_rounds, match_events). No change to the core game or lifecycle model is required for that.

---

## Documentation index

Use these as the canonical handoff and reference layer:

| Doc | Purpose |
|-----|---------|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | What KasRoyal is, roadmap, priorities, why off-chain now. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Next.js, Supabase, realtime, room flow, game-driver, lifecycle, sync, move pipeline. |
| [docs/GAME_RUNTIME.md](docs/GAME_RUNTIME.md) | GameDriver contract, round outcome, adding games, RPS vs grid games. |
| [docs/MATCH_LIFECYCLE.md](docs/MATCH_LIFECYCLE.md) | Waiting, ready, countdown, live, intermission, finished, pause, DB fields. |
| [docs/SUPABASE_SCHEMA.md](docs/SUPABASE_SCHEMA.md) | Tables, canonical match fields, RLS, realtime, migrations. |
| [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) | How we work, Cursor/GitHub/Vercel, schema changes, testing, handoffs. |
| [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) | What’s working, recent refactors, next priorities. |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Unresolved issues and watchpoints. |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Mental model, key files, priorities, what not to regress. |
| [docs/MATCH_HISTORY_SPRINT.md](docs/MATCH_HISTORY_SPRINT.md) | Event timeline and round record design and implementation. |

Other references: [ROADMAP.md](ROADMAP.md) (e.g. transactional email), [docs/MOVE_ROUTE_REFACTOR.md](docs/MOVE_ROUTE_REFACTOR.md), [docs/SUPABASE_SECURITY_MODEL.md](docs/SUPABASE_SECURITY_MODEL.md).

---

## Development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Arena, match room, history, and spectate pages are available once Supabase is configured.

For schema, migrations, testing, and deployment details, see [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md).
