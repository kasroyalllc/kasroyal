import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendRoomMessage } from "@/lib/rooms/rooms-service"
import { getRoomById } from "@/lib/rooms/rooms-service"

export const dynamic = "force-dynamic"

/**
 * Send a room chat message. Persisted in Supabase (match_messages). No localStorage authority.
 * Room chat is for everyone in the match room: host, challenger, and spectators.
 * Any identity viewing the room can send; there is no player-only restriction.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const matchId = String(body.match_id ?? "").trim()
    const senderIdentityId = String(body.sender_identity_id ?? "").trim()
    const senderDisplayName = String(body.sender_display_name ?? "").trim()
    const message = String(body.message ?? "").trim().slice(0, 2000)

    if (!matchId || !senderIdentityId || !message) {
      return NextResponse.json(
        { ok: false, error: "match_id, sender_identity_id, and message required" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const room = await getRoomById(supabase, matchId)
    if (!room) {
      return NextResponse.json(
        { ok: false, error: "Room not found" },
        { status: 404 }
      )
    }

    const msg = await sendRoomMessage(supabase, {
      match_id: matchId,
      sender_identity_id: senderIdentityId,
      sender_display_name: senderDisplayName || "Player",
      message,
    })

    return NextResponse.json(
      { ok: true, message: msg },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Send message failed" },
      { status: 500 }
    )
  }
}
