"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  autoFillArenaMatch,
  clampWager,
  createArenaMatch,
  currentUser,
  formatAge,
  gameMeta,
  getArenaBettingSecondsLeft,
  getRankColors,
  joinArenaMatch,
  launchArenaMatch,
  readArenaMatches,
  subscribeArenaMatches,
  type ArenaMatch,
  type ArenaStatus,
  type GameType,
  type RankTier,
} from "@/lib/mock/arena-data"

type GameFilter = "All" | GameType
type OwnershipFilter = "All Matches" | "My Games" | "Hosted" | "Joined"
type QuickBoardFilter = "All" | "Ready" | "Live" | "Open"

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

function StatCard({
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
    <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-2 text-3xl font-black ${accent}`}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-white/45">{helper}</div> : null}
    </div>
  )
}

function StatusPill({ status }: { status: ArenaStatus }) {
  const styles =
    status === "Waiting for Opponent"
      ? "bg-emerald-400/10 text-emerald-300"
      : status === "Ready to Start"
      ? "bg-amber-300/10 text-amber-300"
      : status === "Live"
      ? "bg-red-500/10 text-red-300"
      : "bg-white/10 text-white/70"

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${styles}`}>
      {status}
    </span>
  )
}

function TinyStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-2 text-xl font-black ${accent ?? "text-white"}`}>{value}</div>
    </div>
  )
}

function MiniBoard({ game }: { game: GameType }) {
  if (game === "Chess Duel") {
    return (
      <div className="grid grid-cols-4 gap-1.5 rounded-[16px] border border-white/8 bg-black/30 p-3">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-[4px] ${
              (Math.floor(i / 4) + i) % 2 === 0 ? "bg-amber-200/20" : "bg-black/50"
            }`}
          />
        ))}
      </div>
    )
  }

  if (game === "Connect 4") {
    return (
      <div className="grid grid-cols-7 gap-1.5 rounded-[16px] border border-white/8 bg-black/30 p-3">
        {Array.from({ length: 21 }).map((_, i) => {
          const filled = [1, 3, 7, 8, 10, 12, 14, 16, 17].includes(i)
          const alt = [2, 6, 9, 11, 15, 18].includes(i)

          return (
            <div
              key={i}
              className={`aspect-square rounded-full border ${
                filled
                  ? "border-amber-200/60 bg-amber-300 shadow-[0_0_10px_rgba(255,215,0,0.12)]"
                  : alt
                  ? "border-emerald-300/60 bg-emerald-400 shadow-[0_0_10px_rgba(0,255,200,0.10)]"
                  : "border-white/5 bg-black/40"
              }`}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 rounded-[16px] border border-white/8 bg-black/30 p-3">
      {["X", "O", "X", "", "O", "", "X", "", "O"].map((cell, i) => (
        <div
          key={i}
          className={`flex aspect-square items-center justify-center rounded-lg border border-white/10 bg-black/30 text-sm font-black ${
            cell === "X" ? "text-amber-200" : cell === "O" ? "text-emerald-200" : "text-white/20"
          }`}
        >
          {cell}
        </div>
      ))}
    </div>
  )
}

function MyGamesActionStrip({
  myGamesCount,
  hostedCount,
  joinedCount,
  readyCount,
  liveCount,
  activeFilter,
  onChangeFilter,
  quickBoardFilter,
  onChangeQuickBoardFilter,
}: {
  myGamesCount: number
  hostedCount: number
  joinedCount: number
  readyCount: number
  liveCount: number
  activeFilter: OwnershipFilter
  onChangeFilter: (filter: OwnershipFilter) => void
  quickBoardFilter: QuickBoardFilter
  onChangeQuickBoardFilter: (filter: QuickBoardFilter) => void
}) {
  return (
    <div className="rounded-[28px] border border-emerald-300/12 bg-emerald-400/[0.04] p-5 shadow-[0_0_30px_rgba(0,255,200,0.04)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Fast Access</p>
          <h3 className="mt-2 text-2xl font-black">My Games Command Deck</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Jump straight to the rooms you host, the matches you joined, and the ones that are ready
            to launch or already live.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <TinyStat label="My Games" value={`${myGamesCount}`} accent="text-emerald-300" />
          <TinyStat label="Hosted" value={`${hostedCount}`} accent="text-amber-300" />
          <TinyStat label="Joined" value={`${joinedCount}`} accent="text-sky-300" />
          <TinyStat label="Ready" value={`${readyCount}`} accent="text-fuchsia-300" />
          <TinyStat label="Live" value={`${liveCount}`} accent="text-red-300" />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(["All Matches", "My Games", "Hosted", "Joined"] as OwnershipFilter[]).map((ownerFilter) => {
            const active = activeFilter === ownerFilter

            return (
              <button
                key={ownerFilter}
                type="button"
                onClick={() => onChangeFilter(ownerFilter)}
                className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                  active
                    ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                {ownerFilter}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {(["All", "Ready", "Live", "Open"] as QuickBoardFilter[]).map((statusFilter) => {
            const active = quickBoardFilter === statusFilter

            return (
              <button
                key={statusFilter}
                type="button"
                onClick={() => onChangeQuickBoardFilter(statusFilter)}
                className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                  active
                    ? "border-amber-300/25 bg-amber-300/10 text-amber-300"
                    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                {statusFilter === "All" ? "All States" : `${statusFilter} Rooms`}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function ArenaPage() {
  const [matches, setMatches] = useState<ArenaMatch[]>([])
  const [selectedGame, setSelectedGame] = useState<GameType>("Connect 4")
  const [wagerInput, setWagerInput] = useState("5")
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(1)
  const [message, setMessage] = useState(
    "Create a new arena match or join an open lobby to move toward gameplay."
  )
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<GameFilter>("All")
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("All Matches")
  const [quickBoardFilter, setQuickBoardFilter] = useState<QuickBoardFilter>("All")
  const [customMode, setCustomMode] = useState(false)
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

  const myGames = useMemo(
    () =>
      matches.filter(
        (match) => match.host.name === currentUser.name || match.challenger?.name === currentUser.name
      ),
    [matches]
  )

  const myHostedGames = useMemo(
    () => matches.filter((match) => match.host.name === currentUser.name),
    [matches]
  )

  const myJoinedGames = useMemo(
    () => matches.filter((match) => match.challenger?.name === currentUser.name),
    [matches]
  )

  const myReadyGames = useMemo(
    () =>
      myGames.filter(
        (match) =>
          match.status === "Ready to Start" ||
          (match.status === "Live" && !!match.countdownStartedAt && !match.startedAt)
      ),
    [myGames]
  )

  const myLiveGames = useMemo(
    () =>
      myGames.filter(
        (match) => match.status === "Live" && (!!match.startedAt || !match.countdownStartedAt)
      ),
    [myGames]
  )

  const filteredMatches = useMemo(() => {
    return matches
      .filter((match) => (filter === "All" ? true : match.game === filter))
      .filter((match) => {
        if (ownershipFilter === "All Matches") return true
        if (ownershipFilter === "My Games") {
          return match.host.name === currentUser.name || match.challenger?.name === currentUser.name
        }
        if (ownershipFilter === "Hosted") {
          return match.host.name === currentUser.name
        }
        if (ownershipFilter === "Joined") {
          return match.challenger?.name === currentUser.name
        }
        return true
      })
      .filter((match) => {
        if (quickBoardFilter === "All") return true
        if (quickBoardFilter === "Open") return match.status === "Waiting for Opponent"
        if (quickBoardFilter === "Ready") {
          return (
            match.status === "Ready to Start" ||
            (match.status === "Live" && !!match.countdownStartedAt && !match.startedAt)
          )
        }
        if (quickBoardFilter === "Live") {
          return match.status === "Live" && (!!match.startedAt || !match.countdownStartedAt)
        }
        return true
      })
      .filter((match) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        return (
          match.host.name.toLowerCase().includes(q) ||
          match.game.toLowerCase().includes(q) ||
          match.host.rank.toLowerCase().includes(q) ||
          (match.challenger?.name.toLowerCase().includes(q) ?? false)
        )
      })
      .sort((a, b) => {
        const score = (match: ArenaMatch) => {
          const mine = match.host.name === currentUser.name || match.challenger?.name === currentUser.name
          const ready =
            match.status === "Ready to Start" ||
            (match.status === "Live" && !!match.countdownStartedAt && !match.startedAt)
          const live = match.status === "Live" && (!!match.startedAt || !match.countdownStartedAt)

          if (mine && ready) return 5
          if (mine && live) return 4
          if (mine) return 3
          if (ready) return 2
          if (live) return 1
          return 0
        }

        const scoreDiff = score(b) - score(a)
        if (scoreDiff !== 0) return scoreDiff

        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt
        return b.spectators - a.spectators
      })
  }, [matches, search, filter, ownershipFilter, quickBoardFilter])

  const openMatches = filteredMatches.filter((match) => match.status === "Waiting for Opponent")
  const readyMatches = filteredMatches.filter(
    (match) =>
      match.status === "Ready to Start" ||
      (match.status === "Live" && !!match.countdownStartedAt && !match.startedAt)
  )
  const liveMatches = filteredMatches.filter(
    (match) => match.status === "Live" && (!!match.startedAt || !match.countdownStartedAt)
  )

  const totalOpenWager = openMatches.reduce((sum, match) => sum + match.wager, 0)

  function handleSelectCreateGame(game: GameType) {
    setSelectedGame(game)
    setFilter(game)
    setMessage(`${game} selected. Lobby now filtered to show only ${game} matches.`)
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

  function createMatch() {
    if (!Number.isFinite(Number(wagerInput)) || String(wagerInput).trim() === "") {
      setMessage("Enter a valid wager amount before creating the arena.")
      return
    }

    const safeWager = clampWager(Number(wagerInput))

    if (safeWager > currentUser.walletBalance) {
      setMessage("Insufficient KAS balance for that wager.")
      return
    }

    const created = createArenaMatch({
      game: selectedGame,
      wager: safeWager,
      bestOf,
    })

    setMatches(readArenaMatches())
    setFilter(selectedGame)
    setOwnershipFilter("My Games")
    setQuickBoardFilter("All")
    setMessage(
      `Arena created: ${created.game} • ${created.wager} KAS • Best of ${created.bestOf}. Your room is now pinned into My Games.`
    )
    setWagerInput("5")
    setCustomMode(false)
    setBestOf(1)
  }

  function joinMatch(matchId: string) {
    try {
      const joined = joinArenaMatch(matchId)

      if (!joined) {
        setMessage("Arena not found.")
        return
      }

      setMatches(readArenaMatches())
      setOwnershipFilter("My Games")
      setQuickBoardFilter("Ready")
      setMessage(
        `Seat reserved in ${joined.game}. Both players are now seated. Your joined room is now highlighted under My Games.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to join arena.")
    }
  }

  function fillOpponent(matchId: string) {
    try {
      const filled = autoFillArenaMatch(matchId)

      if (!filled) {
        setMessage("Arena not found.")
        return
      }

      setMatches(readArenaMatches())
      setOwnershipFilter("Hosted")
      setQuickBoardFilter("Ready")
      setMessage(
        `Dev fill complete: ${filled.challenger?.name ?? "Mock challenger"} joined ${filled.game}. You can now launch countdown and test the full room flow.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to auto-fill opponent.")
    }
  }

  function launchMatch(matchId: string) {
    try {
      const target = matches.find((item) => item.id === matchId)

      if (!target) {
        setMessage("Arena not found.")
        return
      }

      const currentIsParticipant =
        target.host.name === currentUser.name || target.challenger?.name === currentUser.name

      if (!currentIsParticipant) {
        setMessage("Only seated players should launch the match room.")
        return
      }

      const launched = launchArenaMatch(matchId)

      if (!launched) {
        setMessage("Arena not found.")
        return
      }

      setMatches(readArenaMatches())
      setOwnershipFilter("My Games")
      setQuickBoardFilter("Ready")
      setMessage(
        `Countdown started for ${launched.game}. Featured market eligibility is now controlled by the authoritative mock lifecycle.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to launch arena.")
    }
  }

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_20%,transparent_80%,rgba(255,255,255,0.02))]" />
      <div className="absolute left-[-80px] top-20 h-[340px] w-[340px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="absolute right-[-80px] top-32 h-[340px] w-[340px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1550px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-8 overflow-hidden rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_50px_rgba(0,255,200,0.05)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
                KasRoyal Arena Network
              </div>

              <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">Arena Lobby</h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
                Create live 1v1 skill matches, seat both players, and launch a pre-match countdown that
                opens or locks featured spectator markets automatically.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Open Lobbies" value={`${openMatches.length}`} accent="text-amber-300" />
              <StatCard label="Ready Rooms" value={`${readyMatches.length}`} accent="text-sky-300" />
              <StatCard label="Live Matches" value={`${liveMatches.length}`} accent="text-emerald-300" />
              <Link
                href="/spectate"
                className="flex items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
              >
                Go to Spectate
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <MyGamesActionStrip
            myGamesCount={myGames.length}
            hostedCount={myHostedGames.length}
            joinedCount={myJoinedGames.length}
            readyCount={myReadyGames.length}
            liveCount={myLiveGames.length}
            activeFilter={ownershipFilter}
            onChangeFilter={setOwnershipFilter}
            quickBoardFilter={quickBoardFilter}
            onChangeQuickBoardFilter={setQuickBoardFilter}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Create Match</p>
                <h2 className="mt-2 text-2xl font-black">Open a New Lobby</h2>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Player</div>
                  <div className="mt-2 text-xl font-black">{currentUser.name}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <RankBadge rank={currentUser.rank} />
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                      {currentUser.rating} MMR
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-white/55">
                    Wallet Balance:{" "}
                    <span className="font-bold text-emerald-300">
                      {currentUser.walletBalance.toFixed(2)} KAS
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
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
                              : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="text-base font-black">{game}</div>
                          <div className="mt-1 text-sm text-white/55">{gameMeta[game].subtitle}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
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
                    placeholder="Enter custom KAS amount"
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-xl font-bold text-white outline-none"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/45">
                    <span>Quick buttons or custom entry allowed</span>
                    <span>Preview: {wager} KAS</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">Match Format</label>

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

                <div className="rounded-2xl border border-emerald-300/12 bg-emerald-400/[0.04] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Selected Arena</div>
                  <div className="mt-2 text-lg font-black text-white">{selectedGame}</div>
                  <div className="mt-1 text-sm text-white/55">{gameMeta[selectedGame].subtitle}</div>
                </div>

                <button
                  onClick={createMatch}
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-base font-black text-black transition hover:scale-[1.01]"
                >
                  Create Arena Match
                </button>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">My Games Snapshot</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <TinyStat label="My Games" value={`${myGames.length}`} accent="text-emerald-300" />
                    <TinyStat label="Hosted" value={`${myHostedGames.length}`} accent="text-amber-300" />
                    <TinyStat label="Joined" value={`${myJoinedGames.length}`} accent="text-sky-300" />
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Lobby Status</div>
                  <div className="mt-2 text-sm leading-6 text-white/85">{message}</div>
                </div>
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <div className="mb-5 flex flex-col gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Active Arena Board</p>
                    <h2 className="mt-2 text-3xl font-black">Open, Ready & Live Matches</h2>
                    <p className="mt-2 text-sm text-white/55">
                      Your hosted and joined rooms are prioritized to the top so you can get back into action faster.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search host, game, rank, challenger"
                      className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(["All", "Chess Duel", "Connect 4", "Tic-Tac-Toe"] as GameFilter[]).map((gameFilter) => {
                    const active = filter === gameFilter

                    return (
                      <button
                        key={gameFilter}
                        type="button"
                        onClick={() => setFilter(gameFilter)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          active
                            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                        }`}
                      >
                        {gameFilter}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <StatCard
                  label="Open Wager Volume"
                  value={`${totalOpenWager.toFixed(0)} KAS`}
                  accent="text-amber-300"
                />
                <StatCard
                  label="Filtered Matches"
                  value={`${filteredMatches.length}`}
                  accent="text-emerald-300"
                />
                <StatCard
                  label="My Rooms"
                  value={`${myGames.length}`}
                  accent="text-sky-300"
                />
                <StatCard
                  label="Your Available Balance"
                  value={`${currentUser.walletBalance.toFixed(2)} KAS`}
                  accent="text-white"
                />
              </div>

              <div className="grid gap-4">
                {filteredMatches.length === 0 ? (
                  <div className="rounded-[24px] border border-white/8 bg-black/20 p-8 text-center text-white/55">
                    No matches found.
                  </div>
                ) : (
                  filteredMatches.map((match) => {
                    const isOpen = match.status === "Waiting for Opponent"
                    const isReady =
                      match.status === "Ready to Start" ||
                      (match.status === "Live" && !!match.countdownStartedAt && !match.startedAt)
                    const isLive = match.status === "Live" && (!!match.startedAt || !match.countdownStartedAt)
                    const meta = gameMeta[match.game]
                    const totalPot = match.playerPot
                    const isHost = match.host.name === currentUser.name
                    const isChallenger = match.challenger?.name === currentUser.name
                    const isParticipant = isHost || isChallenger
                    const countdownSeconds = getArenaBettingSecondsLeft(match)

                    const countdownLabel =
                      isReady && countdownSeconds > 0
                        ? `Bet lock in ${Math.max(0, countdownSeconds)}s`
                        : match.isFeaturedMarket && isLive
                        ? "Betting locked"
                        : match.isFeaturedMarket
                        ? "Featured market"
                        : "Watch-only"

                    const priorityLabel = isHost
                      ? "Host Control"
                      : isChallenger
                      ? "Joined Seat"
                      : isReady
                      ? "Ready Room"
                      : isLive
                      ? "Live Arena"
                      : "Open Lobby"

                    return (
                      <div
                        key={match.id}
                        className={`overflow-hidden rounded-[24px] border p-5 transition hover:bg-white/[0.03] ${
                          isParticipant
                            ? "border-emerald-300/18 bg-emerald-400/[0.03]"
                            : isReady
                            ? "border-amber-300/12 bg-amber-300/[0.03]"
                            : "border-white/8 bg-black/20"
                        }`}
                      >
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${meta.glow}`}
                              >
                                {match.game}
                              </span>
                              <StatusPill status={match.status} />
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
                                Best of {match.bestOf}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
                                {formatAge(match.createdAt)}
                              </span>
                              <span
                                className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                                  match.isFeaturedMarket
                                    ? "border-amber-300/20 bg-amber-300/10 text-amber-300"
                                    : "border-white/10 bg-white/5 text-white/70"
                                }`}
                              >
                                {countdownLabel}
                              </span>
                              <span
                                className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                                  isParticipant
                                    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-300"
                                    : isReady
                                    ? "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-300"
                                    : isLive
                                    ? "border-red-300/20 bg-red-500/10 text-red-300"
                                    : "border-white/10 bg-white/5 text-white/70"
                                }`}
                              >
                                {priorityLabel}
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
                            </div>

                            <div className="grid gap-4 2xl:grid-cols-[180px_minmax(0,1fr)]">
                              <div className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,#11110d,#0a0d0c)] p-4">
                                <MiniBoard game={match.game} />
                              </div>

                              <div>
                                <div className="grid gap-3 lg:grid-cols-2">
                                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                    <div className="text-xs uppercase tracking-[0.16em] text-white/45">Host</div>
                                    <div className="mt-2 text-2xl font-black">{match.host.name}</div>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <RankBadge rank={match.host.rank} />
                                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                                        {match.host.rating} MMR
                                      </span>
                                    </div>
                                    <div className="mt-3 text-sm text-white/55">Side: {match.hostSideLabel}</div>
                                  </div>

                                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                    <div className="text-xs uppercase tracking-[0.16em] text-white/45">Opponent Seat</div>
                                    {match.challenger ? (
                                      <>
                                        <div className="mt-2 text-2xl font-black">{match.challenger.name}</div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                          <RankBadge rank={match.challenger.rank} />
                                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                                            {match.challenger.rating} MMR
                                          </span>
                                        </div>
                                        <div className="mt-3 text-sm text-white/55">Side: {match.challengerSideLabel}</div>
                                      </>
                                    ) : (
                                      <div className="mt-2 text-lg font-black text-white/45">Waiting for challenger</div>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-5">
                                  <TinyStat label="Entry" value={`${match.wager} KAS`} accent="text-amber-300" />
                                  <TinyStat label="Total Pot" value={`${totalPot} KAS`} accent="text-emerald-300" />
                                  <TinyStat label="Spectators" value={`${match.spectators}`} accent="text-sky-300" />
                                  <TinyStat label="Type" value={match.game} accent={meta.accent} />
                                  <TinyStat
                                    label="Seat State"
                                    value={isParticipant ? "You Seated" : isOpen ? "Open Seat" : "Locked"}
                                    accent={isParticipant ? "text-emerald-300" : "text-white"}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[270px]">
                            {isOpen ? (
                              <>
                                {!isHost ? (
                                  <button
                                    type="button"
                                    onClick={() => joinMatch(match.id)}
                                    className="rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-center text-sm font-black text-black transition hover:scale-[1.01]"
                                  >
                                    Join for {match.wager} KAS
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => fillOpponent(match.id)}
                                    className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-center text-sm font-black text-black transition hover:scale-[1.01]"
                                  >
                                    Fill Opponent (Dev)
                                  </button>
                                )}
                              </>
                            ) : isReady ? (
                              <button
                                type="button"
                                onClick={() => launchMatch(match.id)}
                                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-center text-sm font-black text-black transition hover:scale-[1.01]"
                              >
                                {match.countdownStartedAt ? "Countdown Active" : "Launch Countdown"}
                              </button>
                            ) : (
                              <Link
                                href={`/arena/match/${match.id}`}
                                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-center text-sm font-black text-black transition hover:scale-[1.01]"
                              >
                                Open Live Room
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
                              View Arena Markets
                            </Link>

                            <div className="rounded-2xl border border-white/8 bg-black/25 p-4 text-sm leading-6 text-white/60">
                              {isOpen
                                ? isHost
                                  ? "You host this room. Use Fill Opponent (Dev) to seat a mock challenger instantly."
                                  : "Step 1: join the seat. Step 2: once both players are seated, launch the countdown."
                                : isReady
                                ? match.countdownStartedAt
                                  ? `Pre-match countdown is live. ${match.isFeaturedMarket ? "Featured market can accept bets until lock." : "This room is watch-only while another featured market is active for this game."}`
                                  : "Both players are locked. Launch the countdown to open any eligible featured market before gameplay begins."
                                : isLive
                                ? `Live state: ${match.moveText}`
                                : "This arena is finished."}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}