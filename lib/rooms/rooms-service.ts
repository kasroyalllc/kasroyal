/**
 * Backend-first room service. Uses Supabase as source of truth.
 * Supports both legacy status strings and canonical DB status (waiting, ready, countdown, live, finished, forfeited, canceled).
 * Series: supports round_number, host_score, challenger_score with fallback to current_round, host_round_wins, challenger_round_wins.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapDbRowToRoom,
  mapMessageRowToRoomMessage,
  type Room,
  type RoomMessage,
} from "@/lib/engine/match/types"
import {
  DB_ACTIVE_STATUSES,
  DB_FINISHED_STATUSES,
  DB_SPECTATE_STATUSES,
  DB_STATUS,
} from "@/lib/rooms/db-status"

/** Query statuses that mean "active" — support both canonical and legacy. */
const ACTIVE_STATUS_VALUES = [
  ...DB_ACTIVE_STATUSES,
  "Waiting for Opponent",
  "Ready to Start",
  "Live",
]
/** Query statuses that mean "finished" for history. */
const FINISHED_STATUS_VALUES = [
  ...DB_FINISHED_STATUSES,
  "Finished",
]
/** Query statuses that allow spectating. */
const SPECTATE_STATUS_VALUES = [
  ...DB_SPECTATE_STATUSES,
  "Ready to Start",
  "Live",
]

/** Active = waiting, ready, countdown, or live only (not finished/forfeited/canceled). */
export async function listActiveRooms(
  supabase: SupabaseClient
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", ACTIVE_STATUS_VALUES)
    .order("created_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** History = finished/forfeited/canceled. Order by finished_at desc. */
export async function listHistoryRooms(
  supabase: SupabaseClient
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", FINISHED_STATUS_VALUES)
    .order("finished_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** Recently resolved = finished/forfeited/canceled; limited. */
export async function listRecentResolvedRooms(
  supabase: SupabaseClient,
  limit = 6
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", FINISHED_STATUS_VALUES)
    .order("finished_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** Spectate = ready/countdown/live with a challenger. */
export async function listSpectateRooms(
  supabase: SupabaseClient
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", SPECTATE_STATUS_VALUES)
    .or("challenger_identity_id.not.is.null,challenger_wallet.not.is.null")
    .order("created_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

export async function getRoomById(
  supabase: SupabaseClient,
  roomId: string
): Promise<Room | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", roomId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapDbRowToRoom(data as Record<string, unknown>)
}

/**
 * Claim an active match slot for an identity (one active match per identity).
 * Call after create/join; release on cancel/forfeit/finish.
 */
export async function claimActiveMatch(
  supabase: SupabaseClient,
  identityId: string,
  matchId: string
): Promise<void> {
  const { error } = await supabase.from("active_identity_matches").upsert(
    { identity_id: identityId, match_id: matchId },
    { onConflict: "identity_id" }
  )
  if (error) {
    console.warn("[rooms-service claimActiveMatch]", error.message)
  }
}

/**
 * Release active match slot(s) for a match (both host and challenger).
 * Call when match is canceled, forfeited, or finished.
 * Non-throwing: logs and continues if table is missing or RLS blocks.
 */
export async function releaseActiveMatchByMatch(
  supabase: SupabaseClient,
  matchId: string
): Promise<void> {
  const { error } = await supabase
    .from("active_identity_matches")
    .delete()
    .eq("match_id", matchId)
  if (error) {
    console.warn("[rooms-service releaseActiveMatchByMatch]", error.message)
  }
}

/**
 * Create room. Writes canonical DB status (waiting). Series columns: round_number, host_score, challenger_score (with legacy fallbacks).
 */
export async function createRoom(
  supabase: SupabaseClient,
  params: {
    mode: "quick" | "ranked"
    game_type: string
    host_identity_id: string
    host_display_name: string
    wager_amount: number
    best_of?: 1 | 3 | 5
  }
): Promise<Room> {
  const now = new Date().toISOString()
  const bestOf = params.best_of === 3 || params.best_of === 5 ? params.best_of : 1
  const insert: Record<string, unknown> = {
    game_type: params.game_type,
    status: DB_STATUS.WAITING,
    host_wallet: params.host_identity_id,
    wager: params.wager_amount,
    host_identity_id: params.host_identity_id,
    wager_amount: params.wager_amount,
    mode: params.mode,
    host_display_name: params.host_display_name,
    best_of: bestOf,
    host_round_wins: 0,
    challenger_round_wins: 0,
    current_round: 1,
    round_number: 1,
    host_score: 0,
    challenger_score: 0,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from("matches")
    .insert(insert)
    .select("*")
    .maybeSingle()

  if (error) {
    console.error("[rooms-service createRoom] Supabase insert error:", {
      message: error.message,
      code: (error as { code?: string }).code,
      details: (error as { details?: unknown }).details,
    })
    throw error
  }
  if (!data) throw new Error("Insert succeeded but no row returned")
  const room = mapDbRowToRoom(data as Record<string, unknown>)
  try {
    await claimActiveMatch(supabase, params.host_identity_id, room.id)
  } catch (e) {
    console.warn("[rooms-service createRoom] claimActiveMatch failed:", e)
  }
  return room
}

/**
 * Join room. Sets challenger, canonical status (ready), and countdown. Claims active match for challenger.
 */
export async function joinRoom(
  supabase: SupabaseClient,
  roomId: string,
  params: {
    challenger_identity_id: string
    challenger_display_name: string
  }
): Promise<Room> {
  const now = new Date().toISOString()
  const countdownSeconds = 30
  const bettingClosesAt = new Date(
    Date.now() + countdownSeconds * 1000
  ).toISOString()

  const updates: Record<string, unknown> = {
    challenger_wallet: params.challenger_identity_id,
    challenger_identity_id: params.challenger_identity_id,
    challenger_display_name: params.challenger_display_name,
    status: DB_STATUS.READY,
    countdown_started_at: now,
    countdown_seconds: countdownSeconds,
    betting_open: true,
    betting_closes_at: bettingClosesAt,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", roomId)
    .in("status", [DB_STATUS.WAITING, "Waiting for Opponent"])
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Room not found or already joined")
  const room = mapDbRowToRoom(data as Record<string, unknown>)
  try {
    await claimActiveMatch(supabase, params.challenger_identity_id, roomId)
  } catch (e) {
    console.warn("[rooms-service joinRoom] claimActiveMatch failed:", e)
  }
  return room
}

/**
 * Cancel room. Host only; no challenger. Sets status canceled and releases active match slots.
 */
export async function cancelRoom(
  supabase: SupabaseClient,
  roomId: string,
  hostIdentityId: string
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from("matches")
    .update({
      status: DB_STATUS.CANCELED,
      winner_identity_id: null,
      win_reason: "canceled",
      updated_at: now,
      ended_at: now,
      finished_at: now,
    })
    .eq("id", roomId)
    .in("status", [DB_STATUS.WAITING, "Waiting for Opponent"])
    .eq("host_wallet", hostIdentityId)
    .is("challenger_wallet", null)

  if (error) throw error
  await releaseActiveMatchByMatch(supabase, roomId)
}

/**
 * Forfeit. Sets status forfeited, winner, win_reason, finished_at. Releases active match slots.
 */
export async function forfeitRoom(
  supabase: SupabaseClient,
  roomId: string,
  forfeiterIdentityId: string,
  winnerIdentityId: string
): Promise<Room> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("matches")
    .update({
      status: DB_STATUS.FORFEITED,
      winner_identity_id: winnerIdentityId,
      win_reason: "forfeit",
      updated_at: now,
      ended_at: now,
      finished_at: now,
    })
    .eq("id", roomId)
    .in("status", ["ready", "countdown", "live", "Ready to Start", "Live"])
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Room not found or already finished")
  await releaseActiveMatchByMatch(supabase, roomId)
  return mapDbRowToRoom(data as Record<string, unknown>)
}

export async function listRoomMessages(
  supabase: SupabaseClient,
  matchId: string
): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from("match_messages")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(
    mapMessageRowToRoomMessage
  )
}

export async function sendRoomMessage(
  supabase: SupabaseClient,
  params: {
    match_id: string
    sender_identity_id: string
    sender_display_name: string
    message: string
  }
): Promise<RoomMessage> {
  const { data, error } = await supabase
    .from("match_messages")
    .insert({
      match_id: params.match_id,
      sender_identity_id: params.sender_identity_id,
      sender_display_name: params.sender_display_name,
      message: params.message,
    })
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Insert succeeded but no message row returned")
  return mapMessageRowToRoomMessage(data as Record<string, unknown>)
}

/** Spectate crowd talk: list messages for a match (shared for all spectators). */
export async function listSpectateMessages(
  supabase: SupabaseClient,
  matchId: string
): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from("spectate_messages")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(
    mapMessageRowToRoomMessage
  )
}

/** Spectate crowd talk: insert message (any viewer can send). */
export async function sendSpectateMessage(
  supabase: SupabaseClient,
  params: {
    match_id: string
    sender_identity_id: string
    sender_display_name: string
    message: string
  }
): Promise<RoomMessage> {
  const { data, error } = await supabase
    .from("spectate_messages")
    .insert({
      match_id: params.match_id,
      sender_identity_id: params.sender_identity_id,
      sender_display_name: params.sender_display_name,
      message: params.message,
    })
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Insert succeeded but no message row returned")
  return mapMessageRowToRoomMessage(data as Record<string, unknown>)
}
