/**
 * Move route: game-driver-based pipeline.
 * All supported games (TTT, C4, RPS) use the same flow: validate state → driver.applyMove → shared round/series/intermission resolution.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById, releaseActiveMatchByMatch } from "@/lib/rooms/rooms-service"
import { logRoomAction } from "@/lib/log"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import type { Room } from "@/lib/engine/match/types"
import { ensureFullRoom } from "@/lib/rooms/canonical-room"
import type { GameType } from "@/lib/engine/match/types"
import { getGameDriver } from "@/lib/rooms/game-drivers"
import type { RoundOutcome } from "@/lib/rooms/game-drivers"
import {
  resolveMoveToDbUpdate,
  type MoveDbUpdate,
} from "@/lib/rooms/move-pipeline"
import { transitionIntermissionToNextRound } from "@/lib/rooms/lifecycle"
import { insertMatchEvent, insertMatchRound } from "@/lib/rooms/match-events"

export const dynamic = "force-dynamic"

function isRoundOutcome(
  result: RoundOutcome | { error: string }
): result is RoundOutcome {
  return result != null && "newBoardState" in result && !("error" in result)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const roomId = String(body?.room_id ?? "").trim()
    const playerIdentityId = String(body?.player_identity_id ?? "").trim()
    const move = body?.move

    if (!roomId || !playerIdentityId) {
      return NextResponse.json(
        { ok: false, error: "room_id and player_identity_id required" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    let room = await getRoomById(supabase, roomId)

    if (!room) {
      return NextResponse.json(
        { ok: false, error: "Room not found" },
        { status: 404 }
      )
    }

    if (room.status !== "Live") {
      logRoomAction("move_rejected", roomId, { reason: "room_not_live", status: room.status })
      return NextResponse.json(
        { ok: false, error: "Room is not live" },
        { status: 409 }
      )
    }

    if (room.isPaused) {
      logRoomAction("move_rejected", roomId, { reason: "match_paused" })
      return NextResponse.json(
        { ok: false, error: "Match is paused" },
        { status: 409 }
      )
    }

    const intermissionUntil = room.roundIntermissionUntil ?? null
    if (
      intermissionUntil != null &&
      typeof intermissionUntil === "number" &&
      Date.now() < intermissionUntil
    ) {
      logRoomAction("move_rejected", roomId, { reason: "during_intermission" })
      return NextResponse.json(
        { ok: false, error: "Cannot move during intermission" },
        { status: 409 }
      )
    }

    // Past intermission but tick may not have run: transition to next round first so we never apply a move on stale board (e.g. RPS with prior-round hostChoice).
    if (
      intermissionUntil != null &&
      typeof intermissionUntil === "number" &&
      Date.now() >= intermissionUntil
    ) {
      const now = new Date()
      const nextRoom = await transitionIntermissionToNextRound(supabase, roomId, room, now)
      if (nextRoom) {
        room = nextRoom
      }
    }

    const isHost = room.hostIdentityId === playerIdentityId
    const isChallenger = room.challengerIdentityId === playerIdentityId
    if (!isHost && !isChallenger) {
      return NextResponse.json(
        { ok: false, error: "Not a seated player" },
        { status: 403 }
      )
    }

    const driver = getGameDriver(room.game as GameType)
    if (!driver) {
      return NextResponse.json(
        { ok: false, error: "Game does not support moves" },
        { status: 400 }
      )
    }

    if (driver.hasTurnTimer) {
      const currentTurnId = room.moveTurnIdentityId
      if (currentTurnId !== playerIdentityId) {
        logRoomAction("move_rejected", roomId, { reason: "not_your_turn" })
        return NextResponse.json(
          { ok: false, error: "Not your turn" },
          { status: 409 }
        )
      }
    }

    const payload = {
      move,
      side: isHost ? ("host" as const) : ("challenger" as const),
    }
    const result = driver.applyMove(room, payload)

    if (!isRoundOutcome(result)) {
      logRoomAction("move_rejected", roomId, {
        reason: "invalid_move",
        game: room.game,
        error: result.error,
      })
      return NextResponse.json(
        { ok: false, error: result.error ?? "Invalid move" },
        { status: 400 }
      )
    }

    const outcome = result
    if (outcome.newBoardState == null) {
      logRoomAction("suspicious_driver_result", roomId, {
        game: room.game,
        reason: "newBoardState_null",
      })
      return NextResponse.json(
        { ok: false, error: "Invalid move result" },
        { status: 500 }
      )
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const nowMs = now.getTime()

    const dbUpdate: MoveDbUpdate = resolveMoveToDbUpdate(
      room,
      outcome,
      nowIso,
      nowMs,
      driver
    )

    const { data, error } = await supabase
      .from("matches")
      .update(dbUpdate.payload)
      .eq("id", roomId)
      .in("status", ["Live", "live"])
      .select("*")
      .maybeSingle()

    if (error) {
      logRoomAction("move_persist_error", roomId, { error: error.message })
      throw error
    }

    if (dbUpdate.updateType === "series_finished" && dbUpdate.releaseMatch) {
      await releaseActiveMatchByMatch(supabase, roomId)
    }

    await insertMatchEvent(supabase, roomId, "move_applied", {
      game: room.game,
      round_number: room.currentRound ?? 1,
    })
    if (dbUpdate.updateType === "intermission") {
      await insertMatchEvent(supabase, roomId, dbUpdate.roundRecord.resultType === "draw" ? "round_draw" : "round_won", {
        round_number: dbUpdate.roundRecord.roundNumber,
        winner_identity_id: dbUpdate.roundRecord.winnerIdentityId,
        host_score: dbUpdate.roundRecord.hostScoreAfter,
        challenger_score: dbUpdate.roundRecord.challengerScoreAfter,
      })
      await insertMatchRound(
        supabase,
        roomId,
        dbUpdate.roundRecord.roundNumber,
        dbUpdate.roundRecord.winnerIdentityId,
        dbUpdate.roundRecord.resultType,
        dbUpdate.roundRecord.hostScoreAfter,
        dbUpdate.roundRecord.challengerScoreAfter
      )
      await insertMatchEvent(supabase, roomId, "intermission_started", {
        round_number: dbUpdate.payload.round_number as number,
      })
    }
    if (dbUpdate.updateType === "series_finished") {
      await insertMatchEvent(supabase, roomId, dbUpdate.roundRecord.resultType === "draw" ? "round_draw" : "round_won", {
        round_number: dbUpdate.roundRecord.roundNumber,
        winner_identity_id: dbUpdate.roundRecord.winnerIdentityId,
        host_score: dbUpdate.roundRecord.hostScoreAfter,
        challenger_score: dbUpdate.roundRecord.challengerScoreAfter,
      })
      await insertMatchRound(
        supabase,
        roomId,
        dbUpdate.roundRecord.roundNumber,
        dbUpdate.roundRecord.winnerIdentityId,
        dbUpdate.roundRecord.resultType,
        dbUpdate.roundRecord.hostScoreAfter,
        dbUpdate.roundRecord.challengerScoreAfter
      )
      await insertMatchEvent(supabase, roomId, "match_finished", {
        winner_identity_id: dbUpdate.payload.winner_identity_id as string | null | undefined,
        win_reason: dbUpdate.payload.win_reason as string | undefined,
        host_score: dbUpdate.roundRecord.hostScoreAfter,
        challenger_score: dbUpdate.roundRecord.challengerScoreAfter,
      })
    }

    logRoomAction(dbUpdate.logEvent, roomId, {
      game: room.game,
      updateType: dbUpdate.updateType,
    })

    const updatedRoom = data
      ? mapDbRowToRoom((data as Record<string, unknown>))
      : (await getRoomById(supabase, roomId)) ?? room
    const fullRoom = ensureFullRoom(updatedRoom, room)

    return NextResponse.json(
      { ok: true, room: fullRoom, server_time_ms: nowMs },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Move failed" },
      { status: 500 }
    )
  }
}
