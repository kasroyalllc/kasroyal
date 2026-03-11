"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  DEFAULT_BET,
  HOUSE_RAKE,
  MAX_BET,
  MIN_BET,
  WHALE_BET_THRESHOLD,
  arenaFeedSeed,
  buildFeaturedSpectateMarkets,
  currentUser,
  formatTime,
  gameDisplayOrder,
  gameMeta,
  getArenaBettingSecondsLeft,
  getClosingTone,
  getEdgeText,
  getFavoriteData,
  getGameBettingWindowLabel,
  getMultiplier,
  getNetPool,
  getProjectedState,
  getRankColors,
  getSideShare,
  getTicketsForMatch,
  getWinProbability,
  isArenaBettable,
  placeArenaSpectatorBet,
  readArenaMatches,
  subscribeArenaMatches,
  subscribeSpectatorTickets,
  type ArenaMatch,
  type ArenaSide,
  type GameType,
  type PersistedBetTicket,
  type RankTier,
} from "@/lib/mock/arena-data"

type SpectateFilter = "All" | GameType

function clampBetAmount(value: number) {
  if (!Number.isFinite(value)) return MIN_BET
  return Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(value)))
}

function HeaderStat({
  label,
  value,
  tone = "white",
}: {
  label: string
  value: string
  tone?: "white" | "gold" | "green" | "sky"
}) {
  const toneClass =
    tone === "gold"
      ? "text-amber-300"
      : tone === "green"
        ? "text-emerald-300"
        : tone === "sky"
          ? "text-sky-300"
          : "text-white"

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}

function RankBadge({ rank }: { rank: RankTier }) {
  const colors = getRankColors(rank)

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${colors.bg} ${colors.text} ${colors.ring}`}
    >
      {rank}
    </span>
  )
}

function TonePill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "neutral" | "green" | "gold" | "red" | "sky"
}) {
  const className =
    tone === "green"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : tone === "gold"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-300"
        : tone === "red"
          ? "border-red-400/20 bg-red-400/10 text-red-300"
          : tone === "sky"
            ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
            : "border-white/10 bg-white/10 text-white/75"

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  )
}

function FeaturedGameCard({
  match,
  active,
  onSelect,
}: {
  match: ArenaMatch
  active: boolean
  onSelect: () => void
}) {
  const totalPool = match.spectatorPool.host + match.spectatorPool.challenger
  const seconds = getArenaBettingSecondsLeft(match)
  const open = isArenaBettable(match)
  const favoriteData = getFavoriteData(
    match.host.rating,
    match.challenger?.rating ?? match.host.rating
  )
  const meta = gameMeta[match.game]

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-3xl border p-5 text-left transition ${
        active
          ? "border-emerald-300/30 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(52,211,153,0.15)]"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{meta.icon}</span>
            <div className="text-lg font-semibold text-white">{match.game}</div>
          </div>
          <div className="mt-1 text-sm text-white/60">
            {match.host.name} vs {match.challenger?.name ?? "Waiting Opponent"}
          </div>
        </div>
        <TonePill tone={match.isFeaturedMarket ? "gold" : "neutral"}>
          {match.isFeaturedMarket ? "Featured Market" : "Watch Only"}
        </TonePill>
      </div>

      <div className="mt-4 text-sm text-white/65">{meta.description}</div>

      <div className="mt-4 flex flex-wrap gap-2">
        <TonePill tone={favoriteData.favorite === "even" ? "neutral" : "green"}>
          {match.host.name}: {favoriteData.leftLabel}
        </TonePill>
        <TonePill tone={favoriteData.favorite === "even" ? "neutral" : "gold"}>
          {match.challenger?.name ?? "Opponent"}: {favoriteData.rightLabel}
        </TonePill>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Player Pot</div>
          <div className="mt-1 font-semibold text-white">{match.playerPot.toFixed(0)} KAS</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Pool</div>
          <div className="mt-1 font-semibold text-white">{totalPool.toFixed(0)} KAS</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Viewers</div>
          <div className="mt-1 font-semibold text-white">{match.spectators}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Status</div>
          <div className="mt-1 font-semibold text-white">
            {open ? `Open ${formatTime(seconds)}` : "Closed"}
          </div>
        </div>
      </div>
    </button>
  )
}

export default function SpectatePage() {
  const [featuredMatches, setFeaturedMatches] = useState<ArenaMatch[]>([])
  const [selectedFilter, setSelectedFilter] = useState<SpectateFilter>("All")
  const [activeMatchId, setActiveMatchId] = useState("")
  const [selectedSide, setSelectedSide] = useState<ArenaSide | null>(null)
  const [betAmountInput, setBetAmountInput] = useState(String(DEFAULT_BET))
  const [betMessage, setBetMessage] = useState(
    "Watch any featured live game without betting, or place a spectator bet during the official pre-match window."
  )
  const [feed, setFeed] = useState<string[]>(arenaFeedSeed)
  const [tickets, setTickets] = useState<PersistedBetTicket[]>([])
  const [poolFlash, setPoolFlash] = useState<ArenaSide | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const syncMatches = () => {
      const matches = buildFeaturedSpectateMarkets(readArenaMatches())
      setFeaturedMatches(matches)
      setActiveMatchId((current) => {
        if (current && matches.some((m) => m.id === current)) return current
        return matches[0]?.id ?? ""
      })
    }

    const syncTickets = () => {
      if (!activeMatchId) {
        setTickets([])
        return
      }
      setTickets(getTicketsForMatch(activeMatchId))
    }

    syncMatches()
    syncTickets()

    const unsubscribeMatches = subscribeArenaMatches(syncMatches)
    const unsubscribeTickets = subscribeSpectatorTickets(syncTickets)

    return () => {
      unsubscribeMatches()
      unsubscribeTickets()
    }
  }, [activeMatchId])

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      setFeaturedMatches(buildFeaturedSpectateMarkets(readArenaMatches()))
      if (activeMatchId) {
        setTickets(getTicketsForMatch(activeMatchId))
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [activeMatchId])

  const filteredMatches = useMemo(() => {
    if (selectedFilter === "All") return featuredMatches
    return featuredMatches.filter((match) => match.game === selectedFilter)
  }, [featuredMatches, selectedFilter])

  const activeMatch = useMemo(() => {
    const selected = filteredMatches.find((match) => match.id === activeMatchId)
    return selected ?? filteredMatches[0] ?? null
  }, [filteredMatches, activeMatchId])

  const activeMarketSeconds = activeMatch ? getArenaBettingSecondsLeft(activeMatch) : 0
  const marketOpen = activeMatch ? isArenaBettable(activeMatch) : false
  const closingTone = getClosingTone(activeMarketSeconds)
  const betAmount = clampBetAmount(Number(betAmountInput))

  const totalSpectatorPool = activeMatch
    ? activeMatch.spectatorPool.host + activeMatch.spectatorPool.challenger
    : 0

  const netPool = getNetPool(totalSpectatorPool)

  const hostCurrentMultiplier = activeMatch
    ? getMultiplier(
        activeMatch.spectatorPool.host,
        activeMatch.spectatorPool.challenger,
        "host"
      )
    : 0

  const challengerCurrentMultiplier = activeMatch
    ? getMultiplier(
        activeMatch.spectatorPool.host,
        activeMatch.spectatorPool.challenger,
        "challenger"
      )
    : 0

  const hostProjection = activeMatch
    ? getProjectedState(
        activeMatch.spectatorPool.host,
        activeMatch.spectatorPool.challenger,
        "host",
        betAmount
      )
    : { projectedHost: 0, projectedChallenger: 0, multiplier: 0, payout: 0 }

  const challengerProjection = activeMatch
    ? getProjectedState(
        activeMatch.spectatorPool.host,
        activeMatch.spectatorPool.challenger,
        "challenger",
        betAmount
      )
    : { projectedHost: 0, projectedChallenger: 0, multiplier: 0, payout: 0 }

  const hostShare = activeMatch
    ? getSideShare(
        activeMatch.spectatorPool.host,
        activeMatch.spectatorPool.challenger,
        "host"
      )
    : 0

  const challengerShare = activeMatch
    ? getSideShare(
        activeMatch.spectatorPool.host,
        activeMatch.spectatorPool.challenger,
        "challenger"
      )
    : 0

  const myHostExposure = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.side === "host")
        .reduce((sum, ticket) => sum + ticket.amount, 0),
    [tickets]
  )

  const myChallengerExposure = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.side === "challenger")
        .reduce((sum, ticket) => sum + ticket.amount, 0),
    [tickets]
  )

  const myTotalExposure = myHostExposure + myChallengerExposure

  const recentTickets = useMemo(
    () => [...tickets].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6),
    [tickets]
  )

  const favoriteData = activeMatch
    ? getFavoriteData(
        activeMatch.host.rating,
        activeMatch.challenger?.rating ?? activeMatch.host.rating
      )
    : {
        favorite: "even" as const,
        leftLabel: "Even Match",
        rightLabel: "Even Match",
        edge: 0,
      }

  const hostProbability = activeMatch
    ? getWinProbability(
        activeMatch.host.rating,
        activeMatch.challenger?.rating ?? activeMatch.host.rating,
        "host"
      )
    : 0.5

  const challengerProbability = activeMatch
    ? getWinProbability(
        activeMatch.host.rating,
        activeMatch.challenger?.rating ?? activeMatch.host.rating,
        "challenger"
      )
    : 0.5

  function resetSlipForMatch(match: ArenaMatch) {
    setSelectedSide(null)
    setBetAmountInput(String(DEFAULT_BET))
    setBetMessage(
      `Watching ${match.host.name} vs ${match.challenger?.name ?? "Waiting Opponent"}. You can spectate without betting, or place a bet before the official pre-match market closes.`
    )
  }

  function handleSelectMatch(match: ArenaMatch) {
    setActiveMatchId(match.id)
    resetSlipForMatch(match)
  }

  async function handlePlaceBet() {
    if (!activeMatch) {
      setBetMessage("No active featured match available.")
      return
    }

    if (!marketOpen) {
      setBetMessage("Betting is closed for this match.")
      return
    }

    if (!selectedSide) {
      setBetMessage("Select a side before placing a bet.")
      return
    }

    if (!activeMatch.challenger) {
      setBetMessage("This match needs both players seated before betting opens.")
      return
    }

    const rawValue = Number(betAmountInput)

    if (!Number.isFinite(rawValue)) {
      setBetMessage("Enter a valid bet amount.")
      return
    }

    const safeAmount = clampBetAmount(rawValue)
    const selectedPlayer =
      selectedSide === "host" ? activeMatch.host.name : activeMatch.challenger.name
    const projection = selectedSide === "host" ? hostProjection : challengerProjection

    try {
      await placeArenaSpectatorBet({
        matchId: activeMatch.id,
        side: selectedSide,
        amount: safeAmount,
        user: currentUser.name,
        walletAddress: currentUser.name,
      })

      const refreshedMatches = buildFeaturedSpectateMarkets(readArenaMatches())
      setFeaturedMatches(refreshedMatches)
      setTickets(getTicketsForMatch(activeMatch.id))
    } catch {
      setBetMessage("Failed to place spectator bet.")
      return
    }

    setPoolFlash(selectedSide)
    window.setTimeout(() => setPoolFlash(null), 650)

    setFeed((prev) => {
      const whale = safeAmount >= WHALE_BET_THRESHOLD
      const message = whale
        ? `WHALE BET: ${safeAmount} KAS on ${selectedPlayer}`
        : `⚡ ${safeAmount} KAS bet placed on ${selectedPlayer}`
      return [message, ...prev].slice(0, 12)
    })

    setBetAmountInput(String(DEFAULT_BET))
    setBetMessage(
      `Bet placed: ${safeAmount} KAS on ${selectedPlayer}. Projected return: ${projection.multiplier.toFixed(
        2
      )}x. Estimated payout if that side wins: ${projection.payout.toFixed(2)} KAS after rake.`
    )
  }

  if (!activeMatch) {
    return (
      <main className="min-h-screen bg-[#050807] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="text-sm uppercase tracking-[0.3em] text-emerald-300">
              Spectator Arena
            </div>
            <h1 className="mt-3 text-3xl font-semibold">No featured markets yet</h1>
            <p className="mt-3 max-w-2xl text-white/65">
              Launch a match from the arena lobby first. Once a game becomes featured,
              spectators will see live pools, side splits, and projected payouts here.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/arena"
                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-3 font-semibold text-black"
              >
                Back to Arena
              </Link>
              <Link
                href="/bets"
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white"
              >
                My Bets
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#050807] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          <div className="animate-pulse whitespace-nowrap">{feed.join(" • ")}</div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                    KasRoyal Live Betting Exchange
                  </div>
                  <h1 className="mt-2 text-4xl font-semibold">Spectator Arena</h1>
                  <p className="mt-3 max-w-3xl text-white/65">
                    One official featured market per game type keeps liquidity tighter and
                    odds cleaner. Users can always spectate featured matches, but betting
                    only exists during the controlled pre-match window.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/bets"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    My Bets
                  </Link>
                  <Link
                    href="/arena"
                    className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-4 py-3 text-sm font-semibold text-black"
                  >
                    Arena Lobby
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <HeaderStat
                  label="Live Viewers"
                  value={`${activeMatch.spectators}`}
                  tone="white"
                />
                <HeaderStat
                  label="Total Pool"
                  value={`${totalSpectatorPool.toFixed(0)} KAS`}
                  tone="gold"
                />
                <HeaderStat
                  label="Net After Rake"
                  value={`${netPool.toFixed(2)} KAS`}
                  tone="green"
                />
                <HeaderStat
                  label="House Rake"
                  value={`${Math.round(HOUSE_RAKE * 100)}%`}
                  tone="sky"
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap gap-3">
                {(["All", ...gameDisplayOrder] as SpectateFilter[]).map((filter) => {
                  const active = selectedFilter === filter

                  return (
                    <button
                      key={filter}
                      onClick={() => setSelectedFilter(filter)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        active
                          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300"
                          : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {filter}
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 grid gap-4">
                {filteredMatches.map((match) => (
                  <FeaturedGameCard
                    key={match.id}
                    match={match}
                    active={match.id === activeMatch.id}
                    onSelect={() => handleSelectMatch(match)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-amber-300">
                    Active Match
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">{activeMatch.game}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <TonePill tone="neutral">
                      {getEdgeText(
                        activeMatch.host.rating,
                        activeMatch.challenger?.rating ?? activeMatch.host.rating
                      )}
                    </TonePill>
                    <TonePill tone={marketOpen ? "green" : "red"}>
                      {marketOpen
                        ? `Betting locks in ${formatTime(activeMarketSeconds)}`
                        : "Spectate Only"}
                    </TonePill>
                    <TonePill tone="gold">
                      {getGameBettingWindowLabel(activeMatch.game)}
                    </TonePill>
                    <TonePill tone={activeMatch.isFeaturedMarket ? "gold" : "neutral"}>
                      {activeMatch.isFeaturedMarket ? "Featured Market" : "Watch Only"}
                    </TonePill>
                  </div>
                </div>

                <Link
                  href={`/arena/match/${activeMatch.id}`}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Watch Full Match
                </Link>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <button
                  onClick={() => setSelectedSide("host")}
                  disabled={!marketOpen || !activeMatch.challenger}
                  className={`rounded-3xl border p-5 text-left transition ${
                    selectedSide === "host"
                      ? "border-amber-300/30 bg-amber-300/10"
                      : "border-white/10 bg-black/20 hover:bg-white/5"
                  } ${poolFlash === "host" ? "scale-[1.01]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-white/50">Host Side</div>
                      <div className="mt-1 text-xl font-semibold text-white">
                        {activeMatch.host.name}
                      </div>
                    </div>
                    <RankBadge rank={activeMatch.host.rank} />
                  </div>

                  <div className="mt-3 text-sm text-white/65">
                    {activeMatch.hostSideLabel} • {activeMatch.host.rating} MMR •{" "}
                    {activeMatch.host.winRate}% WR • Last 10: {activeMatch.host.last10}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <TonePill
                      tone={
                        favoriteData.leftLabel === "Favorite"
                          ? "green"
                          : favoriteData.leftLabel === "Underdog"
                            ? "gold"
                            : "neutral"
                      }
                    >
                      {favoriteData.leftLabel}
                    </TonePill>
                    <TonePill tone="sky">
                      Win probability {Math.round(hostProbability * 100)}%
                    </TonePill>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Market Share
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {hostShare.toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Current Multiplier
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {hostCurrentMultiplier.toFixed(2)}x
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Current Pool
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {activeMatch.spectatorPool.host.toFixed(0)} KAS
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Projected Payout
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {hostProjection.payout.toFixed(2)} KAS
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedSide("challenger")}
                  disabled={!marketOpen || !activeMatch.challenger}
                  className={`rounded-3xl border p-5 text-left transition ${
                    selectedSide === "challenger"
                      ? "border-emerald-300/30 bg-emerald-400/10"
                      : "border-white/10 bg-black/20 hover:bg-white/5"
                  } ${poolFlash === "challenger" ? "scale-[1.01]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-white/50">Challenger Side</div>
                      <div className="mt-1 text-xl font-semibold text-white">
                        {activeMatch.challenger?.name ?? "Waiting Opponent"}
                      </div>
                    </div>
                    {activeMatch.challenger ? (
                      <RankBadge rank={activeMatch.challenger.rank} />
                    ) : null}
                  </div>

                  <div className="mt-3 text-sm text-white/65">
                    {activeMatch.challengerSideLabel} •{" "}
                    {activeMatch.challenger?.rating ?? 0} MMR •{" "}
                    {activeMatch.challenger?.winRate ?? 0}% WR • Last 10:{" "}
                    {activeMatch.challenger?.last10 ?? "--"}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <TonePill
                      tone={
                        favoriteData.rightLabel === "Favorite"
                          ? "green"
                          : favoriteData.rightLabel === "Underdog"
                            ? "gold"
                            : "neutral"
                      }
                    >
                      {favoriteData.rightLabel}
                    </TonePill>
                    <TonePill tone="sky">
                      Win probability {Math.round(challengerProbability * 100)}%
                    </TonePill>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Market Share
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {challengerShare.toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Current Multiplier
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {challengerCurrentMultiplier.toFixed(2)}x
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Current Pool
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {activeMatch.spectatorPool.challenger.toFixed(0)} KAS
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Projected Payout
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {challengerProjection.payout.toFixed(2)} KAS
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm uppercase tracking-[0.22em] text-white/45">
                      Bet Slip
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {selectedSide
                        ? `Backing ${selectedSide === "host" ? activeMatch.host.name : activeMatch.challenger?.name ?? "Waiting Opponent"}`
                        : "Select a side to begin"}
                    </div>
                  </div>
                  <TonePill
                    tone={
                      closingTone === "danger"
                        ? "red"
                        : closingTone === "warning"
                          ? "gold"
                          : "green"
                    }
                  >
                    {marketOpen ? `Open ${formatTime(activeMarketSeconds)}` : "Closed"}
                  </TonePill>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label className="mb-2 block text-sm text-white/60">Bet Amount (KAS)</label>
                    <input
                      value={betAmountInput}
                      onChange={(event) => setBetAmountInput(event.target.value)}
                      inputMode="numeric"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-300/30"
                      placeholder={`${DEFAULT_BET}`}
                    />
                    <div className="mt-2 text-xs text-white/45">
                      Minimum {MIN_BET} KAS • Maximum {MAX_BET} KAS
                    </div>
                  </div>

                  <button
                    onClick={handlePlaceBet}
                    disabled={!marketOpen || !selectedSide || !activeMatch.challenger}
                    className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-6 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Place Bet
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
                  {betMessage}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm uppercase tracking-[0.3em] text-sky-300">
                My Market Activity
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <HeaderStat label="Host Exposure" value={`${myHostExposure.toFixed(0)} KAS`} />
                <HeaderStat
                  label="Challenger Exposure"
                  value={`${myChallengerExposure.toFixed(0)} KAS`}
                />
                <HeaderStat
                  label="Total Exposure"
                  value={`${myTotalExposure.toFixed(0)} KAS`}
                  tone="gold"
                />
              </div>

              <div className="mt-6">
                <div className="text-sm font-semibold text-white">Recent Tickets</div>

                {recentTickets.length ? (
                  <div className="mt-3 space-y-3">
                    {recentTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                      >
                        <div>
                          <div className="font-medium text-white">{ticket.user}</div>
                          <div className="text-sm text-white/50">
                            {ticket.side === "host"
                              ? activeMatch.host.name
                              : activeMatch.challenger?.name ?? "Challenger"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-white">{ticket.amount} KAS</div>
                          <div className="text-xs text-white/40">
                            {new Date(ticket.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/55">
                    No tickets yet for this market.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}