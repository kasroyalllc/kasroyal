import { supabase } from "../supabase"

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
      amount: bet.amount
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function getMatchBets(matchId: string) {
  const { data, error } = await supabase
    .from("bets")
    .select("*")
    .eq("match_id", matchId)

  if (error) throw error

  return data
}