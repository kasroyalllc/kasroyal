import {
  type ArenaMatch,
  type ArenaSide,
  type ArenaStatus,
  type GameType,
  type LeaderboardEntry,
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
  isArenaBettable,
  isArenaSpectatable,
  normalizeArenaMatches,
} from "@/lib/engine/lifecycle"
import { gameDisplayOrder } from "@/lib/engine/featured-markets"

export type {
  ArenaMatch,
  ArenaSide,
  ArenaStatus,
  GameType,
  LeaderboardEntry,
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
  isArenaBettable,
  isArenaSpectatable,
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

export const currentUser: PlayerProfile & {
  walletBalance: number
} = {
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

const now = Date.now()

const ARENA_MATCHES_STORAGE_KEY = "kasroyal_arena_matches"
const ARENA_MATCHES_EVENT = "kasroyal-arena-matches-updated"

const SPECTATOR_TICKETS_STORAGE_KEY = "kasroyal_spectator_tickets"
const SPECTATOR_TICKETS_EVENT = "kasroyal-spectator-tickets-updated"

export const initialArenaMatches: ArenaMatch[] = [
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
    roundScore: {
      host: 0,
      challenger: 1,
    },
    spectatorPool: {
      host: 31,
      challenger: 42,
    },
    bettingWindowSeconds: 60,
    result: null,
    moveHistory: ["1. e4", "1... c5", "2. Nf3", "2... d6", "17... Qe7"],
    boardState: {
      mode: "chess-preview",
      fen: "r1bq1rk1/pp2bppp/2np1n2/2p1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9",
    },
  },
  {
    id: "arena-2",
    game: "Connect 4",
    status: "Live",
    bettingStatus: "locked",
    marketVisibility: "featured",
    isFeaturedMarket: true,
    bestOf: 3,
    wager: 5,
    createdAt: now - 1000 * 60 * 12,
    seatedAt: now - 1000 * 60 * 11,
    countdownStartedAt: now - 1000 * 60 * 10,
    bettingClosesAt: now - 1000 * 60 * 10 + 25 * 1000,
    startedAt: now - 1000 * 60 * 10 + 25 * 1000,
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
    hostSideLabel: "Yellow",
    challengerSideLabel: "Green",
    statusText: "Match is live",
    moveText: "Yellow threatens column 4",
    roundScore: {
      host: 1,
      challenger: 1,
    },
    spectatorPool: {
      host: 18,
      challenger: 22,
    },
    bettingWindowSeconds: 25,
    result: null,
    moveHistory: ["Y@4", "G@3", "Y@5", "G@4", "Y threatens column 4"],
    boardState: {
      mode: "connect4-preview",
    },
  },
  {
    id: "arena-3",
    game: "Tic-Tac-Toe",
    status: "Live",
    bettingStatus: "locked",
    marketVisibility: "featured",
    isFeaturedMarket: true,
    bestOf: 5,
    wager: 2,
    createdAt: now - 1000 * 60 * 7,
    seatedAt: now - 1000 * 60 * 6,
    countdownStartedAt: now - 1000 * 60 * 5,
    bettingClosesAt: now - 1000 * 60 * 5 + 12 * 1000,
    startedAt: now - 1000 * 60 * 5 + 12 * 1000,
    spectators: 11,
    playerPot: 4,
    host: {
      name: "StakeLord",
      rank: "Master",
      rating: 1910,
      winRate: 67,
      last10: "8-2",
    },
    challenger: {
      name: "FlashMove",
      rank: "Silver II",
      rating: 1318,
      winRate: 48,
      last10: "4-6",
    },
    hostSideLabel: "X",
    challengerSideLabel: "O",
    statusText: "Match is live",
    moveText: "X controls center",
    roundScore: {
      host: 1,
      challenger: 2,
    },
    spectatorPool: {
      host: 7,
      challenger: 5,
    },
    bettingWindowSeconds: 12,
    result: null,
    moveHistory: ["X center", "O corner", "X pressure"],
    boardState: {
      mode: "ttt-preview",
    },
  },
  {
    id: "arena-4",
    game: "Connect 4",
    status: "Waiting for Opponent",
    bettingStatus: "disabled",
    marketVisibility: "watch-only",
    isFeaturedMarket: false,
    bestOf: 3,
    wager: 8,
    createdAt: now - 1000 * 60 * 3,
    spectators: 6,
    playerPot: 8,
    host: {
      name: "BrettBlitz",
      rank: "Gold I",
      rating: 1511,
      winRate: 55,
      last10: "6-4",
    },
    challenger: null,
    hostSideLabel: "Yellow",
    challengerSideLabel: "Green",
    statusText: "Open seat available",
    moveText: "Waiting for join",
    roundScore: {
      host: 0,
      challenger: 0,
    },
    spectatorPool: {
      host: 0,
      challenger: 0,
    },
    bettingWindowSeconds: 25,
    result: null,
    moveHistory: [],
  },
]

export const gameMeta: Record<
  GameType,
  {
    subtitle: string
    accent: string
    glow: string
    cta: string
  }
> = {
  "Chess Duel": {
    subtitle: "Skill-heavy strategic 1v1 betting arena",
    accent: "text-amber-300",
    glow: "border-amber-300/20 bg-amber-300/10",
    cta: "Enter Chess Arena",
  },
  "Connect 4": {
    subtitle: "Fast tactical rounds with strong spectator appeal",
    accent: "text-emerald-300",
    glow: "border-emerald-300/20 bg-emerald-300/10",
    cta: "Enter Connect 4 Arena",
  },
  "Tic-Tac-Toe": {
    subtitle: "Quick matches for casual arena volume",
    accent: "text-sky-300",
    glow: "border-sky-300/20 bg-sky-300/10",
    cta: "Enter Tic-Tac-Toe Arena",
  },
}

export const initialLeaderboard: LeaderboardEntry[] = [
  {
    id: "lb-1",
    name: "StakeLord",
    rank: "Master",
    rating: 1910,
    winRate: 67,
    wins: 172,
    losses: 84,
    streak: "W2",
    favoriteGame: "Tic-Tac-Toe",
    earnings: 1185,
    avatarGlow: "fuchsia",
  },
  {
    id: "lb-2",
    name: "KasKing01",
    rank: "Diamond II",
    rating: 1842,
    winRate: 61,
    wins: 148,
    losses: 95,
    streak: "W4",
    favoriteGame: "Chess Duel",
    earnings: 1240,
    avatarGlow: "amber",
  },
  {
    id: "lb-3",
    name: "LuckyDog23",
    rank: "Platinum I",
    rating: 1608,
    winRate: 59,
    wins: 121,
    losses: 84,
    streak: "W3",
    favoriteGame: "Connect 4",
    earnings: 860,
    avatarGlow: "emerald",
  },
  {
    id: "lb-4",
    name: "CryptoCrush44",
    rank: "Gold I",
    rating: 1528,
    winRate: 53,
    wins: 98,
    losses: 87,
    streak: "L2",
    favoriteGame: "Chess Duel",
    earnings: 715,
    avatarGlow: "amber",
  },
  {
    id: "lb-5",
    name: "TurboBetGuy",
    rank: "Gold III",
    rating: 1492,
    winRate: 57,
    wins: 109,
    losses: 82,
    streak: "W1",
    favoriteGame: "Connect 4",
    earnings: 910,
    avatarGlow: "emerald",
  },
  {
    id: "lb-6",
    name: "FlashMove",
    rank: "Silver II",
    rating: 1318,
    winRate: 48,
    wins: 76,
    losses: 81,
    streak: "L1",
    favoriteGame: "Tic-Tac-Toe",
    earnings: 420,
    avatarGlow: "sky",
  },
]

function isBrowser() {
  return typeof window !== "undefined"
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function cloneArenaMatches(matches: ArenaMatch[] = initialArenaMatches): ArenaMatch[] {
  return deepClone(matches)
}

function dispatchArenaMatchesUpdated() {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(ARENA_MATCHES_EVENT))
}

function dispatchSpectatorTicketsUpdated() {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(SPECTATOR_TICKETS_EVENT))
}

function hydrateMatches(matches: ArenaMatch[]) {
  return normalizeArenaMatches(cloneArenaMatches(matches))
}

function persistArenaMatches(matches: ArenaMatch[], dispatch = true) {
  if (!isBrowser()) return
  const normalized = hydrateMatches(matches)
  window.localStorage.setItem(ARENA_MATCHES_STORAGE_KEY, JSON.stringify(normalized))
  if (dispatch) {
    dispatchArenaMatchesUpdated()
  }
}

function normalizeTicket(ticket: PersistedBetTicket): PersistedBetTicket {
  return {
    id: ticket.id,
    user: ticket.user,
    matchId: ticket.matchId,
    game: ticket.game,
    side: ticket.side,
    amount: clampBetAmount(ticket.amount),
    createdAt: ticket.createdAt,
  }
}

function persistSpectatorTickets(tickets: PersistedBetTicket[], dispatch = true) {
  if (!isBrowser()) return
  const normalized = tickets.map(normalizeTicket).sort((a, b) => b.createdAt - a.createdAt)
  window.localStorage.setItem(SPECTATOR_TICKETS_STORAGE_KEY, JSON.stringify(normalized))
  if (dispatch) {
    dispatchSpectatorTicketsUpdated()
  }
}

export function readSpectatorTickets(): PersistedBetTicket[] {
  if (!isBrowser()) {
    return []
  }

  const stored = window.localStorage.getItem(SPECTATOR_TICKETS_STORAGE_KEY)
  if (!stored) return []

  try {
    const parsed = JSON.parse(stored) as PersistedBetTicket[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeTicket).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export function readCurrentUserTickets(user = currentUser.name) {
  return readSpectatorTickets().filter((ticket) => ticket.user === user)
}

export function writeSpectatorTickets(tickets: PersistedBetTicket[]) {
  if (!isBrowser()) return
  persistSpectatorTickets(tickets, true)
}

export function clearSpectatorTickets() {
  if (!isBrowser()) return
  window.localStorage.removeItem(SPECTATOR_TICKETS_STORAGE_KEY)
  dispatchSpectatorTicketsUpdated()
}

export function subscribeSpectatorTickets(listener: () => void) {
  if (!isBrowser()) {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SPECTATOR_TICKETS_STORAGE_KEY) {
      listener()
    }
  }

  const handleCustom = () => {
    listener()
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(SPECTATOR_TICKETS_EVENT, handleCustom)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(SPECTATOR_TICKETS_EVENT, handleCustom)
  }
}

export function ensureSpectatorTicketsSeeded() {
  if (!isBrowser()) return
  const stored = window.localStorage.getItem(SPECTATOR_TICKETS_STORAGE_KEY)
  if (!stored) {
    window.localStorage.setItem(SPECTATOR_TICKETS_STORAGE_KEY, JSON.stringify([]))
  }
}

export function getTicketsForMatch(matchId: string, user = currentUser.name) {
  return readCurrentUserTickets(user).filter((ticket) => ticket.matchId === matchId)
}

export function getTicketExposureByMatch(matchId: string, user = currentUser.name) {
  const tickets = getTicketsForMatch(matchId, user)

  const host = tickets
    .filter((ticket) => ticket.side === "host")
    .reduce((sum, ticket) => sum + ticket.amount, 0)

  const challenger = tickets
    .filter((ticket) => ticket.side === "challenger")
    .reduce((sum, ticket) => sum + ticket.amount, 0)

  return {
    host,
    challenger,
    total: host + challenger,
  }
}

export function readArenaMatches(): ArenaMatch[] {
  if (!isBrowser()) {
    return hydrateMatches(initialArenaMatches)
  }

  const stored = window.localStorage.getItem(ARENA_MATCHES_STORAGE_KEY)

  if (!stored) {
    const seeded = hydrateMatches(initialArenaMatches)
    window.localStorage.setItem(ARENA_MATCHES_STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }

  try {
    const parsed = JSON.parse(stored) as ArenaMatch[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = hydrateMatches(initialArenaMatches)
      window.localStorage.setItem(ARENA_MATCHES_STORAGE_KEY, JSON.stringify(seeded))
      return seeded
    }

    const normalized = hydrateMatches(parsed)
    const normalizedString = JSON.stringify(normalized)

    if (normalizedString !== stored) {
      window.localStorage.setItem(ARENA_MATCHES_STORAGE_KEY, normalizedString)
    }

    return normalized
  } catch {
    const seeded = hydrateMatches(initialArenaMatches)
    window.localStorage.setItem(ARENA_MATCHES_STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
}

export function writeArenaMatches(matches: ArenaMatch[]) {
  if (!isBrowser()) return
  persistArenaMatches(matches, true)
}

export function ensureArenaMatchesSeeded() {
  if (!isBrowser()) return
  const stored = window.localStorage.getItem(ARENA_MATCHES_STORAGE_KEY)
  if (!stored) {
    writeArenaMatches(initialArenaMatches)
  }
}

export function resetArenaMatches() {
  writeArenaMatches(initialArenaMatches)
}

export function subscribeArenaMatches(listener: () => void) {
  if (!isBrowser()) {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === ARENA_MATCHES_STORAGE_KEY) {
      listener()
    }
  }

  const handleCustom = () => {
    listener()
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(ARENA_MATCHES_EVENT, handleCustom)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(ARENA_MATCHES_EVENT, handleCustom)
  }
}

export function getArenaById(id: string, matches: ArenaMatch[] = initialArenaMatches): ArenaMatch | null {
  return hydrateMatches(matches).find((match) => match.id === id) ?? null
}

export function readArenaById(id: string): ArenaMatch | null {
  return getArenaById(id, readArenaMatches())
}

export function getFavoriteData(leftRating: number, rightRating: number) {
  const diff = Math.abs(leftRating - rightRating)

  if (diff < 75) {
    return {
      leftLabel: "Even Match",
      rightLabel: "Even Match",
    }
  }

  const leftFavored = leftRating > rightRating

  return {
    leftLabel: leftFavored ? "Favorite" : diff >= 250 ? "Heavy Underdog" : "Underdog",
    rightLabel: !leftFavored ? "Favorite" : diff >= 250 ? "Heavy Underdog" : "Underdog",
  }
}

export function getEdgeText(leftRating: number, rightRating: number) {
  const diff = Math.abs(leftRating - rightRating)
  if (diff < 75) return "Minimal Skill Edge"
  if (diff < 150) return "Moderate Skill Edge"
  if (diff < 250) return "Strong Skill Edge"
  return "Massive Skill Edge"
}

export function getWinProbability(ratingA: number, ratingB: number) {
  const exponent = (ratingB - ratingA) / 400
  return 1 / (1 + Math.pow(10, exponent))
}

export function getRankColors(rank: RankTier) {
  if (rank.startsWith("Bronze")) {
    return "border-orange-400/25 bg-orange-400/10 text-orange-300"
  }
  if (rank.startsWith("Silver")) {
    return "border-zinc-300/25 bg-zinc-300/10 text-zinc-200"
  }
  if (rank.startsWith("Gold")) {
    return "border-amber-300/25 bg-amber-300/10 text-amber-300"
  }
  if (rank.startsWith("Platinum")) {
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-300"
  }
  if (rank.startsWith("Diamond")) {
    return "border-sky-300/25 bg-sky-300/10 text-sky-300"
  }
  if (rank === "Master") {
    return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-300"
  }
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-300"
}

export function buildFeaturedSpectateMarkets(matches: ArenaMatch[] = readArenaMatches()) {
  const normalized = hydrateMatches(matches)

  return gameDisplayOrder
    .map((game) => {
      const candidates = normalized
        .filter((match) => match.game === game)
        .filter(isArenaSpectatable)
        .sort((a, b) => {
          const aScore = a.isFeaturedMarket
            ? a.status === "Ready to Start"
              ? 5
              : a.status === "Live"
              ? 4
              : 0
            : a.status === "Ready to Start"
            ? 3
            : a.status === "Live"
            ? 2
            : 0

          const bScore = b.isFeaturedMarket
            ? b.status === "Ready to Start"
              ? 5
              : b.status === "Live"
              ? 4
              : 0
            : b.status === "Ready to Start"
            ? 3
            : b.status === "Live"
            ? 2
            : 0

          if (bScore !== aScore) return bScore - aScore
          if (b.playerPot !== a.playerPot) return b.playerPot - a.playerPot
          if (b.spectators !== a.spectators) return b.spectators - a.spectators
          return b.createdAt - a.createdAt
        })

      return candidates[0] ?? null
    })
    .filter((match): match is ArenaMatch => Boolean(match))
}

export function createArenaMatch(params: {
  game: GameType
  wager: number
  bestOf: 1 | 3 | 5
  host?: PlayerProfile
}) {
  const host = params.host ?? {
    name: currentUser.name,
    rank: currentUser.rank,
    rating: currentUser.rating,
    winRate: currentUser.winRate,
    last10: currentUser.last10,
  }

  const challengerSideLabel =
    params.game === "Chess Duel" ? "Black" : params.game === "Connect 4" ? "Green" : "O"

  const hostSideLabel =
    params.game === "Chess Duel" ? "White" : params.game === "Connect 4" ? "Yellow" : "X"

  const nextMatch: ArenaMatch = {
    id: `arena-${Date.now()}`,
    game: params.game,
    status: "Waiting for Opponent",
    bettingStatus: "disabled",
    marketVisibility: "watch-only",
    isFeaturedMarket: false,
    bestOf: params.bestOf,
    wager: clampWager(params.wager),
    createdAt: Date.now(),
    spectators: 0,
    playerPot: clampWager(params.wager),
    host,
    challenger: null,
    hostSideLabel,
    challengerSideLabel,
    statusText: "Open seat available",
    moveText: "Waiting for join",
    roundScore: {
      host: 0,
      challenger: 0,
    },
    spectatorPool: {
      host: 0,
      challenger: 0,
    },
    bettingWindowSeconds: getGameBettingWindowSeconds(params.game),
    result: null,
    moveHistory: [],
  }

  const matches = readArenaMatches()
  writeArenaMatches([nextMatch, ...matches])
  return readArenaById(nextMatch.id) ?? nextMatch
}

export function joinArenaMatch(matchId: string, challenger?: PlayerProfile) {
  const challengerProfile = challenger ?? {
    name: currentUser.name,
    rank: currentUser.rank,
    rating: currentUser.rating,
    winRate: currentUser.winRate,
    last10: currentUser.last10,
  }

  const matches = readArenaMatches()
  const target = matches.find((item) => item.id === matchId)

  if (!target) {
    throw new Error("Arena not found.")
  }

  if (target.host.name === challengerProfile.name) {
    throw new Error("You already host this arena.")
  }

  if (target.status !== "Waiting for Opponent") {
    throw new Error("This arena is no longer open for joining.")
  }

  const seatedAt = Date.now()

  const nextMatches = matches.map((match) =>
    match.id === matchId
      ? {
          ...match,
          challenger: challengerProfile,
          status: "Ready to Start" as ArenaStatus,
          bettingStatus: "disabled" as const,
          seatedAt,
          countdownStartedAt: undefined,
          bettingClosesAt: undefined,
          startedAt: undefined,
          spectators: match.spectators + 3,
          playerPot: match.wager * 2,
          statusText: "Both players seated",
          moveText: "Ready for launch",
        }
      : match
  )

  writeArenaMatches(nextMatches)
  return readArenaById(matchId)
}

export function autoFillArenaMatch(matchId: string) {
  const matches = readArenaMatches()
  const target = matches.find((item) => item.id === matchId)

  if (!target) {
    throw new Error("Arena not found.")
  }

  if (target.status !== "Waiting for Opponent") {
    throw new Error("This arena is no longer open for auto-fill.")
  }

  const availableOpponents = mockOpponentPool.filter((player) => player.name !== target.host.name)
  const challengerProfile =
    availableOpponents[Math.floor(Math.random() * availableOpponents.length)] ?? mockOpponentPool[0]

  return joinArenaMatch(matchId, challengerProfile)
}

export function launchArenaMatch(matchId: string) {
  const matches = readArenaMatches()
  const target = matches.find((item) => item.id === matchId)

  if (!target) {
    throw new Error("Arena not found.")
  }

  if (target.status === "Waiting for Opponent") {
    throw new Error("This arena still needs an opponent before gameplay can start.")
  }

  if (!target.challenger) {
    throw new Error("Both players must be seated before launch.")
  }

  if (target.status === "Live") {
    return target
  }

  const countdownStartedAt = Date.now()
  const bettingWindowSeconds = getGameBettingWindowSeconds(target.game)

  const nextMatches = matches.map((match) =>
    match.id === matchId
      ? {
          ...match,
          status: "Ready to Start" as ArenaStatus,
          countdownStartedAt,
          bettingClosesAt: countdownStartedAt + bettingWindowSeconds * 1000,
          bettingWindowSeconds,
          spectators: match.spectators + 7,
          statusText: "Launch countdown started",
          moveText: "Countdown live",
        }
      : match
  )

  writeArenaMatches(nextMatches)
  return readArenaById(matchId)
}

export function updateArenaMatch(matchId: string, updater: (match: ArenaMatch) => ArenaMatch) {
  const matches = readArenaMatches()
  const target = matches.find((item) => item.id === matchId)

  if (!target) {
    throw new Error("Arena not found.")
  }

  const nextMatches = matches.map((match) => (match.id === matchId ? updater(match) : match))
  writeArenaMatches(nextMatches)
  return readArenaById(matchId)
}

export function placeArenaSpectatorBet(matchId: string, side: ArenaSide, amount: number) {
  const safeAmount = clampBetAmount(amount)
  const currentMatch = readArenaById(matchId)

  if (!currentMatch) {
    throw new Error("Arena not found.")
  }

  const ticket: PersistedBetTicket = {
    id: `${matchId}-${Date.now()}`,
    user: currentUser.name,
    matchId,
    game: currentMatch.game,
    side,
    amount: safeAmount,
    createdAt: Date.now(),
  }

  const updatedMatch = updateArenaMatch(matchId, (match) => {
    const normalizedMatch = normalizeArenaMatches([match])[0]

    if (!isArenaBettable(normalizedMatch)) {
      throw new Error("This match is not currently open for spectator betting.")
    }

    return {
      ...normalizedMatch,
      spectators: normalizedMatch.spectators + 1,
      spectatorPool: {
        host:
          side === "host"
            ? normalizedMatch.spectatorPool.host + safeAmount
            : normalizedMatch.spectatorPool.host,
        challenger:
          side === "challenger"
            ? normalizedMatch.spectatorPool.challenger + safeAmount
            : normalizedMatch.spectatorPool.challenger,
      },
    }
  })

  const existingTickets = readSpectatorTickets()
  writeSpectatorTickets([ticket, ...existingTickets])

  return {
    match: updatedMatch,
    ticket,
  }
}

export function buildLeaderboardFromArena(matches: ArenaMatch[] = readArenaMatches()): LeaderboardEntry[] {
  const map = new Map<string, LeaderboardEntry>()

  function upsertPlayer(player: PlayerProfile | null, game: GameType, fallbackEarnings: number) {
    if (!player) return

    const existing = map.get(player.name)

    if (!existing) {
      const wins = Math.max(1, Math.round((player.winRate / 100) * 180))
      const losses = Math.max(1, Math.round(((100 - player.winRate) / 100) * 120))

      map.set(player.name, {
        id: `lb-${player.name.toLowerCase()}`,
        name: player.name,
        rank: player.rank,
        rating: player.rating,
        winRate: player.winRate,
        wins,
        losses,
        streak: player.last10.includes("8-2") || player.last10.includes("7-3") ? "W3" : "W1",
        favoriteGame: game,
        earnings: fallbackEarnings,
        avatarGlow:
          player.rank === "Master"
            ? "fuchsia"
            : player.rank.startsWith("Diamond")
            ? "sky"
            : player.rank.startsWith("Gold")
            ? "amber"
            : "emerald",
      })
      return
    }

    existing.rating = Math.max(existing.rating, player.rating)
    existing.winRate = Math.max(existing.winRate, player.winRate)
    existing.earnings += Math.round(fallbackEarnings * 0.35)

    if (player.rating >= existing.rating) {
      existing.favoriteGame = game
      existing.rank = player.rank
    }
  }

  matches.forEach((match) => {
    upsertPlayer(match.host, match.game, match.playerPot + match.spectators * 4)
    upsertPlayer(match.challenger, match.game, Math.round(match.playerPot * 0.9) + match.spectators * 3)
  })

  const merged = [...initialLeaderboard]

  map.forEach((player) => {
    const idx = merged.findIndex((entry) => entry.name === player.name)
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        rank: player.rank,
        rating: Math.max(merged[idx].rating, player.rating),
        winRate: Math.max(merged[idx].winRate, player.winRate),
        favoriteGame: player.favoriteGame,
        earnings: Math.max(merged[idx].earnings, player.earnings),
      }
    } else {
      merged.push(player)
    }
  })

  return merged
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating
      if (b.winRate !== a.winRate) return b.winRate - a.winRate
      return b.earnings - a.earnings
    })
    .map((entry, index) => ({
      ...entry,
      streak:
        entry.streak ||
        (entry.winRate >= 60 ? "W3" : entry.winRate >= 50 ? "W1" : "L1"),
      id: entry.id || `lb-${index + 1}`,
    }))
}