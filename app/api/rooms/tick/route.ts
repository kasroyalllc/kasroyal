import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { assertTransition } from "@/lib/rooms/match-lifecycle"
import { createInitialBoardState } from "@/lib/rooms/game-board"
import {
  getMoveSecondsForGame,
  TIMEOUT_STRIKES_TO_LOSE,
} from "@/lib/engine/game-constants"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"
import { logRoomAction } from "@/lib/log"
import { DB_STATUS } from "@/lib/rooms/db-status"
import { releaseActiveMatchByMatch } from "@/lib/rooms/rooms-service"

export const dynamic = "force-dynamic"

/**
 * Resolve time-based transitions (idempotent). DB-authoritative:
 * - Ready -> Live only when countdown_started_at + countdown_seconds <= now
 * - Timeout strike only when now >= turn_expires_at
 * - Sets turn_expires_at on transition and on each strike.
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
      // Only transition when the real countdown deadline has been reached. No buffer, no early transition.
      const countdownStartedAt = room.countdownStartedAt ?? null
      if (!countdownStartedAt || !room.challengerIdentityId) {
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      const countdownEndMs = countdownStartedAt + room.countdownSeconds * 1000
      if (nowMs < countdownEndMs) {
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      const gameType = room.game as GameType
      if (
        gameType !== "Connect 4" &&
        gameType !== "Tic-Tac-Toe" &&
        gameType !== "Rock Paper Scissors"
      ) {
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      const moveSeconds = getMoveSecondsForGame(gameType)
      const boardState = createInitialBoardState(gameType)
      const isRps = gameType === "Rock Paper Scissors"
      const turnExpiresAt = isRps
        ? null
        : new Date(nowMs + moveSeconds * 1000).toISOString()

      assertTransition(room.status, "Live", "tick_ready_to_live")

      const { data, error } = await supabase
        .from("matches")
        .update({
          status: DB_STATUS.LIVE,
          live_started_at: nowIso,
          started_at: nowIso,
          betting_open: false,
          board_state: boardState,
          move_turn_identity_id: isRps ? null : room.hostIdentityId,
          move_turn_started_at: isRps ? null : nowIso,
          move_turn_seconds: isRps ? null : moveSeconds,
          turn_expires_at: turnExpiresAt,
          round_number: 1,
          host_score: 0,
          challenger_score: 0,
          updated_at: nowIso,
        })
        .eq("id", roomId)
        .in("status", ["ready", "countdown", "Ready to Start"])
        .select("*")
        .maybeSingle()
      if (error) throw error
      if (data) {
        logRoomAction("ready_to_live", roomId, { game: gameType })
        return NextResponse.json(
          {
            ok: true,
            room: mapDbRowToRoom((data as Record<string, unknown>)),
            transition: "ready_to_live",
            server_time_ms: Date.now(),
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      // Update matched 0 rows (e.g. another request already transitioned). Re-fetch and return latest so client gets Live.
      const { data: refetched } = await supabase.from("matches").select("*").eq("id", roomId).maybeSingle()
      const latestRoom = refetched ? mapDbRowToRoom(refetched as Record<string, unknown>) : room
      const isNowLive = refetched && String((refetched as Record<string, unknown>).status) === DB_STATUS.LIVE
      return NextResponse.json(
        {
          ok: true,
          room: latestRoom,
          transition: isNowLive ? "ready_to_live" : null,
          server_time_ms: Date.now(),
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (room.status === "Live") {
      const gameTypeLive = room.game as GameType
      // Between-round intermission: wait until round_intermission_until then start next round.
      const intermissionUntilMs = room.roundIntermissionUntil ?? null
      if (intermissionUntilMs != null) {
        if (nowMs < intermissionUntilMs) {
          return NextResponse.json(
            { ok: true, room, transition: null, server_time_ms: nowMs },
            { headers: { "Cache-Control": "no-store" } }
          )
        }
        const moveSeconds = getMoveSecondsForGame(gameTypeLive)
        const nextBoardState = createInitialBoardState(gameTypeLive)
        const isRps = gameTypeLive === "Rock Paper Scissors"
        const nextTurnId = isRps ? null : room.hostIdentityId
        const turnExpiresAt = isRps
          ? null
          : new Date(nowMs + moveSeconds * 1000).toISOString()
        const { data: intermissionData, error: intermissionError } = await supabase
          .from("matches")
          .update({
            round_intermission_until: null,
            last_round_winner_identity_id: null,
            board_state: nextBoardState,
            move_turn_identity_id: nextTurnId,
            move_turn_started_at: isRps ? null : nowIso,
            move_turn_seconds: isRps ? null : moveSeconds,
            turn_expires_at: turnExpiresAt,
            updated_at: nowIso,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (!intermissionError && intermissionData) {
          logRoomAction("intermission_next_round", roomId, { game: gameTypeLive })
          return NextResponse.json(
            {
              ok: true,
              room: mapDbRowToRoom((intermissionData as Record<string, unknown>)),
              transition: "intermission_next_round",
              server_time_ms: nowMs,
            },
            { headers: { "Cache-Control": "no-store" } }
          )
        }
      }
      if (gameTypeLive === "Rock Paper Scissors") {
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      // When paused: skip turn timeout; if pause duration expired, auto-resume and extend turn.
      if (room.isPaused) {
        const pauseExpiresAtMs = room.pauseExpiresAt ?? null
        if (pauseExpiresAtMs != null && nowMs >= pauseExpiresAtMs) {
          const moveSeconds = getMoveSecondsForGame(gameTypeLive)
          const turnExpiresAt = new Date(nowMs + moveSeconds * 1000).toISOString()
          const { data: resumeData, error: resumeError } = await supabase
            .from("matches")
            .update({
              is_paused: false,
              paused_at: null,
              paused_by: null,
              pause_expires_at: null,
              move_turn_started_at: nowIso,
              turn_expires_at: turnExpiresAt,
              updated_at: nowIso,
            })
            .eq("id", roomId)
            .in("status", ["Live", "live"])
            .select("*")
            .maybeSingle()
          if (!resumeError && resumeData) {
            return NextResponse.json(
              {
                ok: true,
                room: mapDbRowToRoom((resumeData as Record<string, unknown>)),
                transition: "pause_expired_resume",
                server_time_ms: nowMs,
              },
              { headers: { "Cache-Control": "no-store" } }
            )
          }
        }
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      // Timeout only when authoritative DB deadline has actually passed. No buffer, no computed fallback.
      const turnExpiresAtMs = room.turnExpiresAt ?? null
      if (turnExpiresAtMs == null || nowMs < turnExpiresAtMs) {
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      const currentTurnId = room.moveTurnIdentityId
      if (!currentTurnId) {
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
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
        assertTransition(room.status, "Finished", "tick_timeout_finish")
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: DB_STATUS.FINISHED,
            host_timeout_strikes: newHostStrikes,
            winner_identity_id: room.challengerIdentityId,
            win_reason: "timeout",
            updated_at: nowIso,
            finished_at: nowIso,
            ended_at: nowIso,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (error) throw error
        await releaseActiveMatchByMatch(supabase, roomId)
        logRoomAction("timeout_finish", roomId, { winner: "challenger", reason: "timeout" })
        return NextResponse.json(
          {
            ok: true,
            room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
            transition: "timeout_finish",
            server_time_ms: nowMs,
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      if (newChallengerStrikes >= TIMEOUT_STRIKES_TO_LOSE) {
        assertTransition(room.status, "Finished", "tick_timeout_finish")
        const { data, error } = await supabase
          .from("matches")
          .update({
            status: DB_STATUS.FINISHED,
            challenger_timeout_strikes: newChallengerStrikes,
            winner_identity_id: room.hostIdentityId,
            win_reason: "timeout",
            updated_at: nowIso,
            finished_at: nowIso,
            ended_at: nowIso,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (error) throw error
        await releaseActiveMatchByMatch(supabase, roomId)
        logRoomAction("timeout_finish", roomId, { winner: "host", reason: "timeout" })
        return NextResponse.json(
          {
            ok: true,
            room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
            transition: "timeout_finish",
            server_time_ms: nowMs,
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      logRoomAction("timeout_strike", roomId, { strikesHost: newHostStrikes, strikesChallenger: newChallengerStrikes })
      const nextTurnId = isHost ? room.challengerIdentityId : room.hostIdentityId
      const gameType = room.game as GameType
      const nextMoveSeconds = getMoveSecondsForGame(gameType)
      const nextTurnExpiresAt = new Date(
        nowMs + nextMoveSeconds * 1000
      ).toISOString()

      const { data, error } = await supabase
        .from("matches")
        .update({
          host_timeout_strikes: newHostStrikes,
          challenger_timeout_strikes: newChallengerStrikes,
          move_turn_identity_id: nextTurnId,
          move_turn_started_at: nowIso,
          move_turn_seconds: nextMoveSeconds,
          turn_expires_at: nextTurnExpiresAt,
          updated_at: nowIso,
        })
        .eq("id", roomId)
        .in("status", ["Live", "live"])
        .select("*")
        .maybeSingle()
      if (error) throw error
      return NextResponse.json(
        {
          ok: true,
          room: data ? mapDbRowToRoom((data as Record<string, unknown>)) : room,
          transition: "timeout_strike",
          server_time_ms: nowMs,
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    return NextResponse.json(
      { ok: true, room, transition: null, server_time_ms: nowMs },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Tick failed" },
      { status: 500 }
    )
  }
}
