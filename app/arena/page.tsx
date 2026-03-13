"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  autoFillArenaMatch,
  clampWager,
  createArenaMatch,
  formatAge,
  gameMeta,
  getArenaBettingSecondsLeft,
  getCurrentUser,
  getMatchResultLabel,
  getRankColors,
  getWalletActiveMatch,
  hasWalletActiveMatch,
  joinArenaMatch,
  readArenaMatches,
  subscribeArenaMatches,
  type ArenaMatch,
  type ArenaStatus,
  type GameType,
  type RankTier,
} from "@/lib/mock/arena-data"
import { getCurrentIdentity } from "@/lib/identity"

type GameFilter = "All" | GameType
type OwnershipFilter = "All" | "Mine" | "Hosted" | "Joined"

const DEV_BOTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_BOTS === "true"

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
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className={`mt-2 text-2xl font-black ${accent}`}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-white/45">{helper}</div> : null}
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
    <div className="rounded-[24px] border border-dashed border-white/12 bg-black/20 p-8 text-center">
      <div className="text-xl font-black text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/55">{text}</div>
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
}: {
  match: ArenaMatch
  onJoin: (matchId: string) => void
  onFill: (matchId: string) => void
  walletLocked: boolean
  activeMatchId: string | null
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

  return (
    <div
      className={`rounded-[24px] border p-5 transition ${
        isReady
          ? "border-amber-300/20 bg-amber-300/[0.04]"
          : isLive
            ? "border-red-300/20 bg-red-500/[0.04]"
            : isMine
              ? "border-emerald-300/20 bg-emerald-400/[0.04]"
              : isFinished
                ? "border-sky-300/20 bg-sky-300/[0.04]"
                : "border-white/10 bg-white/[0.03]"
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
                disabled={joinBlockedByWalletLock}
                className={`rounded-2xl px-5 py-4 text-sm font-black transition ${
                  joinBlockedByWalletLock
                    ? "cursor-not-allowed border border-red-300/20 bg-red-500/10 text-red-300 opacity-70"
                    : "bg-gradient-to-r from-amber-400 to-yellow-300 text-black hover:scale-[1.01]"
                }`}
              >
                {joinBlockedByWalletLock
                  ? "Locked: Active Match"
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

export default function ArenaPage() {
  const router = useRouter()
  const [matches, setMatches] = useState<ArenaMatch[]>([])
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

  useEffect(() => {
    setMatches(readArenaMatches())
    const unsubscribe = subscribeArenaMatches(() => {
      setMatches(readArenaMatches())
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      setMatches(readArenaMatches())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const wager = clampWager(Number(wagerInput))
  const activeWalletMatch = useMemo(() => getWalletActiveMatch(), [matches])
  const walletLocked = useMemo(() => hasWalletActiveMatch(), [matches])

  const filteredMatches = useMemo(() => {
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

    return matches
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
  }, [matches, gameFilter, ownershipFilter, search])

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

  function handleCreateMatch() {
    if (arenaMode === "quick") {
      if (walletLocked) {
        setMessage("You already have an active match. Resume or finish it before creating another one.")
        return
      }
      try {
        const created = createArenaMatch({
          game: selectedGame,
          matchMode: "quick",
          bestOf,
        })
        setMatches(readArenaMatches())
        setOwnershipFilter("Mine")
        setGameFilter(selectedGame)
        setMessage(`Quick Match created: ${created.game}. Share the room or wait for someone to join.`)
        router.push(`/arena/match/${created.id}`)
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

    try {
      const created = createArenaMatch({
        game: selectedGame,
        wager: safeWager,
        bestOf,
      })

      setMatches(readArenaMatches())
      setOwnershipFilter("Mine")
      setGameFilter(selectedGame)
      setMessage(
        `Created ${created.game} for ${created.wager} KAS. Your new room is now under My Matches.`
      )
      setWagerInput("5")
      setBestOf(1)
      setCustomMode(false)

      router.push(`/arena/match/${created.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create arena.")
    }
  }

  function handleJoinMatch(matchId: string) {
    if (walletLocked && activeWalletMatch?.id !== matchId) {
      setMessage("You already have an active match. Resume or finish it before joining another one.")
      return
    }

    try {
      const joined = joinArenaMatch(matchId)

      if (!joined) {
        setMessage("Match not found.")
        return
      }

      setMatches(readArenaMatches())
      setOwnershipFilter("Mine")
      setMessage(`Joined ${joined.game}. Countdown should now begin automatically.`)
      router.push(`/arena/match/${matchId}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to join arena.")
    }
  }

  function handleFillOpponent(matchId: string) {
    try {
      const filled = autoFillArenaMatch(matchId)

      if (!filled) {
        setMessage("Match not found.")
        return
      }

      setMatches(readArenaMatches())
      setOwnershipFilter("Mine")
      setMessage(
        `Dev fill complete: ${filled.challenger?.name ?? "Mock challenger"} joined ${filled.game}.`
      )
      router.push(`/arena/match/${matchId}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to fill opponent.")
    }
  }

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
      <div className="absolute left-[-80px] top-20 h-[340px] w-[340px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="absolute right-[-80px] top-32 h-[340px] w-[340px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1500px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-8 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_50px_rgba(0,255,200,0.05)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
                KasRoyal Arena Network
              </div>

              <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">
                Arena Lobby
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
                <strong className="text-emerald-300/90">Quick Match</strong> — free play, no wallet.{" "}
                <strong className="text-amber-300/90">Ranked Match</strong> — connect wallet, wager, and climb.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
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
                label="Live Arenas"
                value={`${liveMatches.length}`}
                accent="text-emerald-300"
              />
            </div>
          </div>
        </div>

        {activeWalletMatch ? (
          <div className="mb-6">
            <Link
              href={`/arena/match/${activeWalletMatch.id}`}
              className="flex items-center justify-center gap-3 rounded-[24px] border-2 border-emerald-400/40 bg-emerald-400/20 px-6 py-4 text-lg font-black text-emerald-100 shadow-[0_0_40px_rgba(0,255,200,0.12)] transition hover:border-emerald-300/50 hover:bg-emerald-400/30 hover:text-emerald-50"
            >
              <span className="text-2xl">🎮</span>
              Return to Active Game — {activeWalletMatch.game} ({activeWalletMatch.status})
            </Link>
          </div>
        ) : null}

        {priorityResumeMatch ? <ResumeMatchBanner match={priorityResumeMatch} /> : null}

        {activeWalletMatch ? <ActiveWalletLockBanner match={activeWalletMatch} /> : null}

        <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
          <aside className="xl:sticky xl:top-6 xl:self-start space-y-6">
            {/* Mode switcher: Quick (default) vs Ranked */}
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
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
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">Game</label>
                  <div className="mt-3 grid gap-2">
                    {(["Chess Duel", "Connect 4", "Tic-Tac-Toe"] as GameType[]).map((game) => {
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
                  disabled={walletLocked}
                  className={`w-full rounded-2xl px-5 py-4 text-base font-black transition ${
                    walletLocked
                      ? "cursor-not-allowed border border-red-300/20 bg-red-500/10 text-red-300 opacity-70"
                      : arenaMode === "quick"
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-600 text-white hover:scale-[1.01]"
                        : "bg-gradient-to-r from-amber-400 to-yellow-300 text-black hover:scale-[1.01]"
                  }`}
                >
                  {walletLocked
                    ? "Locked: Active Match"
                    : arenaMode === "quick"
                      ? "Create Quick Match (Free)"
                      : "Create Ranked Match"}
                </button>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Status</div>
                  <div className="mt-2 text-sm leading-6 text-white/85">{message}</div>
                </div>
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-fuchsia-300/15 bg-fuchsia-300/[0.04] p-5">
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.2em] text-fuchsia-300/80">
                  Ready to Enter
                </p>
                <h2 className="mt-2 text-2xl font-black">Countdown Rooms</h2>
                <p className="mt-2 text-sm text-white/60">
                  If someone joined your room, it shows here immediately so you can enter fast.
                </p>
              </div>

              <div className="grid gap-4">
                {myReadyMatches.length ? (
                  myReadyMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onJoin={handleJoinMatch}
                      onFill={handleFillOpponent}
                      walletLocked={walletLocked}
                      activeMatchId={activeWalletMatch?.id ?? null}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="No ready rooms"
                    text="When a second player joins one of your matches, it will show here."
                  />
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                    Lobby Filters
                  </p>
                  <h2 className="mt-2 text-3xl font-black">Clean Arena View</h2>
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
                {(["All", "Chess Duel", "Connect 4", "Tic-Tac-Toe"] as GameFilter[]).map(
                  (filterValue) => {
                    const active = gameFilter === filterValue
                    return (
                      <button
                        key={filterValue}
                        type="button"
                        onClick={() => setGameFilter(filterValue)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          active
                            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                        }`}
                      >
                        {filterValue}
                      </button>
                    )
                  }
                )}
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
                        active
                          ? "border-amber-300/25 bg-amber-300/10 text-amber-300"
                          : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {filterValue}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">
                    Joinable Matches
                  </p>
                  <h2 className="mt-2 text-2xl font-black">Open Seats</h2>
                  <p className="mt-1 text-sm text-white/55">
                    Quick = free, no wallet. Ranked = connect wallet to join.
                  </p>
                </div>
                <MetricCard
                  label="Open Hosted by You"
                  value={`${openHostedMatches.length}`}
                  accent="text-amber-300"
                />
              </div>

              {joinableQuickMatches.length > 0 ? (
                <div className="mb-6">
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300/90">
                    Quick Match (Free)
                  </h3>
                  <div className="grid gap-4">
                    {joinableQuickMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        onJoin={handleJoinMatch}
                        onFill={handleFillOpponent}
                        walletLocked={walletLocked}
                        activeMatchId={activeWalletMatch?.id ?? null}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {joinableRankedMatches.length > 0 ? (
                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-300/90">
                    Ranked Match (Wallet)
                  </h3>
                  <div className="grid gap-4">
                    {joinableRankedMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        onJoin={handleJoinMatch}
                        onFill={handleFillOpponent}
                        walletLocked={walletLocked}
                        activeMatchId={activeWalletMatch?.id ?? null}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {joinableMatches.length === 0 ? (
                <EmptyState
                  title="No joinable matches"
                  text="Create a Quick or Ranked match above, or wait for new open seats."
                />
              ) : null}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.2em] text-sky-300/80">My Matches</p>
                <h2 className="mt-2 text-2xl font-black">Your Rooms</h2>
              </div>

              <div className="grid gap-4">
                {myMatches.length ? (
                  myMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onJoin={handleJoinMatch}
                      onFill={handleFillOpponent}
                      walletLocked={walletLocked}
                      activeMatchId={activeWalletMatch?.id ?? null}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="No personal matches yet"
                    text="Once you create or join a room, it will appear here."
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}