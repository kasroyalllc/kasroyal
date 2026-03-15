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

/**
 * Convert a Room from Supabase to ArenaMatch for the arena UI (presentation only).
 * Status: passed through exactly (match.status = room.status). Live is never remapped to Ready to Start.
 * boardState: preserved; for Live we only add turnDeadlineTs; RPS board_state is not altered.
 */
export function roomToArenaMatch(room: Room): ArenaMatch {
  const host: PlayerProfile = defaultPlayer(room.hostDisplayName ?? "Host")
  const challenger: PlayerProfile | null = room.challengerDisplayName != null && String(room.challengerDisplayName).trim() !== ""
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
  const hostRoundWins = Math.max(0, Number(room.hostRoundWins ?? 0))
  const challengerRoundWins = Math.max(0, Number(room.challengerRoundWins ?? 0))
  const currentRound = Math.max(1, Number(room.currentRound ?? 1))
  const isPaused = Boolean(room.isPaused ?? false)
  const pausedBy =
    room.pausedBy === "host" || room.pausedBy === "challenger" ? room.pausedBy : null
  const pauseExpiresAt =
    room.pauseExpiresAt != null && Number.isFinite(room.pauseExpiresAt)
      ? Number(room.pauseExpiresAt)
      : null
  const pauseCountHost = Math.max(0, Number(room.pauseCountHost ?? 0))
  const pauseCountChallenger = Math.max(0, Number(room.pauseCountChallenger ?? 0))
  const pauseState = {
    isPaused,
    pausedBy,
    pauseExpiresAt,
    pauseCountHost,
    pauseCountChallenger,
  }
  return {
    id: room.id,
    game: room.game,
    status: room.status,
    matchMode: room.mode,
    bettingStatus,
    marketVisibility: "watch-only",
    isFeaturedMarket: false,
    bestOf,
    wager: Number(room.wager ?? 0),
    createdAt: Number(room.createdAt ?? 0),
    countdownStartedAt,
    countdownSeconds,
    bettingClosesAt,
    startedAt,
    finishedAt,
    spectators: 0,
    playerPot: Number(room.wager ?? 0) * (room.challengerIdentityId ? 2 : 1),
    host,
    challenger,
    hostIdentityId: room.hostIdentityId ?? "",
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
    roundScore: { host: hostRoundWins, challenger: challengerRoundWins },
    currentRound,
    spectatorPool: { host: 0, challenger: 0 },
    bettingWindowSeconds: countdownSeconds,
    result: room.winnerIdentityId != null && String(room.winnerIdentityId).trim() !== ""
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
    timeoutStrikesHost: Math.max(0, Number(room.hostTimeoutStrikes ?? 0)),
    timeoutStrikesChallenger: Math.max(0, Number(room.challengerTimeoutStrikes ?? 0)),
    pauseState,
    roundIntermissionUntil: room.roundIntermissionUntil ?? undefined,
    lastRoundWinnerIdentityId: room.lastRoundWinnerIdentityId ?? undefined,
    updatedAt: Number(room.updatedAt ?? 0) || undefined,
  }
}
