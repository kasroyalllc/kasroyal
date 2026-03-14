/**
 * GET /api/rooms/[id]/timeline — match event timeline and round records.
 * Used for history UX, final result surface, and spectator trust.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { listMatchEvents, listMatchRounds } from "@/lib/rooms/match-events"
import type { MatchEventRow, MatchRoundRow } from "@/lib/rooms/match-events"

export const dynamic = "force-dynamic"

export type TimelineResponse = {
  ok: boolean
  match_id: string
  events: MatchEventRow[]
  rounds: MatchRoundRow[]
  error?: string
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params
    if (!roomId) {
      return NextResponse.json(
        { ok: false, match_id: "", events: [], rounds: [], error: "Room id required" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const room = await getRoomById(supabase, roomId)
    if (!room) {
      return NextResponse.json(
        { ok: false, match_id: roomId, events: [], rounds: [], error: "Room not found" },
        { status: 404 }
      )
    }

    const [events, rounds] = await Promise.all([
      listMatchEvents(supabase, roomId),
      listMatchRounds(supabase, roomId),
    ])

    const body: TimelineResponse = {
      ok: true,
      match_id: roomId,
      events,
      rounds,
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        match_id: "",
        events: [],
        rounds: [],
        error: e instanceof Error ? e.message : "Timeline failed",
      },
      { status: 500 }
    )
  }
}
