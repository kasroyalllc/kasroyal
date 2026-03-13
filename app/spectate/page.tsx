"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  arenaFeedSeed,
  clampBetAmount,
  DEFAULT_BET,
  gameDisplayOrder,
  gameMeta,
  getArenaBettingSecondsLeft,
  getCurrentUser,
  getMatchResultLabel,
  getMultiplier,
  getRankColors,
  getSideShare,
  isArenaBettable,
  isArenaSpectatable,
  placeArenaSpectatorBet,
  readArenaMatches,
  subscribeArenaMatches,
  type ArenaMatch,
  type ArenaSide,
  type GameType,
  type RankTier,
} from "@/lib/mock/arena-data"
import { getCurrentIdentity } from "@/lib/identity"

type SpectateFilter = "All" | GameType

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
  children: ReactNode
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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}
    >
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
    <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 p-6">
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/55">{text}</div>
    </div>
  )
}

function getMatchPhaseTone(match: ArenaMatch) {
  if (match.status === "Ready to Start") return "gold" as const
  if (match.status === "Live") return "green" as const
  if (match.status === "Finished") return "sky" as const
  return "neutral" as const
}

function getMatchPhaseLabel(match: ArenaMatch) {
  if (match.status === "Ready to Start") {
    const seconds = getArenaBettingSecondsLeft(match)
    return seconds > 0 ? `Starting Soon • ${seconds}s` : "Starting Soon"
  }

  if (match.status === "Live") return "Live Match"
  if (match.status === "Finished") return getMatchResultLabel(match)
  return match.status
}

function LiveMatchCard({
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
  const bettingOpen = isArenaBettable(match)

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

        <div className="flex flex-col items-end gap-2">
          <TonePill tone={getMatchPhaseTone(match)}>{getMatchPhaseLabel(match)}</TonePill>
          <TonePill tone={bettingOpen ? "gold" : "neutral"}>
            {bettingOpen ? "Betting Open" : "Betting Closed"}
          </TonePill>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Status</div>
          <div className="mt-1 font-semibold text-white">{match.statusText}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Player Pot</div>
          <div className="mt-1 font-semibold text-white">{match.playerPot.toFixed(0)} KAS</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Spectator Pool</div>
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

export default function SpectatePage() {
  const [allMatches, setAllMatches] = useState<ArenaMatch[]>([])
  const [selectedFilter, setSelectedFilter] = useState<SpectateFilter>("All")
  const [activeLiveMatchId, setActiveLiveMatchId] = useState("")
  const [feed] = useState<string[]>(arenaFeedSeed)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<string[]>([
    "StakeLord: This one is heating up fast.",
    "FlashMove: Center control looks huge here.",
    "KasWatcher: Crowd is leaning toward the favorite.",
  ])
  const [betAmountInput, setBetAmountInput] = useState(String(DEFAULT_BET))
  const [selectedSide, setSelectedSide] = useState<ArenaSide | null>(null)
  const [message, setMessage] = useState(
    "Select a live room to watch and place spectator bets when betting is open."
  )
  const [, setTick] = useState(0)

  useEffect(() => {
    const syncMatches = () => {
      setAllMatches(readArenaMatches())
    }

    syncMatches()
    const unsubscribeMatches = subscribeArenaMatches(syncMatches)

    return () => {
      unsubscribeMatches()
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      setAllMatches(readArenaMatches())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const filteredMatches = useMemo(() => {
    const spectatable = allMatches.filter((match) => isArenaSpectatable(match))
    if (selectedFilter === "All") return spectatable
    return spectatable.filter((match) => match.game === selectedFilter)
  }, [allMatches, selectedFilter])

  const liveMatches = useMemo(() => {
    return filteredMatches
      .filter(
        (match) =>
          isArenaSpectatable(match) &&
          (match.status === "Ready to Start" || match.status === "Live")
      )
      .sort((a, b) => {
        const aPriority = a.status === "Ready to Start" ? 2 : a.status === "Live" ? 1 : 0
        const bPriority = b.status === "Ready to Start" ? 2 : b.status === "Live" ? 1 : 0

        if (bPriority !== aPriority) return bPriority - aPriority

        const aPool = a.spectatorPool.host + a.spectatorPool.challenger
        const bPool = b.spectatorPool.host + b.spectatorPool.challenger

        if (bPool !== aPool) return bPool - aPool
        if (b.spectators !== a.spectators) return b.spectators - a.spectators
        return b.createdAt - a.createdAt
      })
  }, [filteredMatches])

  useEffect(() => {
    setActiveLiveMatchId((current) => {
      if (current && liveMatches.some((match) => match.id === current)) return current
      return liveMatches[0]?.id ?? ""
    })
  }, [liveMatches])

  useEffect(() => {
    setSelectedSide(null)
    setBetAmountInput(String(DEFAULT_BET))
  }, [activeLiveMatchId])

  const activeLiveMatch = useMemo(() => {
    return liveMatches.find((match) => match.id === activeLiveMatchId) ?? liveMatches[0] ?? null
  }, [liveMatches, activeLiveMatchId])

  const totalLivePools = liveMatches.reduce(
    (sum, match) => sum + match.spectatorPool.host + match.spectatorPool.challenger,
    0
  )

  const totalLiveViewers = liveMatches.reduce((sum, match) => sum + match.spectators, 0)

  const betAmount = clampBetAmount(Number(betAmountInput))
  const activeTotalPool = activeLiveMatch
    ? activeLiveMatch.spectatorPool.host + activeLiveMatch.spectatorPool.challenger
    : 0

  const hostShare = activeLiveMatch
    ? getSideShare(
        activeLiveMatch.spectatorPool.host,
        activeLiveMatch.spectatorPool.challenger,
        "host"
      )
    : 0

  const challengerShare = activeLiveMatch
    ? getSideShare(
        activeLiveMatch.spectatorPool.host,
        activeLiveMatch.spectatorPool.challenger,
        "challenger"
      )
    : 0

  const hostMultiplier = activeLiveMatch
    ? getMultiplier(
        activeLiveMatch.spectatorPool.host,
        activeLiveMatch.spectatorPool.challenger,
        "host"
      )
    : 0

  const challengerMultiplier = activeLiveMatch
    ? getMultiplier(
        activeLiveMatch.spectatorPool.host,
        activeLiveMatch.spectatorPool.challenger,
        "challenger"
      )
    : 0

  const isSelectedMatchBettable = activeLiveMatch ? isArenaBettable(activeLiveMatch) : false
  const isCurrentUserPlayerInSelectedMatch = activeLiveMatch
    ? getCurrentUser().name === activeLiveMatch.host.name ||
      getCurrentUser().name === activeLiveMatch.challenger?.name
    : false

  function sendChatMessage() {
    const trimmed = chatInput.trim()
    if (!trimmed) return

    setChatMessages((prev) => [`${getCurrentUser().name}: ${trimmed}`, ...prev].slice(0, 24))
    setChatInput("")
  }

  async function handlePlaceBet() {
    if (!activeLiveMatch) {
      setMessage("No live match selected.")
      return
    }

    if (isCurrentUserPlayerInSelectedMatch) {
      setMessage("You cannot bet on your own match.")
      return
    }

    if (!isSelectedMatchBettable) {
      setMessage("Betting is closed for this match.")
      return
    }

    if (!selectedSide) {
      setMessage("Select a side before placing a bet.")
      return
    }

    if (betAmount > getCurrentUser().walletBalance) {
      setMessage("Insufficient KAS balance for that spectator bet.")
      return
    }

    try {
      await placeArenaSpectatorBet({
        matchId: activeLiveMatch.id,
        side: selectedSide,
        amount: betAmount,
        user: getCurrentIdentity().id,
        walletAddress: getCurrentIdentity().id,
      })

      setAllMatches(readArenaMatches())

      const sideName =
        selectedSide === "host"
          ? activeLiveMatch.host.name
          : activeLiveMatch.challenger?.name ?? "Opponent"

      setMessage(`Placed ${betAmount} KAS on ${sideName}.`)
      setBetAmountInput(String(DEFAULT_BET))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to place spectator bet.")
    }
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
                KasRoyal Live Watch Floor
              </div>
              <h1 className="mt-2 text-4xl font-semibold">Spectate</h1>
              <p className="mt-3 max-w-3xl text-white/65">
                Live and pre-start watch floor. Spectators can track momentum, pools, and active rooms in one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/bets"
                className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-300 hover:bg-amber-300/15"
              >
                Open Markets
              </Link>
              <Link
                href="/arena"
                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-4 py-3 text-sm font-semibold text-black"
              >
                Arena Lobby
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <HeaderStat label="Tracked Matches" value={`${liveMatches.length}`} tone="green" />
            <HeaderStat label="Live Viewers" value={`${totalLiveViewers}`} tone="white" />
            <HeaderStat
              label="Pool Volume"
              value={`${totalLivePools.toFixed(0)} KAS`}
              tone="gold"
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
            <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                    Watch Floor
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">Tracked Rooms</h2>
                  <p className="mt-2 text-white/60">
                    Live matches and countdown rooms with active markets are surfaced here.
                  </p>
                </div>

                {activeLiveMatch ? (
                  <Link
                    href={`/arena/match/${activeLiveMatch.id}`}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Open Selected
                  </Link>
                ) : null}
              </div>

              {liveMatches.length ? (
                <div className="mt-6 grid gap-4">
                  {liveMatches.map((match) => (
                    <LiveMatchCard
                      key={match.id}
                      match={match}
                      active={match.id === activeLiveMatch?.id}
                      onSelect={() => setActiveLiveMatchId(match.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptySection
                    title="No tracked rooms yet"
                    text="Once countdown or live rooms are active, they will show here automatically."
                  />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-sky-400/15 bg-sky-400/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-sky-300">
                    Live Watch Panel
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">
                    {activeLiveMatch ? activeLiveMatch.game : "No Match Selected"}
                  </h2>
                  <p className="mt-2 text-white/60">
                    Watch the room, check live pools, and place spectator bets if the market is open.
                  </p>
                </div>

                {activeLiveMatch ? (
                  <TonePill tone={getMatchPhaseTone(activeLiveMatch)}>
                    {getMatchPhaseLabel(activeLiveMatch)}
                  </TonePill>
                ) : (
                  <TonePill tone="neutral">Idle</TonePill>
                )}
              </div>

              {activeLiveMatch ? (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <HeaderStat
                      label="Spectator Pool"
                      value={`${activeTotalPool.toFixed(0)} KAS`}
                      tone="gold"
                    />
                    <HeaderStat
                      label="Viewers"
                      value={`${activeLiveMatch.spectators}`}
                      tone="white"
                    />
                    <HeaderStat
                      label="Host Side"
                      value={activeLiveMatch.hostSideLabel}
                      tone="sky"
                    />
                    <HeaderStat
                      label="Challenger Side"
                      value={activeLiveMatch.challengerSideLabel}
                      tone="green"
                    />
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <TonePill tone="gold">{activeLiveMatch.game}</TonePill>
                      <TonePill tone={getMatchPhaseTone(activeLiveMatch)}>
                        {getMatchPhaseLabel(activeLiveMatch)}
                      </TonePill>
                      <TonePill tone="sky">{activeLiveMatch.statusText}</TonePill>
                    </div>

                    <h3 className="mt-4 text-2xl font-black">
                      {activeLiveMatch.host.name} vs{" "}
                      {activeLiveMatch.challenger?.name ?? "Waiting Opponent"}
                    </h3>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <RankBadge rank={activeLiveMatch.host.rank} />
                      {activeLiveMatch.challenger ? (
                        <RankBadge rank={activeLiveMatch.challenger.rank} />
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-3 text-sm text-white/60 sm:grid-cols-2">
                      <div>Move text: {activeLiveMatch.moveText}</div>
                      <div>Player pot: {activeLiveMatch.playerPot.toFixed(2)} KAS</div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href={`/arena/match/${activeLiveMatch.id}`}
                        className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01]"
                      >
                        Watch Full Match
                      </Link>

                      <Link
                        href="/bets"
                        className="inline-flex items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
                      >
                        View Open Markets
                      </Link>
                    </div>
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm uppercase tracking-[0.3em] text-amber-300">
                          Spectator Bet Slip
                        </div>
                        <h3 className="mt-2 text-2xl font-black">Back a Side</h3>
                      </div>

                      <TonePill tone={isSelectedMatchBettable ? "green" : "neutral"}>
                        {isSelectedMatchBettable ? "Betting Open" : "Betting Closed"}
                      </TonePill>
                    </div>

                    {isCurrentUserPlayerInSelectedMatch ? (
                      <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
                        You cannot bet on your own match.
                      </div>
                    ) : null}

                    <div className="mt-5 grid gap-5 xl:grid-cols-2">
                      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm uppercase tracking-[0.16em] text-white/45">
                              Back Host
                            </div>
                            <div className="mt-2 text-2xl font-black">{activeLiveMatch.host.name}</div>
                            <div className="mt-2 text-sm text-white/55">
                              Side: {activeLiveMatch.hostSideLabel}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedSide("host")}
                            disabled={!isSelectedMatchBettable || isCurrentUserPlayerInSelectedMatch}
                            className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                              selectedSide === "host"
                                ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black"
                                : "border border-white/10 bg-white/5 text-white"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            Back Host
                          </button>
                        </div>

                        <div className="mt-5">
                          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/45">
                            <span>Market Share</span>
                            <span>{hostShare.toFixed(1)}%</span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300"
                              style={{ width: `${hostShare}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                              Pool
                            </div>
                            <div className="mt-2 text-2xl font-black text-amber-300">
                              {activeLiveMatch.spectatorPool.host.toFixed(0)} KAS
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                              Multiplier
                            </div>
                            <div className="mt-2 text-2xl font-black">
                              {hostMultiplier > 0 ? `${hostMultiplier.toFixed(2)}x` : "0.00x"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm uppercase tracking-[0.16em] text-white/45">
                              Back Challenger
                            </div>
                            <div className="mt-2 text-2xl font-black">
                              {activeLiveMatch.challenger?.name ?? "Waiting Opponent"}
                            </div>
                            <div className="mt-2 text-sm text-white/55">
                              Side: {activeLiveMatch.challengerSideLabel}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedSide("challenger")}
                            disabled={
                              !isSelectedMatchBettable ||
                              isCurrentUserPlayerInSelectedMatch ||
                              !activeLiveMatch.challenger
                            }
                            className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                              selectedSide === "challenger"
                                ? "bg-gradient-to-r from-emerald-300 to-emerald-500 text-black"
                                : "border border-white/10 bg-white/5 text-white"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            Back Challenger
                          </button>
                        </div>

                        <div className="mt-5">
                          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/45">
                            <span>Market Share</span>
                            <span>{challengerShare.toFixed(1)}%</span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500"
                              style={{ width: `${challengerShare}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                              Pool
                            </div>
                            <div className="mt-2 text-2xl font-black text-emerald-300">
                              {activeLiveMatch.spectatorPool.challenger.toFixed(0)} KAS
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                              Multiplier
                            </div>
                            <div className="mt-2 text-2xl font-black">
                              {challengerMultiplier > 0
                                ? `${challengerMultiplier.toFixed(2)}x`
                                : "0.00x"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        inputMode="numeric"
                        value={betAmountInput}
                        onChange={(event) => setBetAmountInput(event.target.value)}
                        disabled={!isSelectedMatchBettable || isCurrentUserPlayerInSelectedMatch}
                        placeholder="Bet amount (KAS)"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setBetAmountInput(String(5))}
                        disabled={!isSelectedMatchBettable || isCurrentUserPlayerInSelectedMatch}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        5 KAS
                      </button>
                      <button
                        type="button"
                        onClick={handlePlaceBet}
                        disabled={
                          !isSelectedMatchBettable ||
                          isCurrentUserPlayerInSelectedMatch ||
                          !selectedSide
                        }
                        className="rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Place Bet
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-white/85">
                      {message}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-6">
                  <EmptySection
                    title="No room selected"
                    text="Choose a tracked room once matches are active."
                  />
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-amber-300">
                    Spectator Chat
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">Crowd Talk</h2>
                  <p className="mt-2 text-white/60">
                    Lightweight placeholder chat for now while spectating.
                  </p>
                </div>

                <TonePill tone="gold">Spectators Only</TonePill>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="mb-4 text-sm text-white/50">
                  Connected as <span className="font-semibold text-white">{getCurrentUser().name}</span>
                </div>

                <div className="max-h-[320px] space-y-3 overflow-y-auto">
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message}-${index}`}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85"
                    >
                      {message}
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Say something about the match..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-300/30"
                  />
                  <button
                    type="button"
                    onClick={sendChatMessage}
                    className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-3 text-sm font-black text-black transition hover:scale-[1.01]"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}