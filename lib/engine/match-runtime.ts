/**
 * Canonical match runtime layer.
 * Builds a single normalized view from Room so UI and logic do not depend on raw DB fields or fragile combinations.
 * All supported games and lifecycle phases are represented through this contract.
 */

import type { Room } from "@/lib/engine/match/types"
import type { MatchSide } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"

/** Canonical match status (same as Room status; single source for comparisons). */
export type CanonicalStatus =
  | "Waiting for Opponent"
  | "Ready to Start"
  | "Live"
  | "Finished"

/** Canonical game key for driver lookup and UI branching. */
export type CanonicalGameKey = "Tic-Tac-Toe" | "Connect 4" | "Rock Paper Scissors"

export type CanonicalSeriesState = {
  bestOf: 1 | 3 | 5
  /** 1-based round number. */
  currentRound: number
  hostRoundWins: number
  challengerRoundWins: number
  /** Required wins to take series (1 for BO1, 2 for BO3, 3 for BO5). */
  requiredWins: number
  /** True when series is decided (not necessarily when match status is Finished). */
  seriesOver: boolean
}

export type CanonicalPauseState = {
  isPaused: boolean
  pausedBy: MatchSide | null
  /** Expiry time (ms); null if not paused. */
  pauseExpiresAt: number | null
  pauseCountHost: number
  pauseCountChallenger: number
}

export type CanonicalIntermissionState = {
  /** True when between rounds (BO3/BO5), waiting for next round to start. */
  inIntermission: boolean
  /** When intermission ends (ms); set only when inIntermission. */
  intermissionEndsAt: number | null
  /** Identity id of round winner for "X won Round N"; null for draw. */
  lastRoundWinnerIdentityId: string | null
}

export type CanonicalMovePermissions = {
  /** Current turn is assigned (for turn-based games). */
  hasTurn: boolean
  /** Identity id of current mover; null for RPS (both choose). */
  moveTurnIdentityId: string | null
  /** Turn deadline (ms); null for RPS or when no timer. */
  turnExpiresAt: number | null
  /** Host can submit a move in current phase. */
  hostCanMove: boolean
  /** Challenger can submit a move in current phase. */
  challengerCanMove: boolean
}

export type CanonicalWinnerResult = {
  /** Match has a final result (winner or draw). */
  isFinal: boolean
  /** "host" | "challenger" | null (null = draw or not finished). */
  winnerSide: "host" | "challenger" | null
  winnerIdentityId: string | null
  winReason: string | null
}

/** Flags for UI: what to show and what to disable. */
export type CanonicalViewFlags = {
  isWaitingForOpponent: boolean
  isCountdown: boolean
  isLiveRound: boolean
  isIntermission: boolean
  isFinished: boolean
  isPaused: boolean
  /** Show move/choice controls (not countdown overlay, not intermission message). */
  showPlayableArea: boolean
  /** Show countdown overlay (pre-game timer). */
  showCountdownOverlay: boolean
  /** Show intermission message and countdown to next round. */
  showIntermissionMessage: boolean
  /** Show pause overlay and countdown. */
  showPauseOverlay: boolean
  /** Spectator view (no move controls). */
  isSpectatorView: boolean
}

export type MatchRuntime = {
  /** Stable key for this match. */
  matchId: string
  /** Canonical status. */
  status: CanonicalStatus
  /** Game type; use for driver lookup and display. */
  game: GameType
  /** Stable game key (subset of game types that have drivers). */
  gameKey: CanonicalGameKey | null
  /** Series state (best_of, round, scores, required wins, series over). */
  series: CanonicalSeriesState
  /** Pause state. */
  pause: CanonicalPauseState
  /** Between-round intermission state. */
  intermission: CanonicalIntermissionState
  /** Who can move and turn deadline. */
  movePermissions: CanonicalMovePermissions
  /** Final winner/result. */
  winnerResult: CanonicalWinnerResult
  /** UI view flags. */
  view: CanonicalViewFlags
  /** Original room updatedAt (ms) for sync comparison. */
  updatedAt: number
  /** Room fields needed for display (ids, names, wager, timestamps). */
  room: Pick<
    Room,
    | "id"
    | "hostIdentityId"
    | "challengerIdentityId"
    | "hostDisplayName"
    | "challengerDisplayName"
    | "wager"
    | "countdownStartedAt"
    | "countdownSeconds"
    | "liveStartedAt"
    | "finishedAt"
    | "boardState"
    | "hostTimeoutStrikes"
    | "challengerTimeoutStrikes"
  >
}

const CANONICAL_GAME_KEYS: CanonicalGameKey[] = [
  "Tic-Tac-Toe",
  "Connect 4",
  "Rock Paper Scissors",
]

function toCanonicalStatus(s: string): CanonicalStatus {
  if (
    s === "Waiting for Opponent" ||
    s === "Ready to Start" ||
    s === "Live" ||
    s === "Finished"
  ) {
    return s
  }
  return "Waiting for Opponent"
}

function toCanonicalGameKey(game: GameType): CanonicalGameKey | null {
  if (CANONICAL_GAME_KEYS.includes(game as CanonicalGameKey)) {
    return game as CanonicalGameKey
  }
  return null
}

/**
 * Build canonical series state from room.
 * Uses only canonical DB semantics: best_of, round_number, host_score, challenger_score.
 */
function getSeriesState(room: Room): CanonicalSeriesState {
  const bestOf = room.bestOf === 3 || room.bestOf === 5 ? room.bestOf : 1
  const requiredWins = bestOf === 1 ? 1 : bestOf === 3 ? 2 : 3
  const hostRoundWins = Math.max(0, Number(room.hostRoundWins ?? 0))
  const challengerRoundWins = Math.max(0, Number(room.challengerRoundWins ?? 0))
  const currentRound = Math.max(1, Math.min(Number(room.currentRound ?? 1), 5))
  const seriesOver =
    hostRoundWins >= requiredWins || challengerRoundWins >= requiredWins
  return {
    bestOf,
    currentRound,
    hostRoundWins,
    challengerRoundWins,
    requiredWins,
    seriesOver,
  }
}

function getPauseState(room: Room): CanonicalPauseState {
  const isPaused = Boolean(room.isPaused ?? false)
  const pausedBy =
    room.pausedBy === "host" || room.pausedBy === "challenger"
      ? room.pausedBy
      : null
  const pauseExpiresAt =
    room.pauseExpiresAt != null && Number.isFinite(room.pauseExpiresAt)
      ? Number(room.pauseExpiresAt)
      : null
  return {
    isPaused,
    pausedBy,
    pauseExpiresAt,
    pauseCountHost: Math.max(0, Number(room.pauseCountHost ?? 0)),
    pauseCountChallenger: Math.max(0, Number(room.pauseCountChallenger ?? 0)),
  }
}

function getIntermissionState(room: Room): CanonicalIntermissionState {
  const until = room.roundIntermissionUntil ?? null
  const inIntermission =
    room.status === "Live" &&
    until != null &&
    typeof until === "number" &&
    Date.now() < until
  return {
    inIntermission: Boolean(inIntermission),
    intermissionEndsAt: until != null ? until : null,
    lastRoundWinnerIdentityId:
      room.lastRoundWinnerIdentityId != null
        ? String(room.lastRoundWinnerIdentityId)
        : null,
  }
}

function getMovePermissions(
  room: Room,
  series: CanonicalSeriesState,
  pause: CanonicalPauseState,
  intermission: CanonicalIntermissionState
): CanonicalMovePermissions {
  const status = toCanonicalStatus(room.status)
  const hasTurn = room.moveTurnIdentityId != null
  const moveTurnIdentityId = room.moveTurnIdentityId ?? null
  const turnExpiresAt = room.turnExpiresAt ?? null

  const isLive = status === "Live"
  const notPaused = !pause.isPaused
  const notIntermission = !intermission.inIntermission
  const canAct = isLive && notPaused && notIntermission

  const hostCanMove =
    canAct &&
    (room.game === "Rock Paper Scissors"
      ? true
      : moveTurnIdentityId === room.hostIdentityId)
  const challengerCanMove =
    canAct &&
    (room.game === "Rock Paper Scissors"
      ? true
      : moveTurnIdentityId === room.challengerIdentityId)

  return {
    hasTurn,
    moveTurnIdentityId,
    turnExpiresAt,
    hostCanMove,
    challengerCanMove,
  }
}

function getWinnerResult(room: Room): CanonicalWinnerResult {
  const status = toCanonicalStatus(room.status)
  const isFinal = status === "Finished"
  const winnerIdentityId = room.winnerIdentityId ?? null
  const winReason = room.winReason ?? null
  let winnerSide: "host" | "challenger" | null = null
  if (winnerIdentityId) {
    winnerSide =
      winnerIdentityId === room.hostIdentityId
        ? "host"
        : winnerIdentityId === room.challengerIdentityId
          ? "challenger"
          : null
  }
  return {
    isFinal,
    winnerSide,
    winnerIdentityId,
    winReason,
  }
}

function getViewFlags(
  room: Room,
  status: CanonicalStatus,
  pause: CanonicalPauseState,
  intermission: CanonicalIntermissionState
): CanonicalViewFlags {
  const isWaitingForOpponent = status === "Waiting for Opponent"
  const isCountdown = status === "Ready to Start"
  const isLiveRound = status === "Live"
  const isIntermission = intermission.inIntermission
  const isFinished = status === "Finished"
  const isPaused = pause.isPaused

  const showCountdownOverlay = isCountdown && room.challengerIdentityId != null
  const showPlayableArea =
    isLiveRound && !isIntermission && (isPaused ? false : true)
  const showIntermissionMessage = isLiveRound && isIntermission
  const showPauseOverlay = isLiveRound && isPaused

  return {
    isWaitingForOpponent,
    isCountdown,
    isLiveRound,
    isIntermission,
    isFinished,
    isPaused,
    showPlayableArea,
    showCountdownOverlay,
    showIntermissionMessage,
    showPauseOverlay,
    isSpectatorView: false,
  }
}

/**
 * Build the canonical match runtime view from a Room.
 * Single place for all derived state; UI and sync logic should use this instead of raw room fields.
 */
export function getMatchRuntime(room: Room): MatchRuntime {
  const status = toCanonicalStatus(room.status)
  const gameKey = toCanonicalGameKey(room.game)
  const series = getSeriesState(room)
  const pause = getPauseState(room)
  const intermission = getIntermissionState(room)
  const movePermissions = getMovePermissions(room, series, pause, intermission)
  const winnerResult = getWinnerResult(room)
  const view = getViewFlags(room, status, pause, intermission)

  return {
    matchId: room.id,
    status,
    game: room.game,
    gameKey,
    series,
    pause,
    intermission,
    movePermissions,
    winnerResult,
    view,
    updatedAt: Number(room.updatedAt ?? 0),
    room: {
      id: room.id,
      hostIdentityId: room.hostIdentityId,
      challengerIdentityId: room.challengerIdentityId,
      hostDisplayName: room.hostDisplayName,
      challengerDisplayName: room.challengerDisplayName,
      wager: room.wager,
      countdownStartedAt: room.countdownStartedAt,
      countdownSeconds: room.countdownSeconds,
      liveStartedAt: room.liveStartedAt,
      finishedAt: room.finishedAt,
      boardState: room.boardState,
      hostTimeoutStrikes: room.hostTimeoutStrikes,
      challengerTimeoutStrikes: room.challengerTimeoutStrikes,
    },
  }
}

/**
 * Set isSpectatorView on the runtime (caller knows if current user is spectator).
 * Does not mutate; returns new runtime with view.isSpectatorView set.
 */
export function withSpectatorView(
  runtime: MatchRuntime,
  isSpectator: boolean
): MatchRuntime {
  return {
    ...runtime,
    view: {
      ...runtime.view,
      isSpectatorView: isSpectator,
    },
  }
}
