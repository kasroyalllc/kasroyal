export type GameType = "Chess Duel" | "Connect 4" | "Tic-Tac-Toe"

export type RankTier =
  | "Bronze I"
  | "Silver II"
  | "Gold I"
  | "Gold III"
  | "Platinum I"
  | "Diamond II"
  | "Master"
  | "Grandmaster"

export type ArenaStatus =
  | "Waiting for Opponent"
  | "Ready to Start"
  | "Live"
  | "Finished"

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

  hostSideLabel: string
  challengerSideLabel: string

  statusText: string
  moveText: string

  roundScore: {
    host: number
    challenger: number
  }

  spectatorPool: {
    host: number
    challenger: number
  }

  bettingWindowSeconds: number

  result: MatchResult

  moveHistory: string[]

  boardState?: unknown

  pauseState?: PauseState
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