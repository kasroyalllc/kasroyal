/**
 * Canonical room shape: all room-mutating API routes must return the full Room object.
 * Partial responses (e.g. missing boardState) cause stale game state on the client (e.g. RPS hands).
 *
 * Use ensureFullRoom(mappedRoom, fallbackRoom) after mapDbRowToRoom(updateResult) so the
 * response always includes critical fields even when Supabase .update().select("*") omits them.
 */

import type { Room } from "@/lib/engine/match/types"

const CORE_FIELDS: (keyof Room)[] = [
  "id",
  "status",
  "game",
  "updatedAt",
  "currentRound",
  "boardState",
  "hostIdentityId",
  "challengerIdentityId",
  "hostRoundWins",
  "challengerRoundWins",
  "bestOf",
]

/**
 * Ensure a room built from an update result has the full canonical shape.
 * When the mapped room is missing critical fields (e.g. boardState), fill from fallback
 * so the client never receives a partial room and keeps stale state.
 *
 * @param mapped - Room from mapDbRowToRoom(updateResult); may omit board_state if select("*") didn't return it
 * @param fallback - Full room from getRoomById at request start; used only when mapped is missing fields
 */
export function ensureFullRoom(mapped: Room, fallback: Room | null): Room {
  if (fallback != null) {
    // Never copy boardState from fallback when mapped is Live (fallback is often pre-transition Ready with null boardState).
    if (mapped.boardState == null && fallback.boardState != null && mapped.status !== "Live") {
      mapped.boardState = fallback.boardState
    }
    if (mapped.currentRound == null && fallback.currentRound != null) {
      mapped.currentRound = fallback.currentRound
    }
    if (mapped.updatedAt == null && fallback.updatedAt != null) {
      mapped.updatedAt = fallback.updatedAt
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const missing: string[] = []
    for (const key of CORE_FIELDS) {
      const v = mapped[key]
      if (v === undefined || v === null) {
        if (key === "boardState" && mapped.status !== "Live") continue
        if (key === "challengerIdentityId" && mapped.status === "Waiting for Opponent") continue
        missing.push(key)
      }
    }
    if (missing.length > 0) {
      console.warn(
        "[canonical-room] Route returned room with missing core fields (may cause stale client state):",
        { roomId: mapped.id, status: mapped.status, missing }
      )
    }
  }

  return mapped
}
