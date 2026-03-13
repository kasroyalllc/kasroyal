# KasRoyal Mega Product Pass — Report

## 1. Root causes found

### Countdown freeze (fixed in prior work)
- **Cause:** `getArenaBettingSecondsLeft` required `bettingStatus === "open"`. Quick Match has betting disabled, so it always returned 0 and the UI showed a frozen 0 before start.
- **Fix:** Countdown logic no longer depends on betting being open; it uses `bettingClosesAt` or `countdownStartedAt + windowSeconds`. Room adapter sets fallback `countdownStartedAt` when missing. Match page shows “Starting…” when seconds left is 0 but status is still Ready to Start.

### Ranked guest leak (fixed this pass)
- **Cause:** Create and Join APIs did not reject guest identities for ranked mode; Arena UI did not block guests from attempting ranked create/join.
- **Fix:** 
  - **Create API:** If `mode === "ranked"` and `host_identity_id` starts with `"guest-"`, return 400: “Ranked matches require a connected wallet…”
  - **Join API:** If room is ranked and `challenger_identity_id` starts with `"guest-"`, return 400 with same message.
  - **Arena UI:** Ranked create button disabled when `isGuest`, label “Connect wallet for Ranked”. MatchCard gets `isGuest`; for open ranked rooms, join button disabled for guests with “Connect wallet to join” and pill “Connect wallet to join”.

### Room not loaded / “local engine” message (fixed in prior work)
- **Cause:** Match page previously relied on local engine sync and showed “room not synced into local engine” when room wasn’t in local store.
- **Fix:** Match page loads only from Supabase (`getRoomById` → `roomToArenaMatch`). No local upsert. `roomLoadAttempted` used to show “Loading room…” vs “Room not found or no longer available” with product copy.

### Mobile chat (fixed in prior work)
- **Cause:** Chat composer could be pushed off-screen by keyboard; send button and input not sized for touch.
- **Fix:** In match page, chat form is sticky at bottom on mobile, min height/width 52px for input and Send, safe-area padding.

### Other
- **Legacy arena store:** `readArenaMatches` / `getArenaById` / `subscribeArenaMatches` remain in `lib/mock/arena-data.ts` and are still used by bets and spectate (e.g. resolving match for tickets, featured markets). Arena list and match room load use Supabase only. A future pass could have bets/spectate resolve match by ID from Supabase where possible to reduce reliance on in-memory store.

---

## 2. Files modified (this session)

| File | Change |
|------|--------|
| `app/api/rooms/create/route.ts` | Reject ranked create when host is guest (400 + message). |
| `app/api/rooms/join/route.ts` | Reject ranked join when challenger is guest (400 + message). |
| `app/arena/page.tsx` | `isGuest` from identity; ranked create disabled + label when guest; MatchCard gets `isGuest`, `joinBlockedByGuest` for ranked open seats, all `<MatchCard>` usages pass `isGuest`. |
| `app/page.tsx` | “Recently resolved” section: “History →” link href changed from `/arena` to `/history`. |
| `app/arena/match/[id]/page.tsx` | Room-not-found title: “Room not found or no longer available”; body copy product-friendly. |

---

## 3. SQL migrations

None required for this pass.

---

## 4. Manual steps still required

- **Environment:** Ensure `NEXT_PUBLIC_ENABLE_DEV_CONSOLE` is set only in dev if you want Tx Console hidden in production.
- **Supabase:** Confirm RLS and `matches` schema match product rules (one active match per identity, etc.); no schema changes were made in this pass.
- **QA:** Run through the checklist below on staging/production after deploy.

---

## 5. QA checklist

Use this to verify behavior after the pass.

### Quick Match
- [ ] **Create:** As guest, create Quick Match (Connect 4 or Tic-Tac-Toe). Room appears; URL is `/arena/match/[id]`.
- [ ] **Join:** As another guest (or wallet user), join the room. Countdown starts at 30.
- [ ] **Play:** Countdown reaches 0, match goes Live, board and turn sync. Make moves; both sides see same state.

### Ranked Match
- [ ] **Create (guest blocked):** As guest, ensure “Create Ranked Match” is disabled and shows “Connect wallet for Ranked”. Connect wallet and confirm button becomes “Create Ranked Match”.
- [ ] **Create (wallet):** With wallet connected, create Ranked Match with wager. Room created and you are host.
- [ ] **Join (guest blocked):** As guest, open Arena; find an open *ranked* seat. Join button disabled with “Connect wallet to join”. Connect wallet and confirm Join works.
- [ ] **Join (wallet):** With wallet, join a ranked open seat. Countdown and live flow work.

### Countdown & live start
- [ ] After challenger joins, countdown starts at 30 and decrements on both clients.
- [ ] At 0, room becomes Live once; board and first turn appear; move timer starts after live (no overlap with countdown).
- [ ] No frozen 0 or “Starting…” stuck state.

### Gameplay
- [ ] Host and challenger see the same board; moves and turn changes sync.
- [ ] Move timer runs; timeout strikes apply; 3 timeouts = loss and result shown.
- [ ] Forfeit ends match once for both; active match lock releases.

### Result / winner
- [ ] Finished match shows clear label: “Winner: [Name]”, “Winner by Forfeit: [Name]”, “Winner by Timeout: [Name]”, or “Draw”.
- [ ] History page cards show same result labels and “View Result” works.

### Chat
- [ ] **Desktop:** Chat visible and usable; send and scroll behave.
- [ ] **Mobile:** Input stays above keyboard; Send is easy to tap; composer not pushed off-screen; scroll and typing comfortable.

### Room load & not found
- [ ] Direct navigate to `/arena/match/[id]` loads room from server (no “local engine” message).
- [ ] Refresh on match page keeps room loading from Supabase.
- [ ] Invalid or ended match ID shows “Room not found or no longer available” and friendly subtext with link to Arena.

### Arena & History
- [ ] Arena: sticky left rail (Create Match, Quick/Ranked, Return to game, Match History). Right: Countdown rooms, Lobby, Open seats, Your rooms. No finished matches in Arena.
- [ ] History: only completed matches; result cards and labels; History in navbar.
- [ ] Homepage “Recently resolved” “History →” goes to `/history`.

### Activity & homepage
- [ ] **Activity:** Wallet Status, Recent Activity, Pending/Completed transactions, Quick Actions; no raw dev language. Dev link to Tx Console only when flag set.
- [ ] **Homepage:** Hero (framed artwork, “Play. Bet. Win.”, CTAs), live strip (active/live/open/resolved), premium empty states for live, open, resolved.

### Identity & rank
- [ ] With wallet: display name is saved profile name or shortened address.
- [ ] New ranked user starts at Bronze III; existing progression preserved.
- [ ] Quick Match guest identity unchanged.

---

*Report generated after Mega Product Pass. Supabase remains the source of truth; no return to local mock room authority.*
