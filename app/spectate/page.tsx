"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  arenaFeedSeed,
  currentUser,
  gameDisplayOrder,
  gameMeta,
  getRankColors,
  readArenaMatches,
  subscribeArenaMatches,
  type ArenaMatch,
  type GameType,
  type RankTier,
} from "@/lib/mock/arena-data"

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
    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/55">{text}</div>
    </div>
  )
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

        <TonePill tone="green">Live</TonePill>
      </div>

      <div className="mt-4 text-sm text-white/65">{meta.subtitle}</div>

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

export default function SpectatePage() {
  const [allMatches, setAllMatches] = useState<ArenaMatch[]>([])
  const [selectedFilter, setSelectedFilter] = useState<SpectateFilter>("All")
  const [activeLiveMatchId, setActiveLiveMatchId] = useState("")
  const [feed, setFeed] = useState<string[]>(arenaFeedSeed)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<string[]>([
    "StakeLord: This one is heating up fast.",
    "FlashMove: Center control looks huge here.",
    "KasWatcher: Crowd is leaning toward the favorite.",
  ])
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
    if (selectedFilter === "All") return allMatches
    return allMatches.filter((match) => match.game === selectedFilter)
  }, [allMatches, selectedFilter])

  const liveMatches = useMemo(() => {
    return filteredMatches
      .filter((match) => match.status === "Live")
      .sort((a, b) => {
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

  const activeLiveMatch = useMemo(() => {
    return liveMatches.find((match) => match.id === activeLiveMatchId) ?? liveMatches[0] ?? null
  }, [liveMatches, activeLiveMatchId])

  const totalLivePools = liveMatches.reduce(
    (sum, match) => sum + match.spectatorPool.host + match.spectatorPool.challenger,
    0
  )

  const totalLiveViewers = liveMatches.reduce((sum, match) => sum + match.spectators, 0)

  const featuredLiveGames = liveMatches.filter((match) => match.isFeaturedMarket).length

  const activePool = activeLiveMatch
    ? activeLiveMatch.spectatorPool.host + activeLiveMatch.spectatorPool.challenger
    : 0

  function sendChatMessage() {
    const trimmed = chatInput.trim()
    if (!trimmed) return

    setChatMessages((prev) => [`${currentUser.name}: ${trimmed}`, ...prev].slice(0, 24))
    setChatInput("")
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
                Spectate is now live-match only. Betting discovery lives in Bets, while this page
                is focused on watching active rooms and letting spectators talk during the action.
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

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeaderStat label="Live Matches" value={`${liveMatches.length}`} tone="green" />
            <HeaderStat label="Live Viewers" value={`${totalLiveViewers}`} tone="white" />
            <HeaderStat label="Live Pool Volume" value={`${totalLivePools.toFixed(0)} KAS`} tone="gold" />
            <HeaderStat label="Featured Live" value={`${featuredLiveGames}`} tone="sky" />
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
                    Live Matches
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold">Watch Active Rooms</h2>
                  <p className="mt-2 text-white/60">
                    Only rooms that are already live show up here. Countdown-stage matches live in
                    Bets until the market locks.
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
                    title="No live matches yet"
                    text="Once countdowns finish and matches go live, they will appear here automatically."
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
                    {activeLiveMatch ? activeLiveMatch.game : "No Live Match Selected"}
                  </h2>
                  <p className="mt-2 text-white/60">
                    Watch the room, follow the crowd, and jump straight into the active match page.
                  </p>
                </div>

                {activeLiveMatch ? (
                  <TonePill tone="green">Live Now</TonePill>
                ) : (
                  <TonePill tone="neutral">Idle</TonePill>
                )}
              </div>

              {activeLiveMatch ? (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <HeaderStat label="Match Pool" value={`${activePool.toFixed(0)} KAS`} tone="gold" />
                    <HeaderStat label="Viewers" value={`${activeLiveMatch.spectators}`} tone="white" />
                    <HeaderStat label="Host Side" value={activeLiveMatch.hostSideLabel} tone="sky" />
                    <HeaderStat
                      label="Challenger Side"
                      value={activeLiveMatch.challengerSideLabel}
                      tone="green"
                    />
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <TonePill tone="gold">{activeLiveMatch.game}</TonePill>
                      <TonePill tone="green">Live Match</TonePill>
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
                </>
              ) : (
                <div className="mt-6">
                  <EmptySection
                    title="No live room selected"
                    text="Pick a live room from the left once matches go live."
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
                    Spectators can talk while watching. Contestants should stay focused on the match.
                  </p>
                </div>

                <TonePill tone="gold">Spectators Only</TonePill>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="mb-4 text-sm text-white/50">
                  Connected as <span className="font-semibold text-white">{currentUser.name}</span>
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

                <div className="mt-3 text-xs text-white/40">
                  Lightweight spectator chat placeholder for now. Next step can be real-time room chat.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}