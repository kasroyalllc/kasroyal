/**
 * Server-side board init and move validation for Connect 4 and Tic-Tac-Toe.
 * Used by /api/rooms/start and /api/rooms/move.
 */

import type {
  Connect4BoardState,
  TttBoardState,
  RpsBoardState,
  Connect4Cell,
  TttCell,
  RpsChoice,
} from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"

export function getEmptyConnect4Board(): Connect4Cell[][] {
  return Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => null))
}

export function getEmptyTttBoard(): TttCell[] {
  return Array.from({ length: 9 }, () => null)
}

export function createInitialBoardState(gameType: GameType):
  | Connect4BoardState
  | TttBoardState
  | RpsBoardState {
  if (gameType === "Connect 4") {
    return {
      mode: "connect4-live",
      board: getEmptyConnect4Board(),
      turn: "host",
      turnDeadlineTs: null,
    }
  }
  if (gameType === "Tic-Tac-Toe") {
    return {
      mode: "ttt-live",
      board: getEmptyTttBoard(),
      turn: "X",
      turnDeadlineTs: null,
    }
  }
  if (gameType === "Rock Paper Scissors") {
    return {
      mode: "rps-live",
      hostChoice: null,
      challengerChoice: null,
      revealed: false,
      winner: null,
    }
  }
  throw new Error(`Unsupported game type for board init: ${gameType}`)
}

/**
 * Create a brand-new RPS board for a new round. Do not derive from previous board (no spread/merge).
 * Use this whenever starting a new RPS round (Ready→Live or intermission→next round).
 * hostChoice and challengerChoice are null; players may change their choice freely until the round resolves (both chosen or timer expires).
 */
export function createRpsRoundBoard(roundExpiresAtMs: number): RpsBoardState {
  return {
    mode: "rps-live",
    hostChoice: null,
    challengerChoice: null,
    revealed: false,
    winner: null,
    roundExpiresAt: roundExpiresAtMs,
  }
}

/** Resolve RPS winner from both choices. Returns "host" | "challenger" | "draw". */
export function resolveRps(
  hostChoice: RpsChoice,
  challengerChoice: RpsChoice
): "host" | "challenger" | "draw" {
  if (hostChoice === challengerChoice) return "draw"
  if (
    (hostChoice === "rock" && challengerChoice === "scissors") ||
    (hostChoice === "paper" && challengerChoice === "rock") ||
    (hostChoice === "scissors" && challengerChoice === "paper")
  ) {
    return "host"
  }
  return "challenger"
}

/** Win reason string for RPS result (e.g. "rock beats scissors"). */
export function getRpsWinReason(
  hostChoice: RpsChoice,
  challengerChoice: RpsChoice
): string {
  if (hostChoice === challengerChoice) return "draw"
  if (
    (hostChoice === "rock" && challengerChoice === "scissors") ||
    (hostChoice === "paper" && challengerChoice === "rock") ||
    (hostChoice === "scissors" && challengerChoice === "paper")
  ) {
    return `${hostChoice} beats ${challengerChoice}`
  }
  return `${challengerChoice} beats ${hostChoice}`
}

export function getConnect4Winner(board: Connect4Cell[][]): Connect4Cell {
  const rows = 6
  const cols = 7
  const directions: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c]
      if (!cell) continue

      for (const [dr, dc] of directions) {
        let count = 1
        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step
          const nc = c + dc * step
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break
          if (board[nr][nc] !== cell) break
          count++
        }
        if (count >= 4) return cell
      }
    }
  }
  return null
}

export function isConnect4Full(board: Connect4Cell[][]): boolean {
  return board.every((row) => row.every((cell) => cell !== null))
}

export function getTttWinner(board: TttCell[]): TttCell {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return null
}

export function isTttFull(board: TttCell[]): boolean {
  return board.every((cell) => cell !== null)
}

export function applyConnect4Move(
  board: Connect4Cell[][],
  col: number,
  side: Connect4Cell
): { board: Connect4Cell[][]; row: number } | null {
  if (col < 0 || col >= 7) return null
  const next = board.map((row) => [...row])
  for (let row = 5; row >= 0; row--) {
    if (next[row][col] === null) {
      next[row][col] = side
      return { board: next, row }
    }
  }
  return null
}

export function applyTttMove(
  board: TttCell[],
  index: number,
  side: TttCell
): TttCell[] | null {
  if (index < 0 || index >= 9 || board[index] !== null) return null
  const next = [...board]
  next[index] = side
  return next
}
