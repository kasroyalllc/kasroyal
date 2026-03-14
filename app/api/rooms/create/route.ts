import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
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

/** Create a room. Uses admin client (SUPABASE_SERVICE_ROLE_KEY) only. */
export async function POST(request: NextRequest) {
  const urlExists = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  )
  const serviceRoleKeyExists = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  console.log("[api/rooms/create] Env check (safe):", {
    urlExists,
    serviceRoleKeyExists,
  })

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
  const bestOfRaw = Number(body.best_of ?? 1)
  const bestOf: 1 | 3 | 5 = bestOfRaw === 3 || bestOfRaw === 5 ? bestOfRaw : 1

  if (!hostIdentityId) {
    return NextResponse.json(
      { ok: false, error: "host_identity_id required" },
      { status: 400 }
    )
  }

  const isGuestIdentity = hostIdentityId.toLowerCase().startsWith("guest-")
  if (mode === "ranked" && isGuestIdentity) {
    return NextResponse.json(
      { ok: false, error: "Ranked matches require a connected wallet. Connect your wallet to create a ranked room." },
      { status: 400 }
    )
  }

  const createPayload = {
    mode,
    game_type: gameType,
    host_identity_id: hostIdentityId,
    host_display_name: hostDisplayName,
    wager_amount: wagerAmount,
  }

  try {
    const supabase = createAdminClient()

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
      best_of: bestOf,
    })

    if (!room?.id || typeof room.id !== "string" || room.id.trim() === "") {
      console.error("[api/rooms/create] Room created but missing id:", { roomId: room?.id })
      return NextResponse.json(
        { ok: false, error: "Room created but invalid response" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { ok: true, room },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    const message = getErrorMessage(e)
    const supabaseMessage =
      e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : null
    const supabaseCode =
      e && typeof e === "object" && "code" in e
        ? (e as { code?: string }).code
        : null

    console.error("[api/rooms/create] Room creation failed (safe log):", {
      urlExists,
      serviceRoleKeyExists,
      message,
      supabaseExactMessage: supabaseMessage,
      supabaseCode,
      requestPayload: createPayload,
    })

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
