/**
 * Sync policy: when to accept room updates and how to reconcile impossible state.
 * Prevents stale refetches from overwriting newer mutation response and recovers from bad data.
 */

import type { Room } from "@/lib/engine/match/types"
import type { ArenaMatch } from "@/lib/engine/match-types"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"
import { getGameDriver } from "@/lib/rooms/game-drivers"
import { createRpsRoundBoard } from "@/lib/rooms/game-board"
import { RPS_ROUND_SECONDS } from "@/lib/engine/game-constants"

export type RoomUpdateSource = "mutation" | "refetch" | "realtime" | "tick" | "ej"

/**
 * Decide whether to accept an incoming room over current match state.
 * Prefer mutation response when we have a clear transition; otherwise prefer newer updated_at.
 * Never regress from Live to Ready to Start (fixes RPS/stale refetch overwriting tick transition).
 * Never accept a tick with older updated_at than current (fixes RPS challenger stuck: stale tick must not overwrite new-round state).
 * "ej" = refreshRoom/getRoomById path (poll or realtime-triggered); same rules as refetch.
 */
export function shouldAcceptRoomUpdate(
  current: ArenaMatch | null,
  incomingRoom: Room,
  source: RoomUpdateSource
): boolean {
  const incomingVersion = getRoomVersion(incomingRoom)
  const currentVersion = getRoomVersion(current ?? {})
  const incomingUpdatedAt = getRoomUpdatedAt(incomingRoom)
  const currentUpdatedAt = typeof current?.updatedAt === "number" ? current.updatedAt : 0
  const incomingStatus = incomingRoom.status ?? "Waiting for Opponent"
  const currentStatus = current?.status

  // Prefer higher room_version; never let refetch/ej overwrite a higher version.
  if (source === "refetch" || source === "realtime" || source === "ej") {
    if (current != null && incomingVersion < currentVersion) {
      return false
    }
  }

  let decision: boolean
  if (source === "mutation") {
    decision = true
  } else if (source === "tick") {
    if (incomingVersion > currentVersion) decision = true
    else if (incomingVersion < currentVersion) decision = false
    else decision = incomingUpdatedAt >= currentUpdatedAt
    // RPS host stuck: never keep old round when server sends a fresh round board (both choices null).
    if (!decision && current && incomingStatus === "Live") {
      const incomingBoard = incomingRoom.boardState as { mode?: string; hostChoice?: unknown; challengerChoice?: unknown; revealed?: boolean } | null | undefined
      const isFreshRound =
        incomingBoard &&
        typeof incomingBoard === "object" &&
        incomingBoard.mode === "rps-live" &&
        incomingBoard.hostChoice == null &&
        incomingBoard.challengerChoice == null &&
        incomingBoard.revealed === false
      const currentBoard = current.boardState as { hostChoice?: unknown; challengerChoice?: unknown } | null | undefined
      const currentHasChoices =
        currentBoard &&
        typeof currentBoard === "object" &&
        (currentBoard.hostChoice != null || currentBoard.challengerChoice != null)
      if (isFreshRound && currentHasChoices && incomingRoom.game === "Rock Paper Scissors") {
        decision = true
      }
    }
  } else if (source === "refetch" || source === "realtime" || source === "ej") {
    if (!current) {
      decision = true
    } else if (currentStatus === "Live" && incomingStatus === "Ready to Start") {
      decision = false
    } else if (currentStatus === "Live" && incomingStatus === "Live" && incomingRoom.game === "Rock Paper Scissors") {
      // RPS: never overwrite a fresh round (both choices null) with stale "first chooser only" state from a prior round.
      const currentBoard = current.boardState as { hostChoice?: unknown; challengerChoice?: unknown; revealed?: boolean } | null | undefined
      const incomingBoard = incomingRoom.boardState as { hostChoice?: unknown; challengerChoice?: unknown; revealed?: boolean } | null | undefined
      const currentFreshRound =
        currentBoard &&
        typeof currentBoard === "object" &&
        currentBoard.hostChoice == null &&
        currentBoard.challengerChoice == null &&
        currentBoard.revealed === false
      const incomingOneChoiceOnly =
        incomingBoard &&
        typeof incomingBoard === "object" &&
        (incomingBoard.hostChoice != null) !== (incomingBoard.challengerChoice != null)
      if (currentFreshRound && incomingOneChoiceOnly) {
        decision = false
      } else if (incomingVersion !== currentVersion) {
        decision = incomingVersion > currentVersion
      } else {
        decision = incomingUpdatedAt >= currentUpdatedAt
      }
    } else if (incomingVersion !== currentVersion) {
      decision = incomingVersion > currentVersion
    } else {
      decision = incomingUpdatedAt >= currentUpdatedAt
    }
  } else {
    decision = true
  }

  if (process.env.NODE_ENV !== "production" && (incomingStatus === "Ready to Start" || incomingStatus === "Live" || currentStatus === "Live" || currentStatus === "Ready to Start")) {
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
 * Room has updatedAt from mapDbRowToRoom; roomToArenaMatch passes it to ArenaMatch.
 */
export function getRoomUpdatedAt(room: Room): number {
  return Number(room.updatedAt ?? 0)
}

/**
 * Get monotonic room_version from Room (or ArenaMatch). Prefer over updatedAt for ordering.
 */
export function getRoomVersion(room: Room | { roomVersion?: number }): number {
  return typeof (room as { roomVersion?: number }).roomVersion === "number"
    ? (room as { roomVersion: number }).roomVersion
    : 0
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
      // RPS needs roundExpiresAt; use createRpsRoundBoard. Other games use driver.createInitialBoardState().
      // No partial merge: we replace boardState entirely; never preserve hostChoice/challengerChoice from anywhere.
      const boardState =
        r.game === "Rock Paper Scissors"
          ? createRpsRoundBoard(Date.now() + RPS_ROUND_SECONDS * 1000)
          : driver.createInitialBoardState()
      r = { ...r, boardState }
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
 * Logs every apply (ACCEPTED/REJECTED) so we can prove the race: tick sets Live -> ej overwrites with Ready.
 */
export function acceptAndReconcile(
  incomingRoom: Room,
  currentMatch: ArenaMatch | null,
  source: RoomUpdateSource
): ArenaMatch {
  const reconciled = reconcileRoom(incomingRoom)
  const accept = shouldAcceptRoomUpdate(currentMatch, reconciled, source)
  const roomToUse = accept ? reconciled : (currentMatch ? undefined : reconciled)
  const incomingStatus = reconciled.status ?? "Waiting for Opponent"
  const incomingUpdatedAt = getRoomUpdatedAt(reconciled)
  const currentUpdatedAt = typeof currentMatch?.updatedAt === "number" ? currentMatch.updatedAt : 0

  if (roomToUse === undefined && currentMatch) {
    const ejOverwrite = (source === "ej" || source === "refetch") && currentMatch.status === "Live" && incomingStatus === "Ready to Start"
    console.info("[R] REJECTED", {
      source,
      room_id: reconciled.id,
      raw_incoming_status: incomingStatus,
      mapped_status_would_be: incomingStatus,
      kept_status: currentMatch.status,
      updatedAt: incomingUpdatedAt,
      current_updatedAt: currentUpdatedAt,
      ej_overwrote_live: ejOverwrite,
    })
    return currentMatch
  }
  const room = roomToUse ?? reconciled
  const mapped = roomToArenaMatch(room)
  console.info("[R] ACCEPTED", {
    source,
    room_id: room.id,
    raw_incoming_status: incomingStatus,
    mapped_status: mapped.status,
    updatedAt: mapped.updatedAt ?? incomingUpdatedAt,
  })
  return mapped
}
