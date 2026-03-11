import { supabase } from "../supabase"

export async function createMatch(match: {
  game_type: string
  host_wallet: string
  wager: number
}) {
  const { data, error } = await supabase
    .from("matches")
    .insert({
      game_type: match.game_type,
      status: "Waiting for Opponent",
      host_wallet: match.host_wallet,
      wager: match.wager
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function getMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error

  return data
}

export async function joinMatch(matchId: string, wallet: string) {
  const { data, error } = await supabase
    .from("matches")
    .update({
      challenger_wallet: wallet,
      status: "Ready to Start"
    })
    .eq("id", matchId)
    .select()
    .single()

  if (error) throw error

  return data
}