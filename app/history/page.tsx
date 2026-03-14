"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { formatAge, getMatchResultLabel, getWinnerDisplayName, getWinReasonLabel, getWinnerDisplayLine } from "@/lib/mock/arena-data"
import { getCurrentIdentity } from "@/lib/identity"
import { createClient } from "@/lib/supabase/client"
import { listHistoryRooms } from "@/lib/rooms/rooms-service"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"
import type { Room } from "@/lib/engine/match/types"

const CLEARED_HISTORY_KEY = "kasroyal_cleared_history"

function getClearedHistoryStorageKey(identityId: string, mode: HistoryTab): string {
  return `${CLEARED_HISTORY_KEY}_${identityId}_${mode}`
}

function loadClearedMatchIds(identityId: string, mode: HistoryTab): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(getClearedHistoryStorageKey(identityId, mode))
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return new Set(Array.isArray(arr) ? arr.filter((id): id is string => typeof id === "string") : [])
  } catch {
    return new Set()
  }
}

function saveClearedMatchIds(identityId: string, mode: HistoryTab, ids: Set<string>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(getClearedHistoryStorageKey(identityId, mode), JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

function HistoryCard({
  match,
  mounted,
}: {
  match: ReturnType<typeof roomToArenaMatch>
  mounted: boolean
}) {
  const winnerName = getWinnerDisplayName(match)
  const winReasonLabel = getWinReasonLabel(match.winReason)
  const resultLine = getWinnerDisplayLine(match) || getMatchResultLabel(match)
  const endedTime = formatAge(match.finishedAt ?? match.createdAt)
  const hasWager = match.matchMode === "ranked" && (match.wager ?? 0) > 0
  const poolLabel = hasWager
    ? match.playerPot > 0
      ? `Pool ${match.playerPot} KAS`
      : `Wager ${match.wager} KAS`
    : null
  const modeLabel = match.matchMode === "ranked" ? "Ranked" : "Quick Match"
  const bestOf = match.bestOf ?? 1
  const seriesScore =
    match.status === "Finished" &&
    (match.roundScore?.host != null || match.roundScore?.challenger != null)
      ? `${match.roundScore?.host ?? 0}–${match.roundScore?.challenger ?? 0}`
      : null
  const resultCopy = match.status === "Finished"
    ? (match.result === "draw"
        ? "Draw"
        : winnerName
          ? `${winnerName} won${winReasonLabel ? ` (${winReasonLabel})` : ""}`
          : "Finished")
    : resultLine

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-4 shadow-[0_0_20px_rgba(0,0,0,0.1)] transition hover:border-sky-400/20 hover:bg-white/[0.03] md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">
              {match.game}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              {modeLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70" title="Ended">
              {mounted ? endedTime : "—"}
            </span>
            {bestOf > 1 ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
                BO{bestOf}
                {seriesScore != null ? ` • ${seriesScore}` : ""}
              </span>
            ) : null}
            {poolLabel ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
                {poolLabel}
              </span>
            ) : null}
            {winReasonLabel ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
                {winReasonLabel}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-xl font-black">
            {match.host.name} vs {match.challenger?.name ?? "—"}
          </h3>
          <p className="mt-2 text-base font-bold text-white/95">
            {resultCopy}
          </p>
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
  const [clearedIdsRanked, setClearedIdsRanked] = useState<Set<string>>(new Set())
  const [clearedIdsQuick, setClearedIdsQuick] = useState<Set<string>>(new Set())
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const identityId = getCurrentIdentity().id

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
    if (mounted) {
      setClearedIdsRanked(loadClearedMatchIds(identityId, "ranked"))
      setClearedIdsQuick(loadClearedMatchIds(identityId, "quick"))
    }
  }, [mounted, identityId])

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

  const historyMatches = useMemo(() => rooms.map(roomToArenaMatch), [rooms])
  const rankedMatches = useMemo(
    () => historyMatches.filter((m) => m.matchMode === "ranked" && !clearedIdsRanked.has(m.id)),
    [historyMatches, clearedIdsRanked]
  )
  const quickMatches = useMemo(
    () => historyMatches.filter((m) => (m.matchMode === "quick" || m.matchMode === undefined) && !clearedIdsQuick.has(m.id)),
    [historyMatches, clearedIdsQuick]
  )
  const displayedMatches = activeTab === "ranked" ? rankedMatches : quickMatches
  const currentTabMatchIds = useMemo(
    () => (activeTab === "ranked" ? rankedMatches : quickMatches).map((m) => m.id),
    [activeTab, rankedMatches, quickMatches]
  )
  const hasCurrentTabHistory = activeTab === "ranked" ? rankedMatches.length > 0 : quickMatches.length > 0

  const handleClearHistory = useCallback(() => {
    if (activeTab === "ranked") {
      const next = new Set(clearedIdsRanked)
      currentTabMatchIds.forEach((id) => next.add(id))
      setClearedIdsRanked(next)
      saveClearedMatchIds(identityId, "ranked", next)
    } else {
      const next = new Set(clearedIdsQuick)
      currentTabMatchIds.forEach((id) => next.add(id))
      setClearedIdsQuick(next)
      saveClearedMatchIds(identityId, "quick", next)
    }
    setShowClearConfirm(false)
  }, [activeTab, clearedIdsRanked, clearedIdsQuick, currentTabMatchIds, identityId])

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

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
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
          {hasCurrentTabHistory ? (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="shrink-0 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-200 transition hover:bg-red-500/20"
            >
              Clear History
            </button>
          ) : null}
        </div>

        {showClearConfirm ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)} />
            <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[var(--surface-card)] p-6 shadow-2xl">
              <p className="text-lg font-bold text-white">
                {activeTab === "ranked"
                  ? "Are you sure you want to clear your Ranked history?"
                  : "Are you sure you want to clear your Quick Match history?"}
              </p>
              <p className="mt-2 text-sm text-white/65">
                This will hide {activeTab === "ranked" ? "Ranked" : "Quick Match"} history for this account. The other tab is not affected. Match data is not deleted.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="flex-1 rounded-2xl border border-red-400/30 bg-red-500/20 px-4 py-3 text-sm font-bold text-red-200 transition hover:bg-red-500/30"
                >
                  Clear {activeTab === "ranked" ? "Ranked" : "Quick Match"} History
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="space-y-4">
          {displayedMatches.length > 0 ? (
            displayedMatches.map((match) => (
              <HistoryCard key={match.id} match={match} mounted={mounted} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
              <p className="text-lg font-bold text-white/90">No matches yet.</p>
              <p className="mt-2 text-sm text-white/55">
                Finished games will appear here. Create or join a match on the Arena.
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
