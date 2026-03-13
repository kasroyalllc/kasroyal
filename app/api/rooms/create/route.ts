import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  createRoom,
  listActiveRooms,
} from "@/lib/rooms/rooms-service"
import type { GameType } from "@/lib/engine/match/types"

export const dynamic = "force-dynamic"

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === "string") return e
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message
  }
  return "Create room failed"
}

/** Create a room. Quick = no wager; Ranked = wager allowed. One active match per identity. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

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

  try {
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
    const message = getErrorMessage(e)
    const supabaseError = e && typeof e === "object" && "code" in e
      ? { code: (e as { code: string }).code, details: (e as { details: unknown }).details }
      : null

    console.error("[api/rooms/create] Room creation failed:", {
      message,
      stack: e instanceof Error ? e.stack : undefined,
      supabaseError,
      requestPayload: {
        mode,
        game_type: gameType,
        host_identity_id_length: hostIdentityId.length,
        wager_amount: wagerAmount,
      },
    })

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
