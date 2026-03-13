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

/** Convert a Room from Supabase to ArenaMatch for the arena UI. */
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

  const countdownStartedAt = room.countdownStartedAt ?? undefined
  const COUNTDOWN_MS = 30 * 1000
  const bettingClosesAt =
    room.bettingClosesAt ??
    (room.status === "Ready to Start" && room.countdownStartedAt
      ? room.countdownStartedAt + COUNTDOWN_MS
      : undefined)
  const startedAt = room.liveStartedAt ?? undefined
  const finishedAt = room.finishedAt ?? undefined

  return {
    id: room.id,
    game: room.game,
    status: room.status,
    matchMode: room.mode,
    bettingStatus,
    marketVisibility: "watch-only",
    isFeaturedMarket: false,
    bestOf: 1,
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
    roundScore: { host: 0, challenger: 0 },
    spectatorPool: { host: 0, challenger: 0 },
    bettingWindowSeconds: 30,
    result: room.winnerIdentityId
      ? room.winnerIdentityId === room.hostIdentityId
        ? ("host" as const)
        : room.winnerIdentityId === room.challengerIdentityId
          ? ("challenger" as const)
          : null
      : null,
    moveHistory: [],
    boardState: room.boardState,
    timeoutStrikesHost: room.hostTimeoutStrikes,
    timeoutStrikesChallenger: room.challengerTimeoutStrikes,
  }
}
