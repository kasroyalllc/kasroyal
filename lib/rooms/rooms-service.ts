/**
 * Backend-first room service. Uses Supabase as source of truth.
 * Pass a Supabase client (browser or server). No localStorage authority.
 *
 * Data flow: Supabase → API routes → UI. Do not use readArenaMatches,
 * subscribeArenaMatches, updateArenaMatch, or syncMatchToSupabase in
 * production paths; those are legacy local/mock helpers in arena-data.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { mapDbRowToRoom, mapMessageRowToRoomMessage, type Room, type RoomMessage } from "@/lib/engine/match/types"

/** Active = Waiting, Ready, or Live (not Finished/canceled). */
export async function listActiveRooms(supabase: SupabaseClient): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", ["Waiting for Opponent", "Ready to Start", "Live"])
    .order("created_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** History = Finished only. */
export async function listHistoryRooms(supabase: SupabaseClient): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "Finished")
    .order("ended_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** Recently resolved = Finished, ordered by ended_at desc, limited (e.g. for homepage). */
export async function listRecentResolvedRooms(
  supabase: SupabaseClient,
  limit = 6
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "Finished")
    .order("ended_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapDbRowToRoom)
}

/** Spectate = Ready to Start or Live with both players (challenger present). */
export async function listSpectateRooms(supabase: SupabaseClient): Promise<Room[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .in("status", ["Ready to Start", "Live"])
    .not("challenger_wallet", "is", null)
    .order("created_at", { ascending: false })

  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map(mapDbRowToRoom)
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
 * Create room: use API POST /api/rooms/create. This helper is for server-side only
 * when you already have a Supabase client (e.g. in API route).
 */
export async function createRoom(
  supabase: SupabaseClient,
  params: {
    mode: "quick" | "ranked"
    game_type: string
    host_identity_id: string
    host_display_name: string
    wager_amount: number
  }
): Promise<Room> {
  const status = "Waiting for Opponent"
  const insert: Record<string, unknown> = {
    game_type: params.game_type,
    status,
    host_wallet: params.host_identity_id,
    wager: params.wager_amount,
  }

  const { data, error } = await supabase
    .from("matches")
    .insert(insert)
    .select("*")
    .single()

  if (error) throw error
  return mapDbRowToRoom((data ?? {}) as Record<string, unknown>)
}

/**
 * Join room: use API POST /api/rooms/join. This helper is for server-side.
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
  const bettingClosesAt = new Date(Date.now() + countdownSeconds * 1000).toISOString()

  const updates: Record<string, unknown> = {
    challenger_wallet: params.challenger_identity_id,
    status: "Ready to Start",
    countdown_started_at: now,
    countdown_seconds: countdownSeconds,
    betting_open: true,
    betting_closes_at: bettingClosesAt,
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
 * Cancel room: use API POST /api/rooms/cancel. Server-side helper.
 */
export async function cancelRoom(
  supabase: SupabaseClient,
  roomId: string,
  hostIdentityId: string
): Promise<void> {
  const { error } = await supabase
    .from("matches")
    .update({
      status: "Finished",
      updated_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    })
    .eq("id", roomId)
    .eq("host_wallet", hostIdentityId)
    .is("challenger_wallet", null)

  if (error) throw error
}

/**
 * Forfeit: use API POST /api/rooms/forfeit. Server-side helper.
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
  return ((data ?? []) as Record<string, unknown>[]).map(mapMessageRowToRoomMessage)
}

/**
 * Send message: use API POST /api/chat/send. Server-side helper.
 */
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
    .single()

  if (error) throw error
  return mapMessageRowToRoomMessage((data ?? {}) as Record<string, unknown>)
}
