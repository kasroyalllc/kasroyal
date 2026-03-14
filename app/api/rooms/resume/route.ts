import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { getMoveSecondsForGame } from "@/lib/engine/game-constants"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"
import { ensureFullRoom } from "@/lib/rooms/canonical-room"
import { logRoomAction } from "@/lib/log"
import { insertMatchEvent } from "@/lib/rooms/match-events"
export const dynamic = "force-dynamic"

/**
 * Resume a paused live match. Clears is_paused and extends turn_expires_at so current turn gets full time again.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const roomId = String(body?.room_id ?? "").trim()
    const playerIdentityId = String(body?.player_identity_id ?? "").trim()

    if (!roomId) {
      return NextResponse.json(
        { ok: false, error: "room_id required" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const room = await getRoomById(supabase, roomId)

    if (!room) {
      return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 })
    }

    if (room.status !== "Live") {
      return NextResponse.json(
        { ok: false, error: "Only live matches can be resumed" },
        { status: 409 }
      )
    }

    if (!room.isPaused) {
      return NextResponse.json(
        { ok: false, error: "Match is not currently paused" },
        { status: 409 }
      )
    }

    if (playerIdentityId) {
      const isHost = room.hostIdentityId === playerIdentityId
      const isChallenger = room.challengerIdentityId === playerIdentityId
      if (!isHost && !isChallenger) {
        return NextResponse.json(
          { ok: false, error: "Only seated players can resume" },
          { status: 403 }
        )
      }
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const nowMs = now.getTime()

    const gameType = room.game as GameType
    const moveSeconds =
      gameType === "Connect 4" || gameType === "Tic-Tac-Toe"
        ? getMoveSecondsForGame(gameType)
        : null
    const turnExpiresAt =
      moveSeconds != null && room.moveTurnIdentityId
        ? new Date(nowMs + moveSeconds * 1000).toISOString()
        : null

    const updatePayload: Record<string, unknown> = {
      is_paused: false,
      paused_at: null,
      paused_by: null,
      pause_expires_at: null,
      updated_at: nowIso,
    }
    if (turnExpiresAt != null) {
      updatePayload.move_turn_started_at = nowIso
      updatePayload.turn_expires_at = turnExpiresAt
    }

    const { data, error } = await supabase
      .from("matches")
      .update(updatePayload)
      .eq("id", roomId)
      .in("status", ["Live", "live"])
      .select("*")
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Room not found or not live" },
        { status: 404 }
      )
    }

    const updatedRoom = mapDbRowToRoom(data as Record<string, unknown>)
    await insertMatchEvent(supabase, roomId, "resumed", {})
    logRoomAction("resume", roomId)
    return NextResponse.json(
      { ok: true, room: ensureFullRoom(updatedRoom, room) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Resume failed" },
      { status: 500 }
    )
  }
}
