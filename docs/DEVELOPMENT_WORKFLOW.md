# Development workflow

This document explains how we typically work: Cursor + GitHub + Vercel flow, Supabase schema changes, testing, and how to do clean handoffs so the next person or chat can continue without drifting.

---

## How we typically work

- **Code**: Next.js app and API routes in this repo; TypeScript throughout. Game logic lives in lib/rooms (game-drivers, move-pipeline, lifecycle, sync-policy) and lib/engine (match types, match-runtime). Supabase is the backend; no match state is authored only on the client.
- **Cursor**: Primary development environment. Use the repo docs (README, ARCHITECTURE, GAME_RUNTIME, MATCH_LIFECYCLE, SUPABASE_SCHEMA, CURRENT_STATUS, KNOWN_ISSUES, HANDOFF) as the handoff layer so that new chats and contributors get the same mental model.
- **GitHub**: Source of truth for code. Main branch typically deploys to production. Feature work happens in branches; PRs preferred for larger changes.
- **Vercel**: Connects to the repo; builds and deploys on push. Set Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) in Vercel. Preview deployments use the same or a separate Supabase project as needed.
- **Supabase**: One project per environment (e.g. dev, staging, prod). Schema and migrations are in the repo; apply them manually or via Supabase CLI. Do not rely on uncommitted local schema changes.

---

## Cursor + GitHub + Vercel flow

1. **Develop**: Edit in Cursor; run `npm run dev` locally. Use the same Supabase project as dev or a dedicated dev project.
2. **Test**: Play through create → join → countdown → live → move → (intermission) → next round or finish. Test pause, resume, forfeit, cancel. Check history and match result page (round-by-round, timeline).
3. **Commit**: Commit with clear messages. Reference docs or ticket if applicable.
4. **Push / PR**: Push to a branch; open a PR to main if the change is non-trivial. Review and merge.
5. **Deploy**: Vercel builds and deploys from main (or from the branch for previews). Ensure env vars are set for the target environment.
6. **Verify**: Smoke-test production (or preview) after deploy. If schema changed, migrations must be applied to that Supabase project before or at deploy.

---

## Supabase schema changes

- **Do not** change the schema only in the Supabase dashboard without recording it in the repo. All schema changes should be captured in SQL in the repo.
- **Add a migration**: Create a new file under supabase/migrations/ with a timestamp prefix (e.g. 20250314000000_add_foo.sql). Write CREATE/ALTER statements. If the change is also needed for fresh installs, add the same to supabase/kasroyal_schema.sql (or document that the migration is required after the consolidated schema).
- **RLS and realtime**: When adding a new table that the client reads, add SELECT-only RLS for anon/authenticated unless the table is server-only (like active_identity_matches). Add the table to the realtime publication only if clients need to subscribe to changes.
- **Apply**: Run the migration SQL against the target Supabase project (Dashboard → SQL Editor, or `supabase db push` if using Supabase CLI). Order matters: run migrations in timestamp order.

---

## When to add migrations

- Adding a new table (e.g. match_events, match_rounds).
- Adding columns to matches or other tables that the app or API will use.
- Changing RLS policies or indexes that affect correctness or performance.
- Do **not** edit a migration that has already been applied in any environment. Add a new migration that alters state (e.g. ADD COLUMN, CREATE INDEX).

---

## How to test locally vs production

- **Local**: `npm run dev`. Point .env.local to a dev Supabase project. Use guest identities or test wallets. Run through full match flow (create, join, start, move, finish) and pause/forfeit. Check that match_events and match_rounds are written and that the timeline API and match page round-by-round work.
- **Production**: After merging and deploy, run the same flows on the live URL. Ensure migrations have been applied to the production Supabase project so that new columns/tables exist. If you use a separate production Supabase project, apply the same migrations there.
- **Regression**: Avoid changing the move pipeline, lifecycle, or game drivers in ways that change when rounds end or when the match finishes. If you do, re-test TTT and Connect 4 BO1/BO3/BO5 and RPS.

---

## How to avoid schema drift

- **Single source of truth**: The repo’s supabase/kasroyal_schema.sql and migrations define the schema. Supabase dashboard is for data and ad-hoc queries, not the definition of tables.
- **Document**: When you add a column or table, update docs/SUPABASE_SCHEMA.md so the next person knows what exists and why.
- **Mapping**: When adding columns that the app reads, update mapDbRowToRoom in lib/engine/match/types.ts (or the relevant mapper) and the Room type so that the UI gets the new fields. Prefer canonical names in the DB and in the type.

---

## Recommended testing flows

1. **Happy path (TTT or C4, BO3)**: Create → Join → wait for countdown or call start → play round 1 to win → intermission → play round 2 (other side wins) → play round 3 to series win → check Finished state, history, and round-by-round on match page.
2. **Draw (BO1)**: Play to draw; match should finish with winner null, win_reason draw.
3. **Forfeit**: Start a live match → call forfeit as one player → check winner and win_reason; check match_events and match_rounds.
4. **Pause**: During live turn-based game, pause → wait or resume → verify turn continues and pause count increments.
5. **Timeout**: Let the turn timer expire 3 times for one side (or simulate); match should finish with win_reason timeout and match_rounds row.
6. **RPS**: Create RPS match → both submit choices → round resolves; repeat for BO3 if applicable. Confirm no “stuck” state.

---

## How to do handoffs cleanly

- **Update docs**: After a significant change (new feature, refactor, new table), update CURRENT_STATUS.md and, if there are open issues, KNOWN_ISSUES.md. Update HANDOFF.md if the “key files” or “what not to regress” list changes.
- **README and index**: Keep README.md and its Documentation index in sync with new docs. New contributors should be able to open README and know where to read next (PROJECT_OVERVIEW, ARCHITECTURE, CURRENT_STATUS, HANDOFF).
- **Commit messages**: Use clear, searchable messages (e.g. “Add match_events and match_rounds for timeline and round record”). Future you and others will grep for these.
- **Chat handoff**: When starting a new Cursor chat, point it at README and HANDOFF (or paste the “current mental model” and “key files” from HANDOFF). That reduces re-discovery and avoids assumptions from an older codebase.
