import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"

export const dynamic = "force-dynamic"

/** Cancel open room. Host only; only if no challenger; releases active lock. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const roomId = String(body.room_id ?? "").trim()
    const hostIdentityId = String(body.host_identity_id ?? "").trim()

    if (!roomId || !hostIdentityId) {
      return NextResponse.json(
        { ok: false, error: "room_id and host_identity_id required" },
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

    if (room.hostIdentityId !== hostIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Only host can cancel" },
        { status: 403 }
      )
    }

    if (room.challengerIdentityId != null) {
      return NextResponse.json(
        { ok: false, error: "Cannot cancel once challenger has joined" },
        { status: 409 }
      )
    }

    if (room.status !== "Waiting for Opponent") {
      return NextResponse.json(
        { ok: false, error: "Room is not in waiting state" },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from("matches")
      .update({ status: "Finished", ended_at: now })
      .eq("id", roomId)
      .eq("host_wallet", hostIdentityId)

    if (error) throw error

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Cancel room failed" },
      { status: 500 }
    )
  }
}
