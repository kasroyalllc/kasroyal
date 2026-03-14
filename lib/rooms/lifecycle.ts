/**
 * Consolidated match lifecycle: phases and shared transition helpers.
 * All games and routes should use these so Ready→Live and round progression
 * are defined in one place.
 */

import type { Room } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"
import { getGameDriver } from "@/lib/rooms/game-drivers"
import { DB_STATUS } from "@/lib/rooms/db-status"
import { RPS_ROUND_SECONDS } from "@/lib/engine/game-constants"
import { createRpsRoundBoard } from "@/lib/rooms/game-board"

/** Top-level lifecycle phases. */
export type LifecyclePhase =
  | "waiting"
  | "ready"
  | "countdown"
  | "live_round"
  | "intermission"
  | "next_round_setup"
  | "finished"

/**
 * Derive lifecycle phase from room state.
 * Single source of truth for "what phase are we in".
 */
export function getLifecyclePhase(room: Room): LifecyclePhase {
  const status = room.status
  if (status === "Finished") return "finished"
  if (status === "Waiting for Opponent") return "waiting"
  if (status === "Ready to Start") {
    const countdownStartedAt = room.countdownStartedAt ?? null
    const countdownSeconds = (room.countdownSeconds ?? 30) * 1000
    const endMs = countdownStartedAt != null ? countdownStartedAt + countdownSeconds : 0
    if (endMs > 0 && Date.now() < endMs) return "countdown"
    return "ready"
  }
  if (status === "Live") {
    const intermissionUntil = room.roundIntermissionUntil ?? null
    if (intermissionUntil != null && typeof intermissionUntil === "number" && Date.now() < intermissionUntil) {
      return "intermission"
    }
    return "live_round"
  }
  return "waiting"
}

/** DB status values that mean "ready to start" (countdown or pre-countdown). */
export const READY_LIKE_STATUSES = [
  "ready",
  "countdown",
  "Ready to Start",
  "Ready To Start",
] as const

/**
 * Build the update payload for Ready → Live transition.
 * Used by both start route and tick route so behavior is identical.
 * Caller must .eq("id", roomId).in("status", READY_LIKE_STATUSES).select("*").
 *
 * Payload by game (audit):
 * - Tic-Tac-Toe / Connect 4 (hasTurnTimer: true): base + move_turn_identity_id (host), move_turn_started_at, move_turn_seconds, turn_expires_at.
 * - Rock Paper Scissors (hasTurnTimer: false): base only. No move_turn_* or turn_expires_at.
 * RPS must never include turn-based fields; the shared path must not assume a single current mover for RPS.
 */
/** Normalize game_type from DB so RPS is recognized regardless of casing. */
function normalizeGameForDriver(game: string): string {
  const g = String(game ?? "").trim()
  if (/^rock\s+paper\s+scissors$/i.test(g)) return "Rock Paper Scissors"
  if (/^tic[- ]?tac[- ]?toe$/i.test(g)) return "Tic-Tac-Toe"
  if (/^connect\s*4$/i.test(g)) return "Connect 4"
  return g
}

export function getReadyToLivePayload(
  room: Room,
  now: Date
): Record<string, unknown> | null {
  const gameKey = normalizeGameForDriver(room.game)
  const driver = getGameDriver(gameKey as GameType)
  if (!driver) return null
  const nowMs = now.getTime()
  const boardState =
    gameKey === "Rock Paper Scissors"
      ? createRpsRoundBoard(nowMs + RPS_ROUND_SECONDS * 1000)
      : driver.createInitialBoardState()
  const moveSeconds = driver.getMoveSeconds()
  const nowIso = now.toISOString()
  const turnExpiresAt = driver.hasTurnTimer
    ? new Date(nowMs + moveSeconds * 1000).toISOString()
    : null

  const base: Record<string, unknown> = {
    status: DB_STATUS.LIVE,
    live_started_at: nowIso,
    betting_open: false,
    board_state: boardState,
    round_number: 1,
    host_score: 0,
    challenger_score: 0,
    updated_at: nowIso,
  }
  if (driver.hasTurnTimer) {
    base.move_turn_identity_id = room.hostIdentityId ?? ""
    base.move_turn_started_at = nowIso
    base.move_turn_seconds = moveSeconds
    base.turn_expires_at = turnExpiresAt
  }
  return base
}

/**
 * Check if the room is in a phase that allows Ready → Live (countdown finished or ready).
 */
export function canTransitionReadyToLive(room: Room, nowMs: number): boolean {
  if (room.status !== "Ready to Start") return false
  if (!room.challengerIdentityId) return false
  const countdownStartedAt = room.countdownStartedAt ?? null
  if (!countdownStartedAt) return false
  const countdownEndMs = countdownStartedAt + (room.countdownSeconds ?? 30) * 1000
  if (nowMs < countdownEndMs) return false
  const gameKey = normalizeGameForDriver(room.game)
  return getGameDriver(gameKey as GameType) != null
}
