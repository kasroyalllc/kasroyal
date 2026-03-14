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

- **Match lifecycle flow**: Waiting → Ready to Start (countdown) → Live → [moves / tick] → intermission or series finish → Finished. Ready→Live and intermission→next round are driven by start or **tick**; move route applies moves and produces in-round, intermission, or series_finished. See [docs/lifecycle/match-lifecycle.md](docs/lifecycle/match-lifecycle.md) and [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md).
- **Supported game categories**: **Turn-based** (Tic-Tac-Toe, Connect 4): one move_turn_identity_id, turn timer, timeout strikes. **Simultaneous** (Rock Paper Scissors): both players submit; no turn timer; round ends when both choices are in. See [docs/game-drivers/driver-contract.md](docs/game-drivers/driver-contract.md).
- **Server authority model**: All match state changes go through API routes using the Supabase **service role** client. Clients never write directly to `matches`; they read via refetch or realtime. DB is the source of truth.
- **Tick loop responsibilities**: (1) Ready→Live when countdown expired, (2) intermission→next round when round_intermission_until passed, (3) turn timeout (strikes then match loss) for turn-based games, (4) pause expiry. Tick does not compute series outcome. See [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md).
- **Move pipeline overview**: Move route calls driver.applyMove(room, payload); driver returns RoundOutcome (or error). Move pipeline (getSeriesUpdate, resolveMoveToDbUpdate) produces a single DB payload: in_round, intermission, or series_finished. One pipeline for all games. See [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md) and [docs/game-drivers/driver-contract.md](docs/game-drivers/driver-contract.md).
- **Where game drivers live**: `lib/rooms/game-drivers.ts` — createInitialBoardState, getMoveSeconds, hasTurnTimer, applyMove. Drivers are registered and looked up by game key (getGameDriver).
- **Where lifecycle logic lives**: `lib/rooms/lifecycle.ts` — phase derivation, getReadyToLivePayload (used by start and tick). Intermission and timeout logic are in the tick route and move pipeline.
- **Where database adapters exist**: Match state is read/written in API routes and services; `lib/engine/match/types.ts` maps DB row → Room (mapDbRowToRoom); `lib/rooms/room-adapter.ts` maps Room → ArenaMatch. Schema and constraints: [docs/database/schema-notes.md](docs/database/schema-notes.md).

Deeper docs: [docs/architecture/](docs/architecture/), [docs/lifecycle/](docs/lifecycle/), [docs/game-drivers/](docs/game-drivers/), [docs/database/](docs/database/), [docs/debugging/](docs/debugging/), [docs/deployment/](docs/deployment/). Legacy flat reference: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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

These docs are the canonical handoff and reference layer. **Suggested order when joining or resuming:** README → HANDOFF → ARCHITECTURE → CURRENT_STATUS.

**Structured docs (architecture, lifecycle, debugging, games, DB, deployment):**

| Doc | Purpose |
|-----|---------|
| [docs/DOCUMENTATION_POLICY.md](docs/DOCUMENTATION_POLICY.md) | **Required**: When to update docs; architectural fixes, new games, lifecycle, debug playbook, PR checklist. |
| [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md) | Match states, tick flow, room sync, realtime, driver architecture, integrating new games. |
| [docs/lifecycle/match-lifecycle.md](docs/lifecycle/match-lifecycle.md) | Ready→live, round lifecycle, intermission, series (BO3/BO5), timeout, pause/resume, forfeit, turn-based vs simultaneous. |
| [docs/game-drivers/driver-contract.md](docs/game-drivers/driver-contract.md) | Driver interface, createInitialBoardState, applyMove, hasTurnTimer, turn-based vs simultaneous. |
| [docs/debugging/debug-playbook.md](docs/debugging/debug-playbook.md) | Lessons learned: RPS/turn fields, DB NOT NULL, tick failures, Supabase keys, localStorage, realtime sync. |
| [docs/database/schema-notes.md](docs/database/schema-notes.md) | Constraints, NOT NULL and turn-based-only fields, lifecycle fields, how match state is persisted. |
| [docs/deployment/README.md](docs/deployment/README.md) | Links to deploy, verify, and development workflow. |

**Legacy flat docs:**

| Doc | Purpose |
|-----|---------|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | What KasRoyal is, roadmap, priorities, why off-chain now. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Next.js, Supabase, realtime, room flow, game-driver, lifecycle, sync, move pipeline. |
| [docs/GAME_RUNTIME.md](docs/GAME_RUNTIME.md) | GameDriver contract, round outcome, adding games, RPS vs grid games. |
| [docs/MATCH_LIFECYCLE.md](docs/MATCH_LIFECYCLE.md) | Waiting, ready, countdown, live, intermission, finished, pause, DB fields. |
| [docs/SUPABASE_SCHEMA.md](docs/SUPABASE_SCHEMA.md) | Tables, canonical match fields, RLS, realtime, migrations. |
| [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) | How we work, Cursor/GitHub/Vercel, schema changes, testing, handoffs. |
| [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) | What’s working, recent refactors, production stabilization, next priorities. |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Unresolved issues and watchpoints (no fake-complete status). |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Mental model, key files, priorities, what not to regress, resume from fresh context. |
| [docs/DEPLOY-AND-VERIFY.md](docs/DEPLOY-AND-VERIFY.md) | Commit hash, deploy steps, production verification checklist. |
| [docs/PRODUCTION-STABILIZATION.md](docs/PRODUCTION-STABILIZATION.md) | Tick 500 and arena store quota: write paths, error capture. |
| [docs/MATCH_HISTORY_SPRINT.md](docs/MATCH_HISTORY_SPRINT.md) | Event timeline and round record design and implementation. |

Other references: [ROADMAP.md](ROADMAP.md), [docs/MOVE_ROUTE_REFACTOR.md](docs/MOVE_ROUTE_REFACTOR.md), [docs/SUPABASE_SECURITY_MODEL.md](docs/SUPABASE_SECURITY_MODEL.md), [VERIFICATION-RPS-AND-FEATURES.md](VERIFICATION-RPS-AND-FEATURES.md) (RPS/phrase verification).

---

## Documentation policy (required)

**Documentation is a required part of development.** The docs structure is a permanent rule of the repository. See **[docs/DOCUMENTATION_POLICY.md](docs/DOCUMENTATION_POLICY.md)** for the full policy.

1. **Architectural fixes must be documented** — Lifecycle bugs, driver issues, DB constraint conflicts, or runtime assumptions: root cause and solution go into the appropriate docs (debug playbook, schema-notes, driver-contract, or architecture) before the task is complete.
2. **New games must update driver documentation** — Document board state shape, turn-based vs simultaneous, hasTurnTimer, round resolution, and any lifecycle differences in [docs/game-drivers/](docs/game-drivers/).
3. **Lifecycle changes must update lifecycle documentation** — Any change to ready→live, round resolution, intermission, series, pause, or timeout must be reflected in [docs/lifecycle/match-lifecycle.md](docs/lifecycle/match-lifecycle.md).
4. **Debugging discoveries go into the debug playbook** — Record symptom, root cause, fix, and prevention in [docs/debugging/debug-playbook.md](docs/debugging/debug-playbook.md).
5. **Documentation is part of the pull request** — Architecture-impacting changes are not complete until the relevant docs are updated; include doc updates in the PR.

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
