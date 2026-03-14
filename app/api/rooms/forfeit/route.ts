import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById, forfeitRoom } from "@/lib/rooms/rooms-service"
import { ensureFullRoom } from "@/lib/rooms/canonical-room"
import { assertTransition } from "@/lib/rooms/match-lifecycle"
import { logRoomAction } from "@/lib/log"
import { insertMatchEvent, insertMatchRound } from "@/lib/rooms/match-events"

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

    const winnerIdentityId = isHost ? room.challengerIdentityId : room.hostIdentityId
    if (!winnerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "Cannot determine winner (missing challenger)" },
        { status: 409 }
      )
    }

    const updated = await forfeitRoom(
      supabase,
      roomId,
      forfeiterIdentityId,
      winnerIdentityId
    )
    await insertMatchEvent(supabase, roomId, "forfeit", {
      forfeiter_identity_id: forfeiterIdentityId,
    })
    await insertMatchEvent(supabase, roomId, "match_finished", {
      winner_identity_id: winnerIdentityId,
      win_reason: "forfeit",
    })
    const roundNum = room.currentRound ?? 1
    const hostScore = room.hostRoundWins ?? 0
    const challengerScore = room.challengerRoundWins ?? 0
    const hostScoreAfter = winnerIdentityId === room.hostIdentityId ? hostScore + 1 : hostScore
    const challengerScoreAfter = winnerIdentityId === room.challengerIdentityId ? challengerScore + 1 : challengerScore
    await insertMatchRound(
      supabase,
      roomId,
      roundNum,
      winnerIdentityId,
      "forfeit",
      hostScoreAfter,
      challengerScoreAfter
    )
    logRoomAction("forfeit", roomId, { winner: isHost ? "challenger" : "host" })

    return NextResponse.json(
      { ok: true, room: ensureFullRoom(updated, room) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Forfeit failed" },
      { status: 500 }
    )
  }
}
