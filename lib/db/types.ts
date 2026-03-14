export type DbMatchStatus =
  | "Waiting for Opponent"
  | "Ready to Start"
  | "Live"
  | "Finished"

export type DbGameType = "Chess Duel" | "Connect 4" | "Rock Paper Scissors" | "Tic-Tac-Toe"

export type DbMatchRow = {
  id: string
  game_type: DbGameType
  status: DbMatchStatus
  host_wallet: string
  challenger_wallet: string | null
  wager: number
  created_at: string
  started_at: string | null
  ended_at: string | null
}

export type DbBetRow = {
  id: string
  match_id: string
  wallet_address: string
  side: string
  amount: number
  created_at: string
}