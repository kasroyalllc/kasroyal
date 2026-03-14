/**
 * Match events timeline and round result record.
 * Canonical event types and payloads for auditability and history UX.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type MatchEventType =
  | "room_created"
  | "challenger_joined"
  | "countdown_started"
  | "match_live"
  | "move_applied"
  | "round_won"
  | "round_draw"
  | "intermission_started"
  | "next_round_started"
  | "pause_requested"
  | "resumed"
  | "forfeit"
  | "match_finished"

export type MatchRoundResultType = "win" | "draw" | "timeout" | "forfeit"

export type MatchEventPayload = Record<string, unknown> & {
  game?: string
  round_number?: number
  winner_identity_id?: string | null
  host_score?: number
  challenger_score?: number
  win_reason?: string
  paused_by?: string
  forfeiter_identity_id?: string
  [key: string]: unknown
}

export type MatchEventRow = {
  id: string
  match_id: string
  event_type: MatchEventType
  payload: MatchEventPayload
  created_at: string
}

export type MatchRoundRow = {
  id: string
  match_id: string
  round_number: number
  winner_identity_id: string | null
  result_type: MatchRoundResultType
  host_score_after: number
  challenger_score_after: number
  created_at: string
}

/**
 * Insert a match event. Safe to call from API routes; no-op if insert fails (log and continue).
 */
export async function insertMatchEvent(
  supabase: SupabaseClient,
  matchId: string,
  eventType: MatchEventType,
  payload: MatchEventPayload = {}
): Promise<void> {
  try {
    const { error } = await supabase.from("match_events").insert({
      match_id: matchId,
      event_type: eventType,
      payload: payload ?? {},
    })
    if (error) {
      console.warn("[match-events] insertMatchEvent failed:", matchId, eventType, error.message)
    }
  } catch (e) {
    console.warn("[match-events] insertMatchEvent error:", e)
  }
}

/**
 * Insert a completed round record. Call when a round ends (win/draw/timeout/forfeit).
 */
export async function insertMatchRound(
  supabase: SupabaseClient,
  matchId: string,
  roundNumber: number,
  winnerIdentityId: string | null,
  resultType: MatchRoundResultType,
  hostScoreAfter: number,
  challengerScoreAfter: number
): Promise<void> {
  try {
    const { error } = await supabase.from("match_rounds").upsert(
      {
        match_id: matchId,
        round_number: roundNumber,
        winner_identity_id: winnerIdentityId,
        result_type: resultType,
        host_score_after: hostScoreAfter,
        challenger_score_after: challengerScoreAfter,
      },
      { onConflict: "match_id,round_number" }
    )
    if (error) {
      console.warn("[match-events] insertMatchRound failed:", matchId, roundNumber, error.message)
    }
  } catch (e) {
    console.warn("[match-events] insertMatchRound error:", e)
  }
}

/**
 * List events for a match, ordered by created_at ascending.
 */
export async function listMatchEvents(
  supabase: SupabaseClient,
  matchId: string
): Promise<MatchEventRow[]> {
  const { data, error } = await supabase
    .from("match_events")
    .select("id, match_id, event_type, payload, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
  if (error) return []
  return (data ?? []) as MatchEventRow[]
}

/**
 * List completed rounds for a match, ordered by round_number ascending.
 */
export async function listMatchRounds(
  supabase: SupabaseClient,
  matchId: string
): Promise<MatchRoundRow[]> {
  const { data, error } = await supabase
    .from("match_rounds")
    .select("id, match_id, round_number, winner_identity_id, result_type, host_score_after, challenger_score_after, created_at")
    .eq("match_id", matchId)
    .order("round_number", { ascending: true })
  if (error) return []
  return (data ?? []) as MatchRoundRow[]
}
