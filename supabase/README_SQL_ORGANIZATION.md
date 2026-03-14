# Supabase SQL organization

SQL is split into **four files**. Keep these concerns separated; do not mix debug queries or DELETE statements into the main schema file.

| File | Purpose |
|------|---------|
| **kasroyal_schema.sql** | Main schema: tables, add-column upgrades, indexes, RLS, users/leaderboard read-only RLS, updated_at trigger, realtime. No DELETE. No debug queries. |
| **kasroyal_match_integrity.sql** | Competitive integrity only: winner validation, terminal-state rules, distinct player, score/round sanity, cleanup + set_finished_at triggers. |
| **kasroyal_dev_reset.sql** | Dev-only: table row wipe for match-related tables (FK-safe order). Do not run in production. |
| **kasroyal_verify.sql** | Inspection/verification only: information_schema checks, pg_publication_tables, match inspection. Run ad hoc; not migrations. |

## Rule

- **Do not** put DELETE statements or debug/inspection queries in `kasroyal_schema.sql`.
- **Do not** put schema, RLS, or realtime in `kasroyal_match_integrity.sql`, `kasroyal_dev_reset.sql`, or `kasroyal_verify.sql`.

The `migrations/` folder may still be used for Supabase migration history; keep it in sync with these four files when you change schema or integrity.
