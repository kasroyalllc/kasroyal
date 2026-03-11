import type { ArenaMatch, GameType } from "@/lib/engine/match-types"

export const gameDisplayOrder: GameType[] = ["Chess Duel", "Connect 4", "Tic-Tac-Toe"]

function getFeaturedCandidateScore(match: ArenaMatch) {
  if (!match.challenger) return 0
  if (match.status === "Ready to Start") return 300
  if (match.status === "Live") return 200
  return 0
}

export function getFeaturedMarketIds(matches: ArenaMatch[]) {
  const featuredIds = new Set<string>()

  for (const game of gameDisplayOrder) {
    const candidates = matches
      .filter((match) => match.game === game)
      .filter((match) => !!match.challenger)
      .filter((match) => match.status === "Ready to Start" || match.status === "Live")
      .sort((a, b) => {
        const scoreDiff = getFeaturedCandidateScore(b) - getFeaturedCandidateScore(a)
        if (scoreDiff !== 0) return scoreDiff

        if (b.playerPot !== a.playerPot) return b.playerPot - a.playerPot
        if (b.spectators !== a.spectators) return b.spectators - a.spectators
        return b.createdAt - a.createdAt
      })

    if (candidates[0]) {
      featuredIds.add(candidates[0].id)
    }
  }

  return featuredIds
}