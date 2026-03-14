/**
 * Sync policy: when to accept room updates and how to reconcile impossible state.
 * Prevents stale refetches from overwriting newer mutation response and recovers from bad data.
 */

import type { Room } from "@/lib/engine/match/types"
import type { ArenaMatch } from "@/lib/engine/match-types"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"
import { getMatchRuntime } from "@/lib/engine/match-runtime"
import { getGameDriver } from "@/lib/rooms/game-drivers"

export type RoomUpdateSource = "mutation" | "refetch" | "realtime" | "tick"

/**
 * Decide whether to accept an incoming room over current match state.
 * Prefer mutation response when we have a clear transition; otherwise prefer newer updated_at.
 * Never regress from Live to Ready to Start (fixes RPS/stale refetch overwriting tick transition).
 */
export function shouldAcceptRoomUpdate(
  current: ArenaMatch | null,
  incomingRoom: Room,
  source: RoomUpdateSource
): boolean {
  const incomingUpdatedAt = getRoomUpdatedAt(incomingRoom)
  const currentUpdatedAt = typeof current?.updatedAt === "number" ? current.updatedAt : 0
  const incomingStatus = incomingRoom.status ?? "Waiting for Opponent"
  const currentStatus = current?.status

  let decision: boolean
  if (source === "mutation" || source === "tick") {
    decision = true
  } else if (source === "refetch" || source === "realtime") {
    if (!current) {
      decision = true
    } else if (currentStatus === "Live" && incomingStatus === "Ready to Start") {
      decision = false
    } else {
      decision = incomingUpdatedAt >= currentUpdatedAt
    }
  } else {
    decision = true
  }

  if (process.env.NODE_ENV !== "production" && (incomingStatus === "Ready to Start" || incomingStatus === "Live" || currentStatus === "Live")) {
    console.info("[sync-policy]", {
      source,
      current_updatedAt: currentUpdatedAt,
      current_status: currentStatus ?? null,
      incoming_updatedAt: incomingUpdatedAt,
      incoming_status: incomingStatus,
      decision: decision ? "accept" : "reject",
    })
  }
  return decision
}

/**
 * Get updatedAt from an ArenaMatch if we store it (optional field).
 * Room has updatedAt from mapDbRowToRoom; roomToArenaMatch does not currently pass it.
 * We can add it to ArenaMatch for sync comparison.
 */
export function getRoomUpdatedAt(room: Room): number {
  return Number(room.updatedAt ?? 0)
}

/**
 * Reconcile room to safe defaults when state is impossible or missing.
 * Returns a Room that is safe to pass to roomToArenaMatch (no crash, no invalid combinations).
 */
export function reconcileRoom(room: Room): Room {
  let r = { ...room }

  if (!r.id) r = { ...r, id: "" }
  const status = r.status ?? "Waiting for Opponent"
  if (
    status !== "Waiting for Opponent" &&
    status !== "Ready to Start" &&
    status !== "Live" &&
    status !== "Finished"
  ) {
    r = { ...r, status: "Waiting for Opponent" }
  }

  if (status === "Live") {
    const driver = getGameDriver(r.game)
    if (driver && (!r.boardState || typeof r.boardState !== "object")) {
      r = { ...r, boardState: driver.createInitialBoardState() }
    }
  }

  if (status === "Finished" && r.winnerIdentityId != null) {
    if (!r.hostIdentityId && !r.challengerIdentityId) {
      r = { ...r, winnerIdentityId: null, winReason: r.winReason ?? "finished" }
    }
  }

  const bestOf = r.bestOf === 3 || r.bestOf === 5 ? r.bestOf : 1
  const hostScore = Math.max(0, Number(r.hostRoundWins ?? 0))
  const challengerScore = Math.max(0, Number(r.challengerRoundWins ?? 0))
  const requiredWins = bestOf === 1 ? 1 : bestOf === 3 ? 2 : 3
  if (hostScore > requiredWins || challengerScore > requiredWins) {
    r = {
      ...r,
      hostRoundWins: Math.min(hostScore, requiredWins),
      challengerRoundWins: Math.min(challengerScore, requiredWins),
    }
  }

  return r
}

/**
 * Build ArenaMatch from room with sync policy and reconciliation.
 * Use this in the match page instead of raw roomToArenaMatch when you have a source and optional current state.
 */
export function acceptAndReconcile(
  incomingRoom: Room,
  currentMatch: ArenaMatch | null,
  source: RoomUpdateSource
): ArenaMatch {
  const reconciled = reconcileRoom(incomingRoom)
  const accept = shouldAcceptRoomUpdate(currentMatch, reconciled, source)
  const roomToUse = accept ? reconciled : (currentMatch ? undefined : reconciled)
  if (roomToUse === undefined && currentMatch) {
    return currentMatch
  }
  const room = roomToUse ?? reconciled
  return roomToArenaMatch(room)
}
