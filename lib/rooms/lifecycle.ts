/**
 * Consolidated match lifecycle: phases and shared transition helpers.
 * All games and routes should use these so Ready→Live and round progression
 * are defined in one place.
 */

import type { Room } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"
import { getGameDriver } from "@/lib/rooms/game-drivers"
import { DB_STATUS } from "@/lib/rooms/db-status"

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
 */
export function getReadyToLivePayload(
  room: Room,
  now: Date
): Record<string, unknown> | null {
  const driver = getGameDriver(room.game)
  if (!driver) return null
  const boardState = driver.createInitialBoardState()
  const moveSeconds = driver.getMoveSeconds()
  const nowIso = now.toISOString()
  const nowMs = now.getTime()
  const turnExpiresAt = driver.hasTurnTimer
    ? new Date(nowMs + moveSeconds * 1000).toISOString()
    : null
  return {
    status: DB_STATUS.LIVE,
    live_started_at: nowIso,
    betting_open: false,
    board_state: boardState,
    move_turn_identity_id: driver.hasTurnTimer ? room.hostIdentityId : null,
    move_turn_started_at: driver.hasTurnTimer ? nowIso : null,
    move_turn_seconds: driver.hasTurnTimer ? moveSeconds : null,
    turn_expires_at: turnExpiresAt,
    round_number: 1,
    host_score: 0,
    challenger_score: 0,
    updated_at: nowIso,
  }
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
  return getGameDriver(room.game) != null
}
