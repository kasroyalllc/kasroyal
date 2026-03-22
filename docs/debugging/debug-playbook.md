# Debug playbook

Lessons learned while building the system. Each entry includes symptom, root cause, fix, and prevention rule. Update this file whenever a structural bug, lifecycle issue, or architecture limitation is discovered and fixed.

---

## RPS lifecycle failure due to turn-based fields

- **Symptom**: Rock Paper Scissors matches fail to start or tick returns 500; RPS challenger stuck in wrong state across rounds (e.g. still seeing previous round’s choices).
- **Root cause**: (1) Ready→Live or intermission→next-round payload included move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at for RPS. DB has NOT NULL on move_turn_seconds; or (2) RPS was treated like a turn-based game in lifecycle. (3) Challenger not receiving updated room when intermission ends (stale sync or no refetch).
- **Fix**: (1) In lifecycle (getReadyToLivePayload and tick’s next-round logic), only add turn fields when `driver.hasTurnTimer === true`. For RPS (hasTurnTimer false), omit move_turn_identity_id, move_turn_started_at, move_turn_seconds, turn_expires_at. (2) Ensure RPS driver is registered with hasTurnTimer: false. (3) On match page, when transitioning from intermission to live (e.g. round_intermission_until cleared), refetch or accept realtime so challenger gets new board_state with hostChoice/challengerChoice null.
- **Prevention**: Always gate turn-related DB writes on driver.hasTurnTimer. When adding a simultaneous game, never add turn fields to payloads. Document in [game-drivers/driver-contract.md](game-drivers/driver-contract.md).

---

## RPS challenger stuck: same hand across rounds

- **Symptom**: After an RPS round ends and intermission runs, the challenger (joiner) still sees their previous round’s choice or “Locked in” instead of a fresh “Choose your hand” for the new round.
- **Root cause**: (1) Server correctly resets board_state (createInitialBoardState with hostChoice/challengerChoice null) when tick clears intermission, but the client never receives that update—e.g. sync policy rejects the tick response, or the client doesn’t refetch when intermission ends. (2) Client derives RPS state only from match.boardState; if the client keeps an older match (e.g. from a stale refetch with older updated_at), board_state stays old.
- **Fix**: (1) Ensure tick returns the updated room with refreshed board_state and updated_at set to now so sync policy accepts it (incoming.updated_at >= current.updated_at). (2) On the match page, when roundIntermissionUntil transitions from set to cleared (intermission just ended), call refreshRoom() so both host and challenger get the new round’s board. (3) Do not derive “my choice” from local state that outlives the round; always derive from match.boardState (hostChoice/challengerChoice). (4) For RPS, move pipeline must not write turn fields on in-round updates (driver.hasTurnTimer false) so DB and room shape stay consistent.
- **Prevention**: Sync policy: accept tick only if incoming.updated_at >= current.updated_at. Match page: effect that refetches when game is RPS, status is Live, and roundIntermissionUntil goes from non-null to null. Driver: reject “Already locked in” if the same side submits again in the same round so server state stays consistent.

---

## RPS host (or one side) stuck: prior-round hand persists

- **Symptom**: One side (e.g. host) keeps seeing their previous round’s choice across rounds; the other side (e.g. challenger) gets a fresh choice each round.
- **Root cause**: (1) New-round board_state was built by spreading a previous object, so one client could receive or retain a board that still had the previous round’s hostChoice/challengerChoice. (2) **Sync policy rejected the tick** that carried the fresh round: the host’s current match had a higher `updated_at` (e.g. from the move response when they submitted their choice), so `incomingUpdatedAt >= currentUpdatedAt` was false and we kept the old room (with hostChoice set), while the challenger accepted the new room.
- **Fix**: (1) Use an **explicit clean RPS board** for every new round: `createRpsRoundBoard(roundExpiresAtMs)` with no spread. (2) In `shouldAcceptRoomUpdate`, when source is `"tick"` and we would reject: if the incoming room is RPS Live with a **fresh round board** (hostChoice and challengerChoice both null, mode `rps-live`, revealed false) and the current match has at least one choice (old round), **accept the incoming** so the client always gets the new round and never keeps the previous round’s hand.
- **Prevention**: Never keep an old RPS round when the server sends a fresh round board. Use tick logs `[tick RPS intermission→next] outgoing board_state` and client `[RPS render]` (raw_boardState_hostChoice, derived_hostChoice, isHostUser, buttons_disabled) to confirm both sides receive null choices each new round.

---

## RPS round timer not auto-resolving (stalled round)

- **Symptom**: A player can stall the round; the 15s timer appears but the round never ends without forfeit.
- **Root cause**: (1) Tick was only run every 2s during a live RPS round, so the server might not evaluate the RPS timeout branch until well after roundExpiresAt. (2) The RPS timeout branch in tick was correct but ran too infrequently to resolve promptly.
- **Fix**: (1) On the client, when game is RPS and status is Live and not in intermission, use the same 1s tick interval as intermission/Ready→Start (`intervalMs = 1000` for `isRpsLiveRound`). So tick is called every second during the round and the server’s `resolveRpsRoundTimeout(room, nowMs)` runs within ~1s of expiry. (2) Ensure tick route does not return early for RPS before checking the timeout: when status is Live and not in intermission, the RPS block runs and persists intermission/series_finished via resolveMoveToDbUpdate when the round has expired.
- **Prevention**: For games with a round-level timer (e.g. RPS 15s), poll tick at 1s during the live round so the backend can resolve the round as soon as the timer expires. Document in lifecycle and game-drivers that RPS uses a round timer, not a turn timer.

---

## RPS stuck at Ready countdown (Ready→Live transition)

- **Symptom**: Rock Paper Scissors stays on “Match is starting… Stay here — the arena will go live shortly.” and status badge “READY TO START” after the countdown reaches zero; the hand-selection screen never appears.
- **Root cause**: (Audit performed; one or more of:) (1) Tick route’s Ready→Live branch not entered (e.g. `canTransitionReadyToLive` false: missing `countdownStartedAt` or server time &lt; countdown end). (2) Update matched 0 rows because DB `status` value is not in `READY_LIKE_STATUSES` (e.g. legacy “Ready to Start” vs “ready”/“countdown”). (3) Tick returns Live but response omits `board_state` for RPS so client or reconcile keeps invalid state. (4) Client rejects the Live update (sync policy: `incoming.updated_at` < `current.updated_at`). (5) Refetch or realtime overwrites Live with stale Ready.
- **Fix**: (1) Tick route: added `[tick Ready→Live] countdown branch` log (room_id, prior_status, countdown values, server_says_go, client_says_go). When update succeeds, log `resulting_status`, `has_board_state`, `board_state_mode`. When update affects 0 rows, log `refetched_status` and whether it equals `DB_STATUS.LIVE`. (2) Ensure RPS Live response always includes `board_state`: if `mapDbRowToRoom` result has null `boardState` for RPS, attach `payload.board_state` before returning. (3) Sync-policy: never accept Ready over Live (refetch/realtime). **For tick source: always accept when current is Ready to Start and incoming is Live** (authoritative Ready→Live); still use `incoming.updated_at >= current.updated_at` for other tick cases. (4) Reconcile: when status is Live and game is RPS and `boardState` is missing, use `createRpsRoundBoard(roundExpiresAtMs)` instead of `driver.createInitialBoardState()` so reconciled board has `roundExpiresAt`. (5) Match page: log when tick response has `transition === "ready_to_live"` and add `render_branch` (countdown_shell | live_controls) to `[RPS render]` so we can see which branch the client rendered. (6) **Start fallback interval**: do not skip `/api/rooms/start` when `countdownEndMsRef` is 0 (client could not compute pre-match end from `bettingClosesAt`/`countdownStartedAt`); still call start so server can transition once countdown is valid.
- **Prevention**: Use the new logs to pinpoint where the pipeline fails: server “countdown branch” → “update succeeded” vs “0 rows” → client “[match page] tick response: ready_to_live” → “[sync-policy] client accepted tick” vs “rejected” → “[RPS render] render_branch: live_controls”. Ensure DB status for pre-live is one of `READY_LIKE_STATUSES`; RPS payload must include `board_state` from `createRpsRoundBoard`; never return Live without `board_state` for RPS. Never reject tick/start Live when client still shows Ready (race on `updated_at`).

---

## Tick vs refresh (ej/getRoomById) race — Ready→Live overwrite

- **Symptom**: Same as RPS stuck at Ready countdown: UI stays on "Match is starting…" after countdown reaches zero; rendered match still has status "Ready to Start".
- **Root cause**: Two competing state update paths: (A) tick (or start) response → `acceptAndReconcile(..., "tick")` → sets Live; (B) `refreshRoom()` → `getRoomById()` → `acceptAndReconcile(..., "refetch")`. If the refetch request was in-flight before the server wrote Live, the refetch response can return a room that is still Ready. If that refetch is applied *after* the tick has already set Live, we must not overwrite (stale refetch would regress to Ready).
- **Fix**: (1) Sync policy already rejects refetch when `current.status === "Live"` and `incoming.status === "Ready to Start"`. (2) Logging: every `acceptAndReconcile` call logs (dev) `[sync-policy] apply room: ACCEPTED | REJECTED` with `source`, `room_id`, `raw_incoming_status`, `mapped_status` (or current_status on reject), `updatedAt`. When rejecting a refetch that would overwrite Live with Ready, log `refetch_would_overwrite_live: true`. (3) `refreshRoom` logs `[match page] refreshRoom (ej) got room` with `raw_status`, `updatedAt`. (4) Client countdown math: use canonical `match.countdownSeconds ?? match.bettingWindowSeconds ?? 30`.
- **Prevention**: Never accept a refetch/realtime update that would regress Live → Ready to Start. Use the apply-room logs to confirm the race: if you see "ACCEPTED" for tick with Live followed by "REJECTED" for refetch with Ready and `refetch_would_overwrite_live: true`, the race occurred but was correctly rejected.

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

## Partial room responses (stale boardState / RPS hands)

- **Symptom**: RPS still shows a previous round’s hand for one or both sides after intermission or round reset; or other game-specific state (e.g. board, scores) does not update after a route response.
- **Root cause**: A room-mutating route (tick, start, move, pause, resume, join, forfeit) returned a **partial** room object—e.g. the payload from the API had `status`, `currentRound`, `countdownStartedAt`, etc., but **no `boardState`**. The client then applied that response as the new match state; because the response omitted `boardState`, the previous `boardState` in memory was never replaced, so the UI kept showing stale `hostChoice`/`challengerChoice`.
- **Fix**: (1) **Single canonical shape**: Every route that returns a room must return the **full** `Room` object. The canonical mapper is `mapDbRowToRoom` in `lib/engine/match/types.ts`. (2) After `mapDbRowToRoom(updateResult)`, the row may lack `board_state` (Supabase `.update().select("*")` can omit it). Use **`ensureFullRoom(mapped, fallback)`** from `lib/rooms/canonical-room.ts` with `fallback` = the room from `getRoomById` at the start of the request, so the response always includes `boardState` and other core fields. (3) All such routes (tick, start, move, pause, resume, join, forfeit) now call `ensureFullRoom`. (4) In development, `ensureFullRoom` logs a warning if the room is still missing core fields.
- **Prevention**: **Architecture rule**: All room-mutating routes must return the full canonical room shape. Do not hand-build partial room payloads. Do not return `mapDbRowToRoom(updateResult)` without `ensureFullRoom` when the update result might omit columns. See [ARCHITECTURE.md](../ARCHITECTURE.md) § Canonical room shape.

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
