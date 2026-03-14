# Documentation policy

**Documentation is a required part of development.** The docs structure (README, docs/architecture, docs/lifecycle, docs/debugging, docs/game-drivers, docs/database, docs/deployment) is not a one-time task—it is a permanent rule of the repository.

This policy ensures a persistent engineering knowledge base so the system becomes easier to extend as we add games and features, and we avoid repeating the same debugging cycles and architectural mistakes.

---

## 1. Architectural fixes must be documented

If we discover a **lifecycle bug**, **driver issue**, **database constraint conflict**, or **runtime assumption** that causes a failure (e.g. the RPS turn-timer problem), the **root cause and solution** must be written into the appropriate docs section **before the task is considered complete**.

- **Where**: [docs/debugging/debug-playbook.md](debugging/debug-playbook.md) (symptom, root cause, fix, prevention); [docs/database/schema-notes.md](database/schema-notes.md) or [docs/game-drivers/driver-contract.md](game-drivers/driver-contract.md) if the fix touches schema or driver contract; [docs/architecture/system-architecture.md](architecture/system-architecture.md) if the fix changes high-level flow or responsibilities.

---

## 2. New games must update driver documentation

When adding a new game driver (Battleship, Darts, etc.), update **docs/game-drivers** to document:

- The **board state shape**
- Whether the game is **turn-based or simultaneous**
- **driver.hasTurnTimer** behavior
- **How rounds resolve**
- Any **lifecycle differences** from existing games

Prefer [docs/game-drivers/driver-contract.md](game-drivers/driver-contract.md) and, if needed, a game-specific doc (e.g. driver-contract.md “Supported games” table and “Adding a new game” section).

---

## 3. Lifecycle changes must update lifecycle documentation

If any change is made to **ready → live**, **round resolution**, **intermission timing**, **series progression**, **pause behavior**, or **timeout handling**, the **lifecycle documentation** must be updated accordingly.

- **Where**: [docs/lifecycle/match-lifecycle.md](lifecycle/match-lifecycle.md). Keep [docs/MATCH_LIFECYCLE.md](MATCH_LIFECYCLE.md) in sync if it remains the flat reference.

---

## 4. Debugging discoveries go into the debug playbook

When a bug requires investigation (tick failures, DB constraint conflicts, realtime sync issues, etc.), record in [docs/debugging/debug-playbook.md](debugging/debug-playbook.md):

- **Symptom**
- **Root cause**
- **Fix**
- **Prevention rule**

Each entry should be concise and actionable so future work can avoid the same pitfall.

---

## 5. Documentation is part of the pull request

**Architecture-impacting changes are not complete until documentation is updated.** When opening or reviewing a PR that touches:

- Lifecycle, tick, move pipeline, or ready→live behavior → update docs/lifecycle and, if applicable, docs/architecture.
- Game drivers or new games → update docs/game-drivers.
- Schema, constraints, or match state persistence → update docs/database.
- Any bug fix that had a non-obvious root cause → add or update docs/debugging/debug-playbook.md.

Consider documentation updates as part of the PR checklist; do not merge architecture-impacting changes without the corresponding doc updates.

---

## Summary

| Change type | Document in |
|-------------|--------------|
| Architectural / lifecycle / driver / DB fix | debug-playbook (+ schema-notes or driver-contract or architecture as needed) |
| New game driver | game-drivers (board state, turn-based vs simultaneous, hasTurnTimer, round resolution, lifecycle differences) |
| Lifecycle behavior change | lifecycle/match-lifecycle.md |
| Any non-obvious bug fix | debugging/debug-playbook.md (symptom, root cause, fix, prevention) |
| PR that impacts architecture | All of the above as applicable; doc updates are part of the PR |

See also: [README.md](../README.md) (Architecture overview, Documentation index, Documentation update rule).
