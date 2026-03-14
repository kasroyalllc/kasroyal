/**
 * Backend-first room service. Uses Supabase as source of truth.
 * Transitional schema: we write both new and legacy columns where present.
 *
 * Active = Waiting for Opponent | Ready to Start | Live only.
 * Recently finished = prefer finished_at desc, fallback ended_at.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapDbRowToRoom,
  mapMessageRowToRoomMessage,
  type Room,
  type RoomMessage,
} from "@/lib/engine/match/types"

const ACTIVE_STATUSES = ["Waiting for Opponent", "Ready to Start", "Live"]

/** Active = waiting, ready, or live only (not finished/canceled). */
export async function listActiveRooms(
  supabase: SupabaseClient
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** History = Finished only. Order by finished_at desc, then ended_at desc. */
export async function listHistoryRooms(
  supabase: SupabaseClient
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "Finished")
    .order("finished_at", { ascending: false })
    .order("ended_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** Recently resolved = Finished, prefer finished_at desc, fallback ended_at; limited. */
export async function listRecentResolvedRooms(
  supabase: SupabaseClient,
  limit = 6
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "Finished")
    .order("finished_at", { ascending: false })
    .order("ended_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** Spectate = Ready to Start or Live with a challenger (new or legacy column). */
export async function listSpectateRooms(
  supabase: SupabaseClient
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", ["Ready to Start", "Live"])
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
 * Create room. Inserts new + legacy columns for transitional schema.
 * Requires admin (service role) client for RLS bypass.
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
  const status = "Waiting for Opponent"
  const now = new Date().toISOString()
  const bestOf = params.best_of === 3 || params.best_of === 5 ? params.best_of : 1
  const insert: Record<string, unknown> = {
    game_type: params.game_type,
    status,
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
  return mapDbRowToRoom(data as Record<string, unknown>)
}

/**
 * Join room. Sets both new and legacy challenger columns for compatibility.
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
    status: "Ready to Start",
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
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Room not found or already joined")
  return mapDbRowToRoom(data as Record<string, unknown>)
}

/**
 * Cancel room. Host only; no challenger. Sets finished_at and ended_at (transitional).
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
      status: "Finished",
      updated_at: now,
      ended_at: now,
      finished_at: now,
    })
    .eq("id", roomId)
    .eq("host_wallet", hostIdentityId)
    .is("challenger_wallet", null)

  if (error) throw error
}

/**
 * Forfeit. Sets winner, win_reason, finished_at, ended_at (new + legacy).
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
      status: "Finished",
      winner_identity_id: winnerIdentityId,
      win_reason: "forfeit",
      updated_at: now,
      ended_at: now,
      finished_at: now,
    })
    .eq("id", roomId)
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Room not found")
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
