import { supabase } from "../supabase"
import type { DbBetRow } from "./types"

export async function placeBet(bet: {
  match_id: string
  wallet_address: string
  side: string
  amount: number
}) {
  const { data, error } = await supabase
    .from("bets")
    .insert({
      match_id: bet.match_id,
      wallet_address: bet.wallet_address,
      side: bet.side,
      amount: bet.amount,
    })
    .select("*")
    .single()

  if (error) throw error
  return data as DbBetRow
}

export async function getMatchBets(matchId: string) {
  const { data, error } = await supabase
    .from("bets")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data ?? []) as DbBetRow[]
}