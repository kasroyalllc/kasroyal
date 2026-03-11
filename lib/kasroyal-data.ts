export type ArenaStatus = "OPEN" | "LIVE" | "SETTLING"
export type GameKey = "chess" | "connect4" | "tictactoe"

export type Arena = {
  id: string
  slug: string
  game: GameKey
  title: string
  entry: number
  prizePool: number
  players: {
    left: {
      name: string
      rating: number
      avatar: string
    }
    right: {
      name: string
      rating: number
      avatar: string
    }
  }
  spectators: number
  betsVolume: number
  status: ArenaStatus
  moveCount?: number
  timeControl?: string
  featured?: boolean
}

export type LeaderboardPlayer = {
  id: string
  rank: number
  name: string
  avatar: string
  rating: number
  wins: number
  winRate: number
  kasWon: number
  streak: number
}

export type TickerItem = {
  id: string
  label: string
}

export type HomePayload = {
  featuredArena: Arena
  liveArenas: Arena[]
  skillArenas: {
    key: GameKey
    name: string
    description: string
    liveMatches: number
    avgEntry: number
    topPrize: number
  }[]
  leaderboard: LeaderboardPlayer[]
  ticker: TickerItem[]
}

const avatars = [
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalAlpha",
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalBravo",
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalCharlie",
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalDelta",
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalEcho",
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalFoxtrot",
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalGold",
  "https://api.dicebear.com/7.x/shapes/svg?seed=KasRoyalEmerald",
]

function n(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function kas(num: number) {
  return Math.round(num * 100) / 100
}

export function getKasRoyalHomeData(): HomePayload {
  const liveArenas: Arena[] = [
    {
      id: "arena-001",
      slug: "grandmaster-blitz-001",
      game: "chess",
      title: "Grandmaster Blitz Duel",
      entry: 25,
      prizePool: 52.5,
      players: {
        left: { name: "CrownMind", rating: 1986, avatar: avatars[0] },
        right: { name: "KasKnight", rating: 2014, avatar: avatars[1] },
      },
      spectators: n(120, 240),
      betsVolume: kas(n(90, 210)),
      status: "LIVE",
      moveCount: n(8, 34),
      timeControl: "3+2",
      featured: true,
    },
    {
      id: "arena-002",
      slug: "connect4-clash-002",
      game: "connect4",
      title: "Connect 4 Ladder Clash",
      entry: 10,
      prizePool: 21,
      players: {
        left: { name: "EmeraldDrop", rating: 1540, avatar: avatars[2] },
        right: { name: "GoldFork", rating: 1508, avatar: avatars[3] },
      },
      spectators: n(30, 90),
      betsVolume: kas(n(20, 70)),
      status: "LIVE",
      moveCount: n(4, 16),
      timeControl: "Fast Match",
    },
    {
      id: "arena-003",
      slug: "ttt-speed-003",
      game: "tictactoe",
      title: "Tic-Tac-Toe Speed Arena",
      entry: 5,
      prizePool: 10.5,
      players: {
        left: { name: "QuickMint", rating: 1322, avatar: avatars[4] },
        right: { name: "NovaGrid", rating: 1360, avatar: avatars[5] },
      },
      spectators: n(10, 40),
      betsVolume: kas(n(8, 22)),
      status: "OPEN",
      timeControl: "Instant",
    },
    {
      id: "arena-004",
      slug: "chess-pro-room-004",
      game: "chess",
      title: "Elite Ranked Chess Room",
      entry: 50,
      prizePool: 105,
      players: {
        left: { name: "RoyalVision", rating: 2144, avatar: avatars[6] },
        right: { name: "ForkedKing", rating: 2097, avatar: avatars[7] },
      },
      spectators: n(80, 180),
      betsVolume: kas(n(110, 260)),
      status: "SETTLING",
      moveCount: n(24, 58),
      timeControl: "5+0",
    },
  ]

  const leaderboard: LeaderboardPlayer[] = [
    {
      id: "lb-1",
      rank: 1,
      name: "RoyalVision",
      avatar: avatars[6],
      rating: 2144,
      wins: 188,
      winRate: 73,
      kasWon: 1422.8,
      streak: 8,
    },
    {
      id: "lb-2",
      rank: 2,
      name: "KasKnight",
      avatar: avatars[1],
      rating: 2014,
      wins: 164,
      winRate: 69,
      kasWon: 1184.35,
      streak: 5,
    },
    {
      id: "lb-3",
      rank: 3,
      name: "CrownMind",
      avatar: avatars[0],
      rating: 1986,
      wins: 159,
      winRate: 67,
      kasWon: 1095.9,
      streak: 4,
    },
    {
      id: "lb-4",
      rank: 4,
      name: "EmeraldDrop",
      avatar: avatars[2],
      rating: 1540,
      wins: 121,
      winRate: 64,
      kasWon: 622.4,
      streak: 2,
    },
    {
      id: "lb-5",
      rank: 5,
      name: "NovaGrid",
      avatar: avatars[5],
      rating: 1360,
      wins: 98,
      winRate: 60,
      kasWon: 410.2,
      streak: 3,
    },
  ]

  const skillArenas = [
    {
      key: "chess" as const,
      name: "Chess Duel",
      description: "Premium head-to-head skill battles with ranked rooms, time controls, and spectator action.",
      liveMatches: 12,
      avgEntry: 24,
      topPrize: 180,
    },
    {
      key: "connect4" as const,
      name: "Connect 4",
      description: "Fast tactical matches built for repeat play, ladders, and lightweight betting action.",
      liveMatches: 18,
      avgEntry: 9,
      topPrize: 52,
    },
    {
      key: "tictactoe" as const,
      name: "Tic-Tac-Toe",
      description: "Instant 1v1 micro-arenas designed for speed, onboarding, and casual competitive grind.",
      liveMatches: 24,
      avgEntry: 4,
      topPrize: 20,
    },
  ]

  const ticker: TickerItem[] = [
    { id: "t1", label: "Chess Duel pools are filling fast" },
    { id: "t2", label: "Spectator betting enabled in featured arenas" },
    { id: "t3", label: "Leaderboard season rewards rotate daily" },
    { id: "t4", label: "Profile uploads and arena identity are live" },
    { id: "t5", label: "KasRoyal skill-first ecosystem online" },
  ]

  const featuredArena =
    liveArenas.find((arena) => arena.featured) ?? liveArenas[0]

  return {
    featuredArena,
    liveArenas,
    skillArenas,
    leaderboard,
    ticker,
  }
}