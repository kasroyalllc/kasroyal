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
import { insertMatchEvent } from "@/lib/rooms/match-events"

export const dynamic = "force-dynamic"

/**
 * Transition room from Ready to Start -> Live only after pre-game countdown expires.
 * Uses countdown_started_at + countdown_seconds as source of truth. Sets turn_expires_at for DB-authoritative timer.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const roomId = String(body?.room_id ?? "").trim()
    const clientTimeMs = typeof body?.client_time_ms === "number" ? body.client_time_ms : null

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
    const countdownStartedAt = room.countdownStartedAt ?? null
    const countdownSeconds = (room.countdownSeconds ?? 30) * 1000
    const countdownEndMs = countdownStartedAt != null ? countdownStartedAt + countdownSeconds : 0
    const roomUpdatedAtMs = Number(room.updatedAt ?? 0)
    const serverSaysGo = canTransitionReadyToLive(room, nowMs)
    const clientSaysGo =
      clientTimeMs != null &&
      (countdownEndMs > 0
        ? clientTimeMs >= countdownEndMs
        : roomUpdatedAtMs > 0 && clientTimeMs - roomUpdatedAtMs > 35000)

    if (!serverSaysGo && !clientSaysGo) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[start] countdown not expired", {
          roomId,
          status: room.status,
          countdownStartedAt,
          countdownEndMs,
          nowMs,
          clientTimeMs,
          serverSaysGo,
          clientSaysGo,
        })
      }
      return NextResponse.json(
        { ok: true, room, countdownNotExpired: true },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (!serverSaysGo && clientSaysGo && process.env.NODE_ENV !== "production") {
      console.info("[start] using client time; server clock may be behind", { roomId, nowMs, clientTimeMs, countdownEndMs })
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
      const { data: refetched } = await supabase.from("matches").select("*").eq("id", roomId).maybeSingle()
      const latestRoom = refetched ? mapDbRowToRoom(refetched as Record<string, unknown>) : room
      const isLive = latestRoom.status === "Live"
      return NextResponse.json(
        { ok: true, room: latestRoom, alreadyLive: isLive },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    await insertMatchEvent(supabase, roomId, "match_live", {})
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
