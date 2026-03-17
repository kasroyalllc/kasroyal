import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { assertTransition } from "@/lib/rooms/match-lifecycle"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import { ensureFullRoom } from "@/lib/rooms/canonical-room"
import {
  computeReadyToLiveUpdate,
  getReadyToLivePayload,
  READY_LIKE_STATUSES,
} from "@/lib/rooms/lifecycle"
import { insertMatchEvent } from "@/lib/rooms/match-events"
import { serializeApiError } from "@/lib/api-error"

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
    const { shouldTransition, payload } = computeReadyToLiveUpdate(room, nowMs, clientTimeMs)
    const countdownEndMs =
      room.countdownStartedAt != null
        ? room.countdownStartedAt + (room.countdownSeconds ?? 30) * 1000
        : 0

    if (!shouldTransition) {
      return NextResponse.json(
        { ok: true, room, countdownNotExpired: true },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const payloadFromLifecycle = payload
    console.info("[start Ready→Live] attempt", {
      room_id: roomId,
      filters: { eq_id: roomId, in_status: [...READY_LIKE_STATUSES] },
      payload_keys: Object.keys(payloadFromLifecycle ?? {}),
    })
    if (!payloadFromLifecycle) {
      return NextResponse.json(
        { ok: false, error: "Only Connect 4, Tic-Tac-Toe, and Rock Paper Scissors support start" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("matches")
      .update(payloadFromLifecycle)
      .eq("id", roomId)
      .in("status", READY_LIKE_STATUSES)
      .select("*")
      .maybeSingle()

    if (error) throw error

    if (!data) {
      const { data: refetched } = await supabase.from("matches").select("*").eq("id", roomId).maybeSingle()
      const mappedRefetched = refetched ? mapDbRowToRoom(refetched as Record<string, unknown>) : null
      // When refetched row is Live but has no boardState, attach from payload so client never gets partial room.
      if (mappedRefetched && mappedRefetched.status === "Live" && (mappedRefetched.boardState == null || typeof mappedRefetched.boardState !== "object")) {
        const fallbackPayload = getReadyToLivePayload(room, new Date())
        if (fallbackPayload?.board_state != null && typeof fallbackPayload.board_state === "object") {
          mappedRefetched.boardState = fallbackPayload.board_state
        }
      }
      const latestRoom = mappedRefetched != null ? ensureFullRoom(mappedRefetched, room) : room
      const isLive = latestRoom.status === "Live"
      const finalStatus = latestRoom.status ?? "unknown"
      console.info("[start Ready→Live] update affected 0 rows", {
        room_id: roomId,
        affected_rows: 0,
        refetched_status: latestRoom.status,
        refetched_updated_at: latestRoom.updatedAt ?? null,
      })
      return NextResponse.json(
        { ok: true, room: latestRoom, alreadyLive: isLive },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    console.info("[start Ready→Live] update succeeded", {
      room_id: roomId,
      affected_rows: 1,
      returned_status: (data as Record<string, unknown>)?.status ?? "live",
      returned_updated_at: (data as Record<string, unknown>)?.updated_at != null ? String((data as Record<string, unknown>).updated_at) : null,
    })
    await insertMatchEvent(supabase, roomId, "match_live", {})
    const updatedRoom = mapDbRowToRoom((data ?? {}) as Record<string, unknown>)
    const payloadBoardState = (payloadFromLifecycle as { board_state?: unknown }).board_state
    if (updatedRoom.boardState == null && payloadBoardState != null) {
      updatedRoom.boardState = payloadBoardState
    }
    updatedRoom.updatedAt = nowMs
    const fullRoom = ensureFullRoom(updatedRoom, room)

    return NextResponse.json(
      { ok: true, room: fullRoom, server_time_ms: nowMs },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    const payload = serializeApiError(e)
    console.error("[start] 500", payload.error, (e as Error)?.stack ?? "")
    return NextResponse.json({ ok: false, ...payload }, { status: 500 })
  }
}
