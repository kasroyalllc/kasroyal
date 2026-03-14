/**
 * Game driver / adapter contract.
 * Each supported game implements this interface so move, tick, start, and UI
 * can treat all games uniformly. RPS differences (no turn timer, choice-based)
 * are absorbed here.
 */

import {
  createInitialBoardState,
  applyConnect4Move,
  applyTttMove,
  getConnect4Winner,
  getTttWinner,
  isConnect4Full,
  isTttFull,
  resolveRps,
  getRpsWinReason,
} from "@/lib/rooms/game-board"
import { getMoveSecondsForGame } from "@/lib/engine/game-constants"
import type { Room } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"
import type {
  Connect4BoardState,
  TttBoardState,
  RpsBoardState,
  Connect4Cell,
  TttCell,
  RpsChoice,
} from "@/lib/engine/match/types"

export type CanonicalGameKey = "Tic-Tac-Toe" | "Connect 4" | "Rock Paper Scissors"

/** Canonical result from driver.applyMove when move is accepted. */
export type RoundOutcome = {
  newBoardState: unknown
  roundWinner: "host" | "challenger" | null
  isDraw: boolean
  isBoardFull: boolean
  /** True when this move ended the round (winner, draw, or both chose in RPS). */
  roundEnded: boolean
  /** For turn-based games when round not ended: identity id of next mover. Null for RPS or when round ended. */
  nextTurnIdentityId: string | null
  winReason?: string
}

export type ApplyMoveResult =
  | RoundOutcome
  | { error: string }

/**
 * Per-game driver: board init, move timing, apply move, round outcome.
 * All game-specific branching for move/tick/start should go through this.
 */
export type GameDriver = {
  gameKey: CanonicalGameKey
  gameType: GameType
  /** Create initial board state for a new round/match. */
  createInitialBoardState(): unknown
  /** Seconds per turn (0 = no turn timer, e.g. RPS). */
  getMoveSeconds(): number
  /** True if this game uses a per-turn timer (C4, TTT). */
  hasTurnTimer: boolean
  /** Apply move payload; returns new state and round outcome or error. */
  applyMove(room: Room, payload: Record<string, unknown>): ApplyMoveResult
}

function connect4Driver(): GameDriver {
  return {
    gameKey: "Connect 4",
    gameType: "Connect 4",
    createInitialBoardState() {
      return createInitialBoardState("Connect 4")
    },
    getMoveSeconds() {
      return getMoveSecondsForGame("Connect 4")
    },
    hasTurnTimer: true,
    applyMove(room, payload) {
      const boardState = room.boardState as Connect4BoardState | undefined
      if (!boardState || boardState.mode !== "connect4-live") {
        return { error: "Invalid board state" }
      }
      const raw = payload.column ?? payload.move
      const col = typeof raw === "number" ? Math.floor(raw) : parseInt(String(raw ?? ""), 10)
      if (Number.isNaN(col) || col < 0 || col > 6) {
        return { error: "Invalid column" }
      }
      const turn = boardState.turn
      const side: Connect4Cell = turn === "host" ? "host" : "challenger"
      const result = applyConnect4Move(boardState.board, col, side)
      if (!result) return { error: "Column full or invalid" }
      const winner = getConnect4Winner(result.board)
      const full = isConnect4Full(result.board)
      const nextTurn = turn === "host" ? "challenger" : "host"
      const newBoardState: Connect4BoardState = {
        mode: "connect4-live",
        board: result.board,
        turn: nextTurn,
        turnDeadlineTs: boardState.turnDeadlineTs ?? null,
      }
      const roundWinner =
        winner === "host" ? "host" : winner === "challenger" ? "challenger" : null
      const roundEnded = !!roundWinner || full
      const nextTurnIdentityId = !roundEnded
        ? (nextTurn === "host" ? room.hostIdentityId : room.challengerIdentityId ?? null)
        : null
      return {
        newBoardState,
        roundWinner,
        isDraw: full && !roundWinner,
        isBoardFull: full,
        roundEnded,
        nextTurnIdentityId,
      }
    },
  }
}

function tttDriver(): GameDriver {
  return {
    gameKey: "Tic-Tac-Toe",
    gameType: "Tic-Tac-Toe",
    createInitialBoardState() {
      return createInitialBoardState("Tic-Tac-Toe")
    },
    getMoveSeconds() {
      return getMoveSecondsForGame("Tic-Tac-Toe")
    },
    hasTurnTimer: true,
    applyMove(room, payload) {
      const boardState = room.boardState as TttBoardState | undefined
      if (!boardState || boardState.mode !== "ttt-live") {
        return { error: "Invalid board state" }
      }
      const raw = payload.index ?? payload.move
      const index = typeof raw === "number" ? Math.floor(raw) : parseInt(String(raw ?? ""), 10)
      if (Number.isNaN(index) || index < 0 || index > 8) {
        return { error: "Invalid index" }
      }
      const turn = boardState.turn
      const side: TttCell = turn === "X" ? "X" : "O"
      const nextBoard = applyTttMove(boardState.board, index, side)
      if (!nextBoard) return { error: "Cell occupied or invalid" }
      const winner = getTttWinner(nextBoard)
      const full = isTttFull(nextBoard)
      const nextTurn = turn === "X" ? "O" : "X"
      const newBoardState: TttBoardState = {
        mode: "ttt-live",
        board: nextBoard,
        turn: nextTurn,
        turnDeadlineTs: boardState.turnDeadlineTs ?? null,
      }
      const roundWinner =
        winner === "X" ? "host" : winner === "O" ? "challenger" : null
      const roundEnded = !!roundWinner || full
      const nextTurnIdentityId = !roundEnded
        ? (nextTurn === "X" ? room.hostIdentityId : room.challengerIdentityId ?? null)
        : null
      return {
        newBoardState,
        roundWinner,
        isDraw: full && !roundWinner,
        isBoardFull: full,
        roundEnded,
        nextTurnIdentityId,
      }
    },
  }
}

function rpsDriver(): GameDriver {
  return {
    gameKey: "Rock Paper Scissors",
    gameType: "Rock Paper Scissors",
    createInitialBoardState() {
      return createInitialBoardState("Rock Paper Scissors")
    },
    getMoveSeconds() {
      return getMoveSecondsForGame("Rock Paper Scissors")
    },
    hasTurnTimer: false,
    applyMove(room, payload) {
      const boardState = room.boardState as RpsBoardState | undefined
      if (!boardState || boardState.mode !== "rps-live") {
        return { error: "Invalid board state" }
      }
      const isHost = payload.side === "host"
      if (isHost && boardState.hostChoice != null) {
        return { error: "Already locked in" }
      }
      if (!isHost && boardState.challengerChoice != null) {
        return { error: "Already locked in" }
      }
      const rawChoice = payload.choice ?? payload.move
      const choice = (typeof rawChoice === "string" ? rawChoice.toLowerCase() : "") as RpsChoice
      const validChoices: RpsChoice[] = ["rock", "paper", "scissors"]
      if (!choice || !validChoices.includes(choice)) {
        return { error: "Invalid choice" }
      }
      const hostChoice = isHost ? choice : (boardState.hostChoice ?? null)
      const challengerChoice = isHost ? (boardState.challengerChoice ?? null) : choice
      if (hostChoice === null || challengerChoice === null) {
        const newBoardState: RpsBoardState = {
          mode: "rps-live",
          hostChoice: isHost ? choice : boardState.hostChoice,
          challengerChoice: isHost ? boardState.challengerChoice : choice,
          revealed: false,
          winner: null,
          roundExpiresAt: boardState.roundExpiresAt ?? undefined,
        }
        return {
          newBoardState,
          roundWinner: null,
          isDraw: false,
          isBoardFull: false,
          roundEnded: false,
          nextTurnIdentityId: null,
        }
      }
      const winner = resolveRps(hostChoice, challengerChoice)
      const winReason = getRpsWinReason(hostChoice, challengerChoice)
      const roundWinner = winner === "draw" ? null : winner
      const newBoardState: RpsBoardState = {
        mode: "rps-live",
        hostChoice,
        challengerChoice,
        revealed: true,
        winner: roundWinner,
        roundExpiresAt: boardState.roundExpiresAt ?? undefined,
      }
      return {
        newBoardState,
        roundWinner,
        isDraw: winner === "draw",
        isBoardFull: true,
        roundEnded: true,
        nextTurnIdentityId: null,
        winReason,
      }
    },
  }
}

const DRIVERS: Record<CanonicalGameKey, GameDriver> = {
  "Tic-Tac-Toe": tttDriver(),
  "Connect 4": connect4Driver(),
  "Rock Paper Scissors": rpsDriver(),
}

/**
 * Resolve RPS round when round timer has expired (tick only).
 * Returns a RoundOutcome for: one chose → that side wins; neither chose → draw.
 * Returns null if not RPS, not expired, or both already chose (move should have resolved).
 */
export function resolveRpsRoundTimeout(
  room: Room,
  nowMs: number
): RoundOutcome | null {
  if (room.game !== "Rock Paper Scissors") return null
  const boardState = room.boardState as RpsBoardState | undefined
  if (!boardState || boardState.mode !== "rps-live") return null
  const expiresAt = boardState.roundExpiresAt ?? 0
  if (expiresAt <= 0 || nowMs < expiresAt) return null
  if (boardState.revealed) return null
  const hostChoice = boardState.hostChoice ?? null
  const challengerChoice = boardState.challengerChoice ?? null
  if (hostChoice !== null && challengerChoice !== null) return null

  let roundWinner: "host" | "challenger" | null = null
  let isDraw = false
  let winReason: string | undefined
  if (hostChoice !== null && challengerChoice === null) {
    roundWinner = "host"
    winReason = "round timeout (opponent no choice)"
  } else if (hostChoice === null && challengerChoice !== null) {
    roundWinner = "challenger"
    winReason = "round timeout (opponent no choice)"
  } else {
    isDraw = true
    winReason = "round timeout (no choices)"
  }
  const newBoardState: RpsBoardState = {
    mode: "rps-live",
    hostChoice: hostChoice ?? null,
    challengerChoice: challengerChoice ?? null,
    revealed: true,
    winner: roundWinner ?? "draw",
    roundExpiresAt: boardState.roundExpiresAt ?? undefined,
  }
  return {
    newBoardState,
    roundWinner,
    isDraw,
    isBoardFull: true,
    roundEnded: true,
    nextTurnIdentityId: null,
    winReason,
  }
}

/**
 * Get the game driver for a game type. Returns null for unsupported games (e.g. Chess Duel).
 */
export function getGameDriver(gameType: GameType): GameDriver | null {
  if (gameType === "Tic-Tac-Toe" || gameType === "Connect 4" || gameType === "Rock Paper Scissors") {
    return DRIVERS[gameType]
  }
  return null
}

/**
 * Check if a game type is supported by the driver layer (has turn/board/round semantics we support).
 */
export function isSupportedGame(gameType: GameType): boolean {
  return getGameDriver(gameType) != null
}
