# Production stabilization: tick 500 and arena store quota

## 1. Verify the latest fixes are deployed

- **Commit:** After pulling the latest, run `git rev-parse HEAD` and note the hash. Confirm this is the same commit Vercel shows for the latest production deployment.
- **Vercel:** Dashboard → Project → Deployments. Check that the production deployment’s commit hash matches. Open the deployment → Functions (or Logs) to confirm the deployed code is from that commit.
- **Storage and tick in the bundle:** The fixes are in:
  - `lib/mock/arena-data.ts` (persistStore quota handling, readArenaStore try/catch, resetAllArenaState try/catch, hydrateMatchesFromSupabase QuotaExceeded handling).
  - `app/api/rooms/tick/route.ts` (catch block always logs with `console.error("[tick] 500", ...)`).
  If production still shows the old behavior (e.g. "KasRoyal hydrateMatchesFromSupabase failed QuotaExceededError" or no tick error in logs), the deployed bundle is likely from an older commit.

## 2. Every write path for `kasroyal_arena_store_v3`

The key is `ARENA_STORE_STORAGE_KEY = "kasroyal_arena_store_v3"`. All writes go through one of these:

| # | Location | How it writes | Quota-safe after patch |
|---|----------|----------------|-------------------------|
| 1 | `persistStore()` in `lib/mock/arena-data.ts` | `window.localStorage.setItem(ARENA_STORE_STORAGE_KEY, JSON.stringify(toStore))` | Yes: try/catch, cap 30 matches, strip boardState/moveHistory, skip if payload > 1.5 MB. |
| 2 | `mutateArenaStore()` | Calls `persistStore(committed)` | Yes (persistStore is safe). |
| 3 | `startArenaLifecycleTicker()` (interval every 500 ms) | Calls `persistStore({ ...current, updatedAt: nowTs })` | Yes. |
| 4 | Init block `if (isBrowser()) { ... }` | If no key and `loaded.matches.length`, calls `persistStore(loaded)` | Yes. |
| 5 | `seedDevArenaMatches()` | Calls `persistStore({ revision: 1, ... })` | Yes. |
| 6 | `resetAllArenaState()` | `window.localStorage.setItem(ARENA_STORE_STORAGE_KEY, JSON.stringify(emptyStore))` | Yes: wrapped in try/catch for QuotaExceededError. |

There are no other direct `setItem(ARENA_STORE_STORAGE_KEY, ...)` or `setItem("kasroyal_arena_store_v3", ...)` calls. All persistent writes go through `persistStore` or the single `setItem` in `resetAllArenaState`, both of which are now quota-safe and do not throw on quota exceeded.

## 3. Exact tick 500 exception

- The tick route’s catch block **always** runs `console.error("[tick] 500", errMessage, errStack)` (including in production).
- The JSON response body includes `error: errMessage`, so the client can see the message in the response (e.g. in DevTools → Network → response body).

**How to get the exact exception in production:**

1. **Server (Vercel):** Deploy the latest code, trigger the tick 500 (e.g. start an RPS match and let countdown run). In Vercel → Project → Logs (or Functions → logs), search for `[tick] 500`. The next tokens are the exception message and stack.
2. **Client:** In DevTools → Network, select the failed `POST .../api/rooms/tick` request. In Response, read the `error` field; that is the thrown error message.

Until the fix is deployed, production will not log the tick error (old code only logged in dev). After deploy, the exact exception text will appear in both server logs and the 500 response body.

## 4. Exact patch summary

- **`app/api/rooms/tick/route.ts`:** In the catch block, removed the `if (process.env.NODE_ENV !== "production")` guard so `console.error("[tick] 500", errMessage, errStack)` always runs. Response body unchanged (`error: errMessage`).
- **`lib/mock/arena-data.ts`:**
  - **persistStore:** Cap 30 matches (was 80), strip `boardState` and `moveHistory` from each match before stringify, skip persist if serialized length > 1.5 MB, keep try/catch and on QuotaExceededError log and return (no throw).
  - **readArenaStore:** Wrapped `localStorage.getItem(ARENA_STORE_STORAGE_KEY)` in try/catch; on throw (e.g. quota) return `createDefaultStore()` so read never throws.
  - **resetAllArenaState:** Wrapped the block that removes keys and sets the empty store in try/catch; on QuotaExceededError log and continue (in-memory state already cleared).
  - **hydrateMatchesFromSupabase:** Unchanged; already catches QuotaExceededError and logs a warning instead of "failed".

## 5. Whether RPS becomes playable after tick + storage are fixed

- **Storage:** Once the new arena-store logic is deployed, quota exceeded should no longer throw; hydration continues without persistence, and the "KasRoyal hydrateMatchesFromSupabase failed QuotaExceededError" message should stop. That removes that source of instability and stale/broken client state.
- **Tick:** The tick 500 is the direct blocker for Ready → Live: if the tick route throws, the client never gets a successful transition and RPS stays in the pre-start shell. After you have the **exact** exception from logs/response and fix that root cause (e.g. missing env, DB shape, or null access), the tick route should return 200 with `transition: "ready_to_live"` when the countdown ends. Then RPS can become playable.

So: **Yes, once (1) the storage layer is deployed and (2) the tick 500 root cause is fixed from the actual exception text, RPS can become playable.** No RPS UI speculation is needed until the tick 500 is resolved.
