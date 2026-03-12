"use client"

import {
  getStoredConnectedAccount,
  isAppWalletConnected,
  shortAddress,
} from "@/lib/wallet/wallet-client"

const GUEST_STORAGE_KEY = "kasroyal_guest_id_v1"
const PROFILE_STORAGE_PREFIX = "kasroyal_profile_v1_"

const GUEST_PREFIX = "Guest-"
const GUEST_WORDS = [
  "FrostRook",
  "GoldOx",
  "ShadowKnight",
  "CrimsonAce",
  "StormHorse",
  "IronPaw",
  "SwiftFox",
  "BoldEagle",
  "SilentWolf",
  "CrystalQueen",
  "BlazeTiger",
  "MistDragon",
  "SteelFalcon",
  "EmberPhoenix",
  "NovaHawk",
  "ThunderBear",
  "VelvetLion",
  "PrismOwl",
  "FlameStag",
  "IceSerpent",
]

export type CurrentIdentity = {
  /** Canonical id for matching: wallet address or guest id (e.g. Guest-FrostRook-4821) */
  id: string
  /** Display name: profile name, short address, or guest id */
  displayName: string
  /** True if no wallet connected */
  isGuest: boolean
}

function isBrowser() {
  return typeof window !== "undefined"
}

/**
 * Generate or read a unique guest id for this session. Format: Guest-{Word}-{Num}
 * Do NOT reuse a shared name like KasKing01.
 */
export function getGuestId(): string {
  if (!isBrowser()) {
    return `${GUEST_PREFIX}FrostRook-${Math.floor(Math.random() * 9999)}`
  }
  let stored = window.sessionStorage.getItem(GUEST_STORAGE_KEY)
  if (stored && stored.startsWith(GUEST_PREFIX)) {
    return stored
  }
  const word = GUEST_WORDS[Math.floor(Math.random() * GUEST_WORDS.length)]
  const num = Math.floor(1000 + Math.random() * 9000)
  stored = `${GUEST_PREFIX}${word}-${num}`
  window.sessionStorage.setItem(GUEST_STORAGE_KEY, stored)
  return stored
}

/**
 * Get stored display name for a wallet address (e.g. from profile).
 * Returns null if none set; app can auto-create profile and allow customization later.
 */
export function getStoredProfileDisplayName(account: string): string | null {
  if (!isBrowser() || !account) return null
  try {
    const key = `${PROFILE_STORAGE_PREFIX}${account.toLowerCase()}`
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw) as { displayName?: string }
    return typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : null
  } catch {
    return null
  }
}

/**
 * Save display name for a wallet address. Used for profile customization.
 */
export function setStoredProfileDisplayName(account: string, displayName: string | null) {
  if (!isBrowser()) return
  const key = `${PROFILE_STORAGE_PREFIX}${account.toLowerCase()}`
  if (!displayName || !displayName.trim()) {
    window.localStorage.removeItem(key)
    return
  }
  try {
    const existing = window.localStorage.getItem(key)
    const data = existing ? { ...JSON.parse(existing) } : {}
    data.displayName = displayName.trim()
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    window.localStorage.setItem(key, JSON.stringify({ displayName: displayName.trim() }))
  }
}

/**
 * Authoritative current user identity for arena/match/active-game logic.
 * - If wallet connected: id = account address, displayName = stored profile or short address.
 * - If no wallet: id = unique guest id (Guest-Word-Num), displayName = guest id.
 * Use id for one-active-match-per-wallet, host/challenger distinction, and matching.
 */
export function getCurrentIdentity(): CurrentIdentity {
  if (!isBrowser()) {
    return {
      id: `${GUEST_PREFIX}FrostRook-0000`,
      displayName: `${GUEST_PREFIX}FrostRook-0000`,
      isGuest: true,
    }
  }
  if (isAppWalletConnected()) {
    const account = getStoredConnectedAccount()
    if (account) {
      const displayName = getStoredProfileDisplayName(account) ?? shortAddress(account, 6, 4)
      return {
        id: account.toLowerCase(),
        displayName,
        isGuest: false,
      }
    }
  }
  const guestId = getGuestId()
  return {
    id: guestId,
    displayName: guestId,
    isGuest: true,
  }
}
