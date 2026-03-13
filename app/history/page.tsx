"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { formatAge, getMatchResultLabel, getWinnerDisplayLine } from "@/lib/mock/arena-data"
import { createClient } from "@/lib/supabase/client"
import { listHistoryRooms } from "@/lib/rooms/rooms-service"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"
import type { Room } from "@/lib/engine/match/types"

function HistoryCard({
  match,
  mounted,
}: {
  match: ReturnType<typeof roomToArenaMatch>
  mounted: boolean
}) {
  const resultLabel = getWinnerDisplayLine(match) || getMatchResultLabel(match)
  const endedTime = formatAge(match.finishedAt ?? match.createdAt)
  const hasWager = match.matchMode === "ranked" && (match.wager ?? 0) > 0
  const poolLabel = hasWager
    ? match.playerPot > 0
      ? `Pool ${match.playerPot} KAS`
      : `Wager ${match.wager} KAS`
    : null

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-4 shadow-[0_0_20px_rgba(0,0,0,0.1)] transition hover:border-sky-400/20 hover:bg-white/[0.03] md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">
              {match.game}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              BO{match.bestOf}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70" title="Ended">
              {mounted ? endedTime : "—"}
            </span>
            {poolLabel ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
                {poolLabel}
              </span>
            ) : null}
            {match.winReason ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
                {match.winReason === "timeout"
                  ? "Timeout"
                  : match.winReason === "forfeit"
                    ? "Forfeit"
                    : match.winReason === "draw"
                      ? "Draw"
                      : "Win"}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-xl font-black">
            {match.host.name} vs {match.challenger?.name ?? "—"}
          </h3>
          <p className="mt-1 text-sm text-white/65">{resultLabel}</p>
        </div>
        <Link
          href={`/arena/match/${match.id}`}
          className="shrink-0 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          View Result
        </Link>
      </div>
    </div>
  )
}

type HistoryTab = "ranked" | "quick"

export default function HistoryPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<HistoryTab>("ranked")

  const refreshHistory = useCallback(async () => {
    if (typeof window === "undefined") return
    const supabase = createClient()
    const list = await listHistoryRooms(supabase)
    setRooms(list)
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    if (!mounted) return
    const supabase = createClient()
    const channel = supabase
      .channel("history-matches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          void refreshHistory()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [mounted, refreshHistory])

  const historyMatches = rooms.map(roomToArenaMatch)
  const rankedMatches = historyMatches.filter((m) => m.matchMode === "ranked")
  const quickMatches = historyMatches.filter((m) => m.matchMode === "quick" || m.matchMode === undefined)
  const displayedMatches = activeTab === "ranked" ? rankedMatches : quickMatches

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-0 h-[300px] w-[300px] rounded-full bg-sky-500/10 blur-[100px]" />
        <div className="absolute right-0 top-20 h-[280px] w-[280px] rounded-full bg-amber-400/08 blur-[100px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(14,165,233,0.06),transparent)]" />

      <div className="relative z-10 mx-auto max-w-[900px] px-4 py-8 md:px-6 md:py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
            Game History
          </div>
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            Completed Games
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
            Completed match archive by mode. Results, ended time, and wager info. Active play is on the Arena.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href="/arena"
            className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/20"
          >
            ← Arena
          </Link>
        </div>

        <div className="mb-6 flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("ranked")}
            className={`flex-1 rounded-xl px-5 py-3 text-sm font-bold transition ${
              activeTab === "ranked"
                ? "bg-amber-400/20 text-amber-200"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Ranked
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("quick")}
            className={`flex-1 rounded-xl px-5 py-3 text-sm font-bold transition ${
              activeTab === "quick"
                ? "bg-emerald-400/20 text-emerald-200"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Quick Match
          </button>
        </div>

        <section className="space-y-4">
          {displayedMatches.length > 0 ? (
            displayedMatches.map((match) => (
              <HistoryCard key={match.id} match={match} mounted={mounted} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
              <p className="text-lg font-bold text-white/90">
                {activeTab === "ranked" ? "No ranked matches yet" : "No quick matches yet"}
              </p>
              <p className="mt-2 text-sm text-white/55">
                {activeTab === "ranked"
                  ? "Finished ranked games will appear here."
                  : "Finished quick games will appear here."}{" "}
                Create or join a match on the Arena.
              </p>
              <Link
                href="/arena"
                className="mt-6 inline-flex rounded-2xl bg-emerald-500/20 border border-emerald-400/30 px-5 py-3 text-sm font-bold text-emerald-200 hover:bg-emerald-500/30"
              >
                Go to Arena
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
