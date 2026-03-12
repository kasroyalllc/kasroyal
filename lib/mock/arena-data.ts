import {
  type ArenaMatch,
  type ArenaSide,
  type ArenaStatus,
  type GameType,
  type LeaderboardEntry,
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

export type {
  ArenaMatch,
  ArenaSide,
  ArenaStatus,
  GameType,
  LeaderboardEntry,
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
  turnDeadlineTs: number
}

type TttBoardState = {
  mode: "ttt-live"
  board: ("X" | "O" | null)[]
  turn: "X" | "O"
  turnDeadlineTs: number
}

const ARENA_MATCHES_STORAGE_KEY = "kasroyal_arena_matches"
const ARENA_MATCHES_EVENT = "kasroyal-arena-matches-updated"
const SPECTATOR_TICKETS_STORAGE_KEY = "kasroyal_spectator_tickets"
const SPECTATOR_TICKETS_EVENT = "kasroyal-spectator-tickets-updated"

export const MAX_PAUSES_PER_SIDE = 2
export const PAUSE_DURATION_SECONDS = 30

const CONNECT4_MOVE_SECONDS = 20
const TTT_MOVE_SECONDS = 10

const ENABLE_DEV_SEED = process.env.NEXT_PUBLIC_ENABLE_DEV_SEED === "true"
const ENABLE_DEV_BOTS = process.env.NEXT_PUBLIC_ENABLE_DEV_BOTS === "true"

const now = Date.now()

export const currentUser: PlayerProfile & { walletBalance: number } = {
  name: "KasKing01",
  rank: "Diamond II",
  rating: 1842,
  winRate: 61,
  last10: "7-3",
  walletBalance: 275.4,
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
  "KasKing01 opened with e4 and took center control.",
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
    pauseExpiresAt: Number.isFinite(value?.pauseExpiresAt)
      ? Number(value?.pauseExpiresAt)
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
    Number.isFinite(state.turnDeadlineTs)
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
    Number.isFinite(state.turnDeadlineTs)
  )
}

function createLiveBoardState(game: GameType) {
  if (game === "Connect 4") {
    return {
      mode: "connect4-live" as const,
      board: Array.from({ length: 6 }, () =>
        Array.from({ length: 7 }, () => null as ArenaSide | null)
      ),
      turn: "host" as ArenaSide,
      turnDeadlineTs: Date.now() + CONNECT4_MOVE_SECONDS * 1000,
    }
  }

  if (game === "Tic-Tac-Toe") {
    return {
      mode: "ttt-live" as const,
      board: Array.from({ length: 9 }, () => null as "X" | "O" | null),
      turn: "X" as "X" | "O",
      turnDeadlineTs: Date.now() + TTT_MOVE_SECONDS * 1000,
    }
  }

  return {
    mode: "chess-preview" as const,
    fen: "start",
  }
}

function getLiveMoveText(game: GameType) {
  if (game === "Chess Duel") return "1. e4"
  if (game === "Connect 4") return "Opening disc dropped"
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
  const raw = (value ?? currentUser.name).trim()
  if (!raw) return currentUser.name
  if (raw === `${currentUser.name}-wallet`) return currentUser.name
  return raw
}

function isActiveMatchStatus(status: ArenaStatus) {
  return (
    status === "Waiting for Opponent" ||
    status === "Ready to Start" ||
    status === "Live"
  )
}

function matchHasIdentity(match: ArenaMatch, identity: string) {
  const normalizedIdentity = normalizePlayerIdentity(identity)
  const hostName = normalizePlayerIdentity(match.host.name)
  const challengerName = normalizePlayerIdentity(match.challenger?.name)

  return hostName === normalizedIdentity || challengerName === normalizedIdentity
}

function getActiveMatchForIdentity(identity?: string, excludeMatchId?: string) {
  const normalizedIdentity = normalizePlayerIdentity(identity)

  return (
    readArenaMatches().find((match) => {
      if (excludeMatchId && match.id === excludeMatchId) return false
      if (!isActiveMatchStatus(match.status)) return false
      return matchHasIdentity(match, normalizedIdentity)
    }) ?? null
  )
}

export function getWalletActiveMatch(identity?: string) {
  return getActiveMatchForIdentity(identity)
}

export function hasWalletActiveMatch(identity?: string, excludeMatchId?: string) {
  return !!getActiveMatchForIdentity(identity, excludeMatchId)
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
    if (normalized.boardState.turnDeadlineTs > nowTs) return normalized

    const loser = normalized.boardState.turn
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
      statusText: `${loserName} timed out`,
      moveText: `${winnerName} wins by timeout`,
      pauseState: {
        ...pauseState,
        isPaused: false,
        pausedBy: null,
        pauseExpiresAt: null,
      },
    }
  }

  if (normalized.game === "Tic-Tac-Toe" && isTttBoardState(normalized.boardState)) {
    if (normalized.boardState.turnDeadlineTs > nowTs) return normalized

    const loser = normalized.boardState.turn === "X" ? "host" : "challenger"
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
      statusText: `${loserName} timed out`,
      moveText: `${winnerName} wins by timeout`,
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

function applyArenaLifecycle(matches: ArenaMatch[], nowTs = Date.now()): ArenaMatch[] {
  return normalizeArenaMatches(
    matches.map((originalMatch) => {
      let match = withNormalizedPauseState(originalMatch)

      const shouldAutoLaunch =
        !!match.challenger &&
        match.status === "Ready to Start" &&
        !!match.bettingClosesAt &&
        match.bettingClosesAt <= nowTs

      if (shouldAutoLaunch) {
        match = {
          ...match,
          status: "Live" as ArenaStatus,
          bettingStatus: "locked",
          marketVisibility: "featured",
          isFeaturedMarket: true,
          seatedAt: match.seatedAt ?? nowTs,
          countdownStartedAt: match.countdownStartedAt ?? nowTs,
          bettingClosesAt: match.bettingClosesAt ?? nowTs,
          startedAt: match.startedAt ?? nowTs,
          finishedAt: undefined,
          statusText: getLiveStatusText(
            match.game,
            match.host.name,
            match.challenger?.name ?? null,
            match.host.name
          ),
          moveText: getLiveMoveText(match.game),
          boardState: createLiveBoardState(match.game),
          pauseState: normalizePauseState(match.pauseState),
        }
      }

      match = resolvePausedMatch(match, nowTs)
      match = resolveTimedOutLiveMatch(match, nowTs)

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

function persistMatches(matches: ArenaMatch[]) {
  arenaMatchesCache = applyArenaLifecycle(
    normalizeArenaMatches(
      matches.map((match) => ({
        ...match,
        pauseState: normalizePauseState(match.pauseState),
      })),
      Date.now()
    ),
    Date.now()
  )

  if (!isBrowser()) return

  window.localStorage.setItem(
    ARENA_MATCHES_STORAGE_KEY,
    JSON.stringify(arenaMatchesCache)
  )
  emitStorageEvent(ARENA_MATCHES_EVENT)
}

function persistTickets(tickets: PersistedBetTicket[]) {
  spectatorTicketsCache = [...tickets].sort((a, b) => a.createdAt - b.createdAt)
  if (!isBrowser()) return
  window.localStorage.setItem(
    SPECTATOR_TICKETS_STORAGE_KEY,
    JSON.stringify(spectatorTicketsCache)
  )
  emitStorageEvent(SPECTATOR_TICKETS_EVENT)
}

function loadMatchesFromLocalStorage() {
  if (!isBrowser()) return arenaMatchesCache

  const stored = safeJsonParse<ArenaMatch[]>(
    window.localStorage.getItem(ARENA_MATCHES_STORAGE_KEY),
    initialArenaMatches
  )

  arenaMatchesCache = applyArenaLifecycle(
    normalizeArenaMatches(
      stored.map((match) => ({
        ...match,
        pauseState: normalizePauseState(match.pauseState),
      })),
      Date.now()
    ),
    Date.now()
  )

  return arenaMatchesCache
}

function loadTicketsFromLocalStorage() {
  if (!isBrowser()) return spectatorTicketsCache
  const stored = safeJsonParse<PersistedBetTicket[]>(
    window.localStorage.getItem(SPECTATOR_TICKETS_STORAGE_KEY),
    []
  )
  spectatorTicketsCache = stored
  return spectatorTicketsCache
}

function rankFromRating(rating: number): RankTier {
  if (rating >= 1950) return "Grandmaster"
  if (rating >= 1800) return "Master"
  if (rating >= 1675) return "Diamond II"
  if (rating >= 1550) return "Platinum I"
  if (rating >= 1450) return "Gold III"
  if (rating >= 1350) return "Gold I"
  if (rating >= 1200) return "Silver II"
  return "Bronze I"
}

function buildProfileFromWallet(
  wallet: string,
  fallbackName?: string
): PlayerProfile {
  const short =
    wallet.length > 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet

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

function sideLabelsForGame(game: GameType) {
  if (game === "Chess Duel") {
    return { host: "White", challenger: "Black" }
  }
  if (game === "Connect 4") {
    return { host: "Red", challenger: "Yellow" }
  }
  return { host: "X", challenger: "O" }
}

function bestOfForGame(game: GameType, explicit?: 1 | 3 | 5): 1 | 3 | 5 {
  if (explicit === 1 || explicit === 3 || explicit === 5) return explicit
  if (game === "Chess Duel") return 3
  if (game === "Connect 4") return 3
  return 1
}

function createDefaultBoardState(game: GameType) {
  if (game === "Connect 4") {
    return {
      mode: "connect4-live" as const,
      board: Array.from({ length: 6 }, () =>
        Array.from({ length: 7 }, () => null as ArenaSide | null)
      ),
      turn: "host" as ArenaSide,
      turnDeadlineTs: Date.now() + CONNECT4_MOVE_SECONDS * 1000,
    }
  }

  if (game === "Tic-Tac-Toe") {
    return {
      mode: "ttt-live" as const,
      board: Array.from({ length: 9 }, () => null as "X" | "O" | null),
      turn: "X" as "X" | "O",
      turnDeadlineTs: Date.now() + TTT_MOVE_SECONDS * 1000,
    }
  }

  return {
    mode: "chess-preview" as const,
    fen: "start",
  }
}

function dbGameTypeToGameType(game: string): GameType {
  if (game === "Connect 4") return "Connect 4"
  if (game === "Tic-Tac-Toe") return "Tic-Tac-Toe"
  return "Chess Duel"
}

function dbStatusToArenaStatus(status: string): ArenaStatus {
  if (status === "Ready to Start") return "Ready to Start"
  if (status === "Live") return "Live"
  if (status === "Finished") return "Finished"
  return "Waiting for Opponent"
}

function upsertMatchLocally(match: ArenaMatch) {
  const next = [...readArenaMatches()]
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

  persistMatches(next)
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

  const host = buildProfileFromWallet(dbMatch.host_wallet, "Host")
  const challenger = dbMatch.challenger_wallet
    ? buildProfileFromWallet(dbMatch.challenger_wallet, "Challenger")
    : null

  return {
    id: dbMatch.id,
    game,
    status: dbStatusToArenaStatus(dbMatch.status),
    bettingStatus:
      challenger && dbMatch.status === "Ready to Start" ? "open" : "disabled",
    marketVisibility: challenger ? "featured" : "watch-only",
    isFeaturedMarket: !!challenger,
    bestOf: bestOfForGame(game),
    wager: Number(dbMatch.wager ?? 0),
    createdAt,
    seatedAt,
    countdownStartedAt,
    bettingClosesAt,
    startedAt: dbMatch.started_at
      ? new Date(dbMatch.started_at).getTime()
      : undefined,
    finishedAt: dbMatch.ended_at
      ? new Date(dbMatch.ended_at).getTime()
      : undefined,
    spectators: randomInt(4, 40),
    playerPot: Number(dbMatch.wager ?? 0) * (challenger ? 2 : 1),
    host,
    challenger,
    hostSideLabel: labels.host,
    challengerSideLabel: labels.challenger,
    statusText:
      challenger && dbMatch.status === "Ready to Start"
        ? "Countdown active"
        : challenger && dbMatch.status === "Live"
          ? "Match is live"
          : challenger && dbMatch.status === "Finished"
            ? "Match finished"
            : "Open seat available",
    moveText:
      challenger && dbMatch.status === "Ready to Start"
        ? "Starting soon"
        : challenger && dbMatch.status === "Live"
          ? game === "Chess Duel"
            ? "1. e4"
            : "Opening move"
          : challenger && dbMatch.status === "Finished"
            ? "Settlement pending"
            : "Waiting for join",
    roundScore: { host: 0, challenger: 0 },
    spectatorPool: { host: 0, challenger: 0 },
    bettingWindowSeconds,
    result: null,
    moveHistory: [],
    boardState: createDefaultBoardState(game),
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

export function isArenaBettable(match: ArenaMatch) {
  return (
    !!match.challenger &&
    match.status === "Ready to Start" &&
    match.bettingStatus === "open"
  )
}

function applyBetsToMatches(
  matches: ArenaMatch[],
  tickets: PersistedBetTicket[]
): ArenaMatch[] {
  return normalizeArenaMatches(
    matches.map((match) => {
      const related = tickets.filter((ticket) => ticket.matchId === match.id)
      const hostPool = related
        .filter((ticket) => ticket.side === "host")
        .reduce((sum, ticket) => sum + ticket.amount, 0)
      const challengerPool = related
        .filter((ticket) => ticket.side === "challenger")
        .reduce((sum, ticket) => sum + ticket.amount, 0)

      return {
        ...match,
        pauseState: normalizePauseState(match.pauseState),
        bettingStatus:
          match.status === "Ready to Start" &&
          !!match.bettingClosesAt &&
          match.bettingClosesAt > Date.now()
            ? "open"
            : match.status === "Live"
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
              ? normalizePauseState(match.pauseState).isPaused
                ? "Pause active"
                : "Match is live"
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
  ).map((match) => ({
    ...match,
    pauseState: normalizePauseState(match.pauseState),
  }))
}

async function hydrateMatchesFromSupabase() {
  try {
    const dbMatches = await getDbMatches()
    const mapped = dbMatches.map(mapDbMatchToArenaMatch)
    const localTickets = readSpectatorTickets()
    persistMatches(
      applyBetsToMatches(
        mapped.length ? mapped : initialArenaMatches,
        localTickets
      )
    )
  } catch (error) {
    console.error("KasRoyal hydrateMatchesFromSupabase failed", error)
  }
}

async function hydrateTicketsForMatchFromSupabase(matchId: string) {
  try {
    const rows = await getDbMatchBets(matchId)
    const local = readSpectatorTickets()
    const filteredLocal = local.filter((ticket) => ticket.matchId !== matchId)

    const mapped: PersistedBetTicket[] = rows.map((row) => {
      const match = readArenaMatches().find((item) => item.id === row.match_id)
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

    persistTickets([...filteredLocal, ...mapped])
    persistMatches(applyBetsToMatches(readArenaMatches(), readSpectatorTickets()))
  } catch (error) {
    console.error("KasRoyal hydrateTicketsForMatchFromSupabase failed", error)
  }
}

const seededArenaMatches: ArenaMatch[] = applyArenaLifecycle(
  normalizeArenaMatches(
    [
      {
        id: "arena-1",
        game: "Chess Duel",
        status: "Live",
        bettingStatus: "locked",
        marketVisibility: "featured",
        isFeaturedMarket: true,
        bestOf: 3,
        wager: 10,
        createdAt: now - 1000 * 60 * 18,
        seatedAt: now - 1000 * 60 * 17,
        countdownStartedAt: now - 1000 * 60 * 16,
        bettingClosesAt: now - 1000 * 60 * 15,
        startedAt: now - 1000 * 60 * 15,
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
          name: "KasKing01",
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
        bettingWindowSeconds: 60,
        result: null,
        moveHistory: ["1. e4", "1... c5", "2. Nf3", "2... d6", "17... Qe7"],
        boardState: {
          mode: "chess-preview",
          fen: "rnbq1rk1/pp3ppp/3bpn2/2pp4/2P5/2N1PN2/PP1PBPPP/R1BQ1RK1 w - - 0 8",
        },
        pauseState: createInitialPauseState(),
      },
      {
        id: "arena-2",
        game: "Connect 4",
        status: "Ready to Start",
        bettingStatus: "open",
        marketVisibility: "featured",
        isFeaturedMarket: true,
        bestOf: 3,
        wager: 5,
        createdAt: now - 1000 * 60 * 4,
        seatedAt: now - 1000 * 20,
        countdownStartedAt: now - 1000 * 20,
        bettingClosesAt: now + 1000 * 9,
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
        bettingWindowSeconds: 25,
        result: null,
        moveHistory: [],
        boardState: {
          mode: "connect4-live",
          board: Array.from({ length: 6 }, () =>
            Array.from({ length: 7 }, () => null as ArenaSide | null)
          ),
          turn: "host" as ArenaSide,
          turnDeadlineTs: now + 1000 * 29,
        },
        pauseState: createInitialPauseState(),
      },
      {
        id: "arena-3",
        game: "Tic-Tac-Toe",
        status: "Waiting for Opponent",
        bettingStatus: "disabled",
        marketVisibility: "watch-only",
        isFeaturedMarket: false,
        bestOf: 1,
        wager: 3,
        createdAt: now - 1000 * 60 * 2,
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
        bettingWindowSeconds: 12,
        result: null,
        moveHistory: [],
        boardState: {
          mode: "ttt-live",
          board: Array.from({ length: 9 }, () => null as "X" | "O" | null),
          turn: "X",
          turnDeadlineTs: now + 1000 * 12,
        },
        pauseState: createInitialPauseState(),
      },
    ],
    now
  ),
  now
)

export const initialArenaMatches: ArenaMatch[] = ENABLE_DEV_SEED
  ? seededArenaMatches
  : []

const leaderboardSeed: LeaderboardEntry[] = [
  {
    id: "lb-1",
    name: "KasKing01",
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

let arenaMatchesCache: ArenaMatch[] = [...initialArenaMatches]
let spectatorTicketsCache: PersistedBetTicket[] = []

if (isBrowser()) {
  loadMatchesFromLocalStorage()
  loadTicketsFromLocalStorage()

  const loaded = readArenaMatches()
  if (!loaded.length && initialArenaMatches.length) {
    persistMatches(initialArenaMatches)
  }

  void hydrateMatchesFromSupabase()
}

export function readArenaMatches() {
  if (isBrowser()) {
    loadMatchesFromLocalStorage()
  }

  const previousMatches = [...arenaMatchesCache]
  const before = JSON.stringify(previousMatches)
  const next = applyArenaLifecycle([...arenaMatchesCache], Date.now())
  const after = JSON.stringify(next)

  if (before !== after) {
    arenaMatchesCache = next

    if (isBrowser()) {
      window.localStorage.setItem(
        ARENA_MATCHES_STORAGE_KEY,
        JSON.stringify(arenaMatchesCache)
      )
      emitStorageEvent(ARENA_MATCHES_EVENT)
    }

    for (const updatedMatch of next) {
      const previous = previousMatches.find((item) => item.id === updatedMatch.id)
      if (!previous) continue

      if (previous.status !== updatedMatch.status) {
        void syncMatchToSupabase(updatedMatch)
      }
    }
  }

  return normalizeArenaMatches(
    [...arenaMatchesCache].map((match) => ({
      ...match,
      pauseState: normalizePauseState(match.pauseState),
    })),
    Date.now()
  ).map((match) => ({
    ...match,
    pauseState: normalizePauseState(match.pauseState),
  }))
}

export function readSpectatorTickets() {
  if (isBrowser()) {
    loadTicketsFromLocalStorage()
  }
  return [...spectatorTicketsCache]
}

export function readCurrentUserTickets(user = currentUser.name) {
  return readSpectatorTickets().filter((ticket) => ticket.user === user)
}

export function getArenaById(
  matchId: string,
  matches: ArenaMatch[] = readArenaMatches()
) {
  return matches.find((match) => match.id === matchId) ?? null
}

export async function getArenaByIdAsync(matchId: string) {
  try {
    const dbMatch = await getDbMatchById(matchId)
    const mapped = mapDbMatchToArenaMatch(dbMatch)
    upsertMatchLocally(mapped)
    await hydrateTicketsForMatchFromSupabase(matchId)
    return getArenaById(matchId)
  } catch (error) {
    console.error("KasRoyal getArenaByIdAsync failed", error)
    return getArenaById(matchId)
  }
}

export function updateArenaMatch(
  matchId: string,
  updater:
    | Partial<ArenaMatch>
    | ((current: ArenaMatch) => ArenaMatch | Partial<ArenaMatch>)
) {
  const next = readArenaMatches().map((match) => {
    if (match.id !== matchId) return match
    const patch = typeof updater === "function" ? updater(match) : updater
    return {
      ...match,
      ...patch,
      pauseState: normalizePauseState(
        "pauseState" in patch ? patch.pauseState : match.pauseState
      ),
    }
  })

  persistMatches(next)

  const updated = next.find((match) => match.id === matchId) ?? null

  if (updated) {
    void syncMatchToSupabase(updated)
  }

  return updated
}

async function syncMatchToSupabase(match: ArenaMatch) {
  try {
    if (
      match.status === "Ready to Start" ||
      match.status === "Live" ||
      match.status === "Finished"
    ) {
      await updateDbMatchStatus(match.id, match.status)
    }
  } catch (error) {
    console.error("KasRoyal syncMatchToSupabase failed", error)
  }
}

export function subscribeArenaMatches(callback: (matches: ArenaMatch[]) => void) {
  if (!isBrowser()) {
    return () => {}
  }

  const handler = () => {
    callback(readArenaMatches())
  }

  window.addEventListener(ARENA_MATCHES_EVENT, handler)
  window.addEventListener("storage", handler)

  return () => {
    window.removeEventListener(ARENA_MATCHES_EVENT, handler)
    window.removeEventListener("storage", handler)
  }
}

export function subscribeSpectatorTickets(
  callback: (tickets: PersistedBetTicket[]) => void
) {
  if (!isBrowser()) {
    return () => {}
  }

  const handler = () => {
    callback(readSpectatorTickets())
  }

  window.addEventListener(SPECTATOR_TICKETS_EVENT, handler)
  window.addEventListener("storage", handler)

  return () => {
    window.removeEventListener(SPECTATOR_TICKETS_EVENT, handler)
    window.removeEventListener("storage", handler)
  }
}

export function createArenaMatch(input: {
  game: GameType
  wager: number
  bestOf?: 1 | 3 | 5
  hostWallet?: string
}) {
  const wager = clampWager(input.wager)
  const hostWallet = normalizePlayerIdentity(input.hostWallet ?? currentUser.name)

  assertNoOtherActiveMatch(hostWallet)

  const profile = buildProfileFromWallet(hostWallet, currentUser.name)
  const labels = sideLabelsForGame(input.game)
  const resolvedBestOf = bestOfForGame(input.game, input.bestOf)

  const localMatch: ArenaMatch = normalizeArenaMatches(
    [
      {
        id: `arena-${cryptoSafeId()}`,
        game: input.game,
        status: "Waiting for Opponent",
        bettingStatus: "disabled",
        marketVisibility: "watch-only",
        isFeaturedMarket: false,
        bestOf: resolvedBestOf,
        wager,
        createdAt: Date.now(),
        spectators: randomInt(2, 12),
        playerPot: wager,
        host: profile,
        challenger: null,
        hostSideLabel: labels.host,
        challengerSideLabel: labels.challenger,
        statusText: "Open seat available",
        moveText: "Waiting for join",
        roundScore: { host: 0, challenger: 0 },
        spectatorPool: { host: 0, challenger: 0 },
        bettingWindowSeconds: getGameBettingWindowSeconds(input.game),
        result: null,
        moveHistory: [],
        boardState: createDefaultBoardState(input.game),
        pauseState: createInitialPauseState(),
      },
    ],
    Date.now()
  )[0]

  upsertMatchLocally(localMatch)

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

      const current = readArenaMatches()
      const withoutTemp = current.filter((match) => match.id !== localMatch.id)
      persistMatches([mapped, ...withoutTemp])
    } catch (error) {
      console.error("KasRoyal createArenaMatch background sync failed", error)
    }
  })()

  return localMatch
}

export function joinArenaMatch(matchId: string, wallet?: string): ArenaMatch | null {
  const walletAddress = normalizePlayerIdentity(wallet ?? currentUser.name)
  const existing = getArenaById(matchId)

  if (!existing) {
    return null
  }

  if (existing.challenger) {
    return existing
  }

  assertNoOtherActiveMatch(walletAddress, matchId)

  const challengerProfile = buildProfileFromWallet(walletAddress, currentUser.name)
  const countdownStartedAt = Date.now()

  const localJoined = updateArenaMatch(matchId, (current) => ({
    challenger: challengerProfile,
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
    pauseState: normalizePauseState(current.pauseState),
  }))

  void (async () => {
    try {
      const dbMatch = await joinDbMatch(matchId, walletAddress)
      const mapped = mapDbMatchToArenaMatch(dbMatch)
      upsertMatchLocally({
        ...mapped,
        challenger: challengerProfile,
        status: "Ready to Start",
        bettingStatus: "open",
        marketVisibility: "featured",
        isFeaturedMarket: true,
        countdownStartedAt: localJoined?.countdownStartedAt,
        bettingClosesAt: localJoined?.bettingClosesAt,
        startedAt: undefined,
        finishedAt: undefined,
        statusText: "Countdown active",
        moveText: `Starts in ${formatTime(getGameBettingWindowSeconds(mapped.game))}`,
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
    bettingClosesAt: nowValue,
    startedAt: nowValue,
    finishedAt: undefined,
    statusText: getLiveStatusText(
      current.game,
      current.host.name,
      current.challenger?.name ?? null,
      current.host.name
    ),
    moveText: getLiveMoveText(current.game),
    boardState: createLiveBoardState(current.game),
    pauseState: normalizePauseState(current.pauseState),
  }))
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

  const ticket: PersistedBetTicket = {
    id: `ticket-${cryptoSafeId()}`,
    user: input.user ?? currentUser.name,
    matchId: input.matchId,
    game: match.game,
    side: input.side,
    amount,
    createdAt: Date.now(),
  }

  persistTickets([...readSpectatorTickets(), ticket])
  persistMatches(applyBetsToMatches(readArenaMatches(), readSpectatorTickets()))

  try {
    await placeDbBet({
      match_id: input.matchId,
      wallet_address: input.walletAddress ?? currentUser.name,
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

export function getUserSettledPayouts(user = currentUser.name): UserSettledPayoutSummary {
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

export function getFavoriteData(
  hostRating: number,
  challengerRating: number
): FavoriteData {
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

  if (rank === "Diamond II" || rank === "Platinum I") {
    return makeRankColors("text-sky-300", "ring-sky-300/30", "bg-sky-400/10")
  }

  if (rank === "Gold III" || rank === "Gold I") {
    return makeRankColors(
      "text-emerald-300",
      "ring-emerald-300/30",
      "bg-emerald-400/10"
    )
  }

  if (rank === "Silver II") {
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
  matches: ArenaMatch[] = readArenaMatches()
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
  return buildLeaderboardFromArena(readArenaMatches())
}

export function clearArenaLocalState() {
  arenaMatchesCache = []
  spectatorTicketsCache = []

  if (!isBrowser()) return

  window.localStorage.removeItem(ARENA_MATCHES_STORAGE_KEY)
  window.localStorage.removeItem(SPECTATOR_TICKETS_STORAGE_KEY)

  emitStorageEvent(ARENA_MATCHES_EVENT)
  emitStorageEvent(SPECTATOR_TICKETS_EVENT)
}

export function seedDevArenaMatches() {
  if (!ENABLE_DEV_SEED) {
    return []
  }

  persistMatches(seededArenaMatches)
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