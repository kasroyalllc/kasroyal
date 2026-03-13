# KasRoyal Deep Stability + Identity + Gameplay Pass — Report

## 1. Root causes and fixes

### PART 1 — Mobile chat send bug
- **Cause:** On mobile, the chat form could be scrolled out of view or the keyboard could cover the input/send area; sticky positioning inside a scrollable column still moved with the page when the keyboard opened.
- **Fix:** On mobile (`max-md:`), the chat form is now **fixed** to the viewport bottom (`max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-30`) so it stays above the keyboard. The messages list has `max-md:pb-[88px]` so the last message is not hidden behind the form. Send button uses `touch-manipulation`, `min-w-[64px]`, and `select-none` for reliable taps. `inputMode="text"` and `fontSize: 16px` kept for iOS. Chat submit logic moved into `handleChatSubmit` and a form ref is used for consistency. Desktop layout unchanged.

### PART 2 — Winner result display
- **Status:** Winner display was already correct: `getWinnerDisplayLine(match)` in `lib/mock/arena-data.ts` returns "Winner: [Name]", "Winner by Forfeit: [Name]", "Winner by Timeout: [Name]", or "Draw" using `match.result`, `match.winReason`, and host/challenger names from the room adapter.
- **Change:** Match page Finished block fallback improved: when `winnerLine` is empty, the UI now shows "Draw" when `match.result === "draw"`, otherwise "Match finished" instead of raw `statusText`. History page already uses `getWinnerDisplayLine(match) || getMatchResultLabel(match)` for result cards.

### PART 3 — Wallet profile name resolution
- **Status:** `getCurrentIdentity()` in `lib/identity.ts` already resolves display name as: (1) saved profile display name, (2) shortened wallet address. Wallet identity is authoritative; guest names are not used when a wallet is connected.
- **Change:** Profile page now uses this identity: it loads display name from `getStoredProfileDisplayName(account)` (or short address) when a wallet is connected, and from guest identity when not. Save flow updated to persist via identity (see Part 4).

### PART 4 — Unique profile name enforcement
- **Cause:** Display names were only in localStorage with no global uniqueness.
- **Fix:**  
  - **Migration:** `supabase/migrations/20250312100000_profiles_display_names.sql` adds `public.profiles` (`identity_id` PK, `display_name`, `updated_at`) and a unique index on `LOWER(TRIM(display_name))`.  
  - **API:** `app/api/profile/display-name/route.ts` PATCH accepts `identity_id` and `display_name`; checks case-insensitive uniqueness (another user already has that name); returns 409 with "That profile name is already taken." on conflict; otherwise upserts and returns success.  
  - **Profile page:** Wallet users save via this API then call `setStoredProfileDisplayName`. Guests save only to local guest identity via `setStoredGuestDisplayName` (no uniqueness across guests).  
  - **Identity:** `setStoredGuestDisplayName(displayName)` added in `lib/identity.ts` so the profile page can update the guest display name in storage.

### PART 5 — Countdown timer bug
- **Status:** Join flow already sets `countdown_started_at` and `betting_closes_at` in `lib/rooms/rooms-service.ts` (`joinRoom`). Room adapter and `getArenaBettingSecondsLeft` use these; lifecycle uses a 30s window. No code change in this pass; behavior was audited and is consistent.

### PART 6 — Realtime stability
- **Status:** Arena page subscribes to `matches` via `arena-matches` channel; match page subscribes to the room row and `match_messages`; spectate subscribes to `matches`. Browser Supabase client is a singleton (`createClient()`). No duplicate subscription fixes were required in this pass.

### PART 7 — Room load reliability
- **Status:** Match page loads room with `getRoomById(supabase, matchId)` and `roomToArenaMatch`; no local engine sync. "Room not found or no longer available" is shown when the room is missing after load. No change in this pass.

### PART 8 — Local storage cleanup
- **Status:** Arena list and match room state come from Supabase. Legacy `readArenaMatches` / localStorage arena store are still used by bets and spectate for tickets/featured markets; removing them would require those flows to resolve match by ID from Supabase. Not changed in this pass; documented for a future cleanup.

### PART 9 — UI premium pass
- **Status:** Arena and Spectate now separate Quick vs Ranked (Part 11). No additional UI pass in this change set.

### PART 10 — Codebase audit
- **Status:** `readArenaMatches`, `subscribeArenaMatches`, `getArenaById` remain in `lib/mock/arena-data.ts` and are used by bets/spectate and some helpers. Arena list and match load use Supabase only. No production path uses the legacy store as the authority for room list or single-room load.

### PART 11 — Separate Quick Match and Ranked Match lists
- **Arena:**  
  - **Quick Match Arena** section: Countdown rooms (Quick), Open seats (Quick), Your rooms (Quick).  
  - **Ranked Arena** section: Countdown rooms (Ranked), Open seats (Ranked), Your rooms (Ranked).  
  - Shared filters (game, ownership) remain at the top.  
- **Spectate:** "Tracked rooms" split into **Ranked matches** (first) and **Quick matches**, each with its own heading and list; same `LiveMatchCard` and selection behavior.

---

## 2. Files modified

| File | Change |
|------|--------|
| `app/arena/match/[id]/page.tsx` | Mobile chat: form fixed to viewport bottom on mobile, messages padding, `handleChatSubmit`, form ref, input `inputMode`, Send button tap/width. Finished fallback: show "Draw" or "Match finished" when no winner line. |
| `app/arena/page.tsx` | Split Arena into Quick Match Arena and Ranked Arena sections; each has countdown rooms, open seats, your rooms. Added `myReadyMatchesQuick/Ranked`, `myMatchesQuick/Ranked`. |
| `app/spectate/page.tsx` | Split tracked rooms into "Ranked matches" and "Quick matches" with separate headings; added `liveMatchesRanked`, `liveMatchesQuick`. |
| `app/profile/page.tsx` | Uses identity: load display name from `getStoredProfileDisplayName` / short address (wallet) or guest identity (guest). Save: wallet → PATCH `/api/profile/display-name` then `setStoredProfileDisplayName`; guest → `setStoredGuestDisplayName`. Shows "That profile name is already taken." on 409. |
| `app/api/profile/display-name/route.ts` | **New.** PATCH: check case-insensitive unique display name, upsert `profiles`, return 409 if taken. |
| `lib/identity.ts` | Added `setStoredGuestDisplayName(displayName)` to update guest display name in storage. |
| `supabase/migrations/20250312100000_profiles_display_names.sql` | **New.** Creates `profiles` table and unique index on `LOWER(TRIM(display_name))`. |

---

## 3. SQL migrations

- **Required:** Run `supabase/migrations/20250312100000_profiles_display_names.sql` (creates `profiles` and unique index).  
- No changes to `matches` or other existing tables.

---

## 4. Manual steps

1. **Run migration:** Apply `20250312100000_profiles_display_names.sql` to your Supabase project (e.g. `supabase db push` or run the SQL in the dashboard).
2. **Profile names:** Existing display names are in localStorage only until users re-save on the profile page; then they are written to `profiles` and enforced as unique.
3. **Optional:** Backfill `profiles` from existing room data (e.g. distinct `host_display_name` / `challenger_display_name` with a chosen `identity_id`) if you want pre-existing names to be reserved; otherwise first claim wins.

---

## 5. QA checklist

- **Quick Match:** Create as guest and as wallet; join as guest and wallet; countdown starts at 30; game goes live; moves sync; forfeit/cancel; winner or draw shown clearly.
- **Ranked Match:** Create/join requires wallet; guest cannot create or join ranked; countdown and live flow; winner labels correct.
- **Countdown:** Starts at 30 when challenger joins; both clients see same countdown; at 0 room goes Live once; move timer starts after; no frozen 0.
- **Winner display:** Match room and History show "Winner: [Name]", "Winner by Forfeit/Timeout: [Name]", or "Draw"; never only "Finished" when a winner exists.
- **Chat:** Desktop: type and send; scroll. Mobile: input stays above keyboard; Send easy to tap; messages send; list scrolls; no composer off-screen.
- **Profile name:** Wallet: set name on profile page; see it in Arena, match room, History, Spectate, Leaderboard; try same name from another account → "That profile name is already taken." Guest: set name; see it in Quick Match flows.
- **Profile uniqueness:** Two different wallet users cannot save the same display name (case-insensitive); 409 and message "That profile name is already taken."
- **Room load:** Direct `/arena/match/[id]`, refresh, and open from another browser load from Supabase; missing room shows "Room not found or no longer available."
- **Arena:** Quick Match Arena (countdown/open/your quick only) and Ranked Arena (countdown/open/your ranked only); no mixing.
- **Spectate:** Ranked matches list first, then Quick matches; selection and watch panel work for both.
- **Realtime:** New room / join / move / chat appear without full page refresh where subscriptions are in place.

---

*Deep Stability Pass completed. Supabase remains the source of truth for rooms and profiles; legacy arena store is not used as authority for room list or match load.*
