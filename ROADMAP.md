# KasRoyal Roadmap

Planned production features. Items are sequenced so core gameplay and wallet flows stay stable before expanding.

---

## Transactional Email Receipts

**Status:** Planned (Phase 1)  
**Prerequisite:** Implement only after current core gameplay flow is stable.

### Goal

Users receive professional email receipts for important account and match events.

### Phase 1 Requirements

1. **Profile**
   - Ranked users can **save and verify an email address** in profile.
   - **Notification preference settings** in profile (e.g. opt-in/opt-out per receipt type).

2. **Transactional emails (server-side only)**
   - **Match receipt** — when a ranked game finishes.
   - **Payout receipt** — when funds are paid out.
   - **Bet settlement receipt** — when a spectator bet resolves.

3. **Email content (per receipt type)**
   - Game type  
   - Match ID  
   - Players  
   - Result  
   - Wager/stake amount  
   - Payout/refund amount if applicable  
   - Timestamp  
   - Tx hash if available  
   - Link to match history or result page  

### Implementation Rules

- Emails must be **triggered server-side only** (e.g. API routes, Supabase functions, or backend jobs).
- **Do not send from the browser.**
- Add notification preference settings to profile; respect opt-out.
- **Marketing emails are out of scope** — transactional only.
- Use a transactional email architecture suitable for production (templates, logging, bounces, etc.).

### Preferred Provider

- **Resend** or an equivalent transactional email service.

### Out of Scope (Phase 1)

- Marketing or promotional emails.
- Sending from the client.
- Email without verification or preferences.

---

*Other roadmap items will be added here as the product evolves.*
