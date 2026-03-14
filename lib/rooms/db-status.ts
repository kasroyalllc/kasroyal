/**
 * Canonical match status values in the Supabase DB after upgrade.
 * DB uses: waiting | ready | countdown | live | finished | forfeited | canceled
 * UI continues to use: "Waiting for Opponent" | "Ready to Start" | "Live" | "Finished"
 */

export const DB_STATUS = {
  WAITING: "waiting",
  READY: "ready",
  COUNTDOWN: "countdown",
  LIVE: "live",
  FINISHED: "finished",
  FORFEITED: "forfeited",
  CANCELED: "canceled",
} as const

export type DbStatus = (typeof DB_STATUS)[keyof typeof DB_STATUS]

/** Statuses that mean "match is active" (not resolved). */
export const DB_ACTIVE_STATUSES: DbStatus[] = [
  DB_STATUS.WAITING,
  DB_STATUS.READY,
  DB_STATUS.COUNTDOWN,
  DB_STATUS.LIVE,
]

/** Statuses that mean "match is finished" (for history). */
export const DB_FINISHED_STATUSES: DbStatus[] = [
  DB_STATUS.FINISHED,
  DB_STATUS.FORFEITED,
  DB_STATUS.CANCELED,
]

/** Statuses that allow spectating (has countdown or live). */
export const DB_SPECTATE_STATUSES: DbStatus[] = [
  DB_STATUS.READY,
  DB_STATUS.COUNTDOWN,
  DB_STATUS.LIVE,
]

/** Map UI status (from Room type) to DB write value. */
export function uiStatusToDb(ui: string): DbStatus {
  switch (ui) {
    case "Waiting for Opponent":
      return DB_STATUS.WAITING
    case "Ready to Start":
      return DB_STATUS.READY
    case "Live":
      return DB_STATUS.LIVE
    case "Finished":
      return DB_STATUS.FINISHED
    default:
      return DB_STATUS.WAITING
  }
}

/** For start/tick transition we allow "ready" or "countdown" -> "live". */
export const DB_READY_LIKE: DbStatus[] = [DB_STATUS.READY, DB_STATUS.COUNTDOWN]
