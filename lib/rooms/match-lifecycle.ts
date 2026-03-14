/**
 * Match lifecycle: legal status transitions and validation.
 * Server must only allow these transitions; clients must not set status.
 */

export type MatchStatus =
  | "Waiting for Opponent"
  | "Ready to Start"
  | "Live"
  | "Finished"

/** Legal transitions: from -> to[] */
const LEGAL_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  "Waiting for Opponent": ["Ready to Start", "Finished"],
  "Ready to Start": ["Live", "Finished"],
  Live: ["Finished"],
  Finished: [],
}

/**
 * Returns true if transitioning from `from` to `to` is allowed.
 */
export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Asserts transition is legal; throws if not.
 */
export function assertTransition(
  from: MatchStatus,
  to: MatchStatus,
  context?: string
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      context
        ? `Invalid match transition: ${from} -> ${to} (${context})`
        : `Invalid match transition: ${from} -> ${to}`
    )
  }
}

/**
 * Status values that are "active" (match not yet resolved).
 */
export const ACTIVE_STATUSES: MatchStatus[] = [
  "Waiting for Opponent",
  "Ready to Start",
  "Live",
]

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status as MatchStatus)
}

/**
 * Only one of these statuses allows gameplay (move/turn).
 */
export function isPlayableStatus(status: string): boolean {
  return status === "Live"
}
