import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoomById } from "@/lib/rooms/rooms-service"
import { assertTransition } from "@/lib/rooms/match-lifecycle"
import { createInitialBoardState, createRpsRoundBoard } from "@/lib/rooms/game-board"
import {
  getMoveSecondsForGame,
  RPS_ROUND_SECONDS,
  TIMEOUT_STRIKES_TO_LOSE,
} from "@/lib/engine/game-constants"
import { mapDbRowToRoom } from "@/lib/engine/match/types"
import type { GameType } from "@/lib/engine/match/types"
import { logRoomAction } from "@/lib/log"
import { DB_STATUS } from "@/lib/rooms/db-status"
import { releaseActiveMatchByMatch } from "@/lib/rooms/rooms-service"
import {
  canTransitionReadyToLive,
  getReadyToLivePayload,
  READY_LIKE_STATUSES,
} from "@/lib/rooms/lifecycle"
import { getGameDriver, resolveRpsRoundTimeout } from "@/lib/rooms/game-drivers"
import {
  resolveMoveToDbUpdate,
  type MoveDbUpdate,
} from "@/lib/rooms/move-pipeline"
import { insertMatchEvent, insertMatchRound } from "@/lib/rooms/match-events"
import { serializeApiError } from "@/lib/api-error"

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
    const clientTimeMs = typeof body?.client_time_ms === "number" ? body.client_time_ms : null

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
      const countdownStartedAt = room.countdownStartedAt ?? null
      const countdownSeconds = (room.countdownSeconds ?? 30) * 1000
      const countdownEndMs = countdownStartedAt != null ? countdownStartedAt + countdownSeconds : 0
      const roomUpdatedAtMs = Number(room.updatedAt ?? 0)
      const serverSaysGo = canTransitionReadyToLive(room, nowMs)
      const clientSaysGo =
        clientTimeMs != null &&
        (countdownEndMs > 0
          ? clientTimeMs >= countdownEndMs
          : roomUpdatedAtMs > 0 && clientTimeMs - roomUpdatedAtMs > 35000)
      if (!serverSaysGo && !clientSaysGo) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[tick Ready->Live]", {
            room_id: roomId,
            previous_status: room.status,
            countdown_end_ms: countdownEndMs,
            server_now_ms: nowMs,
            client_time_ms: clientTimeMs ?? null,
            transition_allowed: false,
            db_rows_affected: 0,
            final_returned_room_status: "Ready to Start",
          })
        }
        return NextResponse.json(
          { ok: true, room, transition: null, server_time_ms: nowMs },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      const gameType = room.game as GameType
      try {
        const payload = getReadyToLivePayload(room, now)
        if (!payload) {
          return NextResponse.json(
            { ok: true, room, transition: null, server_time_ms: nowMs },
            { headers: { "Cache-Control": "no-store" } }
          )
        }
        assertTransition(room.status, "Live", "tick_ready_to_live")

        const { data, error } = await supabase
          .from("matches")
          .update(payload)
          .eq("id", roomId)
          .in("status", READY_LIKE_STATUSES)
          .select("*")
          .maybeSingle()
        if (error) throw error
        if (data) {
          if (process.env.NODE_ENV !== "production") {
            console.info("[tick Ready->Live]", {
              room_id: roomId,
              previous_status: room.status,
              countdown_end_ms: countdownEndMs,
              server_now_ms: nowMs,
              client_time_ms: clientTimeMs ?? null,
              transition_allowed: true,
              db_rows_affected: 1,
              final_returned_room_status: "Live",
            })
          }
          await insertMatchEvent(supabase, roomId, "match_live", {})
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
        const refetchedStatus = refetched != null ? String((refetched as Record<string, unknown>).status) : "null"
        const finalStatus = refetched ? refetchedStatus : "Ready to Start"
        if (process.env.NODE_ENV !== "production") {
          console.info("[tick Ready->Live]", {
            room_id: roomId,
            previous_status: room.status,
            countdown_end_ms: countdownEndMs,
            server_now_ms: nowMs,
            client_time_ms: clientTimeMs ?? null,
            transition_allowed: true,
            db_rows_affected: 0,
            final_returned_room_status: finalStatus,
          })
        }
        logRoomAction("tick_ready_to_live_0_rows", roomId, { game: gameType, refetched_status: refetchedStatus })
        const latestRoom = refetched ? mapDbRowToRoom(refetched as Record<string, unknown>) : room
        const isNowLive = refetched && refetchedStatus === DB_STATUS.LIVE
        return NextResponse.json(
          {
            ok: true,
            room: latestRoom,
            transition: isNowLive ? "ready_to_live" : null,
            server_time_ms: Date.now(),
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      } catch (readyToLiveErr) {
        const msg = readyToLiveErr instanceof Error ? readyToLiveErr.message : String(readyToLiveErr)
        const code = (readyToLiveErr as { code?: string })?.code
        throw new Error(
          `Tick Ready→Live failed (room_id=${roomId}, game=${String(room.game)}): ${msg}${code ? ` [${code}]` : ""}`
        )
      }
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
        const driver = getGameDriver(gameTypeLive)
        const nextBoardState =
          gameTypeLive === "Rock Paper Scissors"
            ? createRpsRoundBoard(nowMs + RPS_ROUND_SECONDS * 1000)
            : driver
              ? driver.createInitialBoardState()
              : createInitialBoardState(gameTypeLive)
        if (gameTypeLive === "Rock Paper Scissors") {
          const rpsBoard = nextBoardState as { hostChoice?: unknown; challengerChoice?: unknown; revealed?: unknown; roundExpiresAt?: unknown }
          console.info("[tick RPS intermission→next] payload we are writing (createRpsRoundBoard)", {
            room_id: roomId,
            hostChoice: rpsBoard.hostChoice,
            challengerChoice: rpsBoard.challengerChoice,
            revealed: rpsBoard.revealed,
            roundExpiresAt: rpsBoard.roundExpiresAt,
          })
        }
        const nextTurnId = driver?.hasTurnTimer ? room.hostIdentityId : null
        const moveSeconds = getMoveSecondsForGame(gameTypeLive)
        const turnExpiresAt =
          nextTurnId != null
            ? new Date(nowMs + moveSeconds * 1000).toISOString()
            : null
        const { data: intermissionData, error: intermissionError } = await supabase
          .from("matches")
          .update({
            round_intermission_until: null,
            last_round_winner_identity_id: null,
            board_state: nextBoardState,
            move_turn_identity_id: nextTurnId,
            move_turn_started_at: nextTurnId != null ? nowIso : null,
            move_turn_seconds: nextTurnId != null ? moveSeconds : null,
            turn_expires_at: turnExpiresAt,
            updated_at: nowIso,
          })
          .eq("id", roomId)
          .in("status", ["Live", "live"])
          .select("*")
          .maybeSingle()
        if (!intermissionError && intermissionData) {
          const row = intermissionData as Record<string, unknown>
          if (gameTypeLive === "Rock Paper Scissors" && row.board_state) {
            const written = row.board_state as Record<string, unknown>
            console.info("[tick RPS intermission→next] room row AFTER write (first state after intermission)", {
              room_id: roomId,
              round_intermission_until: row.round_intermission_until,
              last_round_winner_identity_id: row.last_round_winner_identity_id,
              board_state: JSON.stringify(written),
              hostChoice: written.hostChoice,
              challengerChoice: written.challengerChoice,
              revealed: written.revealed,
              roundExpiresAt: written.roundExpiresAt,
            })
          }
          await insertMatchEvent(supabase, roomId, "next_round_started", {
            round_number: (room.currentRound ?? 1) + 1,
          })
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
      // RPS round timer: if round expired, resolve (one chose → that side wins; neither → draw).
      if (gameTypeLive === "Rock Paper Scissors") {
        const rpsOutcome = resolveRpsRoundTimeout(room, nowMs)
        if (rpsOutcome) {
          const driver = getGameDriver(gameTypeLive)
          if (driver) {
            const dbUpdate: MoveDbUpdate = resolveMoveToDbUpdate(
              room,
              rpsOutcome,
              nowIso,
              nowMs,
              driver
            )
            const { data: updateData, error: updateError } = await supabase
              .from("matches")
              .update(dbUpdate.payload)
              .eq("id", roomId)
              .in("status", ["Live", "live"])
              .select("*")
              .maybeSingle()
            if (!updateError && updateData) {
              if (dbUpdate.updateType === "series_finished" && "releaseMatch" in dbUpdate && dbUpdate.releaseMatch) {
                await releaseActiveMatchByMatch(supabase, roomId)
              }
              await insertMatchEvent(supabase, roomId, "move_applied", { game: gameTypeLive, round_number: room.currentRound ?? 1 })
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
              logRoomAction("rps_round_timeout", roomId, { updateType: dbUpdate.updateType })
              return NextResponse.json(
                {
                  ok: true,
                  room: mapDbRowToRoom((updateData as Record<string, unknown>)),
                  transition: "rps_round_timeout",
                  server_time_ms: nowMs,
                },
                { headers: { "Cache-Control": "no-store" } }
              )
            }
          }
        }
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
        await insertMatchEvent(supabase, roomId, "match_finished", {
          winner_identity_id: room.challengerIdentityId,
          win_reason: "timeout",
        })
        await insertMatchRound(
          supabase,
          roomId,
          room.currentRound ?? 1,
          room.challengerIdentityId,
          "timeout",
          room.hostRoundWins ?? 0,
          (room.challengerRoundWins ?? 0) + 1
        )
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
        await insertMatchEvent(supabase, roomId, "match_finished", {
          winner_identity_id: room.hostIdentityId,
          win_reason: "timeout",
        })
        await insertMatchRound(
          supabase,
          roomId,
          room.currentRound ?? 1,
          room.hostIdentityId,
          "timeout",
          (room.hostRoundWins ?? 0) + 1,
          room.challengerRoundWins ?? 0
        )
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
    const payload = serializeApiError(e)
    console.error("[tick] 500", payload.error, (e as Error)?.stack ?? "")
    return NextResponse.json({ ok: false, ...payload }, { status: 500 })
  }
}
