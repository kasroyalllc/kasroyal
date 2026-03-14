export type GameType = "Chess Duel" | "Connect 4" | "Rock Paper Scissors" | "Tic-Tac-Toe"

/** Full ranked ladder: Bronze III → Grandmaster. XP bar per rank; wins/losses/forfeits affect XP. */
export type RankTier =
  | "Bronze III"
  | "Bronze II"
  | "Bronze I"
  | "Silver III"
  | "Silver II"
  | "Silver I"
  | "Gold III"
  | "Gold II"
  | "Gold I"
  | "Platinum III"
  | "Platinum II"
  | "Platinum I"
  | "Diamond III"
  | "Diamond II"
  | "Diamond I"
  | "Master"
  | "Grandmaster"

export type ArenaStatus =
  | "Waiting for Opponent"
  | "Ready to Start"
  | "Live"
  | "Finished"

/** Quick Match = free play, no wallet/betting/rank. Ranked = wallet, wagers, spectator betting. */
export type MatchMode = "quick" | "ranked"

export type ArenaSide = "host" | "challenger"

export type BettingStatus =
  | "disabled"
  | "open"
  | "locked"
  | "settling"
  | "settled"

export type MarketVisibility = "featured" | "watch-only"

export type MatchResult = ArenaSide | "draw" | null

export type PlayerProfile = {
  name: string
  rank: RankTier
  rating: number
  winRate: number
  last10: string
}

export type PauseState = {
  isPaused: boolean
  pausedBy: ArenaSide | null
  pauseExpiresAt: number | null
  pauseCountHost: number
  pauseCountChallenger: number
}

export type ArenaMatch = {
  id: string
  game: GameType
  status: ArenaStatus
  /** quick = no betting/rank; ranked = wallet + spectator betting */
  matchMode?: MatchMode
  bettingStatus: BettingStatus
  marketVisibility: MarketVisibility
  isFeaturedMarket: boolean

  bestOf: 1 | 3 | 5
  wager: number

  createdAt: number
  seatedAt?: number
  countdownStartedAt?: number
  bettingClosesAt?: number
  startedAt?: number
  finishedAt?: number

  spectators: number
  playerPot: number

  host: PlayerProfile
  challenger: PlayerProfile | null
  /** Canonical identity for host (wallet address or guest id). Used for active-match and turn logic. */
  hostIdentityId?: string
  /** Canonical identity for challenger. */
  challengerIdentityId?: string

  hostSideLabel: string
  challengerSideLabel: string

  statusText: string
  moveText: string

  roundScore: {
    host: number
    challenger: number
  }
  /** Current round in a best-of series (1-based). */
  currentRound?: number

  spectatorPool: {
    host: number
    challenger: number
  }

  bettingWindowSeconds: number

  result: MatchResult
  /** Win reason from backend: win, draw, timeout, forfeit. */
  winReason?: string | null
  /** DB-authoritative turn deadline (ms). Used for "time left" display only. */
  turnExpiresAt?: number | null

  moveHistory: string[]

  boardState?: unknown

  pauseState?: PauseState

  /** Timeout strikes (move timer expired). After 3, that side loses. Connect 4 / Tic-Tac-Toe only. */
  timeoutStrikesHost?: number
  timeoutStrikesChallenger?: number
  /** Between-round intermission: server sets when round ends (BO3/BO5). Next round starts when expired (ms). */
  roundIntermissionUntil?: number | null
  /** During intermission: identity of round winner for "X won Round N" (null = draw). */
  lastRoundWinnerIdentityId?: string | null
}

export type SpectatorTicket = {
  id: string
  matchId: string
  side: ArenaSide
  amount: number
  createdAt: number
}

export type LeaderboardEntry = {
  id: string
  name: string
  rank: RankTier
  rating: number
  winRate: number
  wins: number
  losses: number
  streak: string
  favoriteGame: GameType
  earnings: number
  avatarGlow?: "amber" | "emerald" | "sky" | "fuchsia"
}
export type MatchEvent =
  | { type: "ROOM_CREATED"; matchId: string; ts: number }
  | { type: "PLAYERS_SEATED"; matchId: string; ts: number }
  | { type: "BETTING_OPENED"; matchId: string; closesAt: number; ts: number }
  | { type: "BETTING_LOCKED"; matchId: string; ts: number }
  | { type: "MATCH_STARTED"; matchId: string; ts: number }
  | { type: "MOVE_ACCEPTED"; matchId: string; move: string; ts: number }
  | { type: "MATCH_FINISHED"; matchId: string; winner: ArenaSide | "draw"; ts: number }
  | { type: "SETTLEMENT_COMPLETED"; matchId: string; ts: number }
