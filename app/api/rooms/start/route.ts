import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { createInitialBoardState } from "@/lib/rooms/game-board"
import { getMoveSecondsForGame } from "@/lib/engine/game-constants"
import { mapDbRowToRoom, type GameType } from "@/lib/engine/match/types"

export const dynamic = "force-dynamic"

/**
 * Transition room from Ready to Start -> Live exactly once.
 * Initialize board_state, assign first turn, start move timer, lock betting.
 * Idempotent: rejects or no-ops if already Live.
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

    const gameType = room.game as GameType
    if (gameType !== "Connect 4" && gameType !== "Tic-Tac-Toe") {
      return NextResponse.json(
        { ok: false, error: "Only Connect 4 and Tic-Tac-Toe support start" },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const moveSeconds = getMoveSecondsForGame(gameType)
    const boardState = createInitialBoardState(gameType)

    const { data, error } = await supabase
      .from("matches")
      .update({
        status: "Live",
        live_started_at: now,
        started_at: now,
        betting_open: false,
        board_state: boardState,
        move_turn_identity_id: room.hostIdentityId,
        move_turn_started_at: now,
        move_turn_seconds: moveSeconds,
        updated_at: now,
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
      { ok: true, room: updatedRoom },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Start failed" },
      { status: 500 }
    )
  }
}
