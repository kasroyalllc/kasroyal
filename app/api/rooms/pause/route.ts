import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import { ensureFullRoom } from "@/lib/rooms/canonical-room"
import { DB_STATUS } from "@/lib/rooms/db-status"
import { logRoomAction } from "@/lib/log"
import { insertMatchEvent } from "@/lib/rooms/match-events"

export const dynamic = "force-dynamic"

const PAUSE_DURATION_SECONDS = 30
const MAX_PAUSES_PER_SIDE = 2

/**
 * Pause a live match. Server-authoritative: sets is_paused, paused_by, pause_expires_at, increments pause_count_*.
 * Only the player whose turn it is can pause. Max MAX_PAUSES_PER_SIDE per player.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const roomId = String(body?.room_id ?? "").trim()
    const playerIdentityId = String(body?.player_identity_id ?? "").trim()

    if (!roomId || !playerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "room_id and player_identity_id required" },
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
        { ok: false, error: "Pause is only available during live matches" },
        { status: 409 }
      )
    }

    if (!room.challengerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Pause is unavailable until both players are seated" },
        { status: 409 }
      )
    }

    const isHost = room.hostIdentityId === playerIdentityId
    const isChallenger = room.challengerIdentityId === playerIdentityId
    if (!isHost && !isChallenger) {
      return NextResponse.json(
        { ok: false, error: "Only seated players can pause" },
        { status: 403 }
      )
    }

    if (room.isPaused) {
      return NextResponse.json(
        { ok: false, error: "Match is already paused" },
        { status: 409 }
      )
    }

    const pauseCountHost = Math.max(0, Number(room.pauseCountHost ?? 0))
    const pauseCountChallenger = Math.max(0, Number(room.pauseCountChallenger ?? 0))
    const usedPauses = isHost ? pauseCountHost : pauseCountChallenger
    if (usedPauses >= MAX_PAUSES_PER_SIDE) {
      return NextResponse.json(
        { ok: false, error: `No pauses remaining (max ${MAX_PAUSES_PER_SIDE} per player)` },
        { status: 409 }
      )
    }

    const side = isHost ? "host" : "challenger"
    const now = new Date()
    const nowIso = now.toISOString()
    const pauseExpiresAt = new Date(now.getTime() + PAUSE_DURATION_SECONDS * 1000).toISOString()

    const { data, error } = await supabase
      .from("matches")
      .update({
        is_paused: true,
        paused_at: nowIso,
        paused_by: side,
        pause_expires_at: pauseExpiresAt,
        pause_count_host: isHost ? pauseCountHost + 1 : pauseCountHost,
        pause_count_challenger: isChallenger ? pauseCountChallenger + 1 : pauseCountChallenger,
        updated_at: nowIso,
      })
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
    await insertMatchEvent(supabase, roomId, "pause_requested", { paused_by: side })
    logRoomAction("pause", roomId, { paused_by: side, pause_count: usedPauses + 1 })
    return NextResponse.json(
      { ok: true, room: ensureFullRoom(updatedRoom, room), pause_duration_seconds: PAUSE_DURATION_SECONDS },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Pause failed" },
      { status: 500 }
    )
  }
}
