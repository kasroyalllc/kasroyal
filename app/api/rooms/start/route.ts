import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { assertTransition } from "@/lib/rooms/match-lifecycle"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import {
  canTransitionReadyToLive,
  getReadyToLivePayload,
  READY_LIKE_STATUSES,
} from "@/lib/rooms/lifecycle"

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

    assertTransition(room.status, "Live", "start")

    if (!room.challengerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Cannot start without challenger" },
        { status: 409 }
      )
    }

    const now = new Date()
    const nowMs = now.getTime()
    if (!canTransitionReadyToLive(room, nowMs)) {
      return NextResponse.json(
        { ok: true, room, countdownNotExpired: true },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const payload = getReadyToLivePayload(room, now)
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Only Connect 4, Tic-Tac-Toe, and Rock Paper Scissors support start" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("matches")
      .update(payload)
      .eq("id", roomId)
      .in("status", READY_LIKE_STATUSES)
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
