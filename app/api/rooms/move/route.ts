import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById, releaseActiveMatchByMatch } from "@/lib/rooms/rooms-service"
import { DB_STATUS } from "@/lib/rooms/db-status"
import { logRoomAction } from "@/lib/log"
import {
  applyConnect4Move,
  applyTttMove,
  getConnect4Winner,
  getTttWinner,
  isConnect4Full,
  isTttFull,
  resolveRps,
  getRpsWinReason,
} from "@/lib/rooms/game-board"
import { createInitialBoardState } from "@/lib/rooms/game-board"
import { getMoveSecondsForGame } from "@/lib/engine/game-constants"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import type {
  Connect4BoardState,
  TttBoardState,
  RpsBoardState,
  Connect4Cell,
  TttCell,
  RpsChoice,
  GameType,
  Room,
} from "@/lib/engine/match/types"

export const dynamic = "force-dynamic"

/** Seconds to show round result before starting next round (BO3/BO5). Tick starts next round when expired. */
const INTERMISSION_SECONDS = 5

/** Compute series update after a round ends. BO1 = 1 win, BO3 = first to 2, BO5 = first to 3. Uses canonical semantics (host_score, challenger_score, round_number). */
function getSeriesUpdate(
  room: Room,
  roundWinner: "host" | "challenger" | null
): {
  seriesOver: boolean
  winnerIdentityId: string | null
  winReason: string
  hostRoundWins: number
  challengerRoundWins: number
  currentRound: number
} {
  const bestOf = room.bestOf === 3 || room.bestOf === 5 ? room.bestOf : 1
  const requiredWins = bestOf === 1 ? 1 : bestOf === 3 ? 2 : 3
  const hostRoundWinsPrev = Math.max(0, Number(room.hostRoundWins ?? 0))
  const challengerRoundWinsPrev = Math.max(0, Number(room.challengerRoundWins ?? 0))
  const currentRoundPrev = Math.max(1, Math.min(Number(room.currentRound ?? 1), 5))
  let hostRoundWins = hostRoundWinsPrev
  let challengerRoundWins = challengerRoundWinsPrev
  if (roundWinner === "host") hostRoundWins += 1
  if (roundWinner === "challenger") challengerRoundWins += 1
  const seriesOver =
    bestOf === 1 && roundWinner === null
      ? true
      : hostRoundWins >= requiredWins || challengerRoundWins >= requiredWins
  const winnerIdentityId = seriesOver
    ? bestOf === 1 && roundWinner === null
      ? null
      : hostRoundWins >= requiredWins
        ? room.hostIdentityId
        : room.challengerIdentityId ?? null
    : null
  const winReason = seriesOver
    ? bestOf === 1 && roundWinner === null
      ? "draw"
      : `series ${hostRoundWins}-${challengerRoundWins}`
    : roundWinner === "host"
      ? "win"
      : roundWinner === "challenger"
        ? "win"
        : "draw"
  const nextRound = currentRoundPrev + (seriesOver ? 0 : 1)
  const currentRound = Math.min(Math.max(1, nextRound), 5)
  return {
    seriesOver,
    winnerIdentityId,
    winReason,
    hostRoundWins,
    challengerRoundWins,
    currentRound,
  }
}

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

    const supabase = createAdminClient()
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
    if (
      gameType !== "Connect 4" &&
      gameType !== "Tic-Tac-Toe" &&
      gameType !== "Rock Paper Scissors"
    ) {
      return NextResponse.json(
        { ok: false, error: "Only Connect 4, Tic-Tac-Toe, and Rock Paper Scissors support move" },
        { status: 400 }
      )
    }

    const rawBoard = room.boardState
    const now = new Date().toISOString()
    const nowMs = Date.now()

    if (gameType === "Rock Paper Scissors") {
      const choice = (typeof move === "string" ? move : String(move)).toLowerCase() as RpsChoice
      if (choice !== "rock" && choice !== "paper" && choice !== "scissors") {
        return NextResponse.json(
          { ok: false, error: "Invalid move: rock, paper, or scissors required" },
          { status: 400 }
        )
      }
      const state = rawBoard as RpsBoardState | null | undefined
      if (!state || state.mode !== "rps-live") {
        return NextResponse.json(
          { ok: false, error: "Invalid Rock Paper Scissors board state" },
          { status: 409 }
        )
      }
      const isHost = room.hostIdentityId === playerIdentityId
      const isChallenger = room.challengerIdentityId === playerIdentityId
      if (isHost && state.hostChoice != null) {
        return NextResponse.json(
          { ok: false, error: "You already locked in your choice" },
          { status: 409 }
        )
      }
      if (isChallenger && state.challengerChoice != null) {
        return NextResponse.json(
          { ok: false, error: "You already locked in your choice" },
          { status: 409 }
        )
      }
      const nextState: RpsBoardState = {
        mode: "rps-live",
        hostChoice: isHost ? choice : state.hostChoice,
        challengerChoice: isChallenger ? choice : state.challengerChoice,
        revealed: false,
        winner: null,
      }
      const hostChoice = nextState.hostChoice!
      const challengerChoice = nextState.challengerChoice!
      const bothSubmitted = hostChoice != null && challengerChoice != null
      if (bothSubmitted) {
        nextState.revealed = true
        nextState.winner = resolveRps(hostChoice, challengerChoice)
        const roundWinner = nextState.winner === "draw" ? null : nextState.winner
        const series = getSeriesUpdate(room, roundWinner)
        if (series.seriesOver) {
          const { data, error } = await supabase
            .from("matches")
            .update({
              status: DB_STATUS.FINISHED,
              board_state: nextState,
              winner_identity_id: series.winnerIdentityId,
              win_reason: series.winReason,
              round_number: series.currentRound,
              host_score: series.hostRoundWins,
              challenger_score: series.challengerRoundWins,
              updated_at: now,
              finished_at: now,
              ended_at: now,
            })
            .eq("id", roomId)
            .in("status", ["Live", "live"])
            .select("*")
            .maybeSingle()
          if (error) throw error
          await releaseActiveMatchByMatch(supabase, roomId)
          const updatedRoom = data ? mapDbRowToRoom((data as Record<string, unknown>)) : (await getRoomById(supabase, roomId)) ?? room
          logRoomAction(
            nextState.winner === "draw" ? "move_draw" : "move_win",
            roomId,
            { game: "Rock Paper Scissors", reason: series.winReason }
          )
          return NextResponse.json(
            { ok: true, room: updatedRoom, server_time_ms: nowMs },
            { headers: { "Cache-Control": "no-store" } }
          )
        }
        const roundWinnerIdentityId =
          roundWinner === "host"
            ? room.hostIdentityId
            : roundWinner === "challenger"
              ? room.challengerIdentityId ?? null
              : null
        const intermissionUntil = new Date(nowMs + INTERMISSION_SECONDS * 1000).toISOString()
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: DB_STATUS.LIVE,
            round_number: series.currentRound,
            host_score: series.hostRoundWins,
            challenger_score: series.challengerRoundWins,
            round_intermission_until: intermissionUntil,
            last_round_winner_identity_id: roundWinnerIdentityId,
            updated_at: now,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (error) throw error
        logRoomAction("move_round_win", roomId, {
          game: "Rock Paper Scissors",
          roundWinner: roundWinner ?? "draw",
        })
        return NextResponse.json(
          {
            ok: true,
            room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
            server_time_ms: nowMs,
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      const { data, error } = await supabase
        .from("matches")
        .update({
          board_state: nextState,
          updated_at: now,
        })
        .eq("id", roomId)
        .in("status", ["Live", "live"])
        .select("*")
        .maybeSingle()
      if (error) throw error
      return NextResponse.json(
        {
          ok: true,
          room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
          server_time_ms: nowMs,
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const currentTurnId = room.moveTurnIdentityId
    if (currentTurnId !== playerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Not your turn" },
        { status: 409 }
      )
    }

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
        const roundWinner = winner === "host" ? "host" : "challenger"
        const series = getSeriesUpdate(room, roundWinner)
        const finalBoard = {
          mode: "connect4-live",
          board: result.board,
          turn: nextTurn,
          turnDeadlineTs: null,
        }
        if (series.seriesOver) {
          const { data, error } = await supabase
            .from("matches")
            .update({
              status: DB_STATUS.FINISHED,
              board_state: finalBoard,
              winner_identity_id: series.winnerIdentityId,
              win_reason: series.winReason,
              round_number: series.currentRound,
              host_score: series.hostRoundWins,
              challenger_score: series.challengerRoundWins,
              updated_at: now,
              finished_at: now,
              ended_at: now,
            })
            .eq("id", roomId)
            .in("status", ["Live", "live"])
            .select("*")
            .maybeSingle()
          if (error) throw error
          await releaseActiveMatchByMatch(supabase, roomId)
          const updatedRoom = data ? mapDbRowToRoom((data as Record<string, unknown>)) : (await getRoomById(supabase, roomId)) ?? room
          logRoomAction("move_win", roomId, { game: "Connect 4", reason: series.winReason })
          return NextResponse.json(
            { ok: true, room: updatedRoom, server_time_ms: nowMs },
            { headers: { "Cache-Control": "no-store" } }
          )
        }
        const roundWinnerIdentityId =
          roundWinner === "host"
            ? room.hostIdentityId
            : roundWinner === "challenger"
              ? room.challengerIdentityId ?? null
              : null
        const intermissionUntil = new Date(nowMs + INTERMISSION_SECONDS * 1000).toISOString()
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: DB_STATUS.LIVE,
            round_number: series.currentRound,
            host_score: series.hostRoundWins,
            challenger_score: series.challengerRoundWins,
            round_intermission_until: intermissionUntil,
            last_round_winner_identity_id: roundWinnerIdentityId,
            updated_at: now,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (error) throw error
        logRoomAction("move_round_win", roomId, { game: "Connect 4", roundWinner })
        return NextResponse.json(
          { ok: true, room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      if (full) {
        const series = getSeriesUpdate(room, null)
        const finalBoard = {
          mode: "connect4-live",
          board: result.board,
          turn: nextTurn,
          turnDeadlineTs: null,
        }
        if (series.seriesOver) {
          const { data, error } = await supabase
            .from("matches")
            .update({
              status: DB_STATUS.FINISHED,
              board_state: finalBoard,
              winner_identity_id: null,
              win_reason: series.winReason,
              round_number: series.currentRound,
              host_score: series.hostRoundWins,
              challenger_score: series.challengerRoundWins,
              updated_at: now,
              finished_at: now,
              ended_at: now,
            })
            .eq("id", roomId)
            .in("status", ["Live", "live"])
            .select("*")
            .maybeSingle()
          if (error) throw error
          await releaseActiveMatchByMatch(supabase, roomId)
          const updatedRoom = data ? mapDbRowToRoom((data as Record<string, unknown>)) : (await getRoomById(supabase, roomId)) ?? room
          return NextResponse.json(
            { ok: true, room: updatedRoom, server_time_ms: nowMs },
            { headers: { "Cache-Control": "no-store" } }
          )
        }
        const intermissionUntil = new Date(nowMs + INTERMISSION_SECONDS * 1000).toISOString()
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: DB_STATUS.LIVE,
            round_number: series.currentRound,
            host_score: series.hostRoundWins,
            challenger_score: series.challengerRoundWins,
            round_intermission_until: intermissionUntil,
            last_round_winner_identity_id: null,
            updated_at: now,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (error) throw error
        logRoomAction("move_draw", roomId, { game: "Connect 4", reason: "draw" })
        return NextResponse.json(
          { ok: true, room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      const nextTurnId = nextTurn === "host" ? room.hostIdentityId : room.challengerIdentityId!
      const turnExpiresAt = new Date(nowMs + moveSeconds * 1000).toISOString()
      const { data, error } = await supabase
        .from("matches")
        .update({
          board_state: {
            mode: "connect4-live",
            board: result.board,
            turn: nextTurn,
            turnDeadlineTs: nowMs + moveSeconds * 1000,
          },
          move_turn_identity_id: nextTurnId,
          move_turn_started_at: now,
          move_turn_seconds: moveSeconds,
          turn_expires_at: turnExpiresAt,
          updated_at: now,
        })
        .eq("id", roomId)
        .in("status", ["Live", "live"])
        .select("*")
        .maybeSingle()
      if (error) throw error
      return NextResponse.json(
        { ok: true, room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room, server_time_ms: nowMs },
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
      const roundWinner = winner === "X" ? "host" : "challenger"
      const series = getSeriesUpdate(room, roundWinner)
      const finalBoard = {
        mode: "ttt-live",
        board: nextBoard,
        turn: nextTurn,
        turnDeadlineTs: null,
      }
      if (series.seriesOver) {
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: DB_STATUS.FINISHED,
            board_state: finalBoard,
            winner_identity_id: series.winnerIdentityId,
            win_reason: series.winReason,
            round_number: series.currentRound,
            host_score: series.hostRoundWins,
            challenger_score: series.challengerRoundWins,
            updated_at: now,
            finished_at: now,
            ended_at: now,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (error) throw error
        await releaseActiveMatchByMatch(supabase, roomId)
        const updatedRoom = data ? mapDbRowToRoom((data as Record<string, unknown>)) : (await getRoomById(supabase, roomId)) ?? room
        logRoomAction("move_win", roomId, { game: "Tic-Tac-Toe", reason: series.winReason })
        return NextResponse.json(
          { ok: true, room: updatedRoom, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      const roundWinnerIdentityId =
        roundWinner === "host"
          ? room.hostIdentityId
          : roundWinner === "challenger"
            ? room.challengerIdentityId ?? null
            : null
      const intermissionUntil = new Date(nowMs + INTERMISSION_SECONDS * 1000).toISOString()
      const { data, error } = await supabase
        .from("matches")
        .update({
          status: DB_STATUS.LIVE,
          round_number: series.currentRound,
          host_score: series.hostRoundWins,
          challenger_score: series.challengerRoundWins,
          round_intermission_until: intermissionUntil,
          last_round_winner_identity_id: roundWinnerIdentityId,
          updated_at: now,
        })
        .eq("id", roomId)
        .in("status", ["Live", "live"])
        .select("*")
        .maybeSingle()
      if (error) throw error
      logRoomAction("move_round_win", roomId, { game: "Tic-Tac-Toe", roundWinner })
      return NextResponse.json(
        { ok: true, room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room, server_time_ms: nowMs },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (full) {
      const series = getSeriesUpdate(room, null)
      const finalBoard = {
        mode: "ttt-live",
        board: nextBoard,
        turn: nextTurn,
        turnDeadlineTs: null,
      }
      if (series.seriesOver) {
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: DB_STATUS.FINISHED,
            board_state: finalBoard,
            winner_identity_id: null,
            win_reason: series.winReason,
            round_number: series.currentRound,
            host_score: series.hostRoundWins,
            challenger_score: series.challengerRoundWins,
            updated_at: now,
            finished_at: now,
            ended_at: now,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (error) throw error
        await releaseActiveMatchByMatch(supabase, roomId)
        const updatedRoom = data ? mapDbRowToRoom((data as Record<string, unknown>)) : (await getRoomById(supabase, roomId)) ?? room
        return NextResponse.json(
          { ok: true, room: updatedRoom, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      const intermissionUntil = new Date(nowMs + INTERMISSION_SECONDS * 1000).toISOString()
      const { data, error } = await supabase
        .from("matches")
        .update({
          status: DB_STATUS.LIVE,
          round_number: series.currentRound,
          host_score: series.hostRoundWins,
          challenger_score: series.challengerRoundWins,
          round_intermission_until: intermissionUntil,
          last_round_winner_identity_id: null,
          updated_at: now,
        })
        .eq("id", roomId)
        .in("status", ["Live", "live"])
        .select("*")
        .maybeSingle()
      if (error) throw error
      logRoomAction("move_draw", roomId, { game: "Tic-Tac-Toe", reason: "draw" })
      return NextResponse.json(
        { ok: true, room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room, server_time_ms: nowMs },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const nextTurnId = nextTurn === "X" ? room.hostIdentityId : room.challengerIdentityId!
    const turnExpiresAt = new Date(nowMs + moveSeconds * 1000).toISOString()
    const { data, error } = await supabase
      .from("matches")
      .update({
        board_state: {
          mode: "ttt-live",
          board: nextBoard,
          turn: nextTurn,
          turnDeadlineTs: nowMs + moveSeconds * 1000,
        },
        move_turn_identity_id: nextTurnId,
        move_turn_started_at: now,
        move_turn_seconds: moveSeconds,
        turn_expires_at: turnExpiresAt,
        updated_at: now,
      })
      .eq("id", roomId)
      .in("status", ["Live", "live"])
      .select("*")
      .maybeSingle()
    if (error) throw error
    return NextResponse.json(
      { ok: true, room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room, server_time_ms: nowMs },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Move failed" },
      { status: 500 }
    )
  }
}
