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
  getTicketExposureByMatch,
  getTicketsForMatch,
  getWinProbability,
  isArenaBettable,
  placeArenaSpectatorBet,
  readArenaMatches,
  subscribeArenaMatches,
  subscribeSpectatorTickets,
  type ArenaMatch,
  type GameType,
  type PersistedBetTicket,
  type RankTier,
} from "@/lib/mock/arena-data"

type SpectateFilter = "All" | GameType

function clampBetAmount(value: number) {
  if (!Number.isFinite(value)) return MIN_BET
  return Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(value)))
}

function RankBadge({ rank }: { rank: RankTier }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${getRankColors(
        rank
      )}`}
    >
      {rank}
    </span>
  )
}

function LabelPill({ label }: { label: string }) {
  const className =
    label === "Favorite"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : label === "Even Match"
      ? "border-white/10 bg-white/10 text-white/75"
      : "border-amber-300/20 bg-amber-300/10 text-amber-300"

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.15em] ${className}`}
    >
      {label}
    </span>
  )
}

function StatMini({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "gold" | "green"
}) {
  const toneClass =
    tone === "gold" ? "text-amber-300" : tone === "green" ? "text-emerald-300" : "text-white"

  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</div>
    </div>
  )
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
    <div className="rounded-2xl border border-white/8 bg-black/30 px-5 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</div>
    </div>
  )
}

function PoolPreviewCard({
  title,
  player,
  rank,
  sideLabel,
  favoriteLabel,
  share,
  currentPool,
  currentMultiplier,
  projectedPayout,
  projectedMultiplier,
  isSelected,
  onSelect,
  disabled,
  tone,
  flash,
  winRate,
  mmr,
  last10,
  probability,
}: {
  title: string
  player: string
  rank: RankTier
  sideLabel: string
  favoriteLabel: string
  share: number
  currentPool: number
  currentMultiplier: number
  projectedPayout: number
  projectedMultiplier: number
  isSelected: boolean
  onSelect: () => void
  disabled: boolean
  tone: "amber" | "emerald"
  flash: boolean
  winRate: number
  mmr: number
  last10: string
  probability: number
}) {
  const buttonClass = isSelected
    ? tone === "amber"
      ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black"
      : "bg-gradient-to-r from-emerald-300 to-emerald-500 text-black"
    : "border border-white/10 bg-white/5 text-white"

  return (
    <div
      className={`rounded-[28px] border p-5 ${
        tone === "amber" ? "border-amber-300/10 bg-black/25" : "border-emerald-400/10 bg-black/25"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.16em] text-white/45">{title}</div>
          <div className="mt-2 text-3xl font-black">{player}</div>
          <div className="mt-1 text-base text-white/60">{sideLabel}</div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <RankBadge rank={rank} />
            <LabelPill label={favoriteLabel} />
          </div>

          <div className="mt-4 grid gap-1 text-sm text-white/55">
            <div>{mmr} MMR</div>
            <div>{winRate}% win rate</div>
            <div>Last 10: {last10}</div>
            <div>Win probability: {Math.round(probability * 100)}%</div>
          </div>
        </div>

        <button
          onClick={onSelect}
          disabled={disabled}
          className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-bold transition ${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Back {player}
        </button>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/45">
          <span>Market Share</span>
          <span>{share.toFixed(1)}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              tone === "amber"
                ? "bg-gradient-to-r from-amber-400 to-yellow-300"
                : "bg-gradient-to-r from-emerald-300 to-emerald-500"
            }`}
            style={{ width: `${share}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div
          className={`rounded-2xl border p-4 transition-all duration-500 ${
            tone === "amber"
              ? "border-amber-300/20 bg-amber-300/10"
              : "border-emerald-400/20 bg-emerald-400/10"
          } ${flash ? "scale-[1.02] ring-2 ring-white/25" : ""}`}
        >
          <div className="text-xs uppercase tracking-[0.16em] text-white/50">Current Pool</div>
          <div className={`mt-2 text-3xl font-black ${tone === "amber" ? "text-amber-300" : "text-emerald-300"}`}>
            {currentPool.toFixed(0)} KAS
          </div>
          <div className="mt-4 text-xs uppercase tracking-[0.16em] text-white/50">Multiplier</div>
          <div className="mt-1 text-2xl font-black">{currentMultiplier.toFixed(2)}x</div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/50">Your Preview</div>
          <div className="mt-2 text-3xl font-black">{projectedPayout.toFixed(2)} KAS</div>
          <div className="mt-4 text-xs uppercase tracking-[0.16em] text-white/50">Projected Multiplier</div>
          <div className={`mt-1 text-2xl font-black ${tone === "amber" ? "text-amber-300" : "text-emerald-300"}`}>
            {projectedMultiplier.toFixed(2)}x
          </div>
        </div>
      </div>
    </div>
  )
}

function MatchVisual({ game }: { game: ArenaMatch["game"] }) {
  if (game === "Chess Duel") {
    return (
      <div className="grid grid-cols-8 gap-1 rounded-[18px] border border-white/8 bg-black/30 p-4">
        {Array.from({ length: 64 }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-[4px] ${
              (Math.floor(i / 8) + i) % 2 === 0 ? "bg-amber-200/20" : "bg-black/50"
            }`}
          />
        ))}
      </div>
    )
  }

  if (game === "Connect 4") {
    return (
      <div className="grid grid-cols-7 gap-2 rounded-[18px] border border-white/8 bg-[#07100e] p-4 shadow-[inset_0_0_24px_rgba(0,255,200,0.08)]">
        {Array.from({ length: 42 }).map((_, i) => {
          const filled = [2, 4, 7, 10, 12, 18, 20, 23, 25, 27, 30, 31, 33].includes(i)
          const alt = [8, 15, 16, 22, 24, 29, 32, 34, 35].includes(i)

          return (
            <div
              key={i}
              className={`aspect-square rounded-full border ${
                filled
                  ? "border-amber-200/60 bg-amber-300 shadow-[0_0_14px_rgba(255,215,0,0.16)]"
                  : alt
                  ? "border-emerald-300/60 bg-emerald-400 shadow-[0_0_14px_rgba(0,255,200,0.14)]"
                  : "border-white/5 bg-black/40"
              }`}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3 rounded-[18px] border border-white/8 bg-black/30 p-4">
      {["X", "O", "X", "", "O", "", "", "", ""].map((cell, i) => (
        <div
          key={i}
          className={`flex aspect-square items-center justify-center rounded-[16px] border border-white/10 bg-black/35 text-3xl font-black ${
            cell === "X" ? "text-amber-200" : cell === "O" ? "text-emerald-200" : "text-white/20"
          }`}
        >
          {cell}
        </div>
      ))}
    </div>
  )
}

function FeaturedGameCard({
  match,
  seconds,
  active,
  onSelect,
}: {
  match: ArenaMatch
  seconds: number
  active: boolean
  onSelect: () => void
}) {
  const favoriteData = getFavoriteData(
    match.host.rating,
    match.challenger?.rating ?? match.host.rating
  )
  const totalPool = match.spectatorPool.host + match.spectatorPool.challenger
  const marketOpen = isArenaBettable(match)
  const tone = getClosingTone(seconds)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-[24px] border p-4 text-left transition ${
        active
          ? "border-emerald-300/30 bg-emerald-400/10 shadow-[0_0_24px_rgba(0,255,200,0.08)]"
          : "border-white/8 bg-black/25 hover:bg-white/[0.05]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${gameMeta[match.game].glow}`}>
          {match.game}
        </span>
        <span className="text-sm font-black text-amber-300">{match.playerPot} KAS</span>
      </div>

      <div className="text-base font-bold text-white">
        {match.host.name} vs {match.challenger?.name ?? "Waiting Opponent"}
      </div>

      <div className="mt-2 text-xs text-white/50">
        {match.isFeaturedMarket
          ? "Official featured market for this game"
          : "Watch-only room"}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <RankBadge rank={match.host.rank} />
        {match.challenger ? <RankBadge rank={match.challenger.rank} /> : null}
      </div>

      <div className="mt-3 grid gap-2 text-xs text-white/55">
        <div>
          {match.host.name}: {favoriteData.leftLabel} • {match.host.rating} MMR
        </div>
        <div>
          {match.challenger?.name ?? "Waiting Opponent"}: {favoriteData.rightLabel} •{" "}
          {match.challenger?.rating ?? 0} MMR
        </div>
      </div>

      <div className="mt-4 text-sm text-white/60">{match.statusText}</div>

      <div className="mt-4 flex items-center justify-between text-xs text-white/50">
        <span>{match.spectators} viewers</span>
        <span>{match.moveText}</span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            !marketOpen
              ? "bg-red-500/10 text-red-300"
              : tone === "danger"
              ? "bg-red-500/10 text-red-300"
              : tone === "warning"
              ? "bg-amber-400/10 text-amber-300"
              : "bg-emerald-400/10 text-emerald-300"
          }`}
        >
          {marketOpen ? `Open ${formatTime(seconds)}` : "Betting Closed"}
        </span>

        <span className="text-xs text-white/50">Pool: {totalPool.toFixed(0)} KAS</span>
      </div>
    </button>
  )
}

export default function SpectatePage() {
  const [featuredMatches, setFeaturedMatches] = useState<ArenaMatch[]>([])
  const [selectedFilter, setSelectedFilter] = useState<SpectateFilter>("All")
  const [activeMatchId, setActiveMatchId] = useState<string>("")
  const [selectedSide, setSelectedSide] = useState<"host" | "challenger" | null>(null)
  const [betAmountInput, setBetAmountInput] = useState(String(DEFAULT_BET))
  const [betMessage, setBetMessage] = useState(
    "Watch any featured live game without betting, or place a spectator bet during the official pre-match window."
  )
  const [feed, setFeed] = useState<string[]>(arenaFeedSeed)
  const [tickets, setTickets] = useState<PersistedBetTicket[]>([])
  const [poolFlash, setPoolFlash] = useState<"host" | "challenger" | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const syncMatches = () => {
      const matches = readArenaMatches()
      const featured = buildFeaturedSpectateMarkets(matches)

      setFeaturedMatches(featured)

      setActiveMatchId((current) => {
        if (current && featured.some((match) => match.id === current)) {
          return current
        }
        return featured[0]?.id ?? ""
      })
    }

    const syncTickets = () => {
      setTickets(getTicketsForMatch(activeMatchId, currentUser.name))
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
      setTickets(getTicketsForMatch(activeMatchId, currentUser.name))
    }, 1000)

    return () => clearInterval(timer)
  }, [activeMatchId])

  const filteredMatches = useMemo(() => {
    if (selectedFilter === "All") return featuredMatches
    return featuredMatches.filter((match) => match.game === selectedFilter)
  }, [featuredMatches, selectedFilter])

  const activeMatch = useMemo(() => {
    const fromFiltered = filteredMatches.find((match) => match.id === activeMatchId)
    if (fromFiltered) return fromFiltered
    return filteredMatches[0] ?? null
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
    ? getMultiplier(activeMatch.spectatorPool.host, activeMatch.spectatorPool.challenger, "host")
    : 0

  const challengerCurrentMultiplier = activeMatch
    ? getMultiplier(activeMatch.spectatorPool.host, activeMatch.spectatorPool.challenger, "challenger")
    : 0

  const hostProjection = activeMatch
    ? getProjectedState(activeMatch.spectatorPool.host, activeMatch.spectatorPool.challenger, "host", betAmount)
    : { projectedHost: 0, projectedChallenger: 0, multiplier: 0, payout: 0 }

  const challengerProjection = activeMatch
    ? getProjectedState(
        activeMatch.spectatorPool.host,
        activeMatch.spectatorPool.challenger,
        "challenger",
        betAmount
      )
    : { projectedHost: 0, projectedChallenger: 0, multiplier: 0, payout: 0 }

  const activeTickets = useMemo(
    () => tickets.filter((t) => t.matchId === activeMatch?.id),
    [tickets, activeMatch?.id]
  )

  const exposure = activeMatch
    ? getTicketExposureByMatch(activeMatch.id, currentUser.name)
    : { host: 0, challenger: 0, total: 0 }

  const myHostExposure = exposure.host
  const myChallengerExposure = exposure.challenger
  const myTotalExposure = exposure.total

  const recentTickets = [...activeTickets].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)

  const hostShare = activeMatch
    ? getSideShare(activeMatch.spectatorPool.host, activeMatch.spectatorPool.challenger, "host")
    : 0

  const challengerShare = activeMatch
    ? getSideShare(activeMatch.spectatorPool.host, activeMatch.spectatorPool.challenger, "challenger")
    : 0

  const favoriteData = activeMatch
    ? getFavoriteData(activeMatch.host.rating, activeMatch.challenger?.rating ?? activeMatch.host.rating)
    : { leftLabel: "Even Match", rightLabel: "Even Match" }

  const hostProbability = activeMatch
    ? getWinProbability(activeMatch.host.rating, activeMatch.challenger?.rating ?? activeMatch.host.rating)
    : 0.5

  const challengerProbability = activeMatch
    ? getWinProbability(activeMatch.challenger?.rating ?? activeMatch.host.rating, activeMatch.host.rating)
    : 0.5

  const upsetWarning =
    (favoriteData.leftLabel === "Favorite" && challengerShare > 55) ||
    (favoriteData.rightLabel === "Favorite" && hostShare > 55)

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

  function placeBet() {
    if (!activeMatch) {
      setBetMessage("No active live match available.")
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
      setBetMessage("This match still needs both players seated before betting.")
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
      placeArenaSpectatorBet(activeMatch.id, selectedSide, safeAmount)
      const refreshed = buildFeaturedSpectateMarkets(readArenaMatches())
      setFeaturedMatches(refreshed)
      setTickets(getTicketsForMatch(activeMatch.id, currentUser.name))
    } catch {
      setBetMessage("Failed to place spectator bet.")
      return
    }

    setPoolFlash(selectedSide)
    setTimeout(() => setPoolFlash(null), 650)

    setFeed((prev) => {
      const whale = safeAmount >= WHALE_BET_THRESHOLD
      const message = whale
        ? `🔥 WHALE BET: ${safeAmount} KAS on ${selectedPlayer}`
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
      <main className="min-h-screen bg-[#050807] text-white">
        <div className="relative z-10 mx-auto max-w-[1200px] px-5 py-16">
          <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-10 text-center">
            <h1 className="text-4xl font-black">Spectator Arena</h1>
            <p className="mt-4 text-white/60">
              No live or ready matches yet. Launch a match from the arena lobby first.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/arena"
                className="inline-flex items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
              >
                Back to Arena
              </Link>
              <Link
                href="/bets"
                className="inline-flex items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
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
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.07),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_20%,transparent_80%,rgba(255,255,255,0.02))]" />
      <div className="absolute left-[-80px] top-24 h-[320px] w-[320px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="absolute right-[-80px] top-32 h-[320px] w-[320px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1600px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/8">
          <div className="animate-[marquee_24s_linear_infinite] whitespace-nowrap py-3 text-sm font-semibold text-emerald-200 [@keyframes_marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}]">
            {feed.join("   •   ")}
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-6 rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_50px_rgba(0,255,200,0.05)] lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              KasRoyal Live Betting Exchange
            </div>

            <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">Spectator Arena</h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
              One official featured market per game type. Users can always watch featured live rooms,
              but betting only exists during the authoritative pre-match countdown.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-5">
            <HeaderStat label="Featured Markets" value={`${featuredMatches.length}`} tone="gold" />
            <HeaderStat label="Active Pool" value={`${totalSpectatorPool.toFixed(0)} KAS`} tone="green" />
            <HeaderStat label="Live Viewers" value={`${activeMatch.spectators}`} tone="sky" />
            <HeaderStat label="My Tickets" value={`${activeTickets.length}`} />
            <Link
              href="/bets"
              className="flex items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
            >
              My Bets
            </Link>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {(["All", ...gameDisplayOrder] as SpectateFilter[]).map((filter) => {
            const active = selectedFilter === filter

            return (
              <button
                key={filter}
                type="button"
                onClick={() => setSelectedFilter(filter)}
                className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
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

        <div className="grid gap-6 xl:grid-cols-[340px_1fr_360px]">
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Featured Markets</p>
                <h2 className="mt-2 text-2xl font-black">By Game Type</h2>
                <p className="mt-2 text-sm text-white/55">
                  Only one official featured market per game type is shown here to keep liquidity
                  concentrated and settlement clean.
                </p>
              </div>

              <div className="space-y-4">
                {filteredMatches.map((match) => (
                  <FeaturedGameCard
                    key={match.id}
                    match={match}
                    seconds={getArenaBettingSecondsLeft(match)}
                    active={match.id === activeMatch.id}
                    onSelect={() => handleSelectMatch(match)}
                  />
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[32px] border border-amber-300/10 bg-white/[0.04] p-6 shadow-[0_0_40px_rgba(0,255,200,0.05)]">
              <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Active Match</p>
                  <h2 className="mt-2 text-4xl font-black leading-none">{activeMatch.game}</h2>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white/75">
                      {getEdgeText(activeMatch.host.rating, activeMatch.challenger?.rating ?? activeMatch.host.rating)}
                    </span>

                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white/75">
                      {getGameBettingWindowLabel(activeMatch.game)}
                    </span>

                    {upsetWarning ? (
                      <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-red-300">
                        Potential Upset
                      </span>
                    ) : null}

                    {activeMatch.isFeaturedMarket ? (
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
                        Featured Market
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white/70">
                        Watch-Only
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full bg-white/5 px-4 py-3 text-sm font-semibold text-white/75">
                    {activeMatch.spectators} live viewers
                  </div>

                  <div
                    className={`rounded-full px-4 py-3 text-sm font-bold ${
                      !marketOpen
                        ? "bg-red-500/10 text-red-300"
                        : closingTone === "danger"
                        ? "bg-red-500/10 text-red-300"
                        : closingTone === "warning"
                        ? "bg-amber-400/10 text-amber-300"
                        : "bg-emerald-400/10 text-emerald-300"
                    }`}
                  >
                    {marketOpen ? `Betting locks in ${formatTime(activeMarketSeconds)}` : "Spectate Only"}
                  </div>

                  <Link
                    href={`/arena/match/${activeMatch.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    Watch Full Match
                  </Link>
                </div>
              </div>

              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <StatMini label="Total Pool" value={`${totalSpectatorPool.toFixed(0)} KAS`} tone="gold" />
                <StatMini label="Net Pool" value={`${netPool.toFixed(2)} KAS`} tone="green" />
                <StatMini label={`${activeMatch.host.name} Win`} value={`${Math.round(hostProbability * 100)}%`} />
                <StatMini
                  label={`${activeMatch.challenger?.name ?? "Challenger"} Win`}
                  value={`${Math.round(challengerProbability * 100)}%`}
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <PoolPreviewCard
                  title="Host Side"
                  player={activeMatch.host.name}
                  rank={activeMatch.host.rank}
                  sideLabel={activeMatch.hostSideLabel}
                  favoriteLabel={favoriteData.leftLabel}
                  share={hostShare}
                  currentPool={activeMatch.spectatorPool.host}
                  currentMultiplier={hostCurrentMultiplier}
                  projectedPayout={hostProjection.payout}
                  projectedMultiplier={hostProjection.multiplier}
                  isSelected={selectedSide === "host"}
                  onSelect={() => setSelectedSide("host")}
                  disabled={!marketOpen}
                  tone="amber"
                  flash={poolFlash === "host"}
                  winRate={activeMatch.host.winRate}
                  mmr={activeMatch.host.rating}
                  last10={activeMatch.host.last10}
                  probability={hostProbability}
                />

                <PoolPreviewCard
                  title="Challenger Side"
                  player={activeMatch.challenger?.name ?? "Waiting Opponent"}
                  rank={activeMatch.challenger?.rank ?? activeMatch.host.rank}
                  sideLabel={activeMatch.challengerSideLabel}
                  favoriteLabel={favoriteData.rightLabel}
                  share={challengerShare}
                  currentPool={activeMatch.spectatorPool.challenger}
                  currentMultiplier={challengerCurrentMultiplier}
                  projectedPayout={challengerProjection.payout}
                  projectedMultiplier={challengerProjection.multiplier}
                  isSelected={selectedSide === "challenger"}
                  onSelect={() => setSelectedSide("challenger")}
                  disabled={!marketOpen || !activeMatch.challenger}
                  tone="emerald"
                  flash={poolFlash === "challenger"}
                  winRate={activeMatch.challenger?.winRate ?? 0}
                  mmr={activeMatch.challenger?.rating ?? 0}
                  last10={activeMatch.challenger?.last10 ?? "0-0"}
                  probability={challengerProbability}
                />
              </div>
            </div>

            <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_30px_rgba(255,200,80,0.04)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Match Stream</p>
                  <h3 className="mt-2 text-3xl font-black">
                    {activeMatch.host.name} vs {activeMatch.challenger?.name ?? "Waiting Opponent"}
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300">LIVE</div>
                  <Link
                    href={`/arena/match/${activeMatch.id}`}
                    className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
                  >
                    Open Match Room
                  </Link>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/8 bg-[#0d1110] p-6">
                <div className="mx-auto w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-300">
                  {activeMatch.statusText}
                </div>

                <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[24px] border border-white/8 bg-black/25 p-5">
                    <MatchVisual game={activeMatch.game} />
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-[24px] border border-white/8 bg-black/25 p-5">
                      <div className="text-sm uppercase tracking-[0.16em] text-white/45">Host Player</div>
                      <div className="mt-2 text-2xl font-black">{activeMatch.host.name}</div>
                      <div className="mt-1 text-white/60">Side: {activeMatch.hostSideLabel}</div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <RankBadge rank={activeMatch.host.rank} />
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white/[0.03] p-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-white/45">MMR</div>
                          <div className="mt-1 text-lg font-black">{activeMatch.host.rating}</div>
                        </div>
                        <div className="rounded-2xl bg-white/[0.03] p-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-white/45">Win Rate</div>
                          <div className="mt-1 text-lg font-black">{activeMatch.host.winRate}%</div>
                        </div>
                        <div className="rounded-2xl bg-white/[0.03] p-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-white/45">Last 10</div>
                          <div className="mt-1 text-lg font-black">{activeMatch.host.last10}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/8 bg-black/25 p-5">
                      <div className="text-sm uppercase tracking-[0.16em] text-white/45">Challenger Player</div>
                      <div className="mt-2 text-2xl font-black">{activeMatch.challenger?.name ?? "Waiting Opponent"}</div>
                      <div className="mt-1 text-white/60">Side: {activeMatch.challengerSideLabel}</div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {activeMatch.challenger ? <RankBadge rank={activeMatch.challenger.rank} /> : null}
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white/[0.03] p-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-white/45">MMR</div>
                          <div className="mt-1 text-lg font-black">{activeMatch.challenger?.rating ?? 0}</div>
                        </div>
                        <div className="rounded-2xl bg-white/[0.03] p-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-white/45">Win Rate</div>
                          <div className="mt-1 text-lg font-black">{activeMatch.challenger?.winRate ?? 0}%</div>
                        </div>
                        <div className="rounded-2xl bg-white/[0.03] p-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-white/45">Last 10</div>
                          <div className="mt-1 text-lg font-black">{activeMatch.challenger?.last10 ?? "0-0"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 rounded-[24px] border border-white/8 bg-black/25 px-6 py-5 text-center text-lg text-white/80">
                  Live move / state: <span className="font-bold text-amber-300">{activeMatch.moveText}</span>
                </div>
              </div>
            </div>
          </section>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Spectator Market</p>
                <h2 className="mt-2 text-2xl font-black">Bet Slip</h2>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Selected Side</div>
                  <div className="mt-2 text-xl font-black">
                    {selectedSide === "host"
                      ? activeMatch.host.name
                      : selectedSide === "challenger"
                      ? activeMatch.challenger?.name ?? "Waiting Opponent"
                      : "None"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">Bet Amount (KAS)</label>

                  <input
                    type="number"
                    min={MIN_BET}
                    max={MAX_BET}
                    step={1}
                    inputMode="numeric"
                    value={betAmountInput}
                    onChange={(e) => setBetAmountInput(e.target.value)}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-xl font-bold text-white outline-none"
                  />

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[5, 10, 25, 50].map((quickAmount) => (
                      <button
                        key={quickAmount}
                        type="button"
                        onClick={() => setBetAmountInput(String(quickAmount))}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10"
                      >
                        {quickAmount} KAS
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 text-xs text-white/45">
                    Allowed range: {MIN_BET}–{MAX_BET} KAS
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Market Model</div>
                  <div className="mt-3 space-y-2 text-sm text-white/75">
                    <div>• Spectate without betting is always allowed.</div>
                    <div>• One official featured market per game type.</div>
                    <div>• Betting only happens during the pre-match countdown.</div>
                    <div>• Once the countdown ends, the market hard-locks before gameplay.</div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-white/45">Total Pool</div>
                    <div className="mt-2 text-3xl font-black text-amber-300">
                      {totalSpectatorPool.toFixed(0)} KAS
                    </div>
                    <div className="mt-2 text-sm text-white/55">
                      Net after {Math.round(HOUSE_RAKE * 100)}% rake: {netPool.toFixed(2)} KAS
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-white/45">Your Exposure</div>
                    <div className="mt-3 space-y-2 text-sm text-white/75">
                      <div className="flex justify-between gap-3">
                        <span>{activeMatch.host.name}</span>
                        <span className="font-bold text-amber-300">{myHostExposure.toFixed(2)} KAS</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span>{activeMatch.challenger?.name ?? "Waiting Opponent"}</span>
                        <span className="font-bold text-emerald-300">{myChallengerExposure.toFixed(2)} KAS</span>
                      </div>
                      <div className="mt-3 flex justify-between gap-3 border-t border-white/8 pt-3">
                        <span>Total</span>
                        <span className="font-black text-white">{myTotalExposure.toFixed(2)} KAS</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={placeBet}
                  disabled={!marketOpen || !activeMatch.challenger}
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-base font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {marketOpen && activeMatch.challenger ? "Place Spectator Bet" : "Betting Closed"}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <Link
                    href={`/arena/match/${activeMatch.id}`}
                    className="flex w-full items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-base font-black text-emerald-300 transition hover:bg-emerald-400/15"
                  >
                    Spectate
                  </Link>
                  <Link
                    href="/bets"
                    className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base font-black text-white transition hover:bg-white/10"
                  >
                    My Bets
                  </Link>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Bet Slip Status</div>
                  <div className="mt-2 text-sm leading-6 text-white/85">{betMessage}</div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">My Recent Tickets</div>
                  <div className="mt-3 space-y-2 text-sm text-white/75">
                    {recentTickets.length === 0 ? (
                      <div className="rounded-xl bg-white/[0.03] px-3 py-3 text-white/45">
                        No bets placed on this match yet.
                      </div>
                    ) : (
                      recentTickets.map((ticket) => {
                        const player =
                          ticket.side === "host"
                            ? activeMatch.host.name
                            : activeMatch.challenger?.name ?? "Waiting Opponent"

                        return (
                          <div key={ticket.id} className="rounded-xl bg-white/[0.03] px-3 py-3">
                            {ticket.amount.toFixed(0)} KAS on {player}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Live Feed</div>
                  <div className="mt-3 max-h-[260px] space-y-3 overflow-y-auto text-sm text-white/80">
                    {feed.map((item, idx) => (
                      <div key={`${item}-${idx}`} className="rounded-xl bg-white/[0.03] px-3 py-3">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}