import {
  type ArenaMatch,
  type ArenaSide,
  type ArenaStatus,
  type GameType,
  type LeaderboardEntry,
  type MatchMode,
  type PauseState,
  type PlayerProfile,
  type RankTier,
  type SpectatorTicket,
} from "@/lib/engine/match-types"
import {
  DEFAULT_BET,
  HOUSE_RAKE,
  MAX_BET,
  MIN_BET,
  WHALE_BET_THRESHOLD,
  clampBetAmount,
  clampWager,
  getMultiplier,
  getNetPool,
  getProjectedState,
  getSideShare,
} from "@/lib/engine/odds"
import {
  formatAge,
  formatArenaPhase,
  formatTime,
  getArenaBettingSecondsLeft,
  getClosingTone,
  getGameBettingWindowLabel,
  getGameBettingWindowSeconds,
  normalizeArenaMatches,
  PRE_MATCH_COUNTDOWN_SECONDS,
} from "@/lib/engine/lifecycle"
import { gameDisplayOrder } from "@/lib/engine/featured-markets"
import {
  createMatch as createDbMatch,
  getMatchById as getDbMatchById,
  getMatches as getDbMatches,
  joinMatch as joinDbMatch,
  updateMatchStatus as updateDbMatchStatus,
} from "@/lib/db/matches"
import {
  getMatchBets as getDbMatchBets,
  placeBet as placeDbBet,
} from "@/lib/db/bets"
import {
  getCurrentIdentity,
  getStoredProfileRank,
  getStoredProfileRating,
} from "@/lib/identity"

export type {
  ArenaMatch,
  ArenaSide,
  ArenaStatus,
  GameType,
  LeaderboardEntry,
  MatchMode,
  PauseState,
  PlayerProfile,
  RankTier,
  SpectatorTicket,
}

export {
  DEFAULT_BET,
  HOUSE_RAKE,
  MAX_BET,
  MIN_BET,
  WHALE_BET_THRESHOLD,
  clampBetAmount,
  clampWager,
  formatAge,
  formatArenaPhase,
  formatTime,
  gameDisplayOrder,
  getArenaBettingSecondsLeft,
  getClosingTone,
  getGameBettingWindowLabel,
  getGameBettingWindowSeconds,
  getMultiplier,
  getNetPool,
  getProjectedState,
  getSideShare,
}

export type PersistedBetTicket = {
  id: string
  user: string
  matchId: string
  game: GameType
  side: ArenaSide
  amount: number
  createdAt: number
}

export type BetSettlementState = "pending" | "won" | "lost" | "refunded" | "archived"

export type RoomChatMessage = {
  id: string
  user: string
  text: string
  ts: number
}

/** Foundation for ranked progression: XP bar per rank, wins/losses/forfeits affect XP, season reset every 2 months. */
export type RankProgress = {
  tier: RankTier
  xpInTier: number
  xpRequiredForNext: number
  seasonEndsAt: number
}

export function getRankProgress(identityId?: string): RankProgress {
  const _id = identityId ?? getCurrentIdentity().id
  // Stub: full persistence and XP delta on win/loss/forfeit to be wired when match results are settled.
  const tier: RankTier = "Gold II"
  const xpRequiredForNext = 100
  const seasonEnd = new Date()
  seasonEnd.setMonth(seasonEnd.getMonth() + 2)
  seasonEnd.setDate(1)
  return { tier, xpInTier: 45, xpRequiredForNext, seasonEndsAt: seasonEnd.getTime() }
}

export type BetSettlement = {
  ticket: PersistedBetTicket
  match: ArenaMatch | null
  state: BetSettlementState
  payout: number
  profit: number
  multiplier: number
  result: ArenaMatch["result"] | null
  resultLabel: string
  backedPlayerName: string
}

export type UserSettledPayoutSummary = {
  settledCount: number
  wonCount: number
  lostCount: number
  refundedCount: number
  totalStaked: number
  totalPayout: number
  totalProfit: number
}

type FavoriteData = {
  favorite: ArenaSide | "even"
  leftLabel: string
  rightLabel: string
  edge: number
}

type RankColors = {
  text: string
  ring: string
  bg: string
  toString(): string
}

type GameMeta = {
  accent: string
  surface: string
  icon: string
  description: string
  subtitle: string
  glow: string
}

type Connect4BoardState = {
  mode: "connect4-live"
  board: (ArenaSide | null)[][]
  turn: ArenaSide
  turnDeadlineTs: number | null
}

type TttBoardState = {
  mode: "ttt-live"
  board: ("X" | "O" | null)[]
  turn: "X" | "O"
  turnDeadlineTs: number | null
}

type ChessPreviewBoardState = {
  mode: "chess-preview"
  fen: string
  turnDeadlineTs?: null
}

type RpsBoardState = {
  mode: "rps-live"
  hostChoice: "rock" | "paper" | "scissors" | null
  challengerChoice: "rock" | "paper" | "scissors" | null
  revealed: boolean
  winner: "host" | "challenger" | "draw" | null
}

type MatchBoardState = Connect4BoardState | TttBoardState | ChessPreviewBoardState | RpsBoardState

type ArenaStore = {
  revision: number
  updatedAt: number
  matches: ArenaMatch[]
  tickets: PersistedBetTicket[]
}

const ARENA_STORE_STORAGE_KEY = "kasroyal_arena_store_v3"
const ARENA_NAVBAR_STORAGE_KEY = "kasroyal_arena_matches"
const ARENA_MATCHES_EVENT = "kasroyal-arena-matches-updated"
const SPECTATOR_TICKETS_EVENT = "kasroyal-spectator-tickets-updated"
const ARENA_STORE_EVENT = "kasroyal-arena-store-updated"
const ARENA_STORE_CHANNEL = "kasroyal-arena-sync"
const ROOM_CHAT_STORAGE_KEY = "kasroyal_room_chat_v1"
const ROOM_CHAT_EVENT = "kasroyal-room-chat-updated"

export const MAX_PAUSES_PER_SIDE = 2
export const PAUSE_DURATION_SECONDS = 30

const CONNECT4_MOVE_SECONDS = 20
const TTT_MOVE_SECONDS = 10

const ENABLE_DEV_SEED = process.env.NEXT_PUBLIC_ENABLE_DEV_SEED === "true"
const ENABLE_DEV_BOTS = process.env.NEXT_PUBLIC_ENABLE_DEV_BOTS === "true"

const now = Date.now()

let arenaStoreCache: ArenaStore | null = null
let arenaBroadcastChannel: BroadcastChannel | null = null
let arenaLifecycleIntervalStarted = false
let lastRemoteHydrateAt = 0

const REMOTE_HYDRATE_INTERVAL_MS = 5000

/** @deprecated Use getCurrentUser() for identity-aware profile. */
export const currentUser: PlayerProfile & { walletBalance: number } = {
  name: "Guest",
  rank: "Bronze III",
  rating: 1000,
  winRate: 50,
  last10: "0-0",
  walletBalance: 0,
}

/** Resolved profile for the current session: wallet-based or guest. Use for display and fallback. */
export function getCurrentUser(): PlayerProfile & { walletBalance: number } {
  const identity = getCurrentIdentity()
  const profile = buildProfileFromWallet(identity.id, identity.displayName)
  return {
    ...profile,
    name: identity.displayName,
    walletBalance: identity.isGuest ? 0 : 275.4,
  }
}

export const mockOpponentPool: PlayerProfile[] = [
  {
    name: "StakeLord",
    rank: "Master",
    rating: 1910,
    winRate: 67,
    last10: "8-2",
  },
  {
    name: "FlashMove",
    rank: "Silver II",
    rating: 1318,
    winRate: 48,
    last10: "4-6",
  },
  {
    name: "TurboBetGuy",
    rank: "Gold III",
    rating: 1492,
    winRate: 57,
    last10: "6-4",
  },
  {
    name: "LuckyDog23",
    rank: "Platinum I",
    rating: 1608,
    winRate: 59,
    last10: "7-3",
  },
  {
    name: "CryptoCrush44",
    rank: "Gold I",
    rating: 1528,
    winRate: 53,
    last10: "5-5",
  },
  {
    name: "BrettBlitz",
    rank: "Gold I",
    rating: 1511,
    winRate: 55,
    last10: "6-4",
  },
]

export const arenaFeedSeed = [
  "A host opened with e4 and took center control.",
  "TurboBetGuy just set up a Connect 4 trap on the right side.",
  "3 new spectators joined the Chess Duel market.",
  "LuckyDog23’s side is gaining more bets after a strong defensive sequence.",
  "FlashMove is now the underdog in Tic-Tac-Toe.",
  "A 12 KAS spectator bet just came in on Black.",
]

export const gameMeta: Record<GameType, GameMeta> = {
  "Chess Duel": {
    accent: "text-amber-300",
    surface: "bg-gradient-to-br from-[#19140a] to-[#0b0b0b]",
    icon: "♞",
    description: "Deep strategy, prestige markets, elite rating swings.",
    subtitle: "High-skill tactical duels with premium featured markets.",
    glow: "border-amber-300/20 bg-amber-300/10 text-amber-300",
  },
  "Connect 4": {
    accent: "text-emerald-300",
    surface: "bg-gradient-to-br from-[#081712] to-[#0b0b0b]",
    icon: "◉",
    description: "Fast reads, trap setups, momentum-friendly pools.",
    subtitle: "Quick-turn pressure matches with crowd-friendly pacing.",
    glow: "border-emerald-300/20 bg-emerald-400/10 text-emerald-300",
  },
  "Rock Paper Scissors": {
    accent: "text-fuchsia-300",
    surface: "bg-gradient-to-br from-[#0f0814] to-[#0b0b0b]",
    icon: "✊",
    description: "Classic showdown. Lock in your pick, reveal together, winner takes all.",
    subtitle: "Simultaneous choice, instant reveal, no turn timer.",
    glow: "border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-300",
  },
  "Tic-Tac-Toe": {
    accent: "text-sky-300",
    surface: "bg-gradient-to-br from-[#08131a] to-[#0b0b0b]",
    icon: "✕",
    description: "Hyper-fast rounds with aggressive pre-lock betting windows.",
    subtitle: "Fastest arena format for instant room creation and action.",
    glow: "border-sky-300/20 bg-sky-300/10 text-sky-300",
  },
}

function createInitialPauseState(): PauseState {
  return {
    isPaused: false,
    pausedBy: null,
    pauseExpiresAt: null,
    pauseCountHost: 0,
    pauseCountChallenger: 0,
  }
}

function normalizePauseState(value?: Partial<PauseState> | null): PauseState {
  return {
    isPaused: value?.isPaused === true,
    pausedBy:
      value?.pausedBy === "host" || value?.pausedBy === "challenger"
        ? value.pausedBy
        : null,
    pauseExpiresAt:
      typeof value?.pauseExpiresAt === "number" && Number.isFinite(value.pauseExpiresAt)
        ? Number(value.pauseExpiresAt)
        : null,
    pauseCountHost:
      typeof value?.pauseCountHost === "number" && Number.isFinite(value.pauseCountHost)
        ? Math.max(0, Math.floor(value.pauseCountHost))
        : 0,
    pauseCountChallenger:
      typeof value?.pauseCountChallenger === "number" &&
      Number.isFinite(value.pauseCountChallenger)
        ? Math.max(0, Math.floor(value.pauseCountChallenger))
        : 0,
  }
}

function isBrowser() {
  return typeof window !== "undefined"
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function emitStorageEvent(name: string) {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent(name))
}

function getBroadcastChannel() {
  if (!isBrowser() || typeof BroadcastChannel === "undefined") return null
  if (!arenaBroadcastChannel) {
    arenaBroadcastChannel = new BroadcastChannel(ARENA_STORE_CHANNEL)
  }
  return arenaBroadcastChannel
}

function isConnect4BoardState(value: unknown): value is Connect4BoardState {
  if (!value || typeof value !== "object") return false
  const state = value as Connect4BoardState
  return (
    state.mode === "connect4-live" &&
    Array.isArray(state.board) &&
    state.board.length === 6 &&
    state.board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 7 &&
        row.every((cell) => cell === "host" || cell === "challenger" || cell === null)
    ) &&
    (state.turn === "host" || state.turn === "challenger") &&
    (state.turnDeadlineTs === null ||
      (typeof state.turnDeadlineTs === "number" && Number.isFinite(state.turnDeadlineTs)))
  )
}

function isTttBoardState(value: unknown): value is TttBoardState {
  if (!value || typeof value !== "object") return false
  const state = value as TttBoardState
  return (
    state.mode === "ttt-live" &&
    Array.isArray(state.board) &&
    state.board.length === 9 &&
    state.board.every((cell) => cell === "X" || cell === "O" || cell === null) &&
    (state.turn === "X" || state.turn === "O") &&
    (state.turnDeadlineTs === null ||
      (typeof state.turnDeadlineTs === "number" && Number.isFinite(state.turnDeadlineTs)))
  )
}

function isRpsBoardState(value: unknown): value is RpsBoardState {
  if (!value || typeof value !== "object") return false
  const state = value as RpsBoardState
  const choiceOk = (c: unknown) => c === null || c === "rock" || c === "paper" || c === "scissors"
  const winnerOk =
    state.winner === null ||
    state.winner === "host" ||
    state.winner === "challenger" ||
    state.winner === "draw"
  return (
    state.mode === "rps-live" &&
    choiceOk(state.hostChoice) &&
    choiceOk(state.challengerChoice) &&
    typeof state.revealed === "boolean" &&
    winnerOk
  )
}

function createWaitingBoardState(game: GameType): MatchBoardState {
  if (game === "Connect 4") {
    return {
      mode: "connect4-live",
      board: Array.from({ length: 6 }, () =>
        Array.from({ length: 7 }, () => null as ArenaSide | null)
      ),
      turn: "host",
      turnDeadlineTs: null,
    }
  }

  if (game === "Tic-Tac-Toe") {
    return {
      mode: "ttt-live",
      board: Array.from({ length: 9 }, () => null as "X" | "O" | null),
      turn: "X",
      turnDeadlineTs: null,
    }
  }

  if (game === "Rock Paper Scissors") {
    return {
      mode: "rps-live",
      hostChoice: null,
      challengerChoice: null,
      revealed: false,
      winner: null,
    }
  }

  return {
    mode: "chess-preview",
    fen: "start",
    turnDeadlineTs: null,
  }
}

function createLiveBoardState(game: GameType, startedAt = Date.now()): MatchBoardState {
  if (game === "Connect 4") {
    return {
      mode: "connect4-live",
      board: Array.from({ length: 6 }, () =>
        Array.from({ length: 7 }, () => null as ArenaSide | null)
      ),
      turn: "host",
      turnDeadlineTs: startedAt + CONNECT4_MOVE_SECONDS * 1000,
    }
  }

  if (game === "Tic-Tac-Toe") {
    return {
      mode: "ttt-live",
      board: Array.from({ length: 9 }, () => null as "X" | "O" | null),
      turn: "X",
      turnDeadlineTs: startedAt + TTT_MOVE_SECONDS * 1000,
    }
  }

  if (game === "Rock Paper Scissors") {
    return {
      mode: "rps-live",
      hostChoice: null,
      challengerChoice: null,
      revealed: false,
      winner: null,
    }
  }

  return {
    mode: "chess-preview",
    fen: "start",
    turnDeadlineTs: null,
  }
}

function getLiveMoveText(game: GameType) {
  if (game === "Chess Duel") return "1. e4"
  if (game === "Connect 4") return "Opening disc dropped"
  if (game === "Rock Paper Scissors") return "Choose rock, paper, or scissors"
  return "Opening move"
}

function getCurrentTurnSide(match: ArenaMatch): ArenaSide | null {
  if (match.game === "Connect 4" && isConnect4BoardState(match.boardState)) {
    return match.boardState.turn
  }

  if (match.game === "Tic-Tac-Toe" && isTttBoardState(match.boardState)) {
    return match.boardState.turn === "X" ? "host" : "challenger"
  }

  return null
}

function getCurrentTurnName(match: ArenaMatch) {
  const turnSide = getCurrentTurnSide(match)

  if (turnSide === "host") return match.host.name
  if (turnSide === "challenger") return match.challenger?.name ?? "Challenger"

  if (match.game === "Connect 4" || match.game === "Tic-Tac-Toe") {
    return match.host.name
  }

  return match.challenger ? `${match.host.name} vs ${match.challenger.name}` : match.host.name
}

function getLiveStatusText(
  game: GameType,
  hostName: string,
  challengerName?: string | null,
  currentTurnName?: string | null
) {
  if (game === "Connect 4" || game === "Tic-Tac-Toe") {
    return `${currentTurnName ?? hostName} to move`
  }
  if (game === "Rock Paper Scissors") {
    return "Choose your move"
  }

  return challengerName ? `${hostName} vs ${challengerName} live` : "Match is live"
}

function resetBoardTimer(game: GameType, boardState: unknown, nowTs: number) {
  if (game === "Connect 4" && isConnect4BoardState(boardState)) {
    return {
      ...boardState,
      turnDeadlineTs: nowTs + CONNECT4_MOVE_SECONDS * 1000,
    }
  }

  if (game === "Tic-Tac-Toe" && isTttBoardState(boardState)) {
    return {
      ...boardState,
      turnDeadlineTs: nowTs + TTT_MOVE_SECONDS * 1000,
    }
  }

  return boardState
}

function withNormalizedPauseState(match: ArenaMatch): ArenaMatch {
  return {
    ...match,
    pauseState: normalizePauseState(match.pauseState),
  }
}

function normalizePlayerIdentity(value?: string) {
  const raw = (value ?? getCurrentIdentity().id).trim()
  if (!raw) return getCurrentIdentity().id
  if (raw === `${getCurrentIdentity().id}-wallet`) return getCurrentIdentity().id
  return raw
}

function isActiveMatchStatus(status: ArenaStatus) {
  return (
    status === "Waiting for Opponent" ||
    status === "Ready to Start" ||
    status === "Live"
  )
}

/** Only treat as active if state is consistent: Waiting => no challenger; Ready/Live => has challenger. Never treat Finished/forfeited/canceled as active. */
export function isValidActiveMatch(match: ArenaMatch): boolean {
  if (!match.id || typeof match.id !== "string") return false
  if (match.status === "Finished") return false
  if (match.finishedAt != null && Number.isFinite(match.finishedAt)) return false
  if (match.status === "Waiting for Opponent") {
    return !match.challenger
  }
  if (match.status === "Ready to Start" || match.status === "Live") {
    return !!match.challenger
  }
  return false
}

/** Match participant check: use hostIdentityId/challengerIdentityId when set, else fall back to name. */
function matchHasIdentity(match: ArenaMatch, identityId: string) {
  const normalized = identityId.trim().toLowerCase()
  if (!normalized) return false
  if (match.hostIdentityId && match.hostIdentityId.toLowerCase() === normalized) return true
  if (match.challengerIdentityId && match.challengerIdentityId.toLowerCase() === normalized) return true
  const hostName = normalizePlayerIdentity(match.host.name).toLowerCase()
  const challengerName = normalizePlayerIdentity(match.challenger?.name).toLowerCase()
  return hostName === normalized || challengerName === normalized
}

function getStoreRevision() {
  return readArenaStore().revision
}

function getActiveMatchForIdentity(identity?: string, excludeMatchId?: string) {
  const id = identity !== undefined && identity !== null ? identity.trim() : getCurrentIdentity().id
  const normalized = id ? id.toLowerCase() : ""

  return (
    readArenaMatches().find((match) => {
      if (excludeMatchId && match.id === excludeMatchId) return false
      if (match.status === "Finished") return false
      if (match.finishedAt != null && Number.isFinite(match.finishedAt)) return false
      if (!isActiveMatchStatus(match.status)) return false
      if (!isValidActiveMatch(match)) return false
      return matchHasIdentity(match, normalized)
    }) ?? null
  )
}

/** @deprecated Use listActiveRooms + find room for current identity. */
export function getWalletActiveMatch(_identity?: string): ArenaMatch | null {
  return null
}

/** @deprecated Use listActiveRooms for backend-first active-match check. */
export function hasWalletActiveMatch(_identity?: string, _excludeMatchId?: string): boolean {
  return false
}

function assertNoOtherActiveMatch(identity?: string, excludeMatchId?: string) {
  const activeMatch = getActiveMatchForIdentity(identity, excludeMatchId)

  if (!activeMatch) {
    return
  }

  throw new Error(
    `Only one active game per wallet is allowed. Finish or leave your current ${activeMatch.game} match first.`
  )
}

function resumePausedMatchInternal(
  match: ArenaMatch,
  nowTs: number,
  reason: "manual" | "expired"
): ArenaMatch {
  const normalized = withNormalizedPauseState(match)
  const activeTurnName = getCurrentTurnName(normalized)

  return {
    ...normalized,
    boardState: resetBoardTimer(normalized.game, normalized.boardState, nowTs),
    pauseState: {
      ...normalizePauseState(normalized.pauseState),
      isPaused: false,
      pausedBy: null,
      pauseExpiresAt: null,
    },
    statusText: getLiveStatusText(
      normalized.game,
      normalized.host.name,
      normalized.challenger?.name ?? null,
      activeTurnName
    ),
    moveText: reason === "expired" ? "Pause expired • timer reset" : "Pause ended • timer reset",
  }
}

function resolvePausedMatch(match: ArenaMatch, nowTs: number): ArenaMatch {
  if (match.status !== "Live") {
    return withNormalizedPauseState(match)
  }

  const normalized = withNormalizedPauseState(match)
  const pauseState = normalizePauseState(normalized.pauseState)

  if (!pauseState.isPaused || !pauseState.pauseExpiresAt) {
    return normalized
  }

  if (pauseState.pauseExpiresAt > nowTs) {
    return normalized
  }

  return resumePausedMatchInternal(normalized, nowTs, "expired")
}

export const TIMEOUT_STRIKES_TO_LOSE = 3

function resolveTimedOutLiveMatch(match: ArenaMatch, nowTs: number): ArenaMatch {
  if (match.status !== "Live" || !match.challenger) {
    return withNormalizedPauseState(match)
  }

  const normalized = withNormalizedPauseState(match)
  const pauseState = normalizePauseState(normalized.pauseState)

  if (pauseState.isPaused) {
    return normalized
  }

  if (normalized.game === "Connect 4" && isConnect4BoardState(normalized.boardState)) {
    if (!normalized.boardState.turnDeadlineTs || normalized.boardState.turnDeadlineTs > nowTs) {
      return normalized
    }

    const timedOutSide = normalized.boardState.turn
    const strikesHost = (normalized.timeoutStrikesHost ?? 0) + (timedOutSide === "host" ? 1 : 0)
    const strikesChallenger =
      (normalized.timeoutStrikesChallenger ?? 0) + (timedOutSide === "challenger" ? 1 : 0)

    if (strikesHost >= TIMEOUT_STRIKES_TO_LOSE || strikesChallenger >= TIMEOUT_STRIKES_TO_LOSE) {
      const loser = strikesHost >= TIMEOUT_STRIKES_TO_LOSE ? "host" : "challenger"
      const winner: ArenaSide = loser === "host" ? "challenger" : "host"
      const winnerName =
        winner === "host"
          ? normalized.host.name
          : normalized.challenger?.name ?? "Challenger"
      const loserName =
        loser === "host"
          ? normalized.host.name
          : normalized.challenger?.name ?? "Challenger"
      return {
        ...normalized,
        status: "Finished",
        bettingStatus: "locked",
        finishedAt: nowTs,
        result: winner,
        timeoutStrikesHost: strikesHost,
        timeoutStrikesChallenger: strikesChallenger,
        statusText: `${loserName} timed out 3 times`,
        moveText: `${winnerName} wins by repeated timeout`,
        pauseState: {
          ...pauseState,
          isPaused: false,
          pausedBy: null,
          pauseExpiresAt: null,
        },
      }
    }

    const nextTurn: ArenaSide = timedOutSide === "host" ? "challenger" : "host"
    const nextDeadline = nowTs + CONNECT4_MOVE_SECONDS * 1000
    const strikeCount = timedOutSide === "host" ? strikesHost : strikesChallenger
    const loserName =
      timedOutSide === "host"
        ? normalized.host.name
        : normalized.challenger?.name ?? "Challenger"
    return {
      ...normalized,
      timeoutStrikesHost: strikesHost,
      timeoutStrikesChallenger: strikesChallenger,
      boardState: {
        ...normalized.boardState,
        turn: nextTurn,
        turnDeadlineTs: nextDeadline,
      },
      statusText: `Warning: ${strikeCount}/${TIMEOUT_STRIKES_TO_LOSE} timeouts`,
      moveText: `${loserName} timed out — ${strikeCount}/${TIMEOUT_STRIKES_TO_LOSE}. ${nextTurn === "host" ? normalized.host.name : normalized.challenger?.name ?? "Challenger"} to move`,
      pauseState: {
        ...pauseState,
        isPaused: false,
        pausedBy: null,
        pauseExpiresAt: null,
      },
    }
  }

  if (normalized.game === "Tic-Tac-Toe" && isTttBoardState(normalized.boardState)) {
    if (!normalized.boardState.turnDeadlineTs || normalized.boardState.turnDeadlineTs > nowTs) {
      return normalized
    }

    const timedOutSide = normalized.boardState.turn === "X" ? "host" : "challenger"
    const strikesHost = (normalized.timeoutStrikesHost ?? 0) + (timedOutSide === "host" ? 1 : 0)
    const strikesChallenger =
      (normalized.timeoutStrikesChallenger ?? 0) + (timedOutSide === "challenger" ? 1 : 0)

    if (strikesHost >= TIMEOUT_STRIKES_TO_LOSE || strikesChallenger >= TIMEOUT_STRIKES_TO_LOSE) {
      const loser = strikesHost >= TIMEOUT_STRIKES_TO_LOSE ? "host" : "challenger"
      const winner: ArenaSide = loser === "host" ? "challenger" : "host"
      const winnerName =
        winner === "host"
          ? normalized.host.name
          : normalized.challenger?.name ?? "Challenger"
      const loserName =
        loser === "host"
          ? normalized.host.name
          : normalized.challenger?.name ?? "Challenger"
      return {
        ...normalized,
        status: "Finished",
        bettingStatus: "locked",
        finishedAt: nowTs,
        result: winner,
        timeoutStrikesHost: strikesHost,
        timeoutStrikesChallenger: strikesChallenger,
        statusText: `${loserName} timed out 3 times`,
        moveText: `${winnerName} wins by repeated timeout`,
        pauseState: {
          ...pauseState,
          isPaused: false,
          pausedBy: null,
          pauseExpiresAt: null,
        },
      }
    }

    const nextTurn: "X" | "O" = normalized.boardState.turn === "X" ? "O" : "X"
    const nextDeadline = nowTs + TTT_MOVE_SECONDS * 1000
    const strikeCount = timedOutSide === "host" ? strikesHost : strikesChallenger
    const loserName =
      timedOutSide === "host"
        ? normalized.host.name
        : normalized.challenger?.name ?? "Challenger"
    return {
      ...normalized,
      timeoutStrikesHost: strikesHost,
      timeoutStrikesChallenger: strikesChallenger,
      boardState: {
        ...normalized.boardState,
        turn: nextTurn,
        turnDeadlineTs: nextDeadline,
      },
      statusText: `Warning: ${strikeCount}/${TIMEOUT_STRIKES_TO_LOSE} timeouts`,
      moveText: `${loserName} timed out — ${strikeCount}/${TIMEOUT_STRIKES_TO_LOSE}. ${nextTurn === "X" ? normalized.host.name : normalized.challenger?.name ?? "Challenger"} to move`,
      pauseState: {
        ...pauseState,
        isPaused: false,
        pausedBy: null,
        pauseExpiresAt: null,
      },
    }
  }

  return normalized
}

/** Universal pre-match countdown: 30s for all games. Countdown and move timer never overlap. */
const ARENA_COUNTDOWN_SECONDS = PRE_MATCH_COUNTDOWN_SECONDS

function applyArenaLifecycle(matches: ArenaMatch[], nowTs = Date.now()): ArenaMatch[] {
  return normalizeArenaMatches(
    matches.map((originalMatch) => {
      let match = withNormalizedPauseState(originalMatch)

      if (match.challenger) {
        if (match.status === "Waiting for Opponent") {
          match = {
            ...match,
            status: "Ready to Start",
          }
        }

        if (match.status === "Ready to Start") {
          const countdownStartedAt = match.countdownStartedAt ?? match.seatedAt ?? nowTs
          const bettingWindowSeconds =
            typeof match.bettingWindowSeconds === "number" && Number.isFinite(match.bettingWindowSeconds)
              ? match.bettingWindowSeconds
              : ARENA_COUNTDOWN_SECONDS
          const bettingClosesAt = match.bettingClosesAt ?? countdownStartedAt + bettingWindowSeconds * 1000
          const countdownSecondsLeft = Math.max(0, Math.ceil((bettingClosesAt - nowTs) / 1000))
          const isQuick = match.matchMode === "quick"

          match = {
            ...match,
            marketVisibility: isQuick ? "watch-only" : "featured",
            isFeaturedMarket: !isQuick,
            bettingWindowSeconds: ARENA_COUNTDOWN_SECONDS,
            bettingStatus: isQuick ? "disabled" : countdownSecondsLeft > 0 ? "open" : "locked",
            seatedAt: match.seatedAt ?? countdownStartedAt,
            countdownStartedAt,
            bettingClosesAt,
            startedAt: match.startedAt,
            boardState:
              match.boardState && typeof match.boardState === "object" && !("turnDeadlineTs" in match.boardState)
                ? createWaitingBoardState(match.game)
                : match.boardState && typeof match.boardState === "object" && "turnDeadlineTs" in match.boardState
                  ? match.boardState
                  : createWaitingBoardState(match.game),
            statusText: countdownSecondsLeft > 0 ? "Countdown active" : "Starting match",
            moveText:
              countdownSecondsLeft > 0
                ? `Starts in ${formatTime(countdownSecondsLeft)}`
                : "Launching live room",
          }

          if (bettingClosesAt <= nowTs) {
            const quickLive = match.matchMode === "quick"
            const startedAt = match.startedAt ?? nowTs
            const existingLiveBoard =
              match.status === "Live" &&
              match.boardState &&
              typeof match.boardState === "object" &&
              "turnDeadlineTs" in match.boardState &&
              typeof (match.boardState as { turnDeadlineTs: number }).turnDeadlineTs === "number" &&
              (match.boardState as { turnDeadlineTs: number }).turnDeadlineTs > nowTs
            const boardState = existingLiveBoard
              ? match.boardState
              : createLiveBoardState(match.game, nowTs)

            match = {
              ...match,
              status: "Live",
              bettingStatus: "locked",
              marketVisibility: quickLive ? "watch-only" : "featured",
              isFeaturedMarket: !quickLive,
              startedAt,
              finishedAt: undefined,
              timeoutStrikesHost: match.timeoutStrikesHost ?? 0,
              timeoutStrikesChallenger: match.timeoutStrikesChallenger ?? 0,
              statusText: getLiveStatusText(
                match.game,
                match.host.name,
                match.challenger?.name ?? null,
                match.host.name
              ),
              moveText: getLiveMoveText(match.game),
              boardState,
              pauseState: normalizePauseState(match.pauseState),
            }
          }
        }

        if (match.status === "Live") {
          const quickLive = match.matchMode === "quick"
          const hasValidBoard =
            match.boardState &&
            typeof match.boardState === "object" &&
            "turnDeadlineTs" in match.boardState &&
            typeof (match.boardState as { turnDeadlineTs: number | null }).turnDeadlineTs === "number"
          const fallbackStarted = match.startedAt ?? nowTs
          match = {
            ...match,
            bettingStatus: "locked",
            marketVisibility: quickLive ? "watch-only" : "featured",
            isFeaturedMarket: !quickLive,
            timeoutStrikesHost: match.timeoutStrikesHost ?? 0,
            timeoutStrikesChallenger: match.timeoutStrikesChallenger ?? 0,
            boardState:
              hasValidBoard
                ? match.boardState
                : createLiveBoardState(match.game, fallbackStarted),
          }

          match = resolvePausedMatch(match, nowTs)
          match = resolveTimedOutLiveMatch(match, nowTs)
        }

        if (match.status === "Finished") {
          const quickFinished = match.matchMode === "quick"
          match = {
            ...match,
            bettingStatus: "locked",
            marketVisibility: quickFinished ? "watch-only" : "featured",
            isFeaturedMarket: !quickFinished,
          }
        }
      } else {
        match = {
          ...match,
          status: "Waiting for Opponent",
          bettingStatus: "disabled",
          marketVisibility: "watch-only",
          isFeaturedMarket: false,
          startedAt: undefined,
          finishedAt: undefined,
          countdownStartedAt: undefined,
          bettingClosesAt: undefined,
          statusText: "Open seat available",
          moveText: "Waiting for join",
          boardState: createWaitingBoardState(match.game),
          pauseState: createInitialPauseState(),
        }
      }

      return {
        ...match,
        pauseState: normalizePauseState(match.pauseState),
      }
    }),
    nowTs
  ).map((match) => ({
    ...match,
    pauseState: normalizePauseState(match.pauseState),
  }))
}

function rankFromRating(rating: number): RankTier {
  if (rating >= 2100) return "Grandmaster"
  if (rating >= 1950) return "Master"
  if (rating >= 1850) return "Diamond I"
  if (rating >= 1750) return "Diamond II"
  if (rating >= 1650) return "Diamond III"
  if (rating >= 1550) return "Platinum I"
  if (rating >= 1480) return "Platinum II"
  if (rating >= 1410) return "Platinum III"
  if (rating >= 1350) return "Gold I"
  if (rating >= 1290) return "Gold II"
  if (rating >= 1230) return "Gold III"
  if (rating >= 1180) return "Silver I"
  if (rating >= 1130) return "Silver II"
  if (rating >= 1080) return "Silver III"
  if (rating >= 1030) return "Bronze I"
  if (rating >= 980) return "Bronze II"
  return "Bronze III"
}

/** Default starting rank/rating for new ranked (wallet) players. Guest keeps seed-based display. */
const DEFAULT_STARTING_RANK: RankTier = "Bronze III"
const DEFAULT_STARTING_RATING = 1000

function buildProfileFromWallet(wallet: string, fallbackName?: string): PlayerProfile {
  const short =
    wallet.length > 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet

  const isGuest = wallet.toLowerCase().startsWith("guest-")
  if (isGuest) {
    const seed = [...wallet].reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const rating = 1200 + (seed % 700)
    const winRate = 44 + (seed % 24)
    const wins = 4 + (seed % 6)
    const losses = 10 - wins
    return {
      name: fallbackName ?? short,
      rank: rankFromRating(rating),
      rating,
      winRate,
      last10: `${wins}-${losses}`,
    }
  }

  const storedRank = getStoredProfileRank(wallet)
  const storedRating = getStoredProfileRating(wallet)
  const rank = (storedRank as RankTier) ?? DEFAULT_STARTING_RANK
  const rating = storedRating ?? DEFAULT_STARTING_RATING
  const winRate = 50
  const last10 = "0-0"

  return {
    name: fallbackName ?? short,
    rank,
    rating,
    winRate,
    last10,
  }
}

function sideLabelsForGame(game: GameType) {
  if (game === "Chess Duel") {
    return { host: "White", challenger: "Black" }
  }
  if (game === "Connect 4") {
    return { host: "Red", challenger: "Yellow" }
  }
  if (game === "Rock Paper Scissors") {
    return { host: "Host", challenger: "Challenger" }
  }
  return { host: "X", challenger: "O" }
}

function bestOfForGame(game: GameType, explicit?: 1 | 3 | 5): 1 | 3 | 5 {
  if (explicit === 1 || explicit === 3 || explicit === 5) return explicit
  if (game === "Chess Duel") return 3
  if (game === "Connect 4") return 3
  if (game === "Rock Paper Scissors") return 1
  return 1
}

function createDefaultBoardState(game: GameType) {
  return createWaitingBoardState(game)
}

function dbGameTypeToGameType(game: string): GameType {
  if (game === "Connect 4") return "Connect 4"
  if (game === "Tic-Tac-Toe") return "Tic-Tac-Toe"
  if (game === "Rock Paper Scissors") return "Rock Paper Scissors"
  return "Chess Duel"
}

function dbStatusToArenaStatus(status: string): ArenaStatus {
  if (status === "Ready to Start") return "Ready to Start"
  if (status === "Live") return "Live"
  if (status === "Finished") return "Finished"
  return "Waiting for Opponent"
}

function applyBetsToMatches(matches: ArenaMatch[], tickets: PersistedBetTicket[]): ArenaMatch[] {
  return applyArenaLifecycle(
    matches.map((match) => {
      const related = tickets.filter((ticket) => ticket.matchId === match.id)
      const hostPool = related
        .filter((ticket) => ticket.side === "host")
        .reduce((sum, ticket) => sum + ticket.amount, 0)
      const challengerPool = related
        .filter((ticket) => ticket.side === "challenger")
        .reduce((sum, ticket) => sum + ticket.amount, 0)

      const pauseState = normalizePauseState(match.pauseState)
      const countdownStillOpen =
        match.status === "Ready to Start" &&
        !!match.bettingClosesAt &&
        match.bettingClosesAt > Date.now()

      return {
        ...match,
        pauseState,
        bettingStatus: countdownStillOpen
          ? "open"
          : match.status === "Live" || match.status === "Finished"
            ? "locked"
            : "disabled",
        marketVisibility: match.challenger ? "featured" : "watch-only",
        isFeaturedMarket: !!match.challenger,
        spectatorPool: {
          host: hostPool,
          challenger: challengerPool,
        },
        spectators: Math.max(match.spectators, related.length + 6),
        statusText:
          match.status === "Ready to Start"
            ? "Countdown active"
            : match.status === "Live"
              ? pauseState.isPaused
                ? "Pause active"
                : getLiveStatusText(
                    match.game,
                    match.host.name,
                    match.challenger?.name ?? null,
                    getCurrentTurnName(match)
                  )
              : match.status === "Finished"
                ? "Match finished"
                : "Open seat available",
        moveText:
          match.status === "Ready to Start"
            ? `Starts in ${formatTime(getArenaBettingSecondsLeft(match))}`
            : match.moveText,
        result: match.result ?? null,
        playerPot: match.wager * (match.challenger ? 2 : 1),
      }
    }),
    Date.now()
  )
}

function makeSeededArenaMatches(baseNow: number): ArenaMatch[] {
  return applyArenaLifecycle(
    normalizeArenaMatches(
      [
        {
          id: "arena-1",
          game: "Chess Duel",
          matchMode: "ranked",
          status: "Live",
          bettingStatus: "locked",
          marketVisibility: "featured",
          isFeaturedMarket: true,
          bestOf: 3,
          wager: 10,
          createdAt: baseNow - 1000 * 60 * 18,
          seatedAt: baseNow - 1000 * 60 * 17,
          countdownStartedAt: baseNow - 1000 * 60 * 16,
          bettingClosesAt: baseNow - 1000 * 60 * 15,
          startedAt: baseNow - 1000 * 60 * 15,
          spectators: 38,
          playerPot: 20,
          host: {
            name: "CryptoCrush44",
            rank: "Gold I",
            rating: 1528,
            winRate: 53,
            last10: "5-5",
          },
          challenger: {
            name: "DiamondPlayer",
            rank: "Diamond II",
            rating: 1842,
            winRate: 61,
            last10: "7-3",
          },
          hostSideLabel: "White",
          challengerSideLabel: "Black",
          statusText: "Match is live",
          moveText: "17... Qe7",
          roundScore: { host: 0, challenger: 1 },
          spectatorPool: { host: 31, challenger: 42 },
          bettingWindowSeconds: PRE_MATCH_COUNTDOWN_SECONDS,
          result: null,
          moveHistory: ["1. e4", "1... c5", "2. Nf3", "2... d6", "17... Qe7"],
          boardState: {
            mode: "chess-preview",
            fen: "rnbq1rk1/pp3ppp/3bpn2/2pp4/2P5/2N1PN2/PP1PBPPP/R1BQ1RK1 w - - 0 8",
            turnDeadlineTs: null,
          },
          pauseState: createInitialPauseState(),
        },
        {
          id: "arena-2",
          game: "Connect 4",
          matchMode: "ranked",
          status: "Ready to Start",
          bettingStatus: "open",
          marketVisibility: "featured",
          isFeaturedMarket: true,
          bestOf: 3,
          wager: 5,
          createdAt: baseNow - 1000 * 60 * 4,
          seatedAt: baseNow - 1000 * 20,
          countdownStartedAt: baseNow - 1000 * 20,
          bettingClosesAt: baseNow + 1000 * 9,
          spectators: 24,
          playerPot: 10,
          host: {
            name: "TurboBetGuy",
            rank: "Gold III",
            rating: 1492,
            winRate: 57,
            last10: "6-4",
          },
          challenger: {
            name: "LuckyDog23",
            rank: "Platinum I",
            rating: 1608,
            winRate: 59,
            last10: "7-3",
          },
          hostSideLabel: "Red",
          challengerSideLabel: "Yellow",
          statusText: "Featured market open",
          moveText: "Starts in 0:09",
          roundScore: { host: 0, challenger: 0 },
          spectatorPool: { host: 14, challenger: 27 },
          bettingWindowSeconds: PRE_MATCH_COUNTDOWN_SECONDS,
          result: null,
          moveHistory: [],
          boardState: createWaitingBoardState("Connect 4"),
          pauseState: createInitialPauseState(),
        },
        {
          id: "arena-3",
          game: "Tic-Tac-Toe",
          matchMode: "ranked",
          status: "Waiting for Opponent",
          bettingStatus: "disabled",
          marketVisibility: "watch-only",
          isFeaturedMarket: false,
          bestOf: 1,
          wager: 3,
          createdAt: baseNow - 1000 * 60 * 2,
          spectators: 7,
          playerPot: 3,
          host: {
            name: "FlashMove",
            rank: "Silver II",
            rating: 1318,
            winRate: 48,
            last10: "4-6",
          },
          challenger: null,
          hostSideLabel: "X",
          challengerSideLabel: "O",
          statusText: "Open seat available",
          moveText: "Waiting for join",
          roundScore: { host: 0, challenger: 0 },
          spectatorPool: { host: 0, challenger: 0 },
          bettingWindowSeconds: PRE_MATCH_COUNTDOWN_SECONDS,
          result: null,
          moveHistory: [],
          boardState: createWaitingBoardState("Tic-Tac-Toe"),
          pauseState: createInitialPauseState(),
        },
      ],
      baseNow
    ),
    baseNow
  )
}

const seededArenaMatches: ArenaMatch[] = ENABLE_DEV_SEED ? makeSeededArenaMatches(now) : []

export const initialArenaMatches: ArenaMatch[] = seededArenaMatches

const leaderboardSeed: LeaderboardEntry[] = [
  {
    id: "lb-1",
    name: "DiamondPlayer",
    rank: "Diamond II",
    rating: 1842,
    winRate: 61,
    wins: 148,
    losses: 94,
    streak: "W4",
    favoriteGame: "Chess Duel",
    earnings: 412.8,
    avatarGlow: "emerald",
  },
  {
    id: "lb-2",
    name: "StakeLord",
    rank: "Master",
    rating: 1910,
    winRate: 67,
    wins: 203,
    losses: 101,
    streak: "W7",
    favoriteGame: "Connect 4",
    earnings: 621.2,
    avatarGlow: "amber",
  },
  {
    id: "lb-3",
    name: "LuckyDog23",
    rank: "Platinum I",
    rating: 1608,
    winRate: 59,
    wins: 131,
    losses: 91,
    streak: "W2",
    favoriteGame: "Tic-Tac-Toe",
    earnings: 214.6,
    avatarGlow: "sky",
  },
]

function createDefaultStore(): ArenaStore {
  return {
    revision: 1,
    updatedAt: Date.now(),
    matches: [...initialArenaMatches],
    tickets: [],
  }
}

/** Drop orphan/ghost matches: Ready or Live with no challenger should not appear or be persisted. */
function dropOrphanMatches(matches: ArenaMatch[]): ArenaMatch[] {
  return matches.filter((m) => {
    if (m.status === "Ready to Start" || m.status === "Live") {
      return !!m.challenger
    }
    return true
  })
}

function persistStore(nextStore: ArenaStore) {
  const afterLifecycle = applyArenaLifecycle(
    normalizeArenaMatches(
      nextStore.matches.map((match) => ({
        ...match,
        pauseState: normalizePauseState(match.pauseState),
      })),
      Date.now()
    ),
    Date.now()
  )
  const cleanedMatches = dropOrphanMatches(afterLifecycle)
  const resolved: ArenaStore = {
    revision: nextStore.revision,
    updatedAt: nextStore.updatedAt,
    matches: applyBetsToMatches(
      cleanedMatches,
      [...nextStore.tickets].sort((a, b) => a.createdAt - b.createdAt)
    ),
    tickets: [...nextStore.tickets].sort((a, b) => a.createdAt - b.createdAt),
  }

  arenaStoreCache = resolved

  if (!isBrowser()) return

  try {
    // Cap and trim to stay under quota; strip heavy fields for persistence only.
    const MAX_PERSISTED_MATCHES = 30
    const trimmedMatches = resolved.matches.slice(0, MAX_PERSISTED_MATCHES).map((m) => ({
      ...m,
      boardState: undefined,
      moveHistory: [],
    }))
    const toStore: ArenaStore = {
      ...resolved,
      matches: trimmedMatches,
    }
    const serialized = JSON.stringify(toStore)
    const MAX_PERSIST_BYTES = 1.5 * 1024 * 1024 // 1.5 MB
    if (serialized.length > MAX_PERSIST_BYTES) {
      console.warn("KasRoyal arena store: payload too large; skipping persistence.")
      return
    }
    window.localStorage.setItem(ARENA_STORE_STORAGE_KEY, serialized)
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      console.warn("KasRoyal arena store: localStorage quota exceeded; continuing without persistence.")
    } else {
      console.warn("KasRoyal arena store: persist failed", e)
    }
    return
  }

  try {
    const navbarMatches = resolved.matches.map((match) => ({
      id: match.id,
      status: match.status,
      wager: match.wager,
      spectators: match.spectators,
    }))
    window.localStorage.setItem(ARENA_NAVBAR_STORAGE_KEY, JSON.stringify(navbarMatches))
  } catch {
    // ignore localStorage navbar projection errors
  }

  emitStorageEvent(ARENA_STORE_EVENT)
  emitStorageEvent(ARENA_MATCHES_EVENT)
  emitStorageEvent(SPECTATOR_TICKETS_EVENT)

  const channel = getBroadcastChannel()
  channel?.postMessage({
    type: "arena-store-updated",
    revision: resolved.revision,
  })
}

function readArenaStore(): ArenaStore {
  if (!isBrowser()) {
    if (!arenaStoreCache) {
      arenaStoreCache = createDefaultStore()
    }
    arenaStoreCache = {
      ...arenaStoreCache,
      matches: applyBetsToMatches(arenaStoreCache.matches, arenaStoreCache.tickets),
    }
    return arenaStoreCache
  }

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(ARENA_STORE_STORAGE_KEY)
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      console.warn("KasRoyal arena store: read failed (quota); using default store.")
    }
    return createDefaultStore()
  }
  const parsed = safeJsonParse<ArenaStore>(raw, createDefaultStore())

  arenaStoreCache = {
    revision: typeof parsed.revision === "number" ? parsed.revision : 1,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
  }

  arenaStoreCache = {
    ...arenaStoreCache,
    matches: applyBetsToMatches(arenaStoreCache.matches, arenaStoreCache.tickets),
  }

  return arenaStoreCache
}

function mutateArenaStore(
  mutator: (current: ArenaStore) => ArenaStore
): ArenaStore {
  const current = readArenaStore()
  const next = mutator({
    revision: current.revision,
    updatedAt: current.updatedAt,
    matches: current.matches.map((match) => ({
      ...match,
      pauseState: normalizePauseState(match.pauseState),
    })),
    tickets: current.tickets.map((ticket) => ({ ...ticket })),
  })

  const committed: ArenaStore = {
    ...next,
    revision: current.revision + 1,
    updatedAt: Date.now(),
  }

  persistStore(committed)
  return committed
}

function readMatchesFromStore() {
  return readArenaStore().matches
}

function readTicketsFromStore() {
  return readArenaStore().tickets
}

/** Write a match into the local store (e.g. after fetching from Supabase). Exported for room-page hydration. */
export function upsertMatchLocally(match: ArenaMatch) {
  mutateArenaStore((store) => {
    const next = [...store.matches]
    const index = next.findIndex((item) => item.id === match.id)

    if (index >= 0) {
      next[index] = {
        ...match,
        pauseState: normalizePauseState(match.pauseState),
      }
    } else {
      next.unshift({
        ...match,
        pauseState: normalizePauseState(match.pauseState),
      })
    }

    return {
      ...store,
      matches: next,
    }
  })
}

function mapDbMatchToArenaMatch(dbMatch: {
  id: string
  game_type: string
  status: string
  host_wallet: string
  challenger_wallet: string | null
  wager: number
  created_at: string
  started_at: string | null
  ended_at: string | null
}): ArenaMatch {
  const game = dbGameTypeToGameType(dbMatch.game_type)
  const labels = sideLabelsForGame(game)
  const createdAt = new Date(dbMatch.created_at).getTime()
  const seatedAt = dbMatch.challenger_wallet ? createdAt + 5_000 : undefined
  const bettingWindowSeconds = getGameBettingWindowSeconds(game)
  const countdownStartedAt = seatedAt
  const bettingClosesAt = countdownStartedAt
    ? countdownStartedAt + bettingWindowSeconds * 1000
    : undefined

  const hostShort =
    dbMatch.host_wallet.length > 10
      ? `${dbMatch.host_wallet.slice(0, 6)}...${dbMatch.host_wallet.slice(-4)}`
      : dbMatch.host_wallet
  const challengerShort =
    dbMatch.challenger_wallet && dbMatch.challenger_wallet.length > 10
      ? `${dbMatch.challenger_wallet.slice(0, 6)}...${dbMatch.challenger_wallet.slice(-4)}`
      : dbMatch.challenger_wallet ?? ""
  const host = buildProfileFromWallet(dbMatch.host_wallet, hostShort)
  const challenger = dbMatch.challenger_wallet
    ? buildProfileFromWallet(dbMatch.challenger_wallet, challengerShort)
    : null

  const status = dbStatusToArenaStatus(dbMatch.status)
  const startedAt = dbMatch.started_at ? new Date(dbMatch.started_at).getTime() : undefined

  return {
    id: dbMatch.id,
    game,
    status,
    matchMode: "ranked" as MatchMode,
    hostIdentityId: dbMatch.host_wallet.toLowerCase(),
    challengerIdentityId: dbMatch.challenger_wallet?.toLowerCase(),
    bettingStatus:
      challenger && status === "Ready to Start"
        ? "open"
        : challenger && (status === "Live" || status === "Finished")
          ? "locked"
          : "disabled",
    marketVisibility: challenger ? "featured" : "watch-only",
    isFeaturedMarket: !!challenger,
    bestOf: bestOfForGame(game),
    wager: Number(dbMatch.wager ?? 0),
    createdAt,
    seatedAt,
    countdownStartedAt,
    bettingClosesAt,
    startedAt,
    finishedAt: dbMatch.ended_at ? new Date(dbMatch.ended_at).getTime() : undefined,
    spectators: randomInt(4, 40),
    playerPot: Number(dbMatch.wager ?? 0) * (challenger ? 2 : 1),
    host,
    challenger,
    hostSideLabel: labels.host,
    challengerSideLabel: labels.challenger,
    statusText:
      challenger && status === "Ready to Start"
        ? "Countdown active"
        : challenger && status === "Live"
          ? "Match is live"
          : challenger && status === "Finished"
            ? "Match finished"
            : "Open seat available",
    moveText:
      challenger && status === "Ready to Start"
        ? "Starting soon"
        : challenger && status === "Live"
          ? getLiveMoveText(game)
          : challenger && status === "Finished"
            ? "Settlement pending"
            : "Waiting for join",
    roundScore: { host: 0, challenger: 0 },
    spectatorPool: { host: 0, challenger: 0 },
    bettingWindowSeconds,
    result: null,
    moveHistory: [],
    boardState:
      status === "Live"
        ? createLiveBoardState(game, startedAt ?? Date.now())
        : createWaitingBoardState(game),
    pauseState: createInitialPauseState(),
  }
}

export function isArenaSpectatable(match: ArenaMatch) {
  return (
    match.status === "Waiting for Opponent" ||
    match.status === "Ready to Start" ||
    match.status === "Live"
  )
}

/** Only real spectatable matches: Ready to Start or Live with both players (no ghost/stale). */
export function isRealSpectatableMatch(match: ArenaMatch): boolean {
  if (!match.id || !match.challenger) return false
  return match.status === "Ready to Start" || match.status === "Live"
}

/** Ranked matches only; Quick Match has no betting. */
export function isArenaBettable(match: ArenaMatch) {
  if (match.matchMode === "quick") return false
  return (
    !!match.challenger &&
    match.status === "Ready to Start" &&
    match.bettingStatus === "open"
  )
}

/** Call from match page when Waiting for Opponent so host sees challenger join quickly (cross-device sync). */
/** @deprecated Room authority is Supabase. No-op. */
export function forceHydrateArenaFromRemote() {
  // no-op
}

async function hydrateMatchesFromSupabase() {
  try {
    const dbMatches = await getDbMatches()
    const mapped = dbMatches.map(mapDbMatchToArenaMatch)

    if (!mapped.length) {
      return
    }

    mutateArenaStore((store) => {
      const consumedDbIds = new Set<string>()

      const updatedLocal = store.matches.map((local) => {
        if (!local.id.startsWith("arena-") || local.challenger) return local
        const hostKey = (local.hostIdentityId ?? local.host.name ?? "").toLowerCase()
        const db = mapped.find(
          (d) =>
            !consumedDbIds.has(d.id) &&
            ((d.hostIdentityId && d.hostIdentityId.toLowerCase() === hostKey) ||
              (d.host.name && d.host.name.toLowerCase() === hostKey)) &&
            d.game === local.game
        )
        if (!db) return local
        consumedDbIds.add(db.id)
        return {
          ...local,
          challenger: db.challenger,
          challengerIdentityId: db.challengerIdentityId,
          status: db.status,
          bettingStatus: db.challenger && db.status === "Ready to Start" ? "open" : local.bettingStatus,
          seatedAt: local.seatedAt ?? db.seatedAt,
          countdownStartedAt: db.countdownStartedAt ?? local.countdownStartedAt,
          bettingClosesAt: db.bettingClosesAt ?? local.bettingClosesAt,
          statusText: db.challenger && db.status === "Ready to Start" ? "Countdown active" : local.statusText,
          moveText:
            db.challenger && db.status === "Ready to Start"
              ? `Starts in ${formatTime(getGameBettingWindowSeconds(local.game))}`
              : local.moveText,
        }
      })

      const dbOnly = mapped.filter((d) => !consumedDbIds.has(d.id))
      const merged = [...updatedLocal, ...dbOnly]
      return {
        ...store,
        matches: merged,
      }
    })
  } catch (error) {
    if (typeof DOMException !== "undefined" && error instanceof DOMException && (error.name === "QuotaExceededError" || (error as DOMException & { code?: number }).code === 22)) {
      console.warn("KasRoyal hydrateMatchesFromSupabase: storage quota exceeded; continuing without persistence.")
    } else {
      console.error("KasRoyal hydrateMatchesFromSupabase failed", error)
    }
  }
}

async function hydrateTicketsForMatchFromSupabase(matchId: string) {
  try {
    const rows = await getDbMatchBets(matchId)

    mutateArenaStore((store) => {
      const filteredLocal = store.tickets.filter((ticket) => ticket.matchId !== matchId)

      const mapped: PersistedBetTicket[] = rows.map((row) => {
        const match = store.matches.find((item) => item.id === row.match_id)
        return {
          id: row.id,
          user:
            row.wallet_address.length > 10
              ? `${row.wallet_address.slice(0, 6)}...${row.wallet_address.slice(-4)}`
              : row.wallet_address,
          matchId: row.match_id,
          game: match?.game ?? "Chess Duel",
          side: row.side === "challenger" ? "challenger" : "host",
          amount: Number(row.amount),
          createdAt: new Date(row.created_at).getTime(),
        }
      })

      return {
        ...store,
        tickets: [...filteredLocal, ...mapped],
      }
    })
  } catch (error) {
    console.error("KasRoyal hydrateTicketsForMatchFromSupabase failed", error)
  }
}

const LIFECYCLE_TICKER_MS = 500

function startArenaLifecycleTicker() {
  if (!isBrowser() || arenaLifecycleIntervalStarted) return
  arenaLifecycleIntervalStarted = true

  window.setInterval(() => {
    const nowTs = Date.now()
    const current = readArenaStore()

    persistStore({
      ...current,
      updatedAt: nowTs,
    })

    if (nowTs - lastRemoteHydrateAt >= REMOTE_HYDRATE_INTERVAL_MS) {
      lastRemoteHydrateAt = nowTs
      void hydrateMatchesFromSupabase()
    }
  }, LIFECYCLE_TICKER_MS)
}

/** Force an immediate persist + broadcast of current store (with lifecycle applied). Use after create/join so other tabs see the new match quickly. */
/** @deprecated Room authority is Supabase. No-op. */
export function forceEmitArenaStoreUpdate(): void {
  // no-op
}

if (isBrowser()) {
  const loaded = readArenaStore()

  if (!window.localStorage.getItem(ARENA_STORE_STORAGE_KEY) && loaded.matches.length) {
    persistStore(loaded)
  }

  startArenaLifecycleTicker()
  void hydrateMatchesFromSupabase()
}

/** Deduplicate matches by id; keep last occurrence so newest state wins. */
function dedupeMatchesById(matches: ArenaMatch[]): ArenaMatch[] {
  const byId = new Map<string, ArenaMatch>()
  for (const m of matches) {
    if (m?.id) byId.set(m.id, m)
  }
  return [...byId.values()]
}

/** Arena = active only. No Finished/Forfeited/Canceled. One logical match per id. */
export function readActiveArenaMatches(): ArenaMatch[] {
  const all = readArenaMatches()
  const active = all.filter((m) => isActiveMatchStatus(m.status) && isValidActiveMatch(m))
  return dedupeMatchesById(active)
}

/** Match History = finished only. For history view / View Result. Deduplicated by id. */
export function readMatchHistory(): ArenaMatch[] {
  const all = readArenaMatches()
  const finished = all.filter((m) => m.status === "Finished")
  return dedupeMatchesById(finished).sort((a, b) => (b.finishedAt ?? b.createdAt ?? 0) - (a.finishedAt ?? a.createdAt ?? 0))
}

/**
 * @deprecated Room/match authority is Supabase. Use listActiveRooms/listHistoryRooms + roomToArenaMatch.
 * Returns empty array so no caller treats this as source of truth.
 */
export function readArenaMatches(): ArenaMatch[] {
  return []
}

export function readSpectatorTickets() {
  return [...readTicketsFromStore()]
}

export function readCurrentUserTickets(user = getCurrentIdentity().id) {
  const id = user.trim().toLowerCase()
  return readSpectatorTickets().filter(
    (ticket) => ticket.user.toLowerCase() === id || ticket.user === user
  )
}

/**
 * @deprecated Use getRoomById + roomToArenaMatch for room truth.
 */
export function getArenaById(matchId: string, matches: ArenaMatch[] = []): ArenaMatch | null {
  return matches.find((match) => match.id === matchId) ?? null
}

/**
 * @deprecated Use getRoomById + roomToArenaMatch for room truth.
 */
export async function getArenaByIdAsync(_matchId: string): Promise<ArenaMatch | null> {
  return null
}

/**
 * @deprecated Room/gameplay authority is Supabase. Use API routes + setState for UI.
 */
export function updateArenaMatch(
  _matchId: string,
  _updater:
    | Partial<ArenaMatch>
    | ((current: ArenaMatch) => ArenaMatch | Partial<ArenaMatch>)
): ArenaMatch | null {
  return null
}

/**
 * @deprecated Use Supabase realtime on matches table. No-op subscription.
 */
export function subscribeArenaMatches(callback: (matches: ArenaMatch[]) => void): () => void {
  callback([])
  return () => {}
}

export function subscribeSpectatorTickets(callback: (tickets: PersistedBetTicket[]) => void) {
  if (!isBrowser()) {
    callback(readSpectatorTickets())
    return () => {}
  }

  const emit = () => {
    callback(readSpectatorTickets())
  }

  const handler = () => emit()

  const storageHandler = (event: StorageEvent) => {
    if (event.key === ARENA_STORE_STORAGE_KEY) {
      emit()
    }
  }

  const channel = getBroadcastChannel()
  const broadcastHandler = () => emit()

  window.addEventListener(SPECTATOR_TICKETS_EVENT, handler)
  window.addEventListener(ARENA_STORE_EVENT, handler)
  window.addEventListener("storage", storageHandler)
  channel?.addEventListener("message", broadcastHandler)

  emit()

  return () => {
    window.removeEventListener(SPECTATOR_TICKETS_EVENT, handler)
    window.removeEventListener(ARENA_STORE_EVENT, handler)
    window.removeEventListener("storage", storageHandler)
    channel?.removeEventListener("message", broadcastHandler)
  }
}

function readRoomChatStore(): Record<string, RoomChatMessage[]> {
  if (!isBrowser()) return {}
  try {
    const raw = window.localStorage.getItem(ROOM_CHAT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const out: Record<string, RoomChatMessage[]> = {}
    for (const [matchId, arr] of Object.entries(parsed)) {
      if (typeof matchId !== "string" || !Array.isArray(arr)) continue
      const list = arr
        .filter(
          (m): m is RoomChatMessage =>
            m != null &&
            typeof m === "object" &&
            typeof (m as RoomChatMessage).id === "string" &&
            typeof (m as RoomChatMessage).user === "string" &&
            typeof (m as RoomChatMessage).text === "string" &&
            typeof (m as RoomChatMessage).ts === "number"
        )
        .sort((a, b) => a.ts - b.ts)
      out[matchId] = list
    }
    return out
  } catch {
    return {}
  }
}

function writeRoomChatStore(store: Record<string, RoomChatMessage[]>, updatedMatchId?: string) {
  if (!isBrowser()) return
  try {
    const serialized = JSON.stringify(store)
    window.localStorage.setItem(ROOM_CHAT_STORAGE_KEY, serialized)
    const channel = getBroadcastChannel()
    channel?.postMessage({ type: "room-chat-updated", matchId: updatedMatchId })
    window.dispatchEvent(
      new CustomEvent(ROOM_CHAT_EVENT, { detail: updatedMatchId != null ? { matchId: updatedMatchId } : {} })
    )
  } catch {
    // ignore
  }
}

export function getRoomChat(matchId: string): RoomChatMessage[] {
  const store = readRoomChatStore()
  return store[matchId] ?? []
}

export function appendRoomChat(
  matchId: string,
  message: { user: string; text: string }
): RoomChatMessage {
  const store = readRoomChatStore()
  const list = store[matchId] ?? []
  const ts = Date.now()
  const id = `chat-${matchId}-${ts}-${Math.random().toString(36).slice(2, 9)}`
  const msg: RoomChatMessage = { id, user: message.user, text: message.text.trim().slice(0, 500), ts }
  store[matchId] = [...list, msg]
  writeRoomChatStore(store, matchId)
  return msg
}

/** Send a room chat message (same as appendRoomChat). Use with subscribeRoomChat for shared live chat. */
export function sendRoomChatMessage(
  matchId: string,
  message: { user: string; text: string }
): RoomChatMessage {
  return appendRoomChat(matchId, message)
}

export function subscribeRoomChat(matchId: string, callback: () => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ matchId?: string }>)?.detail
    if (detail?.matchId !== undefined && detail.matchId !== matchId) return
    callback()
  }
  const storageHandler = (event: StorageEvent) => {
    if (event.key !== ROOM_CHAT_STORAGE_KEY) return
    callback()
  }
  const broadcastHandler = (e: MessageEvent) => {
    const data = e.data
    if (data?.type === "room-chat-updated" && (data.matchId == null || data.matchId === matchId)) {
      callback()
    }
  }
  window.addEventListener(ROOM_CHAT_EVENT, handler)
  window.addEventListener("storage", storageHandler)
  const channel = getBroadcastChannel()
  channel?.addEventListener("message", broadcastHandler)
  return () => {
    window.removeEventListener(ROOM_CHAT_EVENT, handler)
    window.removeEventListener("storage", storageHandler)
    channel?.removeEventListener("message", broadcastHandler)
  }
}

export function createArenaMatch(input: {
  game: GameType
  wager?: number
  bestOf?: 1 | 3 | 5
  hostWallet?: string
  matchMode?: MatchMode
}) {
  const mode: MatchMode = input.matchMode ?? "ranked"
  const wager = mode === "quick" ? 0 : clampWager(input.wager ?? 0)
  const identity = getCurrentIdentity()
  const hostWallet = normalizePlayerIdentity(input.hostWallet ?? identity.id)

  assertNoOtherActiveMatch(hostWallet)

  const profile = buildProfileFromWallet(hostWallet, identity.displayName)
  const labels = sideLabelsForGame(input.game)
  const resolvedBestOf = bestOfForGame(input.game, input.bestOf)

  const localMatch: ArenaMatch = normalizeArenaMatches(
    [
      {
        id: `arena-${cryptoSafeId()}`,
        game: input.game,
        matchMode: mode,
        status: "Waiting for Opponent",
        bettingStatus: mode === "quick" ? "disabled" : "disabled",
        marketVisibility: mode === "quick" ? "watch-only" : "watch-only",
        isFeaturedMarket: false,
        bestOf: resolvedBestOf,
        wager,
        createdAt: Date.now(),
        spectators: randomInt(2, 12),
        playerPot: wager,
        host: profile,
        challenger: null,
        hostIdentityId: hostWallet.toLowerCase(),
        challengerIdentityId: undefined,
        hostSideLabel: labels.host,
        challengerSideLabel: labels.challenger,
        statusText: "Open seat available",
        moveText: "Waiting for join",
        roundScore: { host: 0, challenger: 0 },
        spectatorPool: { host: 0, challenger: 0 },
        bettingWindowSeconds: getGameBettingWindowSeconds(input.game),
        result: null,
        moveHistory: [],
        boardState: createWaitingBoardState(input.game),
        pauseState: createInitialPauseState(),
      },
    ],
    Date.now()
  )[0]

  upsertMatchLocally(localMatch)
  forceEmitArenaStoreUpdate()

  void (async () => {
    try {
      const dbMatch = await createDbMatch({
        game_type: input.game,
        host_wallet: hostWallet,
        wager,
      })

      const mapped = mapDbMatchToArenaMatch(dbMatch)
      mapped.host = profile
      mapped.bestOf = resolvedBestOf
      mapped.hostSideLabel = labels.host
      mapped.challengerSideLabel = labels.challenger
      mapped.pauseState = createInitialPauseState()

      // Keep the temp id and mode so the URL /arena/match/${localMatch.id} still resolves
      mutateArenaStore((store) => {
        const idx = store.matches.findIndex((m) => m.id === localMatch.id)
        if (idx < 0) return store
        const merged: ArenaMatch = { ...mapped, id: localMatch.id, matchMode: localMatch.matchMode }
        const next = [...store.matches]
        next[idx] = merged
        return { ...store, matches: next }
      })
    } catch (error) {
      console.error("KasRoyal createArenaMatch background sync failed", error)
    }
  })()

  return localMatch
}

export function joinArenaMatch(matchId: string, wallet?: string): ArenaMatch | null {
  const identity = getCurrentIdentity()
  const walletAddress = normalizePlayerIdentity(wallet ?? identity.id)
  const existing = getArenaById(matchId)

  if (!existing) {
    return null
  }

  if (existing.challenger) {
    return existing
  }

  assertNoOtherActiveMatch(walletAddress, matchId)

  const challengerProfile = buildProfileFromWallet(walletAddress, identity.displayName)
  const nowTs = Date.now()
  const resolvedSeatedAt = existing.seatedAt ?? nowTs
  const resolvedCountdownStartedAt = existing.countdownStartedAt ?? nowTs
  const resolvedBettingClosesAt =
    resolvedCountdownStartedAt + getGameBettingWindowSeconds(existing.game) * 1000

  const isQuick = existing.matchMode === "quick"
  const localJoined = updateArenaMatch(matchId, (current) => ({
    challenger: challengerProfile,
    challengerIdentityId: walletAddress.toLowerCase(),
    status: "Ready to Start",
    bettingStatus: isQuick ? "disabled" : "open",
    marketVisibility: isQuick ? "watch-only" : "featured",
    isFeaturedMarket: !isQuick,
    seatedAt: current.seatedAt ?? resolvedSeatedAt,
    countdownStartedAt: current.countdownStartedAt ?? resolvedCountdownStartedAt,
    bettingClosesAt: resolvedBettingClosesAt,
    startedAt: undefined,
    finishedAt: undefined,
    playerPot: current.wager * 2,
    statusText: "Countdown active",
    moveText: `Starts in ${formatTime(getGameBettingWindowSeconds(current.game))}`,
    boardState: createWaitingBoardState(current.game),
    pauseState: normalizePauseState(current.pauseState),
  }))

  void (async () => {
    try {
      const dbMatch = await joinDbMatch(matchId, walletAddress)
      if (!dbMatch) return
      const mapped = mapDbMatchToArenaMatch(dbMatch)

      upsertMatchLocally({
        ...mapped,
        challenger: challengerProfile,
        challengerIdentityId: walletAddress.toLowerCase(),
        status: "Ready to Start",
        bettingStatus: "open",
        marketVisibility: "featured",
        isFeaturedMarket: true,
        seatedAt: mapped.seatedAt ?? resolvedSeatedAt,
        countdownStartedAt: resolvedCountdownStartedAt,
        bettingClosesAt: resolvedBettingClosesAt,
        startedAt: undefined,
        finishedAt: undefined,
        statusText: "Countdown active",
        moveText: `Starts in ${formatTime(getGameBettingWindowSeconds(mapped.game))}`,
        boardState: createWaitingBoardState(mapped.game),
        pauseState: createInitialPauseState(),
      })
    } catch (error) {
      console.error("KasRoyal joinArenaMatch background sync failed", error)
    }
  })()

  return localJoined
}

export function autoFillArenaMatch(matchId: string): ArenaMatch | null {
  if (!ENABLE_DEV_BOTS) {
    return getArenaById(matchId)
  }

  const match = getArenaById(matchId)

  if (!match || match.challenger) {
    return match
  }

  const opponent =
    mockOpponentPool.find((player) => player.name !== match.host.name) ??
    mockOpponentPool[0]

  const countdownStartedAt = Date.now()

  return updateArenaMatch(matchId, (current) => ({
    challenger: opponent,
    status: "Ready to Start",
    bettingStatus: "open",
    marketVisibility: "featured",
    isFeaturedMarket: true,
    seatedAt: current.seatedAt ?? countdownStartedAt,
    countdownStartedAt: current.countdownStartedAt ?? countdownStartedAt,
    bettingClosesAt:
      (current.countdownStartedAt ?? countdownStartedAt) +
      getGameBettingWindowSeconds(current.game) * 1000,
    startedAt: undefined,
    finishedAt: undefined,
    playerPot: current.wager * 2,
    statusText: "Countdown active",
    moveText: `Starts in ${formatTime(getGameBettingWindowSeconds(current.game))}`,
    boardState: createWaitingBoardState(current.game),
    pauseState: normalizePauseState(current.pauseState),
  }))
}

export function launchArenaMatch(matchId: string): ArenaMatch | null {
  const match = getArenaById(matchId)

  if (!match) {
    return null
  }

  const nowValue = Date.now()

  return updateArenaMatch(matchId, (current) => ({
    status: "Live",
    bettingStatus: "locked",
    marketVisibility: current.challenger ? "featured" : "watch-only",
    isFeaturedMarket: !!current.challenger,
    seatedAt: current.seatedAt ?? nowValue,
    countdownStartedAt: current.countdownStartedAt ?? nowValue,
    bettingClosesAt: current.bettingClosesAt ?? nowValue,
    startedAt: nowValue,
    finishedAt: undefined,
    statusText: getLiveStatusText(
      current.game,
      current.host.name,
      current.challenger?.name ?? null,
      current.host.name
    ),
    moveText: getLiveMoveText(current.game),
    boardState: createLiveBoardState(current.game, nowValue),
    pauseState: normalizePauseState(current.pauseState),
  }))
}

/**
 * Cancel (quit) an open room. Host only, and only if no challenger has joined.
 * Removes this match AND any other open (no challenger) rooms for this host so
 * no ghost rooms remain and active-match lock is released. Persists and broadcasts.
 */
export function cancelOpenRoom(matchId: string, hostIdentity?: string): boolean {
  const identityId = (hostIdentity ?? getCurrentIdentity().id).trim().toLowerCase()
  const match = getArenaById(matchId)

  if (!match) {
    return false
  }

  if (match.challenger) {
    return false
  }

  const isHost =
    (match.hostIdentityId && match.hostIdentityId.toLowerCase() === identityId) ||
    normalizePlayerIdentity(match.host.name).toLowerCase() === identityId
  if (!isHost) {
    return false
  }

  mutateArenaStore((store) => {
    const nextMatches = store.matches.filter((m) => {
      if (m.id === matchId) return false
      if (m.challenger) return true
      const hostId = (m.hostIdentityId ?? normalizePlayerIdentity(m.host.name)).toLowerCase()
      if (hostId === identityId) return false
      return true
    })
    return { ...store, matches: nextMatches }
  })
  return true
}

/**
 * Forfeit the match. Only seated players; allowed in Ready to Start or Live.
 * Opponent wins; match becomes Finished; betting locks; both identities released.
 * Removes any duplicate/orphan matches with same host+challenger so no ghost rooms remain.
 */
export function forfeitArenaMatch(matchId: string, forfeitingSide: ArenaSide): ArenaMatch | null {
  const match = getArenaById(matchId)

  if (!match) {
    return null
  }

  if (!match.challenger) {
    return null
  }

  if (match.status !== "Ready to Start" && match.status !== "Live") {
    return null
  }

  const winner: ArenaSide = forfeitingSide === "host" ? "challenger" : "host"
  const hostId = (match.hostIdentityId ?? "").toLowerCase()
  const challengerId = (match.challengerIdentityId ?? "").toLowerCase()

  let updated: ArenaMatch | null = null

  mutateArenaStore((store) => {
    const nowTs = Date.now()
    const finishedMatch: ArenaMatch = {
      ...match,
      status: "Finished",
      bettingStatus: "locked",
      result: winner,
      finishedAt: nowTs,
      statusText: winner === "host" ? `${match.host.name} wins by forfeit` : `${match.challenger?.name ?? "Challenger"} wins by forfeit`,
      moveText: "Forfeit",
    }

    const nextMatches = store.matches.map((m) => {
      if (m.id === matchId) {
        updated = { ...finishedMatch, pauseState: normalizePauseState(match.pauseState) }
        return updated
      }
      if (m.status !== "Ready to Start" && m.status !== "Live") return m
      if (!m.challenger) return m
      const mHost = (m.hostIdentityId ?? "").toLowerCase()
      const mChall = (m.challengerIdentityId ?? "").toLowerCase()
      if (mHost === hostId && mChall === challengerId) {
        return { ...m, status: "Finished" as ArenaStatus, bettingStatus: "locked" as const, result: winner, finishedAt: nowTs }
      }
      return m
    })

    return { ...store, matches: nextMatches }
  })

  return updated
}

export function pauseArenaMatch(matchId: string, side: ArenaSide): ArenaMatch | null {
  const match = getArenaById(matchId)

  if (!match) {
    throw new Error("Match not found")
  }

  if (match.status !== "Live") {
    throw new Error("Pause is only available during live matches")
  }

  if (!match.challenger) {
    throw new Error("Pause is unavailable until both players are seated")
  }

  if (match.game === "Chess Duel") {
    throw new Error("Pause is not available for chess preview yet")
  }

  const pauseState = normalizePauseState(match.pauseState)

  if (pauseState.isPaused) {
    throw new Error("Match is already paused")
  }

  const currentTurnSide = getCurrentTurnSide(match)

  if (!currentTurnSide) {
    throw new Error("Pause is unavailable for this board state")
  }

  if (currentTurnSide !== side) {
    throw new Error("Only the player whose turn it is can pause")
  }

  const usedPauses =
    side === "host" ? pauseState.pauseCountHost : pauseState.pauseCountChallenger

  if (usedPauses >= MAX_PAUSES_PER_SIDE) {
    throw new Error("No pauses remaining for this player")
  }

  const pauseExpiresAt = Date.now() + PAUSE_DURATION_SECONDS * 1000
  const playerName = side === "host" ? match.host.name : match.challenger.name

  return updateArenaMatch(matchId, (current) => {
    const currentPauseState = normalizePauseState(current.pauseState)

    return {
      pauseState: {
        ...currentPauseState,
        isPaused: true,
        pausedBy: side,
        pauseExpiresAt,
        pauseCountHost:
          side === "host"
            ? currentPauseState.pauseCountHost + 1
            : currentPauseState.pauseCountHost,
        pauseCountChallenger:
          side === "challenger"
            ? currentPauseState.pauseCountChallenger + 1
            : currentPauseState.pauseCountChallenger,
      },
      statusText: `${playerName} paused • ${PAUSE_DURATION_SECONDS}s`,
      moveText: "Pause active",
    }
  })
}

export function resumeArenaMatch(
  matchId: string,
  resumedBy?: ArenaSide | "system"
): ArenaMatch | null {
  const match = getArenaById(matchId)

  if (!match) {
    throw new Error("Match not found")
  }

  if (match.status !== "Live") {
    throw new Error("Only live matches can be resumed")
  }

  const pauseState = normalizePauseState(match.pauseState)

  if (!pauseState.isPaused) {
    throw new Error("Match is not currently paused")
  }

  if (
    resumedBy &&
    resumedBy !== "system" &&
    resumedBy !== "host" &&
    resumedBy !== "challenger"
  ) {
    throw new Error("Invalid resume side")
  }

  const nowTs = Date.now()

  return updateArenaMatch(matchId, (current) => {
    const resumed = resumePausedMatchInternal(current, nowTs, "manual")
    const resumerName =
      resumedBy === "host"
        ? current.host.name
        : resumedBy === "challenger"
          ? current.challenger?.name ?? "Challenger"
          : null

    return {
      ...resumed,
      moveText:
        resumedBy && resumedBy !== "system" && resumerName
          ? `${resumerName} resumed • timer reset`
          : "Pause ended • timer reset",
    }
  })
}

export async function placeArenaSpectatorBet(input: {
  matchId: string
  side: ArenaSide
  amount: number
  user?: string
  walletAddress?: string
}) {
  const amount = clampBetAmount(input.amount)
  const match = getArenaById(input.matchId)

  if (!match) {
    throw new Error("Match not found")
  }

  if (!isArenaBettable(match)) {
    throw new Error("Betting is closed for this match")
  }

  const identity = getCurrentIdentity()
  const normalizedUser = (input.user ?? identity.id).trim()
  const normalizedWalletAddress = (input.walletAddress ?? identity.id).trim()

  if (matchHasIdentity(match, normalizedUser) || matchHasIdentity(match, normalizedWalletAddress)) {
    throw new Error("Players cannot bet on their own match")
  }

  const ticket: PersistedBetTicket = {
    id: `ticket-${cryptoSafeId()}`,
    user: normalizedUser,
    matchId: input.matchId,
    game: match.game,
    side: input.side,
    amount,
    createdAt: Date.now(),
  }

  mutateArenaStore((store) => ({
    ...store,
    tickets: [...store.tickets, ticket],
  }))

  try {
    await placeDbBet({
      match_id: input.matchId,
      wallet_address: normalizedWalletAddress,
      side: input.side,
      amount,
    })
    await hydrateTicketsForMatchFromSupabase(input.matchId)
  } catch (error) {
    console.error("KasRoyal placeArenaSpectatorBet Supabase sync failed", error)
  }

  return ticket
}

export function getTicketsForMatch(matchId: string) {
  return readSpectatorTickets().filter((ticket) => ticket.matchId === matchId)
}

export function getTicketExposureByMatch(matchId: string, user?: string) {
  const tickets = getTicketsForMatch(matchId)
  const filtered = user
    ? tickets.filter((ticket) => ticket.user === user)
    : tickets

  const host = filtered
    .filter((ticket) => ticket.side === "host")
    .reduce((sum, ticket) => sum + ticket.amount, 0)

  const challenger = filtered
    .filter((ticket) => ticket.side === "challenger")
    .reduce((sum, ticket) => sum + ticket.amount, 0)

  return {
    host,
    challenger,
    total: host + challenger,
  }
}

export function getMatchResultLabel(match: ArenaMatch | null) {
  if (!match) return "Archived"
  if (match.result === "host") return `${match.host.name} won`
  if (match.result === "challenger") return `${match.challenger?.name ?? "Challenger"} won`
  if (match.result === "draw") return "Draw / Refund"
  if (match.status === "Finished") return "Finished"
  return formatArenaPhase(match.status)
}

/** One-line winner display for finished matches: "Winner: Name", "Winner by Forfeit: Name", "Draw", etc. */
export function getWinnerDisplayLine(match: ArenaMatch | null): string {
  if (!match || match.status !== "Finished") return ""
  if (match.result === "draw") return "Draw"
  const winnerName =
    match.result === "host"
      ? match.host.name
      : match.result === "challenger"
        ? (match.challenger?.name ?? "Challenger")
        : null
  if (!winnerName) return "Finished"
  const reason =
    match.winReason === "forfeit"
      ? " by Forfeit"
      : match.winReason === "timeout"
        ? " by Timeout"
        : match.winReason === "win"
          ? ""
          : match.winReason
            ? ` (${match.winReason})`
            : ""
  return `Winner${reason}: ${winnerName}`
}

/** Format win reason for banner: "timeout", "forfeit", " series 2-1", or "" for game win. */
function formatWinReasonForBanner(winReason: string | null | undefined): string {
  if (winReason === "timeout") return " by timeout"
  if (winReason === "forfeit") return " by forfeit"
  if (winReason && winReason.startsWith("series ")) return ` ${winReason}`
  return ""
}

/**
 * Result copy for finished match banner. Uses status, winner_identity_id, win_reason, and current user.
 * Returns: "You won by timeout", "You lost", "Guest123 won by forfeit", or "Draw".
 */
export function getMatchResultCopy(
  match: ArenaMatch | null,
  currentUserIdentityId: string
): string {
  if (!match || match.status !== "Finished") return "Match finished"
  if (match.result === "draw") return "Draw"
  const isHost = match.hostIdentityId === currentUserIdentityId
  const isChallenger = match.challengerIdentityId === currentUserIdentityId
  const currentUserSide = isHost ? "host" : isChallenger ? "challenger" : null
  const winnerName =
    match.result === "host"
      ? match.host.name
      : match.result === "challenger"
        ? (match.challenger?.name ?? "Challenger")
        : null
  const reasonSuffix = formatWinReasonForBanner(match.winReason ?? undefined)
  if (currentUserSide && match.result === currentUserSide) return `You won${reasonSuffix}`
  if (currentUserSide) return "You lost"
  if (winnerName) return `${winnerName} won${reasonSuffix}`
  return "Match finished"
}

/** Winner display name for finished match (for banner detail). */
export function getWinnerDisplayName(match: ArenaMatch | null): string | null {
  if (!match || match.status !== "Finished" || match.result === "draw") return null
  if (match.result === "host") return match.host.name
  if (match.result === "challenger") return match.challenger?.name ?? "Challenger"
  return null
}

/** Human-readable win reason for banner (timeout, forfeit, game win, series). */
export function getWinReasonLabel(winReason: string | null | undefined): string | null {
  if (!winReason) return null
  if (winReason === "timeout") return "Timeout"
  if (winReason === "forfeit") return "Forfeit"
  if (winReason === "win") return "Game win"
  if (winReason.startsWith("series ")) return `Won ${winReason}`
  return winReason
}

export function getBackedPlayerName(
  ticket: Pick<PersistedBetTicket, "side">,
  match: ArenaMatch | null
) {
  if (!match) {
    return ticket.side === "host" ? "Host" : "Challenger"
  }

  return ticket.side === "host" ? match.host.name : match.challenger?.name ?? "Challenger"
}

export function getBetSettlement(
  ticket: PersistedBetTicket,
  match?: ArenaMatch | null
): BetSettlement {
  const resolvedMatch = match ?? getArenaById(ticket.matchId)
  const backedPlayerName = getBackedPlayerName(ticket, resolvedMatch)
  const resultLabel = getMatchResultLabel(resolvedMatch)

  if (!resolvedMatch) {
    return {
      ticket,
      match: null,
      state: "archived",
      payout: 0,
      profit: 0,
      multiplier: 0,
      result: null,
      resultLabel,
      backedPlayerName,
    }
  }

  const multiplier = getMultiplier(
    resolvedMatch.spectatorPool.host,
    resolvedMatch.spectatorPool.challenger,
    ticket.side
  )

  if (resolvedMatch.status !== "Finished") {
    return {
      ticket,
      match: resolvedMatch,
      state: "pending",
      payout: 0,
      profit: 0,
      multiplier,
      result: resolvedMatch.result ?? null,
      resultLabel,
      backedPlayerName,
    }
  }

  if (resolvedMatch.result === "draw") {
    return {
      ticket,
      match: resolvedMatch,
      state: "refunded",
      payout: Number(ticket.amount.toFixed(2)),
      profit: 0,
      multiplier: 1,
      result: resolvedMatch.result,
      resultLabel,
      backedPlayerName,
    }
  }

  if (resolvedMatch.result === ticket.side) {
    const payout = Number((ticket.amount * multiplier).toFixed(2))
    const profit = Number((payout - ticket.amount).toFixed(2))

    return {
      ticket,
      match: resolvedMatch,
      state: "won",
      payout,
      profit,
      multiplier,
      result: resolvedMatch.result,
      resultLabel,
      backedPlayerName,
    }
  }

  return {
    ticket,
    match: resolvedMatch,
    state: "lost",
    payout: 0,
    profit: Number((-ticket.amount).toFixed(2)),
    multiplier,
    result: resolvedMatch.result ?? null,
    resultLabel,
    backedPlayerName,
  }
}

export function getMatchSettlement(matchId: string) {
  const match = getArenaById(matchId)
  const tickets = getTicketsForMatch(matchId)
  const settlements = tickets.map((ticket) => getBetSettlement(ticket, match))

  const totalStaked = Number(
    settlements.reduce((sum, item) => sum + item.ticket.amount, 0).toFixed(2)
  )
  const totalPayout = Number(
    settlements.reduce((sum, item) => sum + item.payout, 0).toFixed(2)
  )
  const totalProfit = Number(
    settlements.reduce((sum, item) => sum + item.profit, 0).toFixed(2)
  )

  return {
    match,
    tickets,
    settlements,
    totalStaked,
    totalPayout,
    totalProfit,
  }
}

export function getUserSettledPayouts(user = getCurrentIdentity().id): UserSettledPayoutSummary {
  const tickets = readCurrentUserTickets(user)
  const settlements = tickets
    .map((ticket) => getBetSettlement(ticket))
    .filter((item) => item.state !== "pending" && item.state !== "archived")

  const wonCount = settlements.filter((item) => item.state === "won").length
  const lostCount = settlements.filter((item) => item.state === "lost").length
  const refundedCount = settlements.filter((item) => item.state === "refunded").length

  return {
    settledCount: settlements.length,
    wonCount,
    lostCount,
    refundedCount,
    totalStaked: Number(
      settlements.reduce((sum, item) => sum + item.ticket.amount, 0).toFixed(2)
    ),
    totalPayout: Number(
      settlements.reduce((sum, item) => sum + item.payout, 0).toFixed(2)
    ),
    totalProfit: Number(
      settlements.reduce((sum, item) => sum + item.profit, 0).toFixed(2)
    ),
  }
}

export function getFavoriteData(hostRating: number, challengerRating: number): FavoriteData {
  const diff = hostRating - challengerRating
  const absDiff = Math.abs(diff)

  if (absDiff < 40) {
    return {
      favorite: "even",
      leftLabel: "Even Match",
      rightLabel: "Even Match",
      edge: 0,
    }
  }

  if (diff > 0) {
    return {
      favorite: "host",
      leftLabel: "Favorite",
      rightLabel: "Underdog",
      edge: absDiff,
    }
  }

  return {
    favorite: "challenger",
    leftLabel: "Underdog",
    rightLabel: "Favorite",
    edge: absDiff,
  }
}

export function getEdgeText(hostRating: number, challengerRating: number) {
  const { favorite, edge } = getFavoriteData(hostRating, challengerRating)
  if (favorite === "even") return "Evenly matched market"
  return `${edge} MMR edge`
}

export function getWinProbability(
  firstRating: number,
  secondRating: number,
  side?: ArenaSide
) {
  const qa = Math.pow(10, firstRating / 400)
  const qb = Math.pow(10, secondRating / 400)
  const firstProbability = qa / (qa + qb)

  if (!side) {
    return firstProbability
  }

  return side === "host" ? firstProbability : 1 - firstProbability
}

function makeRankColors(text: string, ring: string, bg: string): RankColors {
  return {
    text,
    ring,
    bg,
    toString() {
      return `${text} ${ring} ${bg}`
    },
  }
}

export function getRankColors(rank: RankTier): RankColors {
  if (rank === "Grandmaster" || rank === "Master") {
    return makeRankColors(
      "text-amber-300",
      "ring-amber-300/30",
      "bg-amber-400/10"
    )
  }
  if (rank.startsWith("Diamond") || rank.startsWith("Platinum")) {
    return makeRankColors("text-sky-300", "ring-sky-300/30", "bg-sky-400/10")
  }
  if (rank.startsWith("Gold")) {
    return makeRankColors(
      "text-emerald-300",
      "ring-emerald-300/30",
      "bg-emerald-400/10"
    )
  }
  if (rank.startsWith("Silver")) {
    return makeRankColors("text-slate-200", "ring-white/20", "bg-white/10")
  }
  return makeRankColors(
    "text-orange-200",
    "ring-orange-300/20",
    "bg-orange-400/10"
  )
}

export function buildFeaturedSpectateMarkets(matches = readArenaMatches()) {
  return matches
    .filter(
      (match) =>
        !!match.challenger &&
        (match.status === "Ready to Start" || match.status === "Live")
    )
    .sort((a, b) => {
      const aPriority =
        a.status === "Ready to Start" ? 2 : a.status === "Live" ? 1 : 0
      const bPriority =
        b.status === "Ready to Start" ? 2 : b.status === "Live" ? 1 : 0

      if (bPriority !== aPriority) return bPriority - aPriority

      const aPool = a.spectatorPool.host + a.spectatorPool.challenger
      const bPool = b.spectatorPool.host + b.spectatorPool.challenger

      if (bPool !== aPool) return bPool - aPool
      if (b.spectators !== a.spectators) return b.spectators - a.spectators
      return b.createdAt - a.createdAt
    })
}

export function buildLeaderboardFromArena(
  matches: ArenaMatch[] = []
): LeaderboardEntry[] {
  const baseMap = new Map<string, LeaderboardEntry>()

  for (const seed of leaderboardSeed) {
    baseMap.set(seed.name, { ...seed })
  }

  const ensureEntry = (profile: PlayerProfile, favoriteGame: GameType) => {
    const existing = baseMap.get(profile.name)
    if (existing) {
      existing.rating = profile.rating
      existing.rank = profile.rank
      existing.winRate = profile.winRate
      if (!existing.favoriteGame) {
        existing.favoriteGame = favoriteGame
      }
      return existing
    }

    const winsLosses = profile.last10.split("-")
    const wins = Number(winsLosses[0] ?? 5)
    const losses = Number(winsLosses[1] ?? 5)

    const created: LeaderboardEntry = {
      id: `lb-${cryptoSafeId()}`,
      name: profile.name,
      rank: profile.rank,
      rating: profile.rating,
      winRate: profile.winRate,
      wins: Number.isFinite(wins) ? wins : 5,
      losses: Number.isFinite(losses) ? losses : 5,
      streak: profile.winRate >= 50 ? "W2" : "L1",
      favoriteGame,
      earnings: 0,
      avatarGlow:
        favoriteGame === "Chess Duel"
          ? "amber"
          : favoriteGame === "Connect 4"
            ? "emerald"
            : "sky",
    }

    baseMap.set(profile.name, created)
    return created
  }

  for (const match of matches) {
    const hostEntry = ensureEntry(match.host, match.game)
    hostEntry.favoriteGame = hostEntry.favoriteGame || match.game
    hostEntry.earnings = Number((hostEntry.earnings + match.wager * 0.35).toFixed(1))

    if (match.challenger) {
      const challengerEntry = ensureEntry(match.challenger, match.game)
      challengerEntry.favoriteGame = challengerEntry.favoriteGame || match.game
      challengerEntry.earnings = Number(
        (challengerEntry.earnings + match.wager * 0.35).toFixed(1)
      )
    }
  }

  return [...baseMap.values()].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating
    if (b.winRate !== a.winRate) return b.winRate - a.winRate
    if (b.earnings !== a.earnings) return b.earnings - a.earnings
    return b.wins - a.wins
  })
}

export function getLeaderboard(): LeaderboardEntry[] {
  return buildLeaderboardFromArena([])
}

export function clearArenaLocalState() {
  arenaStoreCache = createDefaultStore()

  if (!isBrowser()) return

  window.localStorage.removeItem(ARENA_STORE_STORAGE_KEY)

  emitStorageEvent(ARENA_STORE_EVENT)
  emitStorageEvent(ARENA_MATCHES_EVENT)
  emitStorageEvent(SPECTATOR_TICKETS_EVENT)
}

const KASROYAL_STORAGE_PREFIX = "kasroyal_"

/**
 * Hard reset: remove ALL KasRoyal local/mock state so Arena, Spectate, History, and Navbar are empty.
 * - Removes every localStorage and sessionStorage key starting with "kasroyal_"
 *   (arena store, navbar cache, room chat, guest identity, wallet disconnect flag, etc.)
 * - Sets in-memory arena cache to empty and writes empty store so next read is fresh.
 * Use for dev/admin only (e.g. "Hard Reset All Matches" button).
 * After reset, guest identity will be regenerated on next getCurrentIdentity() (new guest).
 */
export function resetAllArenaState(): void {
  const emptyStore: ArenaStore = {
    revision: 1,
    updatedAt: Date.now(),
    matches: [],
    tickets: [],
  }
  arenaStoreCache = emptyStore

  if (!isBrowser()) return

  const keysToRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (key && key.startsWith(KASROYAL_STORAGE_PREFIX)) keysToRemove.push(key)
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key)
  }
  keysToRemove.length = 0
  for (let i = 0; i < window.sessionStorage.length; i++) {
    const key = window.sessionStorage.key(i)
    if (key && key.startsWith(KASROYAL_STORAGE_PREFIX)) keysToRemove.push(key)
  }
  for (const key of keysToRemove) {
    window.sessionStorage.removeItem(key)
  }

  // Remove any legacy / old test keys (in case they exist under older names)
  try {
    window.localStorage.removeItem("kasroyal_arena_store")
    window.localStorage.removeItem("kasroyal_arena_store_v3")
    window.localStorage.removeItem("kasroyal_navbar_cache")
    window.localStorage.setItem(ARENA_STORE_STORAGE_KEY, JSON.stringify(emptyStore))
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      console.warn("KasRoyal resetAllArenaState: quota exceeded; in-memory state cleared.")
    }
  }
  try {
    window.localStorage.setItem(ARENA_NAVBAR_STORAGE_KEY, "[]")
  } catch {
    // ignore
  }

  emitStorageEvent(ARENA_STORE_EVENT)
  emitStorageEvent(ARENA_MATCHES_EVENT)
  emitStorageEvent(SPECTATOR_TICKETS_EVENT)

  const channel = getBroadcastChannel()
  channel?.postMessage({ type: "arena-store-updated", revision: emptyStore.revision })
}

export function seedDevArenaMatches() {
  if (!ENABLE_DEV_SEED) {
    return []
  }

  persistStore({
    revision: 1,
    updatedAt: Date.now(),
    matches: makeSeededArenaMatches(Date.now()),
    tickets: [],
  })

  return readArenaMatches()
}

function cryptoSafeId() {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}