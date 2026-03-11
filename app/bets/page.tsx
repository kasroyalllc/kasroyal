"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  currentUser,
  getMultiplier,
  getRankColors,
  getTicketExposureByMatch,
  readArenaMatches,
  readCurrentUserTickets,
  subscribeArenaMatches,
  subscribeSpectatorTickets,
  type ArenaMatch,
  type PersistedBetTicket,
  type RankTier,
} from "@/lib/mock/arena-data"

type TicketWithMatch = {
  ticket: PersistedBetTicket
  match: ArenaMatch | null
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

function formatDate(value: number) {
  return new Date(value).toLocaleString()
}

function getTicketStatus(match: ArenaMatch | null) {
  if (!match) return "Archived"
  if (match.status === "Waiting for Opponent") return "Open Room"
  if (match.status === "Ready to Start") return "Pre-Match"
  if (match.status === "Live") return "Live"
  if (match.status === "Finished") return "Finished"
  return "Unknown"
}

function getStatusTone(match: ArenaMatch | null) {
  if (!match) return "text-white/70 border-white/10 bg-white/5"
  if (match.status === "Live") return "text-emerald-300 border-emerald-300/20 bg-emerald-400/10"
  if (match.status === "Ready to Start") return "text-amber-300 border-amber-300/20 bg-amber-300/10"
  if (match.status === "Waiting for Opponent") return "text-sky-300 border-sky-300/20 bg-sky-300/10"
  if (match.status === "Finished") return "text-white/75 border-white/10 bg-white/5"
  return "text-white/75 border-white/10 bg-white/5"
}

function getTicketPlayer(ticket: PersistedBetTicket, match: ArenaMatch | null) {
  if (!match) return ticket.side === "host" ? "Host" : "Challenger"
  return ticket.side === "host" ? match.host.name : match.challenger?.name ?? "Challenger"
}

function getCurrentProjectedPayout(ticket: PersistedBetTicket, match: ArenaMatch | null) {
  if (!match) return 0

  const multiplier = getMultiplier(
    match.spectatorPool.host,
    match.spectatorPool.challenger,
    ticket.side
  )

  return ticket.amount * multiplier
}

function getCurrentMultiplier(ticket: PersistedBetTicket, match: ArenaMatch | null) {
  if (!match) return 0

  return getMultiplier(
    match.spectatorPool.host,
    match.spectatorPool.challenger,
    ticket.side
  )
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
  tone?: "white" | "amber" | "emerald" | "sky"
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : tone === "emerald"
      ? "text-emerald-300"
      : tone === "sky"
      ? "text-sky-300"
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
      <div className="text-sm font-bold text-white/50">{count} ticket(s)</div>
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

function TicketCard({ ticket, match }: TicketWithMatch) {
  const player = getTicketPlayer(ticket, match)
  const status = getTicketStatus(match)
  const payout = getCurrentProjectedPayout(ticket, match)
  const multiplier = getCurrentMultiplier(ticket, match)
  const exposure = match
    ? getTicketExposureByMatch(match.id, currentUser.name)
    : { host: 0, challenger: 0, total: 0 }

  const totalPool = match ? match.spectatorPool.host + match.spectatorPool.challenger : 0
  const selectedPool = match
    ? ticket.side === "host"
      ? match.spectatorPool.host
      : match.spectatorPool.challenger
    : 0

  return (
    <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_0_40px_rgba(0,255,200,0.03)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              {ticket.game}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${getStatusTone(
                match
              )}`}
            >
              {status}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">
              Backed {player}
            </span>
          </div>

          <h3 className="mt-4 text-2xl font-black">
            {match ? `${match.host.name} vs ${match.challenger?.name ?? "Waiting Opponent"}` : ticket.matchId}
          </h3>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {match ? <RankBadge rank={match.host.rank} /> : null}
            {match?.challenger ? <RankBadge rank={match.challenger.rank} /> : null}
          </div>

          <div className="mt-5 grid gap-3 text-sm text-white/60 sm:grid-cols-2">
            <div>Placed: {formatDate(ticket.createdAt)}</div>
            <div>Ticket ID: {ticket.id}</div>
            <div>Side pool: {selectedPool.toFixed(2)} KAS</div>
            <div>Total market pool: {totalPool.toFixed(2)} KAS</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
              Bet Amount
            </div>
            <div className="mt-2 text-3xl font-black text-amber-300">
              {ticket.amount.toFixed(2)} KAS
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
              Projected Return
            </div>
            <div className="mt-2 text-3xl font-black text-emerald-300">
              {payout > 0 ? `${payout.toFixed(2)} KAS` : "--"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
              Live Multiplier
            </div>
            <div className="mt-2 text-2xl font-black">
              {multiplier > 0 ? `${multiplier.toFixed(2)}x` : "--"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
              My Exposure
            </div>
            <div className="mt-2 text-2xl font-black">{exposure.total.toFixed(2)} KAS</div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {match ? (
          <>
            <Link
              href={`/arena/match/${match.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Watch Match
            </Link>
            <Link
              href="/spectate"
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
            >
              Back to Spectate
            </Link>
          </>
        ) : (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
            Match no longer found in local data
          </div>
        )}
      </div>
    </div>
  )
}

export default function BetsPage() {
  const [tickets, setTickets] = useState<PersistedBetTicket[]>([])
  const [matches, setMatches] = useState<ArenaMatch[]>([])
  const [, setTick] = useState(0)

  useEffect(() => {
    const sync = () => {
      setTickets(readCurrentUserTickets(currentUser.name))
      setMatches(readArenaMatches())
    }

    sync()

    const unsubscribeMatches = subscribeArenaMatches(sync)
    const unsubscribeTickets = subscribeSpectatorTickets(sync)

    return () => {
      unsubscribeMatches()
      unsubscribeTickets()
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      setMatches(readArenaMatches())
      setTickets(readCurrentUserTickets(currentUser.name))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const ticketsWithMatch = useMemo<TicketWithMatch[]>(() => {
    return tickets.map((ticket) => ({
      ticket,
      match: matches.find((match) => match.id === ticket.matchId) ?? null,
    }))
  }, [tickets, matches])

  const openTickets = ticketsWithMatch.filter(({ match }) => match?.status === "Ready to Start")
  const liveTickets = ticketsWithMatch.filter(({ match }) => match?.status === "Live")
  const waitingTickets = ticketsWithMatch.filter(({ match }) => match?.status === "Waiting for Opponent")
  const finishedTickets = ticketsWithMatch.filter(({ match }) => match?.status === "Finished" || !match)

  const totalWagered = tickets.reduce((sum, ticket) => sum + ticket.amount, 0)
  const liveExposure = liveTickets.reduce((sum, item) => sum + item.ticket.amount, 0)
  const preMatchExposure = openTickets.reduce((sum, item) => sum + item.ticket.amount, 0)

  const totalProjected = ticketsWithMatch.reduce((sum, item) => {
    return sum + getCurrentProjectedPayout(item.ticket, item.match)
  }, 0)

  const uniqueMatches = new Set(tickets.map((ticket) => ticket.matchId)).size

  const biggestBet = tickets.reduce((max, ticket) => Math.max(max, ticket.amount), 0)

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.07),transparent_24%)]" />
      <div className="absolute left-[-80px] top-24 h-[320px] w-[320px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="absolute right-[-80px] top-32 h-[320px] w-[320px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1550px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-8 flex flex-col gap-6 rounded-[34px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_50px_rgba(0,255,200,0.05)] lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              KasRoyal Ticket Center
            </div>

            <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">
              My Bets
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
              Track active exposure, pre-match entries, live tickets, and archived wagers from one
              premium dashboard.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/spectate"
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
            >
              Open Spectate
            </Link>
            <Link
              href="/arena"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Arena Lobby
            </Link>
          </div>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label="Total Tickets"
            value={`${tickets.length}`}
            subtext="All spectator tickets"
            tone="white"
          />
          <SummaryCard
            label="Total Wagered"
            value={`${totalWagered.toFixed(2)} KAS`}
            subtext="Combined bet size"
            tone="amber"
          />
          <SummaryCard
            label="Live Exposure"
            value={`${liveExposure.toFixed(2)} KAS`}
            subtext="Currently in live matches"
            tone="emerald"
          />
          <SummaryCard
            label="Pre-Match Exposure"
            value={`${preMatchExposure.toFixed(2)} KAS`}
            subtext="Ready-to-start markets"
            tone="sky"
          />
          <SummaryCard
            label="Projected Total"
            value={`${totalProjected.toFixed(2)} KAS`}
            subtext={`${uniqueMatches} unique matches • biggest bet ${biggestBet.toFixed(2)} KAS`}
            tone="white"
          />
        </div>

        {tickets.length === 0 ? (
          <div className="rounded-[34px] border border-white/8 bg-white/[0.03] p-10 text-center">
            <h2 className="text-3xl font-black">No bets yet</h2>
            <p className="mt-4 text-white/60">
              Place your first spectator bet from the Spectator Arena and your tickets will appear here.
            </p>
            <div className="mt-6">
              <Link
                href="/spectate"
                className="inline-flex items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
              >
                Open Spectator Arena
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <section>
              <SectionHeader
                title="Pre-Match Tickets"
                count={openTickets.length}
                subtitle="Markets that are ready and still in the launch window."
              />
              <div className="space-y-4">
                {openTickets.length === 0 ? (
                  <EmptyState text="No pre-match tickets right now." />
                ) : (
                  openTickets.map(({ ticket, match }) => (
                    <TicketCard key={ticket.id} ticket={ticket} match={match} />
                  ))
                )}
              </div>
            </section>

            <section>
              <SectionHeader
                title="Live Exposure"
                count={liveTickets.length}
                subtitle="Your bets currently attached to live matches."
              />
              <div className="space-y-4">
                {liveTickets.length === 0 ? (
                  <EmptyState text="No live exposure right now." />
                ) : (
                  liveTickets.map(({ ticket, match }) => (
                    <TicketCard key={ticket.id} ticket={ticket} match={match} />
                  ))
                )}
              </div>
            </section>

            <section>
              <SectionHeader
                title="Waiting Rooms"
                count={waitingTickets.length}
                subtitle="Tickets attached to rooms that have not fully launched."
              />
              <div className="space-y-4">
                {waitingTickets.length === 0 ? (
                  <EmptyState text="No waiting-room tickets." />
                ) : (
                  waitingTickets.map(({ ticket, match }) => (
                    <TicketCard key={ticket.id} ticket={ticket} match={match} />
                  ))
                )}
              </div>
            </section>

            <section>
              <SectionHeader
                title="Archived / Finished"
                count={finishedTickets.length}
                subtitle="Older wagers and anything no longer active in local state."
              />
              <div className="space-y-4">
                {finishedTickets.length === 0 ? (
                  <EmptyState text="No archived tickets yet." />
                ) : (
                  finishedTickets.map(({ ticket, match }) => (
                    <TicketCard key={ticket.id} ticket={ticket} match={match} />
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}