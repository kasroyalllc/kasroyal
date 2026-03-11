import { getFeaturedMarketIds } from "@/lib/engine/featured-markets"
import type { ArenaMatch, ArenaStatus, GameType } from "@/lib/engine/match-types"

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function formatAge(createdAt: number) {
  const diff = Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
  const mins = Math.floor(diff / 60)
  if (mins < 1) return "just now"
  if (mins === 1) return "1 min ago"
  return `${mins} mins ago`
}

export function getClosingTone(seconds: number) {
  if (seconds <= 0) return "closed"
  if (seconds <= 10) return "danger"
  if (seconds <= 20) return "warning"
  return "open"
}

export function getGameBettingWindowSeconds(game: GameType) {
  if (game === "Chess Duel") return 60
  if (game === "Connect 4") return 25
  return 12
}

export function getGameBettingWindowLabel(game: GameType) {
  if (game === "Chess Duel") return "Pre-match market window: 60s"
  if (game === "Connect 4") return "Pre-match market window: 25s"
  return "Pre-match market window: 12s"
}

export function getArenaBettingSecondsLeft(match: ArenaMatch, now = Date.now()) {
  if (!match.challenger) return 0
  if (match.status !== "Ready to Start") return 0
  if (match.bettingStatus !== "open") return 0
  if (!match.bettingClosesAt) return 0

  return Math.max(0, Math.ceil((match.bettingClosesAt - now) / 1000))
}

export function isArenaSpectatable(match: ArenaMatch) {
  return match.status === "Ready to Start" || match.status === "Live"
}

export function isArenaBettable(match: ArenaMatch) {
  return (
    !!match.challenger &&
    match.isFeaturedMarket &&
    match.marketVisibility === "featured" &&
    match.status === "Ready to Start" &&
    match.bettingStatus === "open"
  )
}

export function formatArenaPhase(status: ArenaStatus) {
  if (status === "Waiting for Opponent") return "Waiting for Opponent"
  if (status === "Ready to Start") return "Pre-Match Countdown"
  if (status === "Live") return "Live Now"
  return "Finished"
}

export function normalizeArenaMatches(matches: ArenaMatch[], now = Date.now()) {
  const featuredIds = getFeaturedMarketIds(matches)

  return matches.map((originalMatch) => {
    const match: ArenaMatch = {
      ...originalMatch,
      moveHistory: Array.isArray(originalMatch.moveHistory) ? originalMatch.moveHistory : [],
      bettingWindowSeconds:
        originalMatch.bettingWindowSeconds || getGameBettingWindowSeconds(originalMatch.game),
      bettingStatus: originalMatch.bettingStatus ?? "disabled",
      marketVisibility: originalMatch.marketVisibility ?? "watch-only",
      isFeaturedMarket: false,
      result: originalMatch.result ?? null,
    }

    const isFeatured = featuredIds.has(match.id)
    match.isFeaturedMarket = isFeatured
    match.marketVisibility = isFeatured ? "featured" : "watch-only"

    if (match.status === "Waiting for Opponent") {
      match.bettingStatus = "disabled"
      match.statusText = "Open seat available"
      match.moveText = "Waiting for join"
      return match
    }

    if (match.status === "Finished") {
      match.bettingStatus = match.bettingStatus === "settled" ? "settled" : "settling"
      match.statusText = "Match finished"
      return match
    }

    if (!match.challenger) {
      match.bettingStatus = "disabled"
      return match
    }

    if (match.status === "Ready to Start") {
      const countdownStartedAt = match.countdownStartedAt ?? match.seatedAt ?? now
      const bettingWindowSeconds = match.bettingWindowSeconds || getGameBettingWindowSeconds(match.game)
      const bettingClosesAt = match.bettingClosesAt ?? countdownStartedAt + bettingWindowSeconds * 1000
      const secondsLeft = Math.max(0, Math.ceil((bettingClosesAt - now) / 1000))

      match.countdownStartedAt = countdownStartedAt
      match.bettingClosesAt = bettingClosesAt

      if (secondsLeft <= 0) {
        match.status = "Live"
        match.startedAt = match.startedAt ?? bettingClosesAt
        match.bettingStatus = isFeatured ? "locked" : "disabled"
        match.statusText = "Match is live"
        match.moveText =
          match.game === "Chess Duel"
            ? match.moveText && match.moveText !== "Waiting for lock" && match.moveText !== "Countdown live"
              ? match.moveText
              : "1. e4"
            : match.game === "Connect 4"
            ? match.moveText && match.moveText !== "Waiting for lock" && match.moveText !== "Countdown live"
              ? match.moveText
              : "Opening move"
            : match.moveText && match.moveText !== "Waiting for lock" && match.moveText !== "Countdown live"
            ? match.moveText
            : "Round start"

        return match
      }

      match.bettingStatus = isFeatured ? "open" : "disabled"
      match.statusText = isFeatured ? "Featured market open" : "Watch-only countdown"
      match.moveText = `Starts in ${formatTime(secondsLeft)}`
      return match
    }

    if (match.status === "Live") {
      match.bettingStatus = isFeatured ? "locked" : "disabled"
      match.statusText = "Match is live"
      return match
    }

    return match
  })
}