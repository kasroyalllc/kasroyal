import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  createRoom,
  listActiveRooms,
} from "@/lib/rooms/rooms-service"
import type { GameType } from "@/lib/engine/match/types"

export const dynamic = "force-dynamic"

/** Create a room. Quick = no wager; Ranked = wager allowed. One active match per identity. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mode = (body.mode as "quick" | "ranked") ?? "quick"
    const gameType = (body.game_type as GameType) ?? "Tic-Tac-Toe"
    const hostIdentityId = String(body.host_identity_id ?? "").trim()
    const hostDisplayName = String(body.host_display_name ?? "Host").trim()
    const wagerAmount = mode === "ranked" ? Math.max(0, Number(body.wager_amount) ?? 0) : 0

    if (!hostIdentityId) {
      return NextResponse.json(
        { ok: false, error: "host_identity_id required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const active = await listActiveRooms(supabase)
    const alreadyInMatch = active.some(
      (r) =>
        r.hostIdentityId === hostIdentityId || r.challengerIdentityId === hostIdentityId
    )
    if (alreadyInMatch) {
      return NextResponse.json(
        { ok: false, error: "One active match per identity" },
        { status: 409 }
      )
    }

    const room = await createRoom(supabase, {
      mode,
      game_type: gameType,
      host_identity_id: hostIdentityId,
      host_display_name: hostDisplayName,
      wager_amount: wagerAmount,
    })

    return NextResponse.json(
      { ok: true, room },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Create room failed" },
      { status: 500 }
    )
  }
}
