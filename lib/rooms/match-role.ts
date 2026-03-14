/**
 * Centralized match role detection: host, challenger, or spectator.
 * Use this for UI gating (cancel, forfeit, move) and labels so logic lives in one place.
 */

export type MatchRole = "host" | "challenger" | "spectator"

export type MatchRoleInfo = {
  role: MatchRole
  isHost: boolean
  isChallenger: boolean
  isPlayer: boolean
  isSpectatorOnly: boolean
  /** Human label: "Host", "Challenger", or "Spectator" */
  playerRoleLabel: string
}

/** Match or room with at least host/challenger identity ids (e.g. Room, ArenaMatch). */
type RoomLike = {
  hostIdentityId?: string
  challengerIdentityId?: string | null
}

function normalizeId(id: string): string {
  return String(id ?? "").trim().toLowerCase()
}

/**
 * Derive the current user's role from a match/room and their identity id.
 * Handles null/undefined challenger (waiting room).
 */
export function getMatchRole(room: RoomLike | null, currentIdentityId: string): MatchRoleInfo {
  const identityId = normalizeId(currentIdentityId)
  if (!room) {
    return {
      role: "spectator",
      isHost: false,
      isChallenger: false,
      isPlayer: false,
      isSpectatorOnly: true,
      playerRoleLabel: "Spectator Only",
    }
  }

  const hostId = normalizeId(room.hostIdentityId ?? "")
  const challengerId = room.challengerIdentityId ? normalizeId(room.challengerIdentityId) : ""

  const isHost = hostId !== "" && identityId === hostId
  const isChallenger = challengerId !== "" && identityId === challengerId
  const isPlayer = isHost || isChallenger
  const role: MatchRole = isHost ? "host" : isChallenger ? "challenger" : "spectator"

  const playerRoleLabel =
    role === "host" ? "Host" : role === "challenger" ? "Challenger" : "Spectator Only"

  return {
    role,
    isHost,
    isChallenger,
    isPlayer,
    isSpectatorOnly: !isPlayer,
    playerRoleLabel,
  }
}
