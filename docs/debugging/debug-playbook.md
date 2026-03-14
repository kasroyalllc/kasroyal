# Debug playbook

Lessons learned while building the system. Each entry includes symptom, root cause, fix, and prevention rule. Update this file whenever a structural bug, lifecycle issue, or architecture limitation is discovered and fixed.

---

## RPS lifecycle failure due to turn-based fields

- **Symptom**: Rock Paper Scissors matches fail to start or tick returns 500; RPS challenger stuck in wrong state across rounds (e.g. still seeing previous round’s choices).
- **Root cause**: (1) Ready→Live or intermission→next-round payload included move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at for RPS. DB has NOT NULL on move_turn_seconds; or (2) RPS was treated like a turn-based game in lifecycle. (3) Challenger not receiving updated room when intermission ends (stale sync or no refetch).
- **Fix**: (1) In lifecycle (getReadyToLivePayload and tick’s next-round logic), only add turn fields when `driver.hasTurnTimer === true`. For RPS (hasTurnTimer false), omit move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at. (2) Ensure RPS driver is registered with hasTurnTimer: false. (3) On match page, when transitioning from intermission to live (e.g. round_intermission_until cleared), refetch or accept realtime so challenger gets new board_state with hostChoice/challengerChoice null.
- **Prevention**: Always gate turn-related DB writes on driver.hasTurnTimer. When adding a simultaneous game, never add turn fields to payloads. Document in [game-drivers/driver-contract.md](game-drivers/driver-contract.md).

---

## DB NOT NULL constraint (move_turn_seconds)

- **Symptom**: Tick or start route returns 500; Supabase error about null value in column move_turn_seconds (or similar turn column).
- **Root cause**: matches.move_turn_seconds (or move_turn_started_at / turn_expires_at) is NOT NULL in the schema, but the app sent null for games without a turn timer (e.g. RPS).
- **Fix**: Do not write turn columns for games with hasTurnTimer false. In lifecycle and tick, only set move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at when the game driver has hasTurnTimer true. If the schema keeps NOT NULL, use a sentinel (e.g. 0 for move_turn_seconds) only if product accepts it; prefer omitting the column or making the column nullable for simultaneous games.
- **Prevention**: Document in [database/schema-notes.md](database/schema-notes.md) which fields are turn-based-only and must be omitted for simultaneous games. Check all code paths that update matches (lifecycle, tick, move pipeline) for turn-field gating.

---

## Tick route failure patterns

- **Symptom**: POST /api/rooms/tick returns 500 or does not advance state (e.g. intermission never ends, ready never goes live).
- **Root cause**: Missing or invalid Supabase service role key; room not found; driver null for room.game; payload building includes null/undefined for NOT NULL columns; or tick logic condition wrong (e.g. comparing round_intermission_until in wrong timezone).
- **Fix**: Ensure SUPABASE_SERVICE_ROLE_KEY is set in env for the API route. Normalize game type (e.g. casing) so getGameDriver(room.game) returns the driver. Build tick payload only with fields that satisfy DB constraints (omit turn fields for RPS). Use server timestamps (now) consistently for comparisons.
- **Prevention**: Document env requirements in README and [deployment/](deployment/). Add logging (without leaking PII) for “tick skipped: driver null”, “tick: applying ready→live”, “tick: clearing intermission”. See [PRODUCTION-STABILIZATION.md](../PRODUCTION-STABILIZATION.md).

---

## Supabase key configuration problems

- **Symptom**: Start, move, or tick returns 500; “invalid API key” or RLS/permission errors when writing to matches or active_identity_matches.
- **Root cause**: API routes use anon key instead of service role; or SUPABASE_SERVICE_ROLE_KEY not set in Vercel (or env file); or wrong project key used.
- **Fix**: Use a Supabase client created with the service role key for all match mutations (create, join, start, move, tick, pause, resume, forfeit, cancel). Set SUPABASE_SERVICE_ROLE_KEY in Vercel (and .env.local for local dev). Do not expose the service role key to the client.
- **Prevention**: Document in README and deployment docs that server-side routes must use the service role client. Keep a single “admin” client for writes; use anon for client-side read-only if needed.

---

## localStorage quota issues

- **Symptom**: Client errors or missing state when using localStorage for arena or match state; quota exceeded in some browsers.
- **Root cause**: Storing large objects (e.g. full match history, big board_state) or many keys in localStorage; browser quota (often ~5–10MB) exceeded.
- **Fix**: Prefer server as source of truth; refetch or use realtime instead of persisting large state in localStorage. If persisting, store only minimal data (e.g. match id, last_updated_at) or use sessionStorage. Consider IndexedDB for larger client cache with explicit eviction.
- **Prevention**: Document in playbook and architecture: “Do not rely on localStorage for full match state; use for preferences or small cache only.” See [PRODUCTION-STABILIZATION.md](../PRODUCTION-STABILIZATION.md) if arena store was involved.

---

## Realtime sync mismatches

- **Symptom**: UI shows stale state after a move or tick; challenger sees old round or “waiting” after match is live; duplicate or out-of-order updates.
- **Root cause**: Accepting an older update over a newer one (e.g. tick response with older updated_at overwriting a just-received move); not refetching or accepting realtime when transitioning from intermission to next round; or client state not keyed by updated_at.
- **Fix**: Enforce sync policy: accept tick only if incoming.updated_at >= current.updated_at; accept refetch/realtime only if incoming.updated_at >= current.updated_at; never accept a transition that regresses Live → Ready to Start. On intermission end, ensure client either refetches or accepts realtime so board_state and round state are fresh.
- **Prevention**: Centralize “should we apply this room update?” in sync policy (lib/rooms/sync-policy.ts). Document in [architecture/system-architecture.md](../architecture/system-architecture.md). For new round start, consider explicit refetch after tick when status stays live and round_intermission_until is cleared.

---

## Adding new games: checklist

- **Symptom**: New game (e.g. Battleship, Darts) causes 500s, wrong lifecycle, or “driver not found”.
- **Root cause**: Driver not registered or wrong gameKey; hasTurnTimer mismatch (turn-based vs simultaneous); Ready→Live or intermission payload includes/omits turn fields incorrectly; or board_state shape not handled by UI.
- **Prevention**: Follow [game-drivers/driver-contract.md](../game-drivers/driver-contract.md). Use checklist: (1) Add driver with correct hasTurnTimer. (2) If simultaneous, ensure lifecycle and tick never add turn fields. (3) If turn-based, ensure move_turn_seconds and turn_expires_at are set. (4) Normalize game type so getGameDriver(room.game) finds the driver. (5) Add board state types and UI handling. (6) Document any game-specific constraints in schema-notes and driver-contract.
