/**
 * Shared room / profile / chat / bet types for Supabase-backed room state.
 * Used by rooms-service, API routes, and UI when reading from backend.
 *
 * Transitional schema: DB has both old columns (host_wallet, wager, started_at, ended_at)
 * and new columns (host_identity_id, wager_amount, live_started_at, finished_at, etc.).
 * We prefer new fields and fall back to old for compatibility.
 */

export type MatchMode = "quick" | "ranked"

export type GameType = "Chess Duel" | "Connect 4" | "Rock Paper Scissors" | "Tic-Tac-Toe"

/** Backend status; maps to UI ArenaStatus. */
export type RoomStatus =
  | "waiting"
  | "ready"
  | "live"
  | "finished"
  | "forfeited"
  | "canceled"

export type IdentityType = "guest" | "wallet"

export type MatchSide = "host" | "challenger"

/** Profile row from Supabase profiles table. */
export type ProfileRecord = {
  id: string
  identity_id: string
  identity_type: IdentityType
  wallet_address: string | null
  display_name: string
  avatar_url: string | null
  rank_tier: string | null
  xp: number
  wins: number
  losses: number
  forfeits: number
  created_at: string
  updated_at: string
}

/** Match row from Supabase matches table (authoritative room state). New schema. */
export type RoomRecord = {
  id: string
  mode: MatchMode
  game_type: GameType
  status: RoomStatus
  host_identity_id: string
  challenger_identity_id: string | null
  host_profile_id: string | null
  challenger_profile_id: string | null
  host_display_name: string
  challenger_display_name: string | null
  wager_amount: number
  betting_open: boolean
  betting_closes_at: string | null
  countdown_started_at: string | null
  countdown_seconds: number
  live_started_at: string | null
  move_turn_identity_id: string | null
  move_turn_started_at: string | null
  move_turn_seconds: number | null
  host_timeout_strikes: number
  challenger_timeout_strikes: number
  winner_identity_id: string | null
  win_reason: string | null
  board_state: unknown
  room_hype_index: number
  created_at: string
  updated_at: string
  finished_at: string | null
}

/** Legacy DB columns (transitional schema: still present). */
export type DbMatchRowLegacy = {
  id: string
  game_type: GameType
  status: string
  host_wallet: string
  challenger_wallet: string | null
  wager: number
  created_at: string
  started_at: string | null
  ended_at: string | null
  turn_expires_at?: string | null
  last_move_at?: string | null
  finished_at?: string | null
}

/** Connect 4 cell: host | challenger | null. Stored in board_state. */
export type Connect4Cell = "host" | "challenger" | null

/** Tic-Tac-Toe cell: X (host) | O (challenger) | null. Stored in board_state. */
export type TttCell = "X" | "O" | null

/** Backend board state for Connect 4. Stored in matches.board_state. */
export type Connect4BoardState = {
  mode: "connect4-live"
  board: Connect4Cell[][]
  turn: MatchSide
  turnDeadlineTs: number | null
}

/** Backend board state for Tic-Tac-Toe. Stored in matches.board_state. */
export type TttBoardState = {
  mode: "ttt-live"
  board: TttCell[]
  turn: TttCell
  turnDeadlineTs: number | null
}

/** Rock Paper Scissors choice. */
export type RpsChoice = "rock" | "paper" | "scissors"

/** Backend board state for Rock Paper Scissors. Both choices hidden until both submitted; then revealed and winner set. */
export type RpsBoardState = {
  mode: "rps-live"
  hostChoice: RpsChoice | null
  challengerChoice: RpsChoice | null
  revealed: boolean
  winner: "host" | "challenger" | "draw" | null
}

export type GameBoardState = Connect4BoardState | TttBoardState | RpsBoardState

export type MoveRecord = {
  id: string
  match_id: string
  move_number: number
  player_identity_id: string
  move_data: unknown
  created_at: string
}

/** Room chat message from Supabase match_messages table. */
export type RoomMessageRecord = {
  id: string
  match_id: string
  sender_identity_id: string
  sender_display_name: string
  message: string
  created_at: string
}

export type BetRecord = {
  id: string
  match_id: string
  bettor_identity_id: string
  side: MatchSide
  amount: number
  created_at: string
}

/** UI-facing room (derived from DB row; one consistent shape). */
export type Room = {
  id: string
  mode: MatchMode
  game: GameType
  status: "Waiting for Opponent" | "Ready to Start" | "Live" | "Finished"
  hostIdentityId: string
  challengerIdentityId: string | null
  hostDisplayName: string
  challengerDisplayName: string | null
  wager: number
  bettingOpen: boolean
  bettingClosesAt: number | null
  countdownStartedAt: number | null
  countdownSeconds: number
  liveStartedAt: number | null
  moveTurnIdentityId: string | null
  moveTurnStartedAt: number | null
  moveTurnSeconds: number | null
  /** DB-authoritative turn deadline (ms). UI uses this for "time left" only. */
  turnExpiresAt: number | null
  hostTimeoutStrikes: number
  challengerTimeoutStrikes: number
  winnerIdentityId: string | null
  winReason: string | null
  boardState: unknown
  /** Best-of series: 1 = one game, 3 = first to 2 wins, 5 = first to 3 wins. */
  bestOf: 1 | 3 | 5
  hostRoundWins: number
  challengerRoundWins: number
  currentRound: number
  roomHypeIndex: number
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

/** UI-facing chat message. */
export type RoomMessage = {
  id: string
  matchId: string
  senderIdentityId: string
  senderDisplayName: string
  message: string
  createdAt: number
}

const ROOM_STATUS_TO_UI: Record<string, Room["status"]> = {
  waiting: "Waiting for Opponent",
  "Waiting for Opponent": "Waiting for Opponent",
  ready: "Ready to Start",
  "Ready to Start": "Ready to Start",
  live: "Live",
  Live: "Live",
  finished: "Finished",
  forfeited: "Finished",
  canceled: "Finished",
  Finished: "Finished",
}

/**
 * Map DB match row (transitional: new + legacy columns) to UI Room.
 * Prefer new fields (host_identity_id, wager_amount, live_started_at, etc.),
 * fall back to legacy (host_wallet, wager, started_at, ended_at).
 */
export function mapDbRowToRoom(row: Record<string, unknown>): Room {
  const id = String(row.id ?? "")
  const statusRaw = String(row.status ?? "waiting")
  const status = ROOM_STATUS_TO_UI[statusRaw] ?? "Waiting for Opponent"

  // New preferred; legacy fallback
  const hostIdentityId = String(
    row.host_identity_id ?? row.host_wallet ?? ""
  )
  const challengerIdentityId =
    row.challenger_identity_id ?? row.challenger_wallet
  const wager = Number(row.wager_amount ?? row.wager ?? 0)
  const liveStartedAt = row.live_started_at
    ? new Date(String(row.live_started_at)).getTime()
    : row.started_at
      ? new Date(String(row.started_at)).getTime()
      : null
  const finishedAt =
    row.finished_at != null
      ? new Date(String(row.finished_at)).getTime()
      : row.ended_at != null
        ? new Date(String(row.ended_at)).getTime()
        : null

  const countdownStartedAt = row.countdown_started_at
    ? new Date(String(row.countdown_started_at)).getTime()
    : null
  const bettingClosesAt = row.betting_closes_at
    ? new Date(String(row.betting_closes_at)).getTime()
    : null
  const moveTurnStartedAt = row.move_turn_started_at
    ? new Date(String(row.move_turn_started_at)).getTime()
    : row.last_move_at
      ? new Date(String(row.last_move_at)).getTime()
      : null
  const moveTurnSeconds = row.move_turn_seconds != null ? Number(row.move_turn_seconds) : null
  const turnExpiresAt = row.turn_expires_at != null
    ? new Date(String(row.turn_expires_at)).getTime()
    : moveTurnStartedAt != null && moveTurnSeconds != null
      ? moveTurnStartedAt + moveTurnSeconds * 1000
      : null
  const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : 0
  const updatedAt = row.updated_at
    ? new Date(String(row.updated_at)).getTime()
    : createdAt

  return {
    id,
    mode: (row.mode as MatchMode) ?? "quick",
    game: (row.game_type as GameType) ?? "Tic-Tac-Toe",
    status,
    hostIdentityId,
    challengerIdentityId:
      challengerIdentityId != null ? String(challengerIdentityId) : null,
    hostDisplayName: String(
      row.host_display_name ?? row.host_wallet ?? "Host"
    ),
    challengerDisplayName:
      row.challenger_display_name != null
        ? String(row.challenger_display_name)
        : row.challenger_wallet != null
          ? String(row.challenger_wallet)
          : row.challenger_identity_id != null
            ? String(row.challenger_identity_id)
            : null,
    wager,
    bettingOpen: Boolean(row.betting_open ?? false),
    bettingClosesAt,
    countdownStartedAt,
    countdownSeconds: Number(row.countdown_seconds ?? 30),
    liveStartedAt,
    moveTurnIdentityId:
      row.move_turn_identity_id != null
        ? String(row.move_turn_identity_id)
        : null,
    moveTurnStartedAt,
    moveTurnSeconds: moveTurnSeconds,
    turnExpiresAt,
    hostTimeoutStrikes: Number(row.host_timeout_strikes ?? 0),
    challengerTimeoutStrikes: Number(row.challenger_timeout_strikes ?? 0),
    winnerIdentityId:
      row.winner_identity_id != null
        ? String(row.winner_identity_id)
        : null,
    winReason: row.win_reason != null ? String(row.win_reason) : null,
    boardState: row.board_state ?? undefined,
    bestOf: ((): 1 | 3 | 5 => {
      const n = Number(row.best_of ?? 1)
      if (n === 3 || n === 5) return n
      return 1
    })(),
    hostRoundWins: Math.max(0, Number(row.host_round_wins ?? 0)),
    challengerRoundWins: Math.max(0, Number(row.challenger_round_wins ?? 0)),
    currentRound: Math.max(1, Number(row.current_round ?? 1)),
    roomHypeIndex: Number(row.room_hype_index ?? 0),
    createdAt,
    updatedAt,
    finishedAt,
  }
}

/** Map match_messages row to UI RoomMessage. */
export function mapMessageRowToRoomMessage(
  row: Record<string, unknown>
): RoomMessage {
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    senderIdentityId: String(row.sender_identity_id),
    senderDisplayName: String(row.sender_display_name ?? ""),
    message: String(row.message ?? ""),
    createdAt: row.created_at ? new Date(String(row.created_at)).getTime() : 0,
  }
}
