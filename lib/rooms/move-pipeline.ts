/**
 * Shared move resolution pipeline: series update, round end, intermission, and DB payloads.
 * Used by the move route so all games share one round/series/intermission path.
 */

import type { Room } from "@/lib/engine/match/types"
import type { GameDriver } from "@/lib/rooms/game-drivers"
import type { RoundOutcome } from "@/lib/rooms/game-drivers"
import { DB_STATUS } from "@/lib/rooms/db-status"

/** Seconds to show round result before next round (BO3/BO5). Tick starts next round when expired. Longer so winning board is visible before countdown. */
export const INTERMISSION_SECONDS = 8

export type SeriesUpdate = {
  seriesOver: boolean
  winnerIdentityId: string | null
  winReason: string
  hostRoundWins: number
  challengerRoundWins: number
  currentRound: number
}

/**
 * Compute series state after a round ends. BO1 = 1 win, BO3 = first to 2, BO5 = first to 3.
 * Uses canonical semantics: round_number, host_score, challenger_score, best_of.
 */
export function getSeriesUpdate(
  room: Room,
  roundWinner: "host" | "challenger" | null
): SeriesUpdate {
  const bestOf = room.bestOf === 3 || room.bestOf === 5 ? room.bestOf : 1
  const requiredWins = bestOf === 1 ? 1 : bestOf === 3 ? 2 : 3
  const hostRoundWinsPrev = Math.max(0, Number(room.hostRoundWins ?? 0))
  const challengerRoundWinsPrev = Math.max(0, Number(room.challengerRoundWins ?? 0))
  const currentRoundPrev = Math.max(1, Math.min(Number(room.currentRound ?? 1), 5))
  let hostRoundWins = hostRoundWinsPrev
  let challengerRoundWins = challengerRoundWinsPrev
  if (roundWinner === "host") hostRoundWins += 1
  if (roundWinner === "challenger") challengerRoundWins += 1
  const seriesOver =
    bestOf === 1 && roundWinner === null
      ? true
      : hostRoundWins >= requiredWins || challengerRoundWins >= requiredWins
  const winnerIdentityId = seriesOver
    ? bestOf === 1 && roundWinner === null
      ? null
      : hostRoundWins >= requiredWins
        ? room.hostIdentityId
        : room.challengerIdentityId ?? null
    : null
  const winReason = seriesOver
    ? bestOf === 1 && roundWinner === null
      ? "draw"
      : `series ${hostRoundWins}-${challengerRoundWins}`
    : roundWinner === "host"
      ? "win"
      : roundWinner === "challenger"
        ? "win"
        : "draw"
  const nextRound = currentRoundPrev + (seriesOver ? 0 : 1)
  const currentRound = Math.min(Math.max(1, nextRound), 5)
  return {
    seriesOver,
    winnerIdentityId,
    winReason,
    hostRoundWins,
    challengerRoundWins,
    currentRound,
  }
}

export type RoundRecord = {
  roundNumber: number
  winnerIdentityId: string | null
  resultType: "win" | "draw" | "timeout" | "forfeit"
  hostScoreAfter: number
  challengerScoreAfter: number
}

export type MoveDbUpdate =
  | { updateType: "in_round"; payload: Record<string, unknown>; logEvent: "move_applied" }
  | {
      updateType: "series_finished"
      payload: Record<string, unknown>
      releaseMatch: true
      logEvent: string
      roundRecord: RoundRecord
    }
  | {
      updateType: "intermission"
      payload: Record<string, unknown>
      logEvent: string
      roundRecord: RoundRecord
    }

/**
 * Build the canonical DB update payload for a move result.
 * Single path for all games: in-round update, series finished, or intermission.
 */
export function resolveMoveToDbUpdate(
  room: Room,
  outcome: RoundOutcome,
  nowIso: string,
  nowMs: number,
  driver: GameDriver
): MoveDbUpdate {
  if (!outcome.roundEnded) {
    const payload: Record<string, unknown> = {
      board_state: outcome.newBoardState,
      updated_at: nowIso,
    }
    if (driver.hasTurnTimer && outcome.nextTurnIdentityId != null) {
      const moveSeconds = driver.getMoveSeconds()
      payload.move_turn_identity_id = outcome.nextTurnIdentityId
      payload.move_turn_started_at = nowIso
      payload.move_turn_seconds = moveSeconds
      payload.turn_expires_at =
        moveSeconds > 0 ? new Date(nowMs + moveSeconds * 1000).toISOString() : null
    }
    return { updateType: "in_round", payload, logEvent: "move_applied" }
  }

  const roundWinner = outcome.roundWinner
  const roundWinnerIdentityId =
    roundWinner === "host"
      ? room.hostIdentityId
      : roundWinner === "challenger"
        ? room.challengerIdentityId ?? null
        : null
  const series = getSeriesUpdate(room, roundWinner)

  const roundRecord: RoundRecord = {
    roundNumber: series.currentRound,
    winnerIdentityId: roundWinnerIdentityId,
    resultType: outcome.isDraw ? "draw" : "win",
    hostScoreAfter: series.hostRoundWins,
    challengerScoreAfter: series.challengerRoundWins,
  }

  if (series.seriesOver) {
    const payload: Record<string, unknown> = {
      status: DB_STATUS.FINISHED,
      board_state: outcome.newBoardState,
      winner_identity_id: series.winnerIdentityId,
      win_reason: series.winReason,
      round_number: series.currentRound,
      host_score: series.hostRoundWins,
      challenger_score: series.challengerRoundWins,
      updated_at: nowIso,
      finished_at: nowIso,
      ended_at: nowIso,
    }
    const logEvent = outcome.isDraw ? "series_finished_draw" : "series_finished"
    return { updateType: "series_finished", payload, releaseMatch: true, logEvent, roundRecord }
  }

  const intermissionUntil = new Date(nowMs + INTERMISSION_SECONDS * 1000).toISOString()
  // Include board_state so resolved round persists (both choices + revealed + winner). Required for RPS: without it, only first chooser's choice would remain in DB and carry into next round.
  const payload: Record<string, unknown> = {
    status: DB_STATUS.LIVE,
    board_state: outcome.newBoardState,
    round_number: series.currentRound,
    host_score: series.hostRoundWins,
    challenger_score: series.challengerRoundWins,
    round_intermission_until: intermissionUntil,
    last_round_winner_identity_id: roundWinnerIdentityId,
    updated_at: nowIso,
  }
  const roundJustEnded = series.currentRound - 1
  const logEvent = outcome.isDraw ? "round_draw_intermission" : "round_ended_intermission"
  return {
    updateType: "intermission",
    payload,
    logEvent,
    roundRecord: { ...roundRecord, roundNumber: roundJustEnded },
  }
}
