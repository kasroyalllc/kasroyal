"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  getArenaBettingSecondsLeft,
  getBetSettlement,
  getCurrentUser,
  getMultiplier,
  getRankColors,
  getUserSettledPayouts,
  isArenaBettable,
  placeArenaSpectatorBet,
  readCurrentUserTickets,
  subscribeSpectatorTickets,
  type ArenaMatch,
  type ArenaSide,
  type BetSettlement,
  type PersistedBetTicket,
  type RankTier,
} from "@/lib/mock/arena-data"
import { getCurrentIdentity } from "@/lib/identity"
import { createClient } from "@/lib/supabase/client"
import { listActiveRooms, listHistoryRooms } from "@/lib/rooms/rooms-service"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"

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

function formatDate(value: number) {
  return new Date(value).toLocaleString()
}

function SummaryCard({
  label,
  value,
  subtext,
  tone = "white",
}: {
  label: string
  value: string
  subtext?: string
  tone?: "white" | "amber" | "emerald" | "sky" | "red"
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : tone === "emerald"
        ? "text-emerald-300"
        : tone === "sky"
          ? "text-sky-300"
          : tone === "red"
            ? "text-red-300"
            : "text-white"

  return (
    <div className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_0_30px_rgba(0,255,200,0.03)]">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className={`mt-3 text-3xl font-black ${toneClass}`}>{value}</div>
      {subtext ? <div className="mt-2 text-sm text-white/50">{subtext}</div> : null}
    </div>
  )
}

function SectionHeader({
  title,
  count,
  subtitle,
}: {
  title: string
  count: number
  subtitle: string
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-black">{title}</h2>
        <p className="mt-1 text-sm text-white/50">{subtitle}</p>
      </div>
      <div className="text-sm font-bold text-white/50">{count} item(s)</div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 text-white/45">
      {text}
    </div>
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

function OpenMarketCard({
  match,
  onBetPlaced,
}: {
  match: ArenaMatch
  onBetPlaced: () => void
}) {
  const [selectedSide, setSelectedSide] = useState<ArenaSide | null>(null)
  const [betAmountInput, setBetAmountInput] = useState("5")
  const [message, setMessage] = useState(
    "Pick a side and place a bet before the market locks."
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const bettingSecondsLeft = getArenaBettingSecondsLeft(match)
  const hostPool = match.spectatorPool.host
  const challengerPool = match.spectatorPool.challenger
  const totalPool = hostPool + challengerPool
  const marketOpen = isArenaBettable(match)
  const betAmount = Math.max(1, Math.floor(Number(betAmountInput) || 0))
  const hostMultiplier = getMultiplier(hostPool, challengerPool, "host")
  const challengerMultiplier = getMultiplier(hostPool, challengerPool, "challenger")
  const isOwnGame =
    (match.hostIdentityId && match.hostIdentityId === getCurrentIdentity().id.toLowerCase()) ||
      (match.challengerIdentityId && match.challengerIdentityId === getCurrentIdentity().id.toLowerCase()) ||
      match.host.name === getCurrentUser().name ||
      match.challenger?.name === getCurrentUser().name

  async function submitBet() {
    if (!marketOpen) {
      setMessage("Betting is closed for this match.")
      return
    }

    if (isOwnGame) {
      setMessage("You cannot bet on your own match.")
      return
    }

    if (!selectedSide) {
      setMessage("Select a side first.")
      return
    }

    if (!Number.isFinite(Number(betAmountInput)) || betAmount <= 0) {
      setMessage("Enter a valid bet amount.")
      return
    }

    if (betAmount > getCurrentUser().walletBalance) {
      setMessage("Insufficient KAS balance.")
      return
    }

    try {
      setIsSubmitting(true)
      await placeArenaSpectatorBet({
        matchId: match.id,
        side: selectedSide,
        amount: betAmount,
        user: getCurrentIdentity().id,
        walletAddress: getCurrentIdentity().id,
      })

      const backed =
        selectedSide === "host" ? match.host.name : match.challenger?.name ?? "Challenger"

      setMessage(
        `Bet placed: ${betAmount} KAS on ${backed}. You can track pending and settled status below in My Bets.`
      )
      setBetAmountInput("5")
      setSelectedSide(null)
      onBetPlaced()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to place bet.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_0_40px_rgba(0,255,200,0.03)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone="gold">{match.game}</TonePill>
            <TonePill tone={marketOpen ? "green" : "red"}>
              {marketOpen ? `Open • ${bettingSecondsLeft}s left` : "Closed"}
            </TonePill>
            {isOwnGame ? <TonePill tone="red">Your Match • No Self-Betting</TonePill> : null}
          </div>

          <h3 className="mt-4 text-2xl font-black">
            {match.host.name} vs {match.challenger?.name ?? "Waiting Opponent"}
          </h3>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RankBadge rank={match.host.rank} />
            {match.challenger ? <RankBadge rank={match.challenger.rank} /> : null}
          </div>

          <div className="mt-5 grid gap-3 text-sm text-white/60 sm:grid-cols-2 xl:grid-cols-4">
            <div>Player pot: {match.playerPot.toFixed(2)} KAS</div>
            <div>Total spectator pool: {totalPool.toFixed(2)} KAS</div>
            <div>Spectators: {match.spectators}</div>
            <div>Status: {match.statusText}</div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setSelectedSide("host")}
              disabled={!marketOpen || isOwnGame}
              className={`rounded-3xl border p-5 text-left transition ${
                selectedSide === "host"
                  ? "border-amber-300/30 bg-amber-300/10"
                  : "border-white/10 bg-black/20 hover:bg-white/5"
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white/50">Back Host</div>
                  <div className="mt-1 text-xl font-semibold text-white">{match.host.name}</div>
                </div>
                <RankBadge rank={match.host.rank} />
              </div>

              <div className="mt-3 text-sm text-white/65">
                {match.hostSideLabel} • {match.host.rating} MMR • {match.host.winRate}% WR
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Pool</div>
                  <div className="mt-1 font-semibold text-white">{hostPool.toFixed(2)} KAS</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                    Multiplier
                  </div>
                  <div className="mt-1 font-semibold text-white">{hostMultiplier.toFixed(2)}x</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSide("challenger")}
              disabled={!marketOpen || isOwnGame || !match.challenger}
              className={`rounded-3xl border p-5 text-left transition ${
                selectedSide === "challenger"
                  ? "border-emerald-300/30 bg-emerald-400/10"
                  : "border-white/10 bg-black/20 hover:bg-white/5"
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white/50">Back Challenger</div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    {match.challenger?.name ?? "Waiting Opponent"}
                  </div>
                </div>
                {match.challenger ? <RankBadge rank={match.challenger.rank} /> : null}
              </div>

              <div className="mt-3 text-sm text-white/65">
                {match.challengerSideLabel} • {match.challenger?.rating ?? 0} MMR •{" "}
                {match.challenger?.winRate ?? 0}% WR
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Pool</div>
                  <div className="mt-1 font-semibold text-white">
                    {challengerPool.toFixed(2)} KAS
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                    Multiplier
                  </div>
                  <div className="mt-1 font-semibold text-white">
                    {challengerMultiplier.toFixed(2)}x
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="xl:w-[340px]">
          <div className="rounded-3xl border border-white/8 bg-black/25 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
              Bet Slip
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                Selected Side
              </div>
              <div className="mt-2 text-lg font-black">
                {selectedSide === "host"
                  ? match.host.name
                  : selectedSide === "challenger"
                    ? match.challenger?.name ?? "Waiting Opponent"
                    : "None"}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm text-white/60">Bet Amount (KAS)</label>
              <input
                value={betAmountInput}
                onChange={(event) => setBetAmountInput(event.target.value)}
                inputMode="numeric"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-300/30"
                placeholder="5"
              />
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {[5, 10, 25, 50].map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => setBetAmountInput(String(quick))}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10"
                >
                  {quick}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={submitBet}
              disabled={isSubmitting || !marketOpen || !selectedSide || isOwnGame}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Placing..." : "Place Bet"}
            </button>

            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-white/85">
              {message}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/arena/match/${match.id}`}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Watch Room
              </Link>
              <Link
                href="/spectate"
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
              >
                Spectate
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MyBetCard({ item }: { item: BetSettlement }) {
  const { ticket, match, state, payout, profit, multiplier, resultLabel, backedPlayerName } = item

  const statusTone =
    state === "won"
      ? "green"
      : state === "lost"
        ? "red"
        : state === "refunded"
          ? "sky"
          : state === "pending"
            ? "gold"
            : "neutral"

  const statusLabel =
    state === "won"
      ? "Won"
      : state === "lost"
        ? "Lost"
        : state === "refunded"
          ? "Refunded"
          : state === "pending"
            ? "Pending"
            : "Archived"

  return (
    <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_0_40px_rgba(0,255,200,0.03)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone="gold">{ticket.game}</TonePill>
            <TonePill tone={statusTone}>{statusLabel}</TonePill>
            <TonePill tone="sky">Backed {backedPlayerName}</TonePill>
            <TonePill tone="neutral">{resultLabel}</TonePill>
          </div>

          <h3 className="mt-4 text-2xl font-black">
            {match
              ? `${match.host.name} vs ${match.challenger?.name ?? "Waiting Opponent"}`
              : ticket.matchId}
          </h3>

          <div className="mt-5 grid gap-3 text-sm text-white/60 sm:grid-cols-2 xl:grid-cols-6">
            <div>Placed: {formatDate(ticket.createdAt)}</div>
            <div>Stake: {ticket.amount.toFixed(2)} KAS</div>
            <div>Multiplier: {multiplier > 0 ? `${multiplier.toFixed(2)}x` : "--"}</div>
            <div>Payout: {payout.toFixed(2)} KAS</div>
            <div>Profit: {profit >= 0 ? `+${profit.toFixed(2)}` : profit.toFixed(2)} KAS</div>
            <div>Status: {statusLabel}</div>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[250px]">
          {match ? (
            <>
              <Link
                href={`/arena/match/${match.id}`}
                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-center text-sm font-black text-black transition hover:scale-[1.01]"
              >
                Watch Match
              </Link>

              {match.status === "Live" || match.status === "Ready to Start" ? (
                <Link
                  href="/spectate"
                  className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-center text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
                >
                  Open Spectate
                </Link>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              Match no longer found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BetsPage() {
  const [matches, setMatches] = useState<ArenaMatch[]>([])
  const [bets, setBets] = useState<PersistedBetTicket[]>([])
  const [, setTick] = useState(0)

  const refreshMatches = useCallback(async () => {
    if (typeof window === "undefined") return
    const supabase = createClient()
    const [active, history] = await Promise.all([
      listActiveRooms(supabase),
      listHistoryRooms(supabase),
    ])
    const arenaMatches = [...active, ...history].map(roomToArenaMatch)
    setMatches(arenaMatches)
  }, [])

  useEffect(() => {
    const syncBets = () => setBets(readCurrentUserTickets(getCurrentIdentity().id))
    syncBets()
    const unsubscribeBets = subscribeSpectatorTickets(syncBets)
    return () => unsubscribeBets()
  }, [])

  useEffect(() => {
    refreshMatches()
    const supabase = createClient()
    const channel = supabase
      .channel("bets-matches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => { void refreshMatches() }
      )
      .subscribe()
    const poll = window.setInterval(() => { void refreshMatches() }, 3000)
    return () => {
      supabase.removeChannel(channel)
      window.clearInterval(poll)
    }
  }, [refreshMatches])

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      setBets(readCurrentUserTickets(getCurrentIdentity().id))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const openMarkets = useMemo(() => {
    return matches
      .filter((match) => isArenaBettable(match))
      .filter(
        (match) =>
          !(
            (match.hostIdentityId &&
              match.hostIdentityId.toLowerCase() === getCurrentIdentity().id.toLowerCase()) ||
            (match.challengerIdentityId &&
              match.challengerIdentityId.toLowerCase() === getCurrentIdentity().id.toLowerCase()) ||
            match.host.name === getCurrentUser().name ||
            match.challenger?.name === getCurrentUser().name
          )
      )
      .sort((a, b) => {
        const aSeconds = getArenaBettingSecondsLeft(a)
        const bSeconds = getArenaBettingSecondsLeft(b)
        if (aSeconds !== bSeconds) return aSeconds - bSeconds

        const aPool = a.spectatorPool.host + a.spectatorPool.challenger
        const bPool = b.spectatorPool.host + b.spectatorPool.challenger
        return bPool - aPool
      })
  }, [matches])

  const myBetRecords = useMemo<BetSettlement[]>(() => {
    return bets
      .map((bet) => {
        const match = matches.find((item) => item.id === bet.matchId) ?? null
        return getBetSettlement(bet, match)
      })
      .sort((a, b) => b.ticket.createdAt - a.ticket.createdAt)
  }, [bets, matches])

  const pendingMyBets = myBetRecords.filter((item) => item.state === "pending")
  const settledMyBets = myBetRecords.filter((item) => item.state !== "pending")

  const totalOpenPools = openMarkets.reduce(
    (sum, match) => sum + match.spectatorPool.host + match.spectatorPool.challenger,
    0
  )

  const totalMyExposure = bets.reduce((sum, bet) => sum + bet.amount, 0)
  const totalPendingExposure = pendingMyBets.reduce((sum, item) => sum + item.ticket.amount, 0)
  const totalProjectedPending = pendingMyBets.reduce((sum, item) => {
    if (!item.match) return sum
    return sum + item.ticket.amount * item.multiplier
  }, 0)

  const settledSummary = useMemo(() => getUserSettledPayouts(getCurrentIdentity().id), [bets, matches])

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.07),transparent_24%)]" />
      <div className="absolute left-[-80px] top-24 h-[320px] w-[320px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="absolute right-[-80px] top-32 h-[320px] w-[320px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1550px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-8 flex flex-col gap-6 rounded-[34px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_50px_rgba(0,255,200,0.05)] lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              KasRoyal Betting Center
            </div>

            <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">
              Bets
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
              Open markets go live here during the pre-match countdown. Once betting closes, your positions move into pending tracking and then settle into win, loss, or refund once the match resolves.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/arena"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Arena Lobby
            </Link>
            <Link
              href="/spectate"
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
            >
              Spectate Live Matches
            </Link>
          </div>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label="Open Markets"
            value={`${openMarkets.length}`}
            subtext="Currently accepting bets"
            tone="emerald"
          />
          <SummaryCard
            label="Open Pool Volume"
            value={`${totalOpenPools.toFixed(2)} KAS`}
            subtext="Across bettable matches"
            tone="amber"
          />
          <SummaryCard
            label="Total Exposure"
            value={`${totalMyExposure.toFixed(2)} KAS`}
            subtext="All bets you've placed"
            tone="sky"
          />
          <SummaryCard
            label="Pending Exposure"
            value={`${totalPendingExposure.toFixed(2)} KAS`}
            subtext={`Pending projected: ${totalProjectedPending.toFixed(2)} KAS`}
            tone="white"
          />
          <SummaryCard
            label="Settled Profit"
            value={`${settledSummary.totalProfit >= 0 ? "+" : ""}${settledSummary.totalProfit.toFixed(2)} KAS`}
            subtext={`Settled payout: ${settledSummary.totalPayout.toFixed(2)} KAS • W:${settledSummary.wonCount} L:${settledSummary.lostCount} R:${settledSummary.refundedCount}`}
            tone={settledSummary.totalProfit >= 0 ? "emerald" : "red"}
          />
        </div>

        <div className="space-y-10">
          <section>
            <SectionHeader
              title="Open Markets"
              count={openMarkets.length}
              subtitle="Only countdown-stage rooms with betting still open appear here."
            />
            <div className="space-y-4">
              {openMarkets.length === 0 ? (
                <EmptyState text="No open betting markets right now. Once a room enters the countdown window, it will appear here." />
              ) : (
                openMarkets.map((match) => (
                  <OpenMarketCard
                    key={match.id}
                    match={match}
                    onBetPlaced={() => {
                      void refreshMatches()
                      setBets(readCurrentUserTickets(getCurrentIdentity().id))
                    }}
                  />
                ))
              )}
            </div>
          </section>

          <section>
            <SectionHeader
              title="My Pending Bets"
              count={pendingMyBets.length}
              subtitle="These positions are still waiting for the match to finish."
            />
            <div className="space-y-4">
              {pendingMyBets.length === 0 ? (
                <EmptyState text="You do not have any pending bets right now." />
              ) : (
                pendingMyBets.map((item) => <MyBetCard key={item.ticket.id} item={item} />)
              )}
            </div>
          </section>

          <section>
            <SectionHeader
              title="Settled Bets"
              count={settledMyBets.length}
              subtitle="Resolved positions with final payout, refund, or loss shown."
            />
            <div className="space-y-4">
              {settledMyBets.length === 0 ? (
                <EmptyState text="No settled bets yet." />
              ) : (
                settledMyBets.map((item) => <MyBetCard key={item.ticket.id} item={item} />)
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}