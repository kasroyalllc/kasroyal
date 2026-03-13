import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendSpectateMessage } from "@/lib/rooms/rooms-service"

export const dynamic = "force-dynamic"

/** Persist spectate crowd talk message. Any viewer can send; shared for all spectators via realtime. */
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
    const msg = await sendSpectateMessage(supabase, {
      match_id: matchId,
      sender_identity_id: senderIdentityId,
      sender_display_name: senderDisplayName || "Spectator",
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
