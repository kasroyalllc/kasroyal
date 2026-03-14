# Deployment

Deployment and environment documentation.

- **[../DEPLOY-AND-VERIFY.md](../DEPLOY-AND-VERIFY.md)** — Commit hash, deploy steps, production verification checklist.
- **[../DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md)** — How we work, schema changes, testing, handoffs.

Ensure `SUPABASE_SERVICE_ROLE_KEY` (and other required env vars) are set in your deployment environment (e.g. Vercel) so API routes (create, join, start, move, tick, etc.) can write to Supabase.
