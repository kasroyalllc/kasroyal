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
  isArenaSpectatable,
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

function EmptySection({
  title,
  text,
}: {
  title: string
  text: string
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/55">{text}</div>
    </div>
  )
}

function WatchGameCard({
  match,
  active,
  onSelect,
}: {
  match: ArenaMatch
  active: boolean
  onSelect: () => void
}) {
  const meta = gameMeta[match.game]
  const totalPool = match.spectatorPool.host + match.spectatorPool.challenger
  const seconds = getArenaBettingSecondsLeft(match)
  const bettingOpen = isArenaBettable(match)

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-3xl border p-5 text-left transition ${
        active
          ? "border-sky-300/30 bg-sky-400/10 shadow-[0_0_0_1px_rgba(56,189,248,0.15)]"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{meta.icon}</span>
            <div className="text-lg font-semibold text-white">{match.game}</div>
          </div>
          <div className="mt-1 truncate text-sm text-white/60">
            {match.host.name} vs {match.challenger?.name ?? "Waiting Opponent"}
          </div>
        </div>

        <TonePill
          tone={
            match.status === "Live"
              ? "green"
              : match.status === "Ready to Start"
                ? "gold"
                : "sky"
          }
        >
          {match.status}
        </TonePill>
      </div>

      <div className="mt-4 text-sm text-white/65">{meta.subtitle}</div>

      <div className="mt-4 flex flex-wrap gap-2">
        <TonePill tone={match.challenger ? "green" : "sky"}>
          {match.challenger ? "Watchable Now" : "Open Room"}
        </TonePill>
        <TonePill tone={bettingOpen ? "gold" : "neutral"}>
          {bettingOpen ? `Betting Open ${formatTime(seconds)}` : "Betting Closed"}
        </TonePill>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Status</div>
          <div className="mt-1 font-semibold text-white">{match.statusText}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Pot</div>
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
      </div>
    </button>
  )
}

function BettingMarketCard({
  match,
  active,
  onSelect,
}: {
  match: ArenaMatch
  active: boolean
  onSelect: () => void
}) {
  const meta = gameMeta[match.game]
  const seconds = getArenaBettingSecondsLeft(match)
  const open = isArenaBettable(match)
  const totalPool = match.spectatorPool.host + match.spectatorPool.challenger
  const favoriteData = getFavoriteData(
    match.host.rating,
    match.challenger?.rating ?? match.host.rating
  )

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
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{meta.icon}</span>
            <div className="text-lg font-semibold text-white">{match.game}</div>
          </div>
          <div className="mt-1 truncate text-sm text-white/60">
            {match.host.name} vs {match.challenger?.name ?? "Waiting Opponent"}
          </div>
        </div>

        <TonePill tone={open ? "gold" : "red"}>
          {open ? `Open ${formatTime(seconds)}` : "Closed"}
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
        <TonePill tone="sky">{getGameBettingWindowLabel(match.game)}</TonePill>
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
          <div className="mt-1 font-semibold text-white">{match.statusText}</div>
        </div>
      </div>
    </button>
  )
}

export default function SpectatePage() {
  const [allMatches, setAllMatches] = useState<ArenaMatch[]>([])
  const [selectedFilter, setSelectedFilter] = useState<SpectateFilter>("All")
  const [activeWatchMatchId, setActiveWatchMatchId] = useState("")
  const [activeBettingMatchId, setActiveBettingMatchId] = useState("")
  const [selectedSide, setSelectedSide] = useState<ArenaSide | null>(null)
  const [betAmountInput, setBetAmountInput] = useState(String(DEFAULT_BET))
  const [betMessage, setBetMessage] = useState(
    "Spectating and betting are separated now. Pick any watchable room to observe, then use the Official Betting Markets section to find live betting windows."
  )
  const [feed, setFeed] = useState<string[]>(arenaFeedSeed)
  const [tickets, setTickets] = useState<PersistedBetTicket[]>([])
  const [poolFlash, setPoolFlash] = useState<ArenaSide | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const syncMatches = () => {
      const matches = readArenaMatches()
      setAllMatches(matches)
    }

    const syncTickets = () => {
      if (!activeBettingMatchId) {
        setTickets([])
        return
      }
      setTickets(getTicketsForMatch(activeBettingMatchId))
    }

    syncMatches()
    syncTickets()

    const unsubscribeMatches = subscribeArenaMatches(syncMatches)
    const unsubscribeTickets = subscribeSpectatorTickets(syncTickets)

    return () => {
      unsubscribeMatches()
      unsubscribeTickets()
    }
  }, [activeBettingMatchId])

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      setAllMatches(readArenaMatches())
      if (activeBettingMatchId) {
        setTickets(getTicketsForMatch(activeBettingMatchId))
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [activeBettingMatchId])

  const filteredMatches = useMemo(() => {
    if (selectedFilter === "All") return allMatches
    return allMatches.filter((match) => match.game === selectedFilter)
  }, [allMatches, selectedFilter])

  const watchableMatches = useMemo(() => {
    return filteredMatches.filter(
      (match) =>
        match.status === "Waiting for Opponent" ||
        isArenaSpectatable(match) ||
        match.status === "Ready to Start" ||
        match.status === "Live"
    )
  }, [filteredMatches])

  const bettingMatches = useMemo(() => {
    return buildFeaturedSpectateMarkets(filteredMatches)
  }, [filteredMatches])

  useEffect(() => {
    setActiveWatchMatchId((current) => {
      if (current && watchableMatches.some((match) => match.id === current)) return current
      return watchableMatches[0]?.id ?? ""
    })

    setActiveBettingMatchId((current) => {
      if (current && bettingMatches.some((match) => match.id === current)) return current
      return bettingMatches[0]?.id ?? ""
    })
  }, [watchableMatches, bettingMatches])

  const activeWatchMatch = useMemo(() => {
    return watchableMatches.find((match) => match.id === activeWatchMatchId) ?? watchableMatches[0] ?? null
  }, [watchableMatches, activeWatchMatchId])

  const activeBettingMatch = useMemo(() => {
    return bettingMatches.find((match) => match.id === activeBettingMatchId) ?? bettingMatches[0] ?? null
  }, [bettingMatches, activeBettingMatchId])

  useEffect(() => {
    setSelectedSide(null)
    setBetAmountInput(String(DEFAULT_BET))

    if (activeBettingMatch) {
      setBetMessage(
        `Selected official betting market: ${activeBettingMatch.host.name} vs ${activeBettingMatch.challenger?.name ?? "Waiting Opponent"}.`
      )
    } else {
      setBetMessage(
        "No official betting market is open right now. You can still spectate any watchable room above."
      )
    }
  }, [activeBettingMatchId, activeBettingMatch])

  const activeMarketSeconds = activeBettingMatch
    ? getArenaBettingSecondsLeft(activeBettingMatch)
    : 0

  const marketOpen = activeBettingMatch ? isArenaBettable(activeBettingMatch) : false
  const closingTone = getClosingTone(activeMarketSeconds)
  const betAmount = clampBetAmount(Number(betAmountInput))

  const totalSpectatorPool = activeBettingMatch
    ? activeBettingMatch.spectatorPool.host + activeBettingMatch.spectatorPool.challenger
    : 0

  const netPool = getNetPool(totalSpectatorPool)

  const hostCurrentMultiplier = activeBettingMatch
    ? getMultiplier(
        activeBettingMatch.spectatorPool.host,
        activeBettingMatch.spectatorPool.challenger,
        "host"
      )
    : 0

  const challengerCurrentMultiplier = activeBettingMatch
    ? getMultiplier(
        activeBettingMatch.spectatorPool.host,
        activeBettingMatch.spectatorPool.challenger,
        "challenger"
      )
    : 0

  const hostProjection = activeBettingMatch
    ? getProjectedState(
        activeBettingMatch.spectatorPool.host,
        activeBettingMatch.spectatorPool.challenger,
        "host",
        betAmount
      )
    : { projectedHost: 0, projectedChallenger: 0, multiplier: 0, payout: 0 }

  const challengerProjection = activeBettingMatch
    ? getProjectedState(
        activeBettingMatch.spectatorPool.host,
        activeBettingMatch.spectatorPool.challenger,
        "challenger",
        betAmount
      )
    : { projectedHost: 0, projectedChallenger: 0, multiplier: 0, payout: 0 }

  const hostShare = activeBettingMatch
    ? getSideShare(
        activeBettingMatch.spectatorPool.host,
        activeBettingMatch.spectatorPool.challenger,
        "host"
      )
    : 0

  const challengerShare = activeBettingMatch
    ? getSideShare(
        activeBettingMatch.spectatorPool.host,
        activeBettingMatch.spectatorPool.challenger,
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

  const favoriteData = activeBettingMatch
    ? getFavoriteData(
        activeBettingMatch.host.rating,
        activeBettingMatch.challenger?.rating ?? activeBettingMatch.host.rating
      )
    : {
        favorite: "even" as const,
        leftLabel: "Even Match",
        rightLabel: "Even Match",
        edge: 0,
      }

  const hostProbability = activeBettingMatch
    ? getWinProbability(
        activeBettingMatch.host.rating,
        activeBettingMatch.challenger?.rating ?? activeBettingMatch.host.rating,
        "host"
      )
    : 0.5

  const challengerProbability = activeBettingMatch
    ? getWinProbability(
        activeBettingMatch.host.rating,
        activeBettingMatch.challenger?.rating ?? activeBettingMatch.host.rating,
        "challenger"
      )
    : 0.5

  async function handlePlaceBet() {
    if (!activeBettingMatch) {
      setBetMessage("No active official betting market available.")
      return
    }

    if (!marketOpen) {
      setBetMessage("Betting is closed for this market.")
      return
    }

    if (!selectedSide) {
      setBetMessage("Select a side before placing a bet.")
      return
    }

    if (!activeBettingMatch.challenger) {
      setBetMessage("Both players must be seated before betting opens.")
      return
    }

    const rawValue = Number(betAmountInput)

    if (!Number.isFinite(rawValue)) {
      setBetMessage("Enter a valid bet amount.")
      return
    }

    const safeAmount = clampBetAmount(rawValue)
    const selectedPlayer =
      selectedSide === "host"
        ? activeBettingMatch.host.name
        : activeBettingMatch.challenger.name

    const projection =
      selectedSide === "host" ? hostProjection : challengerProjection

    try {
      await placeArenaSpectatorBet({
        matchId: activeBettingMatch.id,
        side: selectedSide,
        amount: safeAmount,
        user: currentUser.name,
        walletAddress: currentUser.name,
      })

      setAllMatches(readArenaMatches())
      setTickets(getTicketsForMatch(activeBettingMatch.id))
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

  return (
    <main className="min-h-screen bg-[#050807] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          <div className="animate-pulse whitespace-nowrap">{feed.join(" • ")}</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                KasRoyal Live Betting Exchange
              </div>
              <h1 className="mt-2 text-4xl font-semibold">Spectator Arena</h1>
              <p className="mt-3 max-w-3xl text-white/65">
                Spectating and betting are now separated. Every watchable room can be
                discovered in the Watch Arena, while official featured markets with active
                betting windows appear below in Official Betting Markets.
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
              label="Watchable Rooms"
              value={`${watchableMatches.length}`}
              tone="white"
            />
            <HeaderStat
              label="Official Betting Markets"
              value={`${bettingMatches.length}`}
              tone="gold"
            />
            <HeaderStat
              label="Featured Pool"
              value={`${totalSpectatorPool.toFixed(0)} KAS`}
              tone="green"
            />
            <HeaderStat
              label="House Rake"
              value={`${Math.round(HOUSE_RAKE * 100)}%`}
              tone="sky"
            />
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
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
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-sky-400/15 bg-sky-400/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-sky-300">
                    Watch Arena
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">All Watchable Matches</h2>
                  <p className="mt-2 text-white/60">
                    Newly created rooms now appear here immediately. Open rooms, ready rooms,
                    and live games are all visible for discovery.
                  </p>
                </div>

                {activeWatchMatch ? (
                  <Link
                    href={`/arena/match/${activeWatchMatch.id}`}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Watch Selected
                  </Link>
                ) : null}
              </div>

              {watchableMatches.length ? (
                <div className="mt-6 grid gap-4">
                  {watchableMatches.map((match) => (
                    <WatchGameCard
                      key={match.id}
                      match={match}
                      active={match.id === activeWatchMatch?.id}
                      onSelect={() => setActiveWatchMatchId(match.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptySection
                    title="No watchable rooms yet"
                    text="Create a room from the arena lobby and it will show up here, even before betting becomes available."
                  />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-amber-300/15 bg-amber-300/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-amber-300">
                    Official Betting Markets
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">Featured Markets Only</h2>
                  <p className="mt-2 text-white/60">
                    Only official featured matches with betting support appear here. This
                    makes short betting windows easy to find instead of buried in the main
                    watch feed.
                  </p>
                </div>

                {activeBettingMatch ? (
                  <Link
                    href={`/arena/match/${activeBettingMatch.id}`}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Watch Market
                  </Link>
                ) : null}
              </div>

              {bettingMatches.length ? (
                <div className="mt-6 grid gap-4">
                  {bettingMatches.map((match) => (
                    <BettingMarketCard
                      key={match.id}
                      match={match}
                      active={match.id === activeBettingMatch?.id}
                      onSelect={() => setActiveBettingMatchId(match.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptySection
                    title="No betting markets live"
                    text="Featured betting markets appear here once a match is selected into the official betting pool."
                  />
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                    Betting Slip
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">
                    {activeBettingMatch ? activeBettingMatch.game : "No Active Betting Market"}
                  </h2>

                  {activeBettingMatch ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <TonePill tone="neutral">
                        {getEdgeText(
                          activeBettingMatch.host.rating,
                          activeBettingMatch.challenger?.rating ??
                            activeBettingMatch.host.rating
                        )}
                      </TonePill>
                      <TonePill tone={marketOpen ? "green" : "red"}>
                        {marketOpen
                          ? `Betting locks in ${formatTime(activeMarketSeconds)}`
                          : "Betting Closed"}
                      </TonePill>
                      <TonePill tone="gold">
                        {getGameBettingWindowLabel(activeBettingMatch.game)}
                      </TonePill>
                    </div>
                  ) : null}
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
                  {activeBettingMatch && marketOpen
                    ? `Open ${formatTime(activeMarketSeconds)}`
                    : "Closed"}
                </TonePill>
              </div>

              {activeBettingMatch ? (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      label="Live Viewers"
                      value={`${activeBettingMatch.spectators}`}
                      tone="white"
                    />
                    <HeaderStat
                      label="House Rake"
                      value={`${Math.round(HOUSE_RAKE * 100)}%`}
                      tone="sky"
                    />
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <button
                      onClick={() => setSelectedSide("host")}
                      disabled={!marketOpen || !activeBettingMatch.challenger}
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
                            {activeBettingMatch.host.name}
                          </div>
                        </div>
                        <RankBadge rank={activeBettingMatch.host.rank} />
                      </div>

                      <div className="mt-3 text-sm text-white/65">
                        {activeBettingMatch.hostSideLabel} • {activeBettingMatch.host.rating} MMR •{" "}
                        {activeBettingMatch.host.winRate}% WR • Last 10:{" "}
                        {activeBettingMatch.host.last10}
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
                            {activeBettingMatch.spectatorPool.host.toFixed(0)} KAS
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
                      disabled={!marketOpen || !activeBettingMatch.challenger}
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
                            {activeBettingMatch.challenger?.name ?? "Waiting Opponent"}
                          </div>
                        </div>
                        {activeBettingMatch.challenger ? (
                          <RankBadge rank={activeBettingMatch.challenger.rank} />
                        ) : null}
                      </div>

                      <div className="mt-3 text-sm text-white/65">
                        {activeBettingMatch.challengerSideLabel} •{" "}
                        {activeBettingMatch.challenger?.rating ?? 0} MMR •{" "}
                        {activeBettingMatch.challenger?.winRate ?? 0}% WR • Last 10:{" "}
                        {activeBettingMatch.challenger?.last10 ?? "--"}
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
                            {activeBettingMatch.spectatorPool.challenger.toFixed(0)} KAS
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
                            ? `Backing ${
                                selectedSide === "host"
                                  ? activeBettingMatch.host.name
                                  : activeBettingMatch.challenger?.name ??
                                    "Waiting Opponent"
                              }`
                            : "Select a side to begin"}
                        </div>
                      </div>

                      <TonePill tone={marketOpen ? "green" : "red"}>
                        {marketOpen
                          ? `Official Market Open ${formatTime(activeMarketSeconds)}`
                          : "Official Market Closed"}
                      </TonePill>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
                      <div>
                        <label className="mb-2 block text-sm text-white/60">
                          Bet Amount (KAS)
                        </label>
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
                        disabled={!marketOpen || !selectedSide || !activeBettingMatch.challenger}
                        className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-6 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Place Bet
                      </button>
                    </div>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
                      {betMessage}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-6">
                  <EmptySection
                    title="No official betting market selected"
                    text="You can still watch rooms above. When a featured market is available, betting controls will appear here."
                  />
                </div>
              )}
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
                              ? activeBettingMatch?.host.name ?? "Host"
                              : activeBettingMatch?.challenger?.name ?? "Challenger"}
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