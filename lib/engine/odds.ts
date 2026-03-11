import type { ArenaSide } from "@/lib/engine/match-types"

export const HOUSE_RAKE = 0.05
export const MIN_BET = 1
export const MAX_BET = 100
export const DEFAULT_BET = 5
export const WHALE_BET_THRESHOLD = 20

export function clampWager(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(100, Math.floor(value)))
}

export function clampBetAmount(value: number) {
  if (!Number.isFinite(value)) return MIN_BET
  return Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(value)))
}

export function getNetPool(totalPool: number) {
  return totalPool * (1 - HOUSE_RAKE)
}

export function getMultiplier(hostPool: number, challengerPool: number, side: ArenaSide) {
  const totalPool = hostPool + challengerPool
  const sidePool = side === "host" ? hostPool : challengerPool
  const netPool = getNetPool(totalPool)

  if (sidePool <= 0) return 0
  return netPool / sidePool
}

export function getProjectedState(
  hostPool: number,
  challengerPool: number,
  side: ArenaSide,
  addedAmount: number
) {
  const amount = clampBetAmount(addedAmount)
  const projectedHost = side === "host" ? hostPool + amount : hostPool
  const projectedChallenger = side === "challenger" ? challengerPool + amount : challengerPool
  const multiplier = getMultiplier(projectedHost, projectedChallenger, side)
  const payout = amount * multiplier

  return {
    projectedHost,
    projectedChallenger,
    multiplier,
    payout,
  }
}

export function getSideShare(hostPool: number, challengerPool: number, side: ArenaSide) {
  const total = hostPool + challengerPool
  if (total <= 0) return 0
  return ((side === "host" ? hostPool : challengerPool) / total) * 100
}