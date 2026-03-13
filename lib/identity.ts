"use client"

import {
  getStoredConnectedAccount,
  isAppWalletConnected,
  shortAddress,
} from "@/lib/wallet/wallet-client"

/** Persisted in localStorage. Cleared only by hard reset, clear site data, or different browser. */
const GUEST_IDENTITY_STORAGE_KEY = "kasroyal_guest_identity_v1"
const PROFILE_STORAGE_PREFIX = "kasroyal_profile_v1_"

const GUEST_PREFIX = "Guest-"
const GUEST_PREFIX_ID = "guest-"
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
  /** Canonical id for matching: wallet address or guest id (e.g. guest-stormhorse-3065) */
  id: string
  /** Display name: profile name, short address, or Guest-Word-Num */
  displayName: string
  /** True if no wallet connected */
  isGuest: boolean
}

function isBrowser() {
  return typeof window !== "undefined"
}

type StoredGuestIdentity = { id: string; displayName: string }

function parseStoredGuestIdentity(raw: string | null): StoredGuestIdentity | null {
  if (!raw || typeof raw !== "string") return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as StoredGuestIdentity).id === "string" &&
      typeof (parsed as StoredGuestIdentity).displayName === "string"
    ) {
      const id = (parsed as StoredGuestIdentity).id.trim().toLowerCase()
      const displayName = (parsed as StoredGuestIdentity).displayName.trim()
      if (id.startsWith(GUEST_PREFIX_ID) && displayName.length > 0) return { id, displayName }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Generate a stable guest identity once and persist in localStorage.
 * Reused on every page load until: hard reset, user clears site data, or different browser/incognito.
 * Format: id = guest-{word}-{num}, displayName = Guest-{Word}-{num}
 */
function getStableGuestIdentity(): StoredGuestIdentity {
  if (!isBrowser()) {
    return { id: "guest-loading", displayName: "Guest-Loading" }
  }
  const stored = window.localStorage.getItem(GUEST_IDENTITY_STORAGE_KEY)
  const parsed = parseStoredGuestIdentity(stored)
  if (parsed) return parsed

  const word = GUEST_WORDS[Math.floor(Math.random() * GUEST_WORDS.length)]
  const num = Math.floor(1000 + Math.random() * 9000)
  const id = `${GUEST_PREFIX_ID}${word.toLowerCase()}-${num}`
  const displayName = `${GUEST_PREFIX}${word}-${num}`
  const value: StoredGuestIdentity = { id, displayName }
  try {
    window.localStorage.setItem(GUEST_IDENTITY_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
  return value
}

/**
 * Legacy: returns stable guest id. Use getCurrentIdentity() for full identity.
 * Guest id is now persisted in localStorage and stable across visits.
 */
export function getGuestId(): string {
  return getStableGuestIdentity().id
}

/**
 * Clear stored guest identity (e.g. after hard reset). Next getCurrentIdentity() will create a new guest.
 * Only call from resetAllArenaState or similar; normally guest identity is persistent.
 */
export function clearStoredGuestIdentity(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(GUEST_IDENTITY_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function getStoredProfileData(account: string): { displayName?: string; rank?: string; rating?: number } | null {
  if (!isBrowser() || !account) return null
  try {
    const key = `${PROFILE_STORAGE_PREFIX}${account.toLowerCase()}`
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as { displayName?: string; rank?: string; rating?: number }
  } catch {
    return null
  }
}

function setStoredProfileData(
  account: string,
  updates: { displayName?: string | null; rank?: string | null; rating?: number | null }
) {
  if (!isBrowser() || !account) return
  const key = `${PROFILE_STORAGE_PREFIX}${account.toLowerCase()}`
  try {
    const existing = window.localStorage.getItem(key)
    const data = existing ? (JSON.parse(existing) as Record<string, unknown>) : {}
    if (updates.displayName !== undefined) {
      if (updates.displayName && String(updates.displayName).trim()) data.displayName = updates.displayName.trim()
      else delete data.displayName
    }
    if (updates.rank !== undefined) {
      if (updates.rank && String(updates.rank).trim()) data.rank = updates.rank.trim()
      else delete data.rank
    }
    if (updates.rating !== undefined) {
      if (typeof updates.rating === "number" && Number.isFinite(updates.rating)) data.rating = updates.rating
      else delete data.rating
    }
    if (Object.keys(data).length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // ignore
  }
}

/**
 * Get stored display name for a wallet address (e.g. from profile).
 * Returns null if none set; app can auto-create profile and allow customization later.
 */
export function getStoredProfileDisplayName(account: string): string | null {
  const data = getStoredProfileData(account)
  if (!data) return null
  return typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : null
}

/**
 * Save display name for a wallet address. Used for profile customization.
 */
export function setStoredProfileDisplayName(account: string, displayName: string | null) {
  setStoredProfileData(account, { displayName })
}

/**
 * Get stored rank for a wallet address (ranked progression).
 * Returns null if none set; new ranked users should default to Bronze III.
 */
export function getStoredProfileRank(account: string): string | null {
  const data = getStoredProfileData(account)
  if (!data || typeof data.rank !== "string" || !data.rank.trim()) return null
  return data.rank.trim()
}

/**
 * Save rank for a wallet address. Call from wins/losses/XP logic; do not overwrite with a lower rank.
 */
export function setStoredProfileRank(account: string, rank: string | null) {
  setStoredProfileData(account, { rank })
}

/**
 * Get stored rating for a wallet address. Returns null if none set; new ranked users use 1000.
 */
export function getStoredProfileRating(account: string): number | null {
  const data = getStoredProfileData(account)
  if (data == null || typeof data.rating !== "number" || !Number.isFinite(data.rating)) return null
  return data.rating
}

/**
 * Save rating for a wallet address. Used by ranked progression.
 */
export function setStoredProfileRating(account: string, rating: number | null) {
  setStoredProfileData(account, { rating })
}

/**
 * Authoritative current user identity for arena/match/active-game logic.
 * Wallet-connected: id = account, displayName = (1) saved profile display name, (2) else shortened wallet address.
 * Guest names are never used when a wallet is connected; wallet identity is authoritative for ranked play.
 * No wallet: id = stable guest id (guest-word-num), displayName = Guest-Word-Num (Quick Match).
 */
export function getCurrentIdentity(): CurrentIdentity {
  if (!isBrowser()) {
    return {
      id: "guest-loading",
      displayName: "Guest-Loading",
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
  const guest = getStableGuestIdentity()
  return {
    id: guest.id,
    displayName: guest.displayName,
    isGuest: true,
  }
}
