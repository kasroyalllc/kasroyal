# Production deployment and verification

## 1. Commit hash (code with all fixes)

```
85948dda99cbbc6e502fc6b3adf388fddb580da5
```

Short: `85948dd`

This commit includes:
- Tick route: production error logging (always `console.error("[tick] 500", ...)`; response body `error` = exception message).
- Storage: quota-safe persistence (persistStore try/catch, cap 30 matches, trim payload, read try/catch, resetAllArenaState try/catch).
- React: hook-order fix in match page (RPS/pregame effects moved before early returns).
- `docs/PRODUCTION-STABILIZATION.md` (write paths and tick debugging).

---

## 2. What you need to deploy

- Push the branch that has this commit to the remote that Vercel deploys from (usually `main`).
- Confirm in Vercel that the production deployment is from commit `85948dd` (or the same hash after you merge).

Nothing else: no extra env vars, no build flags, no manual Vercel steps. Push and confirm Vercel deployed that commit.

```bash
git push origin <your-branch>
# If Vercel deploys from main:
# git checkout main && git merge <your-branch> && git push origin main
```

---

## 3. Production verification checklist

After deployment, verify in this order:

| # | Check | How | Pass condition |
|---|--------|-----|-----------------|
| 1 | Storage quota | Open production site; watch browser console. | You do **not** see `KasRoyal hydrateMatchesFromSupabase failed QuotaExceededError`. A single `KasRoyal arena store: localStorage quota exceeded; continuing without persistence.` (or similar warning) is acceptable. |
| 2 | Tick response body | Create RPS match, join, let countdown run. In DevTools → Network, find a `POST .../api/rooms/tick` with status 500. Open it → Response. | The JSON has an `error` field with a **real** error message (e.g. a TypeError or DB message), not a generic "Tick failed". |
| 3 | Vercel logs (tick) | In Vercel dashboard: Project → Logs (or Deployments → latest → Functions / Runtime Logs). Reproduce tick (RPS countdown). | If tick returns 500, logs contain a line starting with `[tick] 500` followed by the exception message and stack. |
| 4 | Host crash (React) | Host creates RPS match; second user joins; wait on match page. | Host tab does **not** crash with a React minified error (e.g. #310). |
| 5 | RPS or exception | Same flow: RPS match, join, countdown to zero. | Either (a) RPS shell disappears and controls appear, or (b) tick still 500s and you have the **exact** exception from step 2 and/or step 3. |

---

## 4. If tick still returns 500 after deployment

### Where to look

**A. Failed request (client)**  
1. DevTools → Network.  
2. Trigger the failing flow (e.g. RPS countdown).  
3. Find the red `POST` to `https://www.kasroyal.com/api/rooms/tick` (or your production URL) with status **500**.  
4. Click it → **Response** (or Preview).  
5. Copy the full JSON body (it should contain `ok: false` and `error: "<actual exception message>"`).

**B. Vercel server logs**  
1. Vercel dashboard → your project.  
2. **Logs** tab (or Deployments → latest deployment → **Functions** or **Runtime Logs**).  
3. Reproduce the tick 500 (same RPS flow).  
4. In the log stream, search for: `[tick] 500`  
5. Copy the full line(s) that follow (message + stack).

### Exact strings to search for

- In **browser Network response**: `"error":`
- In **Vercel logs**: `[tick] 500`

### What to paste back

1. The **full Response body** of one failing `POST .../api/rooms/tick` (the `error` value is the thrown message).  
2. Any **Vercel log line(s)** that contain `[tick] 500` (message and stack).  
3. One sentence: whether the host still crashes (React error) and whether the storage quota message still appears as a hard failure.

---

## 5. Browser storage: clear before retesting?

**Yes. Clear arena-related storage before retesting** so old large data doesn’t trigger quota again and you’re testing the new code paths.

**Keys to remove (in the production origin, e.g. https://www.kasroyal.com):**

1. `kasroyal_arena_store_v3`  
2. `kasroyal_arena_store` (legacy)  
3. `kasroyal_arena_matches` (navbar cache)

**How:**  
- DevTools → Application (Chrome) or Storage (Firefox) → Local Storage → `https://www.kasroyal.com` (or your production origin) → delete the three keys above.  
- Or run in the console on the production site:

```javascript
['kasroyal_arena_store_v3', 'kasroyal_arena_store', 'kasroyal_arena_matches'].forEach(k => localStorage.removeItem(k));
```

Then reload and run through the verification checklist again.

---

## 6. RPS reset and 15s timer verification (after RPS patch)

After deploying the RPS round-reset and 15s timer patch, verify live behavior (two browsers or host + challenger):

| # | Check | How | Pass condition |
|---|--------|-----|----------------|
| 1 | Host can change hand every round | Host: play RPS BO3. After each round (reveal → intermission → next round), pick a **different** hand (e.g. rock then paper then scissors). | Host can choose a new hand at the start of round 2 and round 3; no “stuck” previous choice. |
| 2 | Challenger can change hand every round | Challenger: same flow. Pick a different hand each round. | Challenger can choose a new hand every round; no stuck previous choice. |
| 3 | Both can choose immediately at round start | As soon as “Choose your hand” appears (and “Round ends in 15s” or similar), both players click a choice without waiting for the other. | Neither side is blocked by “waiting for opponent to move first”; both can click as soon as the round starts. |
| 4 | Timer auto-resolves in ~15s without forfeit | Start a round and **do not** lock in either choice. Wait 15–17 seconds. | Round ends automatically (one wins by timeout or draw); no need to forfeit. |
| 5 | BO3/BO5 still works | Play RPS BO3 to 2 wins (or BO5 to 3). | Series score advances, intermission and “X won Round N” appear, match finishes at 2 (or 3) wins. |
| 6 | No stale hand for either side | After each round transition (intermission → next round), both clients show “Choose your hand” with **no** prior choice pre-selected or locked. | Neither host nor challenger sees their previous round’s hand carried into the new round. |

**If any one of these fails:**

1. Note the **exact failing behavior** (e.g. “host’s hand stays ‘rock’ in round 2”, “timer never ends”, “challenger can’t click until host picks”).  
2. Report back with: **which check failed**, **exact steps**, and (if possible) **Network/Console** details (e.g. tick response, any 500s).  
3. You will get back: **exact file/function/line** still responsible and an **exact next patch**.
