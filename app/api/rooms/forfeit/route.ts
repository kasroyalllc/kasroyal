import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById, forfeitRoom } from "@/lib/rooms/rooms-service"
import { assertTransition } from "@/lib/rooms/match-lifecycle"
import { logRoomAction } from "@/lib/log"

export const dynamic = "force-dynamic"

/** Forfeit match. Seated players only; Ready or Live; one forfeit finalizes for both. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const roomId = String(body.room_id ?? "").trim()
    const forfeiterIdentityId = String(body.forfeiter_identity_id ?? "").trim()

    if (!roomId || !forfeiterIdentityId) {
      return NextResponse.json(
        { ok: false, error: "room_id and forfeiter_identity_id required" },
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

    const isHost = room.hostIdentityId === forfeiterIdentityId
    const isChallenger = room.challengerIdentityId === forfeiterIdentityId
    if (!isHost && !isChallenger) {
      return NextResponse.json(
        { ok: false, error: "Only a seated player can forfeit" },
        { status: 403 }
      )
    }

    if (room.status !== "Ready to Start" && room.status !== "Live") {
      return NextResponse.json(
        { ok: false, error: "Forfeit only allowed in Ready to Start or Live" },
        { status: 409 }
      )
    }

    assertTransition(room.status, "Finished", "forfeit")

    const winnerIdentityId = isHost ? room.challengerIdentityId! : room.hostIdentityId

    const updated = await forfeitRoom(
      supabase,
      roomId,
      forfeiterIdentityId,
      winnerIdentityId
    )
    logRoomAction("forfeit", roomId, { winner: isHost ? "challenger" : "host" })

    return NextResponse.json(
      { ok: true, room: updated },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Forfeit failed" },
      { status: 500 }
    )
  }
}
