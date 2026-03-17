/**
 * Shared game constants for backend and UI. Countdown and move timers.
 */

export const PRE_MATCH_COUNTDOWN_SECONDS = 30

export const CONNECT4_MOVE_SECONDS = 20
export const TTT_MOVE_SECONDS = 10

/** RPS: round timer in seconds. Both choose within this time; if only one chooses, that side wins; if neither, draw. */
export const RPS_ROUND_SECONDS = 10

export const TIMEOUT_STRIKES_TO_LOSE = 3

export function getMoveSecondsForGame(game: string): number {
  if (game === "Connect 4") return CONNECT4_MOVE_SECONDS
  if (game === "Tic-Tac-Toe") return TTT_MOVE_SECONDS
  if (game === "Rock Paper Scissors") return 0
  return 30
}
