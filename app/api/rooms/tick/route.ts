import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { createInitialBoardState } from "@/lib/rooms/game-board"
import {
  getMoveSecondsForGame,
  PRE_MATCH_COUNTDOWN_SECONDS,
  TIMEOUT_STRIKES_TO_LOSE,
} from "@/lib/engine/game-constants"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"

export const dynamic = "force-dynamic"

/**
 * Resolve time-based transitions on the backend (idempotent):
 * - Ready -> Live when countdown expires
 * - Timeout strike when move timer expires (Connect 4 / Tic-Tac-Toe)
 * - Finish match when strikes reach 3
 * Can be called by clients periodically until a job/scheduler exists.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const roomId = String(body?.room_id ?? "").trim()

    if (!roomId) {
      return NextResponse.json(
        { ok: false, error: "room_id required" },
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

    const now = new Date()
    const nowMs = now.getTime()
    const nowIso = now.toISOString()

    if (room.status === "Ready to Start") {
      const countdownStart = room.countdownStartedAt
        ? new Date(room.countdownStartedAt).getTime()
        : 0
      const countdownEnd = countdownStart + room.countdownSeconds * 1000
      if (countdownEnd <= nowMs && room.challengerIdentityId) {
        const gameType = room.game as GameType
        if (gameType === "Connect 4" || gameType === "Tic-Tac-Toe") {
          const moveSeconds = getMoveSecondsForGame(gameType)
          const boardState = createInitialBoardState(gameType)
          const { data, error } = await supabase
            .from("matches")
            .update({
              status: "Live",
              live_started_at: nowIso,
              started_at: nowIso,
              betting_open: false,
              board_state: boardState,
              move_turn_identity_id: room.hostIdentityId,
              move_turn_started_at: nowIso,
              move_turn_seconds: moveSeconds,
              updated_at: nowIso,
            })
            .eq("id", roomId)
            .eq("status", "Ready to Start")
            .select("*")
            .maybeSingle()
          if (error) throw error
          if (data) {
            return NextResponse.json(
              {
                ok: true,
                room: mapDbRowToRoom((data as Record<string, unknown>)),
                transition: "ready_to_live",
              },
              { headers: { "Cache-Control": "no-store" } }
            )
          }
        }
      }
      return NextResponse.json(
        { ok: true, room, transition: null },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (room.status === "Live") {
      const moveStartRaw = room.moveTurnStartedAt
      const moveSeconds = room.moveTurnSeconds ?? 0
      if (!moveStartRaw || !moveSeconds) {
        return NextResponse.json(
          { ok: true, room, transition: null },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      const moveStartMs =
        typeof moveStartRaw === "number" ? moveStartRaw : new Date(moveStartRaw).getTime()
      const moveEndMs = moveStartMs + moveSeconds * 1000

      if (moveEndMs > nowMs) {
        return NextResponse.json(
          { ok: true, room, transition: null },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      const currentTurnId = room.moveTurnIdentityId
      if (!currentTurnId) {
        return NextResponse.json(
          { ok: true, room, transition: null },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      const isHost = room.hostIdentityId === currentTurnId
      const newHostStrikes = isHost
        ? Math.min((room.hostTimeoutStrikes ?? 0) + 1, 999)
        : (room.hostTimeoutStrikes ?? 0)
      const newChallengerStrikes = !isHost
        ? Math.min((room.challengerTimeoutStrikes ?? 0) + 1, 999)
        : (room.challengerTimeoutStrikes ?? 0)

      if (newHostStrikes >= TIMEOUT_STRIKES_TO_LOSE) {
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: "Finished",
            host_timeout_strikes: newHostStrikes,
            winner_identity_id: room.challengerIdentityId,
            win_reason: "timeout",
            updated_at: nowIso,
            finished_at: nowIso,
            ended_at: nowIso,
          })
          .eq("id", roomId)
          .select("*")
          .maybeSingle()
        if (error) throw error
        return NextResponse.json(
          {
            ok: true,
            room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
            transition: "timeout_finish",
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      if (newChallengerStrikes >= TIMEOUT_STRIKES_TO_LOSE) {
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: "Finished",
            challenger_timeout_strikes: newChallengerStrikes,
            winner_identity_id: room.hostIdentityId,
            win_reason: "timeout",
            updated_at: nowIso,
            finished_at: nowIso,
            ended_at: nowIso,
          })
          .eq("id", roomId)
          .select("*")
          .maybeSingle()
        if (error) throw error
        return NextResponse.json(
          {
            ok: true,
            room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
            transition: "timeout_finish",
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      const nextTurnId = isHost ? room.challengerIdentityId : room.hostIdentityId
      const gameType = room.game as GameType
      const nextMoveSeconds = getMoveSecondsForGame(gameType)

      const { data, error } = await supabase
        .from("matches")
        .update({
          host_timeout_strikes: newHostStrikes,
          challenger_timeout_strikes: newChallengerStrikes,
          move_turn_identity_id: nextTurnId,
          move_turn_started_at: nowIso,
          move_turn_seconds: nextMoveSeconds,
          updated_at: nowIso,
        })
        .eq("id", roomId)
        .select("*")
        .maybeSingle()
      if (error) throw error
      return NextResponse.json(
        {
          ok: true,
          room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
          transition: "timeout_strike",
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    return NextResponse.json(
      { ok: true, room, transition: null },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Tick failed" },
      { status: 500 }
    )
  }
}
