"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  clampWager,
  formatAge,
  gameMeta,
  getArenaBettingSecondsLeft,
  getCurrentUser,
  getMatchResultLabel,
  getRankColors,
  isValidActiveMatch,
  resetAllArenaState,
  type ArenaMatch,
  type ArenaStatus,
  type GameType,
  type RankTier,
} from "@/lib/mock/arena-data"
import { getCurrentIdentity } from "@/lib/identity"
import { createClient } from "@/lib/supabase/client"
import type { Room } from "@/lib/engine/match/types"
import { listActiveRooms } from "@/lib/rooms/rooms-service"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"

type GameFilter = "All" | GameType
type OwnershipFilter = "All" | "Mine" | "Hosted" | "Joined"

const DEV_BOTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_BOTS === "true"
const DEV_RESET_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEV_RESET === "true" || DEV_BOTS_ENABLED

function RankBadge({ rank }: { rank: RankTier }) {
  const colors = getRankColors(rank)

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${colors.bg} ${colors.text} ${colors.ring}`}
    >
      {rank}
    </span>
  )
}

function MetricCard({
  label,
  value,
  accent = "text-white",
  helper,
}: {
  label: string
  value: string
  accent?: string
  helper?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--surface-card)] p-3.5 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className={`mt-1.5 text-xl font-black ${accent}`}>{value}</div>
      {helper ? <div className="mt-1 text-[11px] text-white/45">{helper}</div> : null}
    </div>
  )
}

function StatusPill({ status }: { status: ArenaStatus }) {
  const tone =
    status === "Waiting for Opponent"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : status === "Ready to Start"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-300"
        : status === "Live"
          ? "border-red-400/20 bg-red-400/10 text-red-300"
          : "border-sky-300/20 bg-sky-300/10 text-sky-300"

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${tone}`}
    >
      {status}
    </span>
  )
}

function EmptyState({
  title,
  text,
}: {
  title: string
  text: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
      <div className="text-lg font-bold text-white/90">{title}</div>
      <div className="mt-1.5 text-sm leading-relaxed text-white/55">{text}</div>
    </div>
  )
}

function getPhaseLabel(match: ArenaMatch) {
  if (match.status === "Ready to Start") {
    const seconds = getArenaBettingSecondsLeft(match)
    return seconds > 0 ? `Starts in ${seconds}s` : "Starting Soon"
  }

  if (match.status === "Live") return "Live now"
  if (match.status === "Finished") return getMatchResultLabel(match)
  return "Open seat"
}

function ResumeMatchBanner({
  match,
}: {
  match: ArenaMatch
}) {
  const isReady = match.status === "Ready to Start"
  const isLive = match.status === "Live"
  const countdown = getArenaBettingSecondsLeft(match)
  const opponent =
    (match.hostIdentityId &&
      match.hostIdentityId.toLowerCase() === getCurrentIdentity().id.toLowerCase()) ||
    match.host.name === getCurrentUser().name
      ? match.challenger?.name ?? "Opponent"
      : match.host.name

  return (
    <div
      className={`mb-6 rounded-[30px] border p-6 ${
        isLive
          ? "border-red-300/20 bg-red-500/[0.05]"
          : "border-fuchsia-300/20 bg-fuchsia-300/[0.05]"
      }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                isLive
                  ? "border-red-300/20 bg-red-500/10 text-red-300"
                  : "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-300"
              }`}
            >
              {isLive ? "Resume Active Match" : "Enter Your Ready Match"}
            </span>
            <StatusPill status={match.status} />
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              {match.game}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              BO{match.bestOf}
            </span>
          </div>

          <h2 className="mt-4 text-3xl font-black">
            {match.host.name} vs {match.challenger?.name ?? "Waiting Opponent"}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            {isReady
              ? `${opponent} is seated. Your room is ready and the countdown is already running${
                  countdown > 0 ? ` (${countdown}s left)` : ""
                }. Enter now so you do not miss the start.`
              : "Your match is already live. Jump back into the room right now."}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href={`/arena/match/${match.id}`}
            className={`inline-flex items-center justify-center rounded-2xl px-6 py-4 text-sm font-black transition hover:scale-[1.01] ${
              isLive
                ? "bg-gradient-to-r from-red-400 to-rose-400 text-white"
                : "bg-gradient-to-r from-fuchsia-300 to-amber-300 text-black"
            }`}
          >
            {isLive ? "Resume Live Match" : "Enter Match Now"}
          </Link>

          <Link
            href="/spectate"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Open Spectate
          </Link>
        </div>
      </div>
    </div>
  )
}

function ActiveWalletLockBanner({
  match,
}: {
  match: ArenaMatch
}) {
  const opponent =
    (match.hostIdentityId &&
      match.hostIdentityId.toLowerCase() === getCurrentIdentity().id.toLowerCase()) ||
    match.host.name === getCurrentUser().name
      ? match.challenger?.name ?? "Opponent"
      : match.host.name
  const isLive = match.status === "Live"
  const isReady = match.status === "Ready to Start"
  const tone = isLive
    ? "border-red-300/20 bg-red-500/[0.05]"
    : "border-emerald-300/20 bg-emerald-400/[0.05]"

  return (
    <div className={`mb-6 rounded-[30px] border p-6 ${tone}`}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                isLive
                  ? "border-red-300/20 bg-red-500/10 text-red-300"
                  : "border-emerald-300/20 bg-emerald-400/10 text-emerald-300"
              }`}
            >
              One Active Match Per Wallet
            </span>
            <StatusPill status={match.status} />
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              {match.game}
            </span>
          </div>

          <h2 className="mt-4 text-3xl font-black">You already have an active match</h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            {isLive
              ? `Your ${match.game} match against ${opponent} is live right now. New host and join actions are locked until that game finishes.`
              : isReady
                ? `Your ${match.game} room against ${opponent} is already set and counting down. New host and join actions are locked until that match finishes.`
                : `Your ${match.game} room is still active. New host and join actions are locked until that match finishes.`}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href={`/arena/match/${match.id}`}
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-6 py-4 text-sm font-black text-black transition hover:scale-[1.01]"
          >
            {isLive ? "Resume Active Match" : "Open Active Match"}
          </Link>

          <Link
            href="/spectate"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Spectate Instead
          </Link>
        </div>
      </div>
    </div>
  )
}

function MatchCard({
  match,
  onJoin,
  onFill,
  walletLocked,
  activeMatchId,
  isGuest,
}: {
  match: ArenaMatch
  onJoin: (matchId: string) => void
  onFill: (matchId: string) => void
  walletLocked: boolean
  activeMatchId: string | null
  isGuest: boolean
}) {
  const meta = gameMeta[match.game]
  const isOpen = match.status === "Waiting for Opponent"
  const isReady = match.status === "Ready to Start"
  const isLive = match.status === "Live"
  const isFinished = match.status === "Finished"
  const id = getCurrentIdentity().id.toLowerCase()
  const name = getCurrentUser().name
  const isHost =
    (match.hostIdentityId && match.hostIdentityId.toLowerCase() === id) || match.host.name === name
  const isChallenger =
    (match.challengerIdentityId && match.challengerIdentityId.toLowerCase() === id) ||
    (!!match.challenger && match.challenger.name === name)
  const isMine = isHost || isChallenger
  const countdownLabel = getPhaseLabel(match)

  const joinBlockedByWalletLock =
    walletLocked && activeMatchId !== null && activeMatchId !== match.id && isOpen && !isHost
  const joinBlockedByGuest = isOpen && !isHost && match.matchMode !== "quick" && isGuest
  const joinDisabled = joinBlockedByWalletLock || joinBlockedByGuest

  return (
    <div
      className={`rounded-2xl border p-4 transition shadow-[0_0_20px_rgba(0,0,0,0.1)] ${
        isReady
          ? "border-amber-400/20 bg-amber-400/[0.05]"
          : isLive
            ? "border-red-400/20 bg-red-500/[0.05]"
            : isMine
              ? "border-emerald-400/20 bg-emerald-500/[0.05]"
              : isFinished
                ? "border-sky-400/20 bg-sky-400/[0.05]"
                : "border-white/10 bg-[var(--surface-card)]"
      }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${meta.glow}`}
            >
              {match.game}
            </span>
            <StatusPill status={match.status} />
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              BO{match.bestOf}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              {formatAge(match.createdAt)}
            </span>
            {match.matchMode === "quick" ? (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                Quick
              </span>
            ) : (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
                Ranked
              </span>
            )}
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
              {countdownLabel}
            </span>
            {isHost ? (
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                Hosted by You
              </span>
            ) : null}
            {isChallenger ? (
              <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">
                Joined by You
              </span>
            ) : null}
            {joinBlockedByWalletLock ? (
              <span className="rounded-full border border-red-300/20 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-red-300">
                Wallet Locked
              </span>
            ) : null}
            {joinBlockedByGuest ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-200">
                Connect wallet to join
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Host</div>
              <div className="mt-2 text-2xl font-black">{match.host.name}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <RankBadge rank={match.host.rank} />
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                  {match.host.rating} MMR
                </span>
              </div>
              <div className="mt-3 text-sm text-white/55">Side: {match.hostSideLabel}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Challenger
              </div>
              {match.challenger ? (
                <>
                  <div className="mt-2 text-2xl font-black">{match.challenger.name}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <RankBadge rank={match.challenger.rank} />
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                      {match.challenger.rating} MMR
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-white/55">
                    Side: {match.challengerSideLabel}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-lg font-black text-white/45">Waiting for opponent</div>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <MetricCard label="Entry" value={`${match.wager} KAS`} accent="text-amber-300" />
            <MetricCard
              label="Player Pot"
              value={`${match.playerPot.toFixed(0)} KAS`}
              accent="text-emerald-300"
            />
            <MetricCard
              label="Spectators"
              value={`${match.spectators}`}
              accent="text-sky-300"
            />
            <MetricCard label="State" value={match.moveText} helper={match.statusText} />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[260px]">
          {isOpen ? (
            isHost ? (
              DEV_BOTS_ENABLED ? (
                <button
                  type="button"
                  onClick={() => onFill(match.id)}
                  className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01]"
                >
                  Fill Opponent (Dev)
                </button>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center text-sm font-semibold text-white/70">
                  Waiting for a real opponent
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => onJoin(match.id)}
                disabled={joinDisabled}
                className={`rounded-2xl px-5 py-4 text-sm font-black transition ${
                  joinDisabled
                    ? "cursor-not-allowed border border-red-300/20 bg-red-500/10 text-red-300 opacity-70"
                    : "bg-gradient-to-r from-amber-400 to-yellow-300 text-black hover:scale-[1.01]"
                }`}
              >
                {joinBlockedByWalletLock
                  ? "Locked: Active Match"
                  : joinBlockedByGuest
                    ? "Connect wallet to join"
                    : match.matchMode === "quick"
                      ? "Join (Free)"
                      : `Join for ${match.wager} KAS`}
              </button>
            )
          ) : (
            <Link
              href={`/arena/match/${match.id}`}
              className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-center text-sm font-black text-black transition hover:scale-[1.01]"
            >
              {isLive ? "Open Live Room" : isReady ? "Enter Room" : "View Result"}
            </Link>
          )}

          <Link
            href={`/arena/match/${match.id}`}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center text-sm font-bold text-white transition hover:bg-white/10"
          >
            View Match Room
          </Link>

          <Link
            href="/spectate"
            className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-center text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
          >
            Open Spectate
          </Link>
        </div>
      </div>
    </div>
  )
}

function dedupeMatchesById(matches: ArenaMatch[]): ArenaMatch[] {
  const byId = new Map<string, ArenaMatch>()
  for (const m of matches) {
    if (m?.id) byId.set(m.id, m)
  }
  return [...byId.values()]
}

export default function ArenaPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedGame, setSelectedGame] = useState<GameType>("Connect 4")
  const [wagerInput, setWagerInput] = useState("5")
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(1)
  const [message, setMessage] = useState(
    "Create a real lobby or join an open seat to begin the KasRoyal arena flow."
  )
  const [search, setSearch] = useState("")
  const [gameFilter, setGameFilter] = useState<GameFilter>("All")
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("All")
  const [customMode, setCustomMode] = useState(false)
  const [arenaMode, setArenaMode] = useState<"quick" | "ranked">("quick")
  const [, setTick] = useState(0)

  const refreshRooms = useCallback(async () => {
    if (typeof window === "undefined") return
    const supabase = createClient()
    const active = await listActiveRooms(supabase)
    setRooms(active)
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    refreshRooms()
  }, [refreshRooms])

  useEffect(() => {
    if (!mounted) return
    const supabase = createClient()
    const channel = supabase
      .channel("arena-matches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          refreshRooms()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [mounted, refreshRooms])

  useEffect(() => {
    const timer = setInterval(() => refreshRooms(), 2000)
    return () => clearInterval(timer)
  }, [refreshRooms])

  const wager = clampWager(Number(wagerInput))

  /** Arena = active only. No Finished/duplicates in main lists. */
  const activeMatches = useMemo(() => {
    const activeRooms = rooms.filter(
      (r) =>
        r.status === "Waiting for Opponent" ||
        r.status === "Ready to Start" ||
        r.status === "Live"
    )
    const list = activeRooms.map(roomToArenaMatch).filter(isValidActiveMatch)
    return dedupeMatchesById(list)
  }, [rooms])

  const identity = getCurrentIdentity()
  const identityId = identity.id.toLowerCase()
  const isGuest = identity.isGuest
  const activeWalletMatch = useMemo(
    () =>
      activeMatches.find(
        (m) =>
          (m.hostIdentityId && m.hostIdentityId.toLowerCase() === identityId) ||
          (m.challengerIdentityId && m.challengerIdentityId.toLowerCase() === identityId)
      ) ?? null,
    [activeMatches, identityId]
  )
  const walletLocked = !!activeWalletMatch

  const filteredMatches = useMemo(() => {
    if (!mounted) return []
    const q = search.trim().toLowerCase()
    const id = getCurrentIdentity().id.toLowerCase()
    const name = getCurrentUser().name
    const isMine = (m: ArenaMatch) =>
      (m.hostIdentityId && m.hostIdentityId.toLowerCase() === id) ||
      (m.challengerIdentityId && m.challengerIdentityId.toLowerCase() === id) ||
      m.host.name === name ||
      m.challenger?.name === name
    const isHost = (m: ArenaMatch) =>
      (m.hostIdentityId && m.hostIdentityId.toLowerCase() === id) || m.host.name === name
    const isChallenger = (m: ArenaMatch) =>
      (m.challengerIdentityId && m.challengerIdentityId.toLowerCase() === id) ||
      (!!m.challenger && m.challenger.name === name)

    return activeMatches
      .filter((match) => (gameFilter === "All" ? true : match.game === gameFilter))
      .filter((match) => {
        if (ownershipFilter === "All") return true
        if (ownershipFilter === "Mine") return isMine(match)
        if (ownershipFilter === "Hosted") return isHost(match)
        if (ownershipFilter === "Joined") return isChallenger(match)
        return true
      })
      .filter((match) => {
        if (!q) return true
        return (
          match.game.toLowerCase().includes(q) ||
          match.host.name.toLowerCase().includes(q) ||
          match.host.rank.toLowerCase().includes(q) ||
          (match.challenger?.name.toLowerCase().includes(q) ?? false)
        )
      })
  }, [activeMatches, gameFilter, ownershipFilter, search, mounted])

  const myReadyMatches = useMemo(() => {
    const id = getCurrentIdentity().id.toLowerCase()
    const name = getCurrentUser().name
    const isMine = (m: ArenaMatch) =>
      (m.hostIdentityId && m.hostIdentityId.toLowerCase() === id) ||
      (m.challengerIdentityId && m.challengerIdentityId.toLowerCase() === id) ||
      m.host.name === name ||
      m.challenger?.name === name
    return filteredMatches
      .filter((match) => match.status === "Ready to Start" && isMine(match))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [filteredMatches])

  const myReadyMatchesQuick = useMemo(
    () => myReadyMatches.filter((m) => m.matchMode === "quick"),
    [myReadyMatches]
  )
  const myReadyMatchesRanked = useMemo(
    () => myReadyMatches.filter((m) => m.matchMode !== "quick"),
    [myReadyMatches]
  )

  const myLiveMatches = useMemo(() => {
    const id = getCurrentIdentity().id.toLowerCase()
    const name = getCurrentUser().name
    const isMine = (m: ArenaMatch) =>
      (m.hostIdentityId && m.hostIdentityId.toLowerCase() === id) ||
      (m.challengerIdentityId && m.challengerIdentityId.toLowerCase() === id) ||
      m.host.name === name ||
      m.challenger?.name === name
    return filteredMatches
      .filter((match) => match.status === "Live" && isMine(match))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [filteredMatches])

  const priorityResumeMatch = myReadyMatches[0] ?? myLiveMatches[0] ?? activeWalletMatch ?? null

  const joinableMatches = useMemo(() => {
    const id = getCurrentIdentity().id.toLowerCase()
    const name = getCurrentUser().name
    const isHost = (m: ArenaMatch) =>
      (m.hostIdentityId && m.hostIdentityId.toLowerCase() === id) || m.host.name === name
    return filteredMatches
      .filter((match) => match.status === "Waiting for Opponent" && !isHost(match))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [filteredMatches])

  const joinableQuickMatches = useMemo(
    () => joinableMatches.filter((m) => m.matchMode === "quick"),
    [joinableMatches]
  )
  const joinableRankedMatches = useMemo(
    () => joinableMatches.filter((m) => m.matchMode !== "quick"),
    [joinableMatches]
  )

  const myMatches = useMemo(() => {
    const id = getCurrentIdentity().id.toLowerCase()
    const name = getCurrentUser().name
    const isMine = (m: ArenaMatch) =>
      (m.hostIdentityId && m.hostIdentityId.toLowerCase() === id) ||
      (m.challengerIdentityId && m.challengerIdentityId.toLowerCase() === id) ||
      m.host.name === name ||
      m.challenger?.name === name
    return filteredMatches.filter(isMine).sort((a, b) => b.createdAt - a.createdAt)
  }, [filteredMatches])

  const myMatchesQuick = useMemo(
    () => myMatches.filter((m) => m.matchMode === "quick"),
    [myMatches]
  )
  const myMatchesRanked = useMemo(
    () => myMatches.filter((m) => m.matchMode !== "quick"),
    [myMatches]
  )

  const liveMatches = useMemo(
    () =>
      filteredMatches
        .filter((match) => match.status === "Live")
        .sort((a, b) => {
          if (b.spectators !== a.spectators) return b.spectators - a.spectators
          return b.createdAt - a.createdAt
        }),
    [filteredMatches]
  )

  const openHostedMatches = useMemo(() => {
    const id = getCurrentIdentity().id.toLowerCase()
    const name = getCurrentUser().name
    const isHost = (m: ArenaMatch) =>
      (m.hostIdentityId && m.hostIdentityId.toLowerCase() === id) || m.host.name === name
    return filteredMatches.filter(
      (match) => match.status === "Waiting for Opponent" && isHost(match)
    )
  }, [filteredMatches])

  function handleSelectCreateGame(game: GameType) {
    setSelectedGame(game)
    setGameFilter(game)
    setMessage(`${game} selected. Arena board filtered to ${game}.`)
  }

  function handleQuickWager(amount: number) {
    setCustomMode(false)
    setWagerInput(String(amount))
  }

  function handleCustomWagerMode() {
    setCustomMode(true)
    if (["2", "5", "10", "25"].includes(wagerInput)) {
      setWagerInput("")
    }
  }

  async function handleCreateMatch() {
    if (arenaMode === "quick") {
      if (walletLocked) {
        setMessage("You already have an active match. Resume or finish it before creating another one.")
        return
      }
      try {
        const identity = getCurrentIdentity()
        const res = await fetch("/api/rooms/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "quick",
            game_type: selectedGame,
            host_identity_id: identity.id,
            host_display_name: identity.displayName,
            wager_amount: 0,
            best_of: bestOf,
          }),
        })
        const data = await res.json()
        if (!data.ok) {
          setMessage(data.error ?? "Failed to create quick match.")
          return
        }
        await refreshRooms()
        setOwnershipFilter("Mine")
        setGameFilter(selectedGame)
        setMessage(`Quick Match created: ${selectedGame}. Share the room or wait for someone to join.`)
        router.push(`/arena/match/${data.room.id}`)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to create quick match.")
      }
      return
    }

    if (walletLocked) {
      setMessage("You already have an active match. Resume or finish it before creating another one.")
      return
    }

    if (!Number.isFinite(Number(wagerInput)) || String(wagerInput).trim() === "") {
      setMessage("Enter a valid wager amount before creating a ranked match.")
      return
    }

    const safeWager = clampWager(Number(wagerInput))

    if (safeWager > getCurrentUser().walletBalance) {
      setMessage("Insufficient KAS balance for that wager.")
      return
    }

    if (isGuest) {
      setMessage("Ranked matches require a connected wallet. Connect your wallet to create a ranked room.")
      return
    }

    try {
      const identity = getCurrentIdentity()
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "ranked",
          game_type: selectedGame,
          host_identity_id: identity.id,
          host_display_name: identity.displayName,
          wager_amount: safeWager,
          best_of: bestOf,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setMessage(data.error ?? "Failed to create ranked match.")
        return
      }
      await refreshRooms()
      setOwnershipFilter("Mine")
      setGameFilter(selectedGame)
      setMessage(`Created ${selectedGame} for ${safeWager} KAS. Your new room is now under My Matches.`)
      setWagerInput("5")
      setBestOf(1)
      setCustomMode(false)
      router.push(`/arena/match/${data.room.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create arena.")
    }
  }

  async function handleJoinMatch(matchId: string) {
    if (walletLocked && activeWalletMatch?.id !== matchId) {
      setMessage("You already have an active match. Resume or finish it before joining another one.")
      return
    }

    try {
      const identity = getCurrentIdentity()
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: matchId,
          challenger_identity_id: identity.id,
          challenger_display_name: identity.displayName,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setMessage(data.error ?? "Failed to join match.")
        return
      }
      await refreshRooms()
      setOwnershipFilter("Mine")
      setMessage(`Joined ${data.room.game}. Countdown should now begin automatically.`)
      router.push(`/arena/match/${matchId}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to join arena.")
    }
  }

  async function handleFillOpponent(matchId: string) {
    if (!DEV_BOTS_ENABLED) return
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: matchId,
          challenger_identity_id: "dev-bot-" + Date.now(),
          challenger_display_name: "DevBot",
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setMessage(data.error ?? "Failed to fill opponent.")
        return
      }
      await refreshRooms()
      setOwnershipFilter("Mine")
      setMessage(`Dev fill complete: DevBot joined ${data.room.game}.`)
      router.push(`/arena/match/${matchId}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to fill opponent.")
    }
  }

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-0 h-[300px] w-[300px] rounded-full bg-emerald-500/10 blur-[100px]" />
        <div className="absolute right-0 top-20 h-[280px] w-[280px] rounded-full bg-amber-400/10 blur-[100px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(16,185,129,0.08),transparent)]" />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
        <div className="mb-6 rounded-2xl border border-white/10 bg-[var(--surface-card)] p-5 shadow-[0_0_30px_rgba(0,0,0,0.2)] md:mb-8 md:p-6">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
              Arena
            </div>
            <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              Active play · Create or join
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
              <span className="text-emerald-300/90">Quick</span> — free play.{" "}
              <span className="text-amber-300/90">Ranked</span> — wager and climb.{" "}
              <Link href="/history" className="font-semibold text-sky-300 underline decoration-sky-400/50 underline-offset-2 hover:text-sky-200">
                Game History
              </Link>{" "}
              for completed matches.
            </p>
          </div>
        </div>

        {DEV_RESET_ENABLED ? (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                resetAllArenaState()
                router.push("/arena")
              }}
              className="w-full rounded-[24px] border-2 border-red-400/40 bg-red-500/20 px-6 py-4 text-lg font-black text-red-100 shadow-[0_0_40px_rgba(239,68,68,0.15)] transition hover:border-red-400/60 hover:bg-red-500/30 hover:text-red-50"
            >
              Hard Reset All Matches
            </button>
            <p className="mt-2 text-center text-xs text-white/50">
              Dev only: wipes all matches, history, chat, guest identity. Redirects to Arena.
            </p>
          </div>
        ) : null}

        {priorityResumeMatch ? <ResumeMatchBanner match={priorityResumeMatch} /> : null}

        {activeWalletMatch ? <ActiveWalletLockBanner match={activeWalletMatch} /> : null}

        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          {/* Sticky left action rail: Return to game, Create Match, compact live stats */}
          <aside id="arena-create" className="xl:sticky xl:top-6 xl:self-start space-y-5">
            {activeWalletMatch ? (
              <Link
                href={`/arena/match/${activeWalletMatch.id}`}
                className="flex items-center justify-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3.5 text-sm font-bold text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.12)] transition hover:border-emerald-400/40 hover:bg-emerald-500/20"
              >
                <span className="text-lg">🎮</span>
                Return to game — {activeWalletMatch.game}
              </Link>
            ) : null}

            {/* Compact live stats */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="Ready to Enter"
                value={`${myReadyMatches.length}`}
                accent="text-fuchsia-300"
              />
              <MetricCard
                label="Joinable"
                value={`${joinableMatches.length}`}
                accent="text-amber-300"
              />
              <MetricCard label="My Matches" value={`${myMatches.length}`} accent="text-sky-300" />
              <MetricCard
                label="Live"
                value={`${liveMatches.length}`}
                accent="text-emerald-300"
              />
            </div>

            {/* Create Match panel */}
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-4 shadow-[0_0_30px_rgba(0,0,0,0.2)] md:p-5">
              <div className="mb-4">
                <p className="text-sm uppercase tracking-[0.2em] text-white/50">
                  Match type
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setArenaMode("quick")}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      arenaMode === "quick"
                        ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                        : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="text-base font-black">Quick Match</div>
                    <div className="mt-1 text-xs opacity-85">Free Play · No wallet</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setArenaMode("ranked")}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      arenaMode === "ranked"
                        ? "border-amber-300/30 bg-amber-300/15 text-amber-100"
                        : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="text-base font-black">Ranked Match</div>
                    <div className="mt-1 text-xs opacity-85">Connect Wallet · Wager</div>
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                  {arenaMode === "quick" ? "Create Quick Match" : "Create Ranked Match"}
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {arenaMode === "quick" ? "Free to play" : "Open a new lobby"}
                </h2>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Player</div>
                  {mounted ? (
                    <>
                      <div className="mt-2 text-xl font-black">{getCurrentUser().name}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <RankBadge rank={getCurrentUser().rank} />
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                          {getCurrentUser().rating} MMR
                        </span>
                      </div>
                      {arenaMode === "ranked" && (
                        <div className="mt-3 text-sm text-white/55">
                          Wallet:{" "}
                          <span className="font-bold text-emerald-300">
                            {getCurrentUser().walletBalance.toFixed(2)} KAS
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 h-8 w-32 animate-pulse rounded-lg bg-white/10" />
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">Game</label>
                  <div className="mt-3 grid gap-2">
                    {(["Chess Duel", "Connect 4", "Rock Paper Scissors", "Tic-Tac-Toe"] as GameType[]).map((game) => {
                      const active = selectedGame === game
                      return (
                        <button
                          key={game}
                          type="button"
                          onClick={() => handleSelectCreateGame(game)}
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            active
                              ? "border-emerald-300/25 bg-emerald-400/10"
                              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="text-base font-black">{game}</div>
                          <div className="mt-1 text-sm text-white/55">{gameMeta[game].subtitle}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {arenaMode === "ranked" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <label className="text-xs uppercase tracking-[0.16em] text-white/45">Wager (KAS)</label>
                    <div className="mt-3 grid grid-cols-5 gap-2">
                      {[2, 5, 10, 25].map((quick) => (
                        <button
                          key={quick}
                          type="button"
                          onClick={() => handleQuickWager(quick)}
                          className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${
                            !customMode && wagerInput === String(quick)
                              ? "border-amber-300/25 bg-amber-300/10 text-amber-300"
                              : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                          }`}
                        >
                          {quick} KAS
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleCustomWagerMode}
                        className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${
                          customMode
                            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      value={wagerInput}
                      onChange={(e) => {
                        setCustomMode(true)
                        setWagerInput(e.target.value)
                      }}
                      placeholder="Custom KAS"
                      className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-xl font-bold text-white outline-none"
                    />
                    <div className="mt-3 text-xs text-white/45">Preview: {wager} KAS</div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">Format</label>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[1, 3, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setBestOf(value as 1 | 3 | 5)}
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${
                          bestOf === value
                            ? "border-amber-300/25 bg-amber-300/10 text-amber-300"
                            : "border-white/10 bg-white/5 text-white/80"
                        }`}
                      >
                        BO{value}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleCreateMatch}
                  disabled={walletLocked || (arenaMode === "ranked" && isGuest)}
                  className={`w-full rounded-2xl px-5 py-4 text-base font-black transition ${
                    walletLocked || (arenaMode === "ranked" && isGuest)
                      ? "cursor-not-allowed border border-red-300/20 bg-red-500/10 text-red-300 opacity-70"
                      : arenaMode === "quick"
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-600 text-white hover:scale-[1.01]"
                        : "bg-gradient-to-r from-amber-400 to-yellow-300 text-black hover:scale-[1.01]"
                  }`}
                >
                  {walletLocked
                    ? "Locked: Active Match"
                    : arenaMode === "ranked" && isGuest
                      ? "Connect wallet for Ranked"
                      : arenaMode === "quick"
                        ? "Create Quick Match (Free)"
                        : "Create Ranked Match"}
                </button>

                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3.5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Status</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-white/90">{message}</div>
                </div>
              </div>
            </div>

            <Link
              href="/history"
              className="flex items-center justify-center gap-2 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-5 py-3.5 text-sm font-bold text-sky-200 transition hover:bg-sky-500/20 hover:text-sky-100"
            >
              Game History →
            </Link>
          </aside>

          {/* Floating Create Match on smaller screens for quick access */}
          <div className="fixed bottom-6 right-6 z-30 xl:hidden">
            <button
              type="button"
              onClick={() => document.getElementById("arena-create")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-2xl bg-gradient-to-r from-emerald-400 to-emerald-600 px-5 py-4 text-sm font-black text-white shadow-[0_0_24px_rgba(16,185,129,0.3)] transition hover:from-emerald-300 hover:to-emerald-500 hover:shadow-[0_0_32px_rgba(16,185,129,0.4)]"
            >
              Create Match
            </button>
          </div>

          <section className="space-y-8">
            {/* Shared filters */}
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-4 shadow-[0_0_20px_rgba(0,0,0,0.15)] md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Filters</p>
                  <h2 className="mt-1 text-xl font-black">Lobby</h2>
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search host, challenger, game, rank"
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(["All", "Chess Duel", "Connect 4", "Rock Paper Scissors", "Tic-Tac-Toe"] as GameFilter[]).map((filterValue) => {
                  const active = gameFilter === filterValue
                  return (
                    <button
                      key={filterValue}
                      type="button"
                      onClick={() => setGameFilter(filterValue)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                        active ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {filterValue}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["All", "Mine", "Hosted", "Joined"] as OwnershipFilter[]).map((filterValue) => {
                  const active = ownershipFilter === filterValue
                  return (
                    <button
                      key={filterValue}
                      type="button"
                      onClick={() => setOwnershipFilter(filterValue)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                        active ? "border-amber-300/25 bg-amber-300/10 text-amber-300" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {filterValue}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ——— Quick Match Arena ——— */}
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4 shadow-[0_0_20px_rgba(0,0,0,0.15)] md:p-5">
              <h2 className="mb-4 text-xl font-black text-emerald-200">Quick Match Arena</h2>
              <p className="mb-5 text-sm text-white/60">Free play. No wallet required. Guests welcome.</p>

              <div className="mb-6">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300/90">Countdown rooms (Quick)</h3>
                <div className="grid gap-4">
                  {myReadyMatchesQuick.length ? (
                    myReadyMatchesQuick.map((match) => (
                      <MatchCard key={match.id} match={match} onJoin={handleJoinMatch} onFill={handleFillOpponent} walletLocked={walletLocked} activeMatchId={activeWalletMatch?.id ?? null} isGuest={isGuest} />
                    ))
                  ) : (
                    <EmptyState title="No quick countdown rooms" text="When someone joins your Quick match, it will show here." />
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300/90">Open seats (Quick)</h3>
                <div className="grid gap-4">
                  {joinableQuickMatches.length ? (
                    joinableQuickMatches.map((match) => (
                      <MatchCard key={match.id} match={match} onJoin={handleJoinMatch} onFill={handleFillOpponent} walletLocked={walletLocked} activeMatchId={activeWalletMatch?.id ?? null} isGuest={isGuest} />
                    ))
                  ) : (
                    <EmptyState title="No open Quick seats" text="Create a Quick match above or wait for new open seats." />
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300/90">Your rooms (Quick)</h3>
                <div className="grid gap-4">
                  {myMatchesQuick.length ? (
                    myMatchesQuick.map((match) => (
                      <MatchCard key={match.id} match={match} onJoin={handleJoinMatch} onFill={handleFillOpponent} walletLocked={walletLocked} activeMatchId={activeWalletMatch?.id ?? null} isGuest={isGuest} />
                    ))
                  ) : (
                    <EmptyState title="No Quick matches yet" text="Create or join a Quick match to see it here." />
                  )}
                </div>
              </div>
            </div>

            {/* ——— Ranked Arena ——— */}
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.04] p-4 shadow-[0_0_20px_rgba(0,0,0,0.15)] md:p-5">
              <h2 className="mb-4 text-xl font-black text-amber-200">Ranked Arena</h2>
              <p className="mb-5 text-sm text-white/60">Wallet required. Spectator betting. Rank and climb.</p>

              <div className="mb-6">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-300/90">Countdown rooms (Ranked)</h3>
                <div className="grid gap-4">
                  {myReadyMatchesRanked.length ? (
                    myReadyMatchesRanked.map((match) => (
                      <MatchCard key={match.id} match={match} onJoin={handleJoinMatch} onFill={handleFillOpponent} walletLocked={walletLocked} activeMatchId={activeWalletMatch?.id ?? null} isGuest={isGuest} />
                    ))
                  ) : (
                    <EmptyState title="No ranked countdown rooms" text="When someone joins your Ranked match, it will show here." />
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-300/90">Open seats (Ranked)</h3>
                <div className="grid gap-4">
                  {joinableRankedMatches.length ? (
                    joinableRankedMatches.map((match) => (
                      <MatchCard key={match.id} match={match} onJoin={handleJoinMatch} onFill={handleFillOpponent} walletLocked={walletLocked} activeMatchId={activeWalletMatch?.id ?? null} isGuest={isGuest} />
                    ))
                  ) : (
                    <EmptyState title="No open Ranked seats" text="Connect wallet and create a Ranked match, or wait for open seats." />
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-300/90">Your rooms (Ranked)</h3>
                <div className="grid gap-4">
                  {myMatchesRanked.length ? (
                    myMatchesRanked.map((match) => (
                      <MatchCard key={match.id} match={match} onJoin={handleJoinMatch} onFill={handleFillOpponent} walletLocked={walletLocked} activeMatchId={activeWalletMatch?.id ?? null} isGuest={isGuest} />
                    ))
                  ) : (
                    <EmptyState title="No Ranked matches yet" text="Create or join a Ranked match (wallet required) to see it here." />
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}