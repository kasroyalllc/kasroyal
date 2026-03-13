import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getRoomById } from "@/lib/rooms/rooms-service"
import {
  applyConnect4Move,
  applyTttMove,
  getConnect4Winner,
  getTttWinner,
  isConnect4Full,
  isTttFull,
} from "@/lib/rooms/game-board"
import { getMoveSecondsForGame } from "@/lib/engine/game-constants"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import type {
  Connect4BoardState,
  TttBoardState,
  Connect4Cell,
  TttCell,
  GameType,
} from "@/lib/engine/match/types"

export const dynamic = "force-dynamic"

/**
 * Process Connect 4 or Tic-Tac-Toe move on the server.
 * Validates room Live, player seated, correct turn, legal move.
 * Updates board_state, turn, move timer; sets winner/finished_at if resolved.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const roomId = String(body.room_id ?? "").trim()
    const playerIdentityId = String(body.player_identity_id ?? "").trim()
    const move = body.move // Connect 4: column 0-6 (number). Tic-Tac-Toe: index 0-8 (number).

    if (!roomId || !playerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "room_id and player_identity_id required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const room = await getRoomById(supabase, roomId)

    if (!room) {
      return NextResponse.json(
        { ok: false, error: "Room not found" },
        { status: 404 }
      )
    }

    if (room.status !== "Live") {
      return NextResponse.json(
        { ok: false, error: "Room is not live" },
        { status: 409 }
      )
    }

    const isHost = room.hostIdentityId === playerIdentityId
    const isChallenger = room.challengerIdentityId === playerIdentityId
    if (!isHost && !isChallenger) {
      return NextResponse.json(
        { ok: false, error: "Not a seated player" },
        { status: 403 }
      )
    }

    const gameType = room.game as GameType
    if (gameType !== "Connect 4" && gameType !== "Tic-Tac-Toe") {
      return NextResponse.json(
        { ok: false, error: "Only Connect 4 and Tic-Tac-Toe support move" },
        { status: 400 }
      )
    }

    const currentTurnId = room.moveTurnIdentityId
    if (currentTurnId !== playerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Not your turn" },
        { status: 409 }
      )
    }

    const rawBoard = room.boardState
    const now = new Date().toISOString()
    const moveSeconds = getMoveSecondsForGame(gameType)

    if (gameType === "Connect 4") {
      const col = typeof move === "number" ? Math.floor(move) : parseInt(String(move), 10)
      if (Number.isNaN(col) || col < 0 || col > 6) {
        return NextResponse.json(
          { ok: false, error: "Invalid move: column 0-6 required" },
          { status: 400 }
        )
      }

      const state = rawBoard as Connect4BoardState | null | undefined
      if (!state || state.mode !== "connect4-live" || !Array.isArray(state.board)) {
        return NextResponse.json(
          { ok: false, error: "Invalid Connect 4 board state" },
          { status: 409 }
        )
      }

      const side: Connect4Cell = state.turn === "host" ? "host" : "challenger"
      const result = applyConnect4Move(state.board, col, side)
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "Column full or invalid" },
          { status: 409 }
        )
      }

      const winner = getConnect4Winner(result.board)
      const full = isConnect4Full(result.board)
      const nextTurn: "host" | "challenger" = side === "host" ? "challenger" : "host"

      if (winner) {
        const winnerId = winner === "host" ? room.hostIdentityId : room.challengerIdentityId!
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: "Finished",
            board_state: {
              mode: "connect4-live",
              board: result.board,
              turn: nextTurn,
              turnDeadlineTs: null,
            },
            winner_identity_id: winnerId,
            win_reason: "win",
            updated_at: now,
            finished_at: now,
            ended_at: now,
          })
          .eq("id", roomId)
          .select("*")
          .single()
        if (error) throw error
        return NextResponse.json(
          { ok: true, room: mapDbRowToRoom((data ?? {}) as Record<string, unknown>) },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      if (full) {
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: "Finished",
            board_state: {
              mode: "connect4-live",
              board: result.board,
              turn: nextTurn,
              turnDeadlineTs: null,
            },
            winner_identity_id: null,
            win_reason: "draw",
            updated_at: now,
            finished_at: now,
            ended_at: now,
          })
          .eq("id", roomId)
          .select("*")
          .single()
        if (error) throw error
        return NextResponse.json(
          { ok: true, room: mapDbRowToRoom((data ?? {}) as Record<string, unknown>) },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      const nextTurnId = nextTurn === "host" ? room.hostIdentityId : room.challengerIdentityId!
      const { data, error } = await supabase
        .from("matches")
        .update({
          board_state: {
            mode: "connect4-live",
            board: result.board,
            turn: nextTurn,
            turnDeadlineTs: Date.now() + moveSeconds * 1000,
          },
          move_turn_identity_id: nextTurnId,
          move_turn_started_at: now,
          move_turn_seconds: moveSeconds,
          updated_at: now,
        })
        .eq("id", roomId)
        .select("*")
        .single()
      if (error) throw error
      return NextResponse.json(
        { ok: true, room: mapDbRowToRoom((data ?? {}) as Record<string, unknown>) },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    // Tic-Tac-Toe
    const index = typeof move === "number" ? Math.floor(move) : parseInt(String(move), 10)
    if (Number.isNaN(index) || index < 0 || index > 8) {
      return NextResponse.json(
        { ok: false, error: "Invalid move: index 0-8 required" },
        { status: 400 }
      )
    }

    const state = rawBoard as TttBoardState | null | undefined
    if (!state || state.mode !== "ttt-live" || !Array.isArray(state.board)) {
      return NextResponse.json(
        { ok: false, error: "Invalid Tic-Tac-Toe board state" },
        { status: 409 }
      )
    }

    const side: TttCell = state.turn
    const nextBoard = applyTttMove(state.board, index, side)
    if (!nextBoard) {
      return NextResponse.json(
        { ok: false, error: "Cell already taken or invalid" },
        { status: 409 }
      )
    }

    const winner = getTttWinner(nextBoard)
    const full = isTttFull(nextBoard)
    const nextTurn: TttCell = side === "X" ? "O" : "X"

    if (winner) {
      const winnerId = winner === "X" ? room.hostIdentityId : room.challengerIdentityId!
      const { data, error } = await supabase
        .from("matches")
        .update({
          status: "Finished",
          board_state: {
            mode: "ttt-live",
            board: nextBoard,
            turn: nextTurn,
            turnDeadlineTs: null,
          },
          winner_identity_id: winnerId,
          win_reason: "win",
          updated_at: now,
          finished_at: now,
          ended_at: now,
        })
        .eq("id", roomId)
        .select("*")
        .single()
      if (error) throw error
      return NextResponse.json(
        { ok: true, room: mapDbRowToRoom((data ?? {}) as Record<string, unknown>) },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (full) {
      const { data, error } = await supabase
        .from("matches")
        .update({
          status: "Finished",
          board_state: {
            mode: "ttt-live",
            board: nextBoard,
            turn: nextTurn,
            turnDeadlineTs: null,
          },
          winner_identity_id: null,
          win_reason: "draw",
          updated_at: now,
          finished_at: now,
          ended_at: now,
        })
        .eq("id", roomId)
        .select("*")
        .single()
      if (error) throw error
      return NextResponse.json(
        { ok: true, room: mapDbRowToRoom((data ?? {}) as Record<string, unknown>) },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const nextTurnId = nextTurn === "X" ? room.hostIdentityId : room.challengerIdentityId!
    const { data, error } = await supabase
      .from("matches")
      .update({
        board_state: {
          mode: "ttt-live",
          board: nextBoard,
          turn: nextTurn,
          turnDeadlineTs: Date.now() + moveSeconds * 1000,
        },
        move_turn_identity_id: nextTurnId,
        move_turn_started_at: now,
        move_turn_seconds: moveSeconds,
        updated_at: now,
      })
      .eq("id", roomId)
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json(
      { ok: true, room: mapDbRowToRoom((data ?? {}) as Record<string, unknown>) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Move failed" },
      { status: 500 }
    )
  }
}
