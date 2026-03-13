import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendRoomMessage } from "@/lib/rooms/rooms-service"
import { getRoomById } from "@/lib/rooms/rooms-service"

export const dynamic = "force-dynamic"

/** Persist room chat message in Supabase. No localStorage authority. */
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

    const supabase = await createClient()
    const room = await getRoomById(supabase, matchId)
    if (!room) {
      return NextResponse.json(
        { ok: false, error: "Room not found" },
        { status: 404 }
      )
    }

    const isParticipant =
      room.hostIdentityId === senderIdentityId ||
      room.challengerIdentityId === senderIdentityId
    if (!isParticipant) {
      return NextResponse.json(
        { ok: false, error: "Only participants can send chat" },
        { status: 403 }
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
