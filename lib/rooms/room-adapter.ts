/**
 * Converts backend Room to UI ArenaMatch shape so existing components keep working.
 */

import type { ArenaMatch, PlayerProfile, RankTier } from "@/lib/engine/match-types"
import type { Room } from "@/lib/engine/match/types"

const DEFAULT_RANK: RankTier = "Bronze III"

function defaultPlayer(name: string): PlayerProfile {
  return {
    name,
    rank: DEFAULT_RANK,
    rating: 1000,
    winRate: 50,
    last10: "0-0",
  }
}

/** Enrich board_state with DB-authoritative turn deadline (turnExpiresAt). */
function enrichBoardStateWithMoveTimer(room: Room): unknown {
  const raw = room.boardState
  if (room.status !== "Live" || !raw || typeof raw !== "object") return raw
  const deadlineMs = room.turnExpiresAt ?? null
  const withDeadline = { ...(raw as Record<string, unknown>), turnDeadlineTs: deadlineMs }
  return withDeadline
}

/** Convert a Room from Supabase to ArenaMatch for the arena UI (presentation only). */
export function roomToArenaMatch(room: Room): ArenaMatch {
  const host: PlayerProfile = defaultPlayer(room.hostDisplayName)
  const challenger: PlayerProfile | null = room.challengerDisplayName
    ? defaultPlayer(room.challengerDisplayName)
    : null

  const bettingStatus =
    room.mode === "quick"
      ? ("disabled" as const)
      : room.bettingOpen
        ? ("open" as const)
        : ("locked" as const)

  const countdownSeconds = Math.max(1, room.countdownSeconds ?? 30)
  const countdownStartedAt = room.countdownStartedAt ?? (room.status === "Ready to Start" ? room.updatedAt : undefined) ?? undefined
  const bettingClosesAt =
    room.bettingClosesAt ??
    (room.status === "Ready to Start" && countdownStartedAt != null
      ? countdownStartedAt + countdownSeconds * 1000
      : undefined)
  const startedAt = room.liveStartedAt ?? undefined
  const finishedAt = room.finishedAt ?? undefined
  const boardState = enrichBoardStateWithMoveTimer(room)

  const bestOf = room.bestOf === 3 || room.bestOf === 5 ? room.bestOf : 1
  return {
    id: room.id,
    game: room.game,
    status: room.status,
    matchMode: room.mode,
    bettingStatus,
    marketVisibility: "watch-only",
    isFeaturedMarket: false,
    bestOf,
    wager: room.wager,
    createdAt: room.createdAt,
    countdownStartedAt,
    bettingClosesAt,
    startedAt,
    finishedAt,
    spectators: 0,
    playerPot: room.wager * (room.challengerIdentityId ? 2 : 1),
    host,
    challenger,
    hostIdentityId: room.hostIdentityId,
    challengerIdentityId: room.challengerIdentityId ?? undefined,
    hostSideLabel: "Host",
    challengerSideLabel: "Challenger",
    statusText: room.status,
    moveText:
      room.status === "Ready to Start"
        ? "Countdown"
        : room.status === "Live"
          ? "Live"
          : room.status === "Finished"
            ? "Finished"
            : "Waiting",
    roundScore: { host: room.hostRoundWins, challenger: room.challengerRoundWins },
    currentRound: room.currentRound,
    spectatorPool: { host: 0, challenger: 0 },
    bettingWindowSeconds: countdownSeconds,
    result: room.winnerIdentityId
      ? room.winnerIdentityId === room.hostIdentityId
        ? ("host" as const)
        : room.winnerIdentityId === room.challengerIdentityId
          ? ("challenger" as const)
          : null
      : null,
    winReason: room.winReason ?? undefined,
    turnExpiresAt: room.turnExpiresAt ?? undefined,
    moveHistory: [],
    boardState: boardState ?? room.boardState,
    timeoutStrikesHost: room.hostTimeoutStrikes,
    timeoutStrikesChallenger: room.challengerTimeoutStrikes,
  }
}
