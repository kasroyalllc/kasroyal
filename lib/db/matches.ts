import { supabase } from "../supabase"
import type { DbMatchRow, DbGameType } from "./types"

export async function createMatch(match: {
  game_type: DbGameType
  host_wallet: string
  wager: number
}) {
  const { data, error } = await supabase
    .from("matches")
    .insert({
      game_type: match.game_type,
      status: "Waiting for Opponent",
      host_wallet: match.host_wallet,
      wager: match.wager,
    })
    .select("*")
    .single()

  if (error) throw error
  return data as DbMatchRow
}

export async function getMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []) as DbMatchRow[]
}

export async function getMatchById(matchId: string): Promise<DbMatchRow | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle()

  if (error) throw error
  return data as DbMatchRow | null
}

export async function joinMatch(matchId: string, wallet: string): Promise<DbMatchRow | null> {
  const { data, error } = await supabase
    .from("matches")
    .update({
      challenger_wallet: wallet,
      status: "Ready to Start",
    })
    .eq("id", matchId)
    .select("*")
    .maybeSingle()

  if (error) throw error
  return data as DbMatchRow | null
}

export async function updateMatchStatus(
  matchId: string,
  status: DbMatchRow["status"]
): Promise<DbMatchRow | null> {
  const updates: Partial<DbMatchRow> & {
    status: DbMatchRow["status"]
  } = { status }

  if (status === "Live") {
    updates.started_at = new Date().toISOString()
  }

  if (status === "Finished") {
    updates.ended_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", matchId)
    .select("*")
    .maybeSingle()

  if (error) throw error
  return data as DbMatchRow | null
}