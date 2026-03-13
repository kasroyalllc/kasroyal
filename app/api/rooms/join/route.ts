import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getRoomById,
  joinRoom,
  listActiveRooms,
} from "@/lib/rooms/rooms-service"

export const dynamic = "force-dynamic"

/** Join an open room. Cannot join own room; cannot join if already in another active match. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const roomId = String(body.room_id ?? "").trim()
    const challengerIdentityId = String(body.challenger_identity_id ?? "").trim()
    const challengerDisplayName = String(
      body.challenger_display_name ?? "Challenger"
    ).trim()

    if (!roomId || !challengerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "room_id and challenger_identity_id required" },
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

    if (room.status !== "Waiting for Opponent") {
      return NextResponse.json(
        { ok: false, error: "Room is not open to join" },
        { status: 409 }
      )
    }

    if (room.hostIdentityId === challengerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Cannot join your own room" },
        { status: 400 }
      )
    }

    const isGuestIdentity = challengerIdentityId.toLowerCase().startsWith("guest-")
    if (room.mode === "ranked" && isGuestIdentity) {
      return NextResponse.json(
        { ok: false, error: "Ranked matches require a connected wallet. Connect your wallet to join this room." },
        { status: 400 }
      )
    }

    const active = await listActiveRooms(supabase)
    const alreadyInMatch = active.some(
      (r) =>
        r.hostIdentityId === challengerIdentityId ||
        r.challengerIdentityId === challengerIdentityId
    )
    if (alreadyInMatch) {
      return NextResponse.json(
        { ok: false, error: "Already in an active match" },
        { status: 409 }
      )
    }

    const updated = await joinRoom(supabase, roomId, {
      challenger_identity_id: challengerIdentityId,
      challenger_display_name: challengerDisplayName,
    })

    return NextResponse.json(
      { ok: true, room: updated },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Join room failed" },
      { status: 500 }
    )
  }
}
