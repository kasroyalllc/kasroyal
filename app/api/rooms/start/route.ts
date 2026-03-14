import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { createInitialBoardState } from "@/lib/rooms/game-board"
import { getMoveSecondsForGame } from "@/lib/engine/game-constants"
import { mapDbRowToRoom, type GameType } from "@/lib/engine/match/types"

export const dynamic = "force-dynamic"

/**
 * Transition room from Ready to Start -> Live only after pre-game countdown expires.
 * Uses countdown_started_at + countdown_seconds as source of truth. Sets turn_expires_at for DB-authoritative timer.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const roomId = String(body.room_id ?? "").trim()

    if (!roomId) {
      return NextResponse.json(
        { ok: false, error: "room_id required" },
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

    if (room.status !== "Ready to Start") {
      return NextResponse.json(
        { ok: true, room, alreadyLive: room.status === "Live" },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (!room.challengerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Cannot start without challenger" },
        { status: 409 }
      )
    }

    const now = new Date()
    const nowMs = now.getTime()
    const countdownStartedAt = room.countdownStartedAt ?? null
    if (!countdownStartedAt) {
      return NextResponse.json(
        { ok: true, room, countdownNotExpired: true },
        { headers: { "Cache-Control": "no-store" } }
      )
    }
    const countdownEndMs = countdownStartedAt + room.countdownSeconds * 1000
    if (nowMs < countdownEndMs) {
      return NextResponse.json(
        { ok: true, room, countdownNotExpired: true },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const gameType = room.game as GameType
    if (
      gameType !== "Connect 4" &&
      gameType !== "Tic-Tac-Toe" &&
      gameType !== "Rock Paper Scissors"
    ) {
      return NextResponse.json(
        { ok: false, error: "Only Connect 4, Tic-Tac-Toe, and Rock Paper Scissors support start" },
        { status: 400 }
      )
    }

    const nowIso = now.toISOString()
    const moveSeconds = getMoveSecondsForGame(gameType)
    const boardState = createInitialBoardState(gameType)
    const isRps = gameType === "Rock Paper Scissors"
    const turnExpiresAt = isRps
      ? null
      : new Date(nowMs + moveSeconds * 1000).toISOString()

    const bestOf = room.bestOf === 3 || room.bestOf === 5 ? room.bestOf : 1
    const { data, error } = await supabase
      .from("matches")
      .update({
        status: "Live",
        live_started_at: nowIso,
        started_at: nowIso,
        betting_open: false,
        board_state: boardState,
        move_turn_identity_id: isRps ? null : room.hostIdentityId,
        move_turn_started_at: isRps ? null : nowIso,
        move_turn_seconds: isRps ? null : moveSeconds,
        turn_expires_at: turnExpiresAt,
        host_round_wins: 0,
        challenger_round_wins: 0,
        current_round: 1,
        updated_at: nowIso,
      })
      .eq("id", roomId)
      .eq("status", "Ready to Start")
      .select("*")
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return NextResponse.json(
        { ok: true, room, alreadyLive: true },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const updatedRoom = mapDbRowToRoom((data ?? {}) as Record<string, unknown>)

    return NextResponse.json(
      { ok: true, room: updatedRoom, server_time_ms: nowMs },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Start failed" },
      { status: 500 }
    )
  }
}
