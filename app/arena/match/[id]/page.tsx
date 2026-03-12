"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import {
  clampBetAmount,
  currentUser,
  DEFAULT_BET,
  formatArenaPhase,
  getArenaBettingSecondsLeft,
  getArenaById,
  getFavoriteData,
  getMultiplier,
  getProjectedState,
  getRankColors,
  getSideShare,
  getWinProbability,
  HOUSE_RAKE,
  initialArenaMatches,
  isArenaBettable,
  MAX_BET,
  MAX_PAUSES_PER_SIDE,
  MIN_BET,
  PAUSE_DURATION_SECONDS,
  pauseArenaMatch,
  placeArenaSpectatorBet,
  readArenaMatches,
  readCurrentUserTickets,
  resumeArenaMatch,
  subscribeArenaMatches,
  subscribeSpectatorTickets,
  type ArenaMatch,
  type ArenaSide,
  type PauseState,
  type PersistedBetTicket,
  type RankTier,
  updateArenaMatch,
  WHALE_BET_THRESHOLD,
} from "@/lib/mock/arena-data"

type Connect4Cell = "host" | "challenger" | null
type TttCell = "X" | "O" | null

const CONNECT4_MOVE_SECONDS = 20
const TTT_MOVE_SECONDS = 10

const COUNTDOWN_HYPE_LINES = [
  "♞ Knights are stretching before battle...",
  "🔥 Crowd money is starting to heat up...",
  "💰 Last-minute action hitting the market...",
  "🎯 Smart money is circling the underdog...",
  "⚡ Bets are flying before lock...",
  "👑 Crowns up. Match ignition incoming...",
]

type PersistedConnect4BoardState = {
  mode: "connect4-live"
  board: Connect4Cell[][]
  turn: ArenaSide
  turnDeadlineTs: number
}

type PersistedTttBoardState = {
  mode: "ttt-live"
  board: TttCell[]
  turn: "X" | "O"
  turnDeadlineTs: number
}

type PersistedChessPreviewState = {
  mode: "chess-preview"
  fen?: string
}

type MatchBoardState =
  | PersistedConnect4BoardState
  | PersistedTttBoardState
  | PersistedChessPreviewState
  | Record<string, unknown>
  | undefined

function normalizePauseState(pauseState?: Partial<PauseState> | null): PauseState {
  return {
    isPaused: pauseState?.isPaused === true,
    pausedBy:
      pauseState?.pausedBy === "host" || pauseState?.pausedBy === "challenger"
        ? pauseState.pausedBy
        : null,
    pauseExpiresAt: Number.isFinite(pauseState?.pauseExpiresAt)
      ? Number(pauseState?.pauseExpiresAt)
      : null,
    pauseCountHost:
      typeof pauseState?.pauseCountHost === "number" && Number.isFinite(pauseState.pauseCountHost)
        ? Math.max(0, Math.floor(pauseState.pauseCountHost))
        : 0,
    pauseCountChallenger:
      typeof pauseState?.pauseCountChallenger === "number" &&
      Number.isFinite(pauseState.pauseCountChallenger)
        ? Math.max(0, Math.floor(pauseState.pauseCountChallenger))
        : 0,
  }
}

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

function StatCard({
  label,
  value,
  accent = "text-white",
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-2 text-2xl font-black ${accent}`}>{value}</div>
    </div>
  )
}

function GameBoardShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[28px] border border-white/8 bg-[#0d1110] p-6">
      <div className="mx-auto mb-6 w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-300">
        {subtitle}
      </div>

      <div className="rounded-[30px] border border-amber-300/10 bg-gradient-to-br from-[#111614] to-[#0b0f0e] p-8">
        <div className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-[26px] border border-white/8 bg-black/20 px-6 py-10 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.05),transparent_24%)]" />
          <div className="relative z-10 mb-6 text-sm uppercase tracking-[0.18em] text-white/45">
            {title}
          </div>
          <div className="relative z-10 w-full">{children}</div>
        </div>
      </div>
    </div>
  )
}

function CountdownOverlay({
  seconds,
  hostName,
  challengerName,
  hypeLine,
}: {
  seconds: number
  hostName: string
  challengerName: string
  hypeLine: string
}) {
  const tone =
    seconds <= 5
      ? "border-red-400/30 bg-red-500/10 text-red-200"
      : seconds <= 10
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[26px] border border-white/10 bg-[rgba(3,8,7,0.84)] backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_36%),radial-gradient(circle_at_bottom,rgba(251,191,36,0.10),transparent_30%)]" />
        <div className="absolute inset-0 animate-pulse bg-[linear-gradient(115deg,transparent,rgba(255,255,255,0.04),transparent)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-6 text-center">
        <div className="mb-4 inline-flex animate-pulse rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
          Match Starting Soon
        </div>

        <div className="text-4xl font-black tracking-wide text-white sm:text-5xl">
          {hostName} vs {challengerName}
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
          Betting is open right now. Lock your side before the market closes and the match goes
          live.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <div
            className={`flex h-28 w-28 items-center justify-center rounded-full border text-5xl font-black shadow-[0_0_45px_rgba(255,215,0,0.18)] ${tone}`}
          >
            {seconds}
          </div>
        </div>

        <div className="mt-6 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/85">
          {hypeLine}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-300">
            Betting Active
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80">
            Board Visible
          </div>
          <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300">
            Match Starts At Zero
          </div>
        </div>
      </div>
    </div>
  )
}

function PauseOverlay({
  seconds,
  pausedByName,
  canResume,
  onResume,
}: {
  seconds: number
  pausedByName: string
  canResume: boolean
  onResume: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[26px] border border-white/10 bg-[rgba(3,8,7,0.88)] backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.10),transparent_25%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-6 text-center">
        <div className="mb-4 inline-flex rounded-full border border-sky-300/25 bg-sky-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-sky-300">
          Match Paused
        </div>

        <div className="text-4xl font-black tracking-wide text-white sm:text-5xl">
          {pausedByName} used a pause
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
          Move clock is frozen. When the pause ends, the active player's timer resets to full time.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border border-sky-300/30 bg-sky-300/10 text-5xl font-black text-sky-200 shadow-[0_0_45px_rgba(56,189,248,0.15)]">
            {seconds}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80">
            Auto resume at zero
          </div>
          <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300">
            Timer resets on resume
          </div>
        </div>

        {canResume ? (
          <button
            type="button"
            onClick={onResume}
            className="mt-7 rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-6 py-4 text-sm font-black text-black transition hover:scale-[1.01]"
          >
            Resume Match Now
          </button>
        ) : null}
      </div>
    </div>
  )
}

function RoomPhaseBanner({
  status,
  isPlayer,
  isHostUser,
  isChallengerUser,
  bettingSecondsLeft,
  hostName,
  challengerName,
  isPaused,
  pauseSecondsLeft,
  pausedByName,
}: {
  status: ArenaMatch["status"]
  isPlayer: boolean
  isHostUser: boolean
  isChallengerUser: boolean
  bettingSecondsLeft: number
  hostName: string
  challengerName: string
  isPaused: boolean
  pauseSecondsLeft: number
  pausedByName: string
}) {
  let tone = "border-white/10 bg-white/[0.04] text-white"
  let eyebrow = "Room Status"
  let title = "Arena room loaded"
  let body = "Follow the match state here."

  if (status === "Waiting for Opponent") {
    tone = "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
    eyebrow = "Waiting Room"
    title = isHostUser ? "Your lobby is open" : "This room is waiting for an opponent"
    body = isHostUser
      ? "You created this match. Stay ready here or return to the lobby until another player joins."
      : `Once another player joins ${hostName}, this room will move into countdown automatically.`
  }

  if (status === "Ready to Start") {
    tone = "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100"
    eyebrow = "Ready To Start"
    title = isHostUser
      ? `${challengerName} joined your room`
      : isChallengerUser
        ? "You are seated and ready"
        : `${hostName} vs ${challengerName} is about to begin`
    body = isPlayer
      ? `You are already in the correct room. Stay here — the countdown is live and the match starts in ${bettingSecondsLeft}s.`
      : `Both players are seated. Betting is still open for ${bettingSecondsLeft}s, then the match goes live.`
  }

  if (status === "Live") {
    if (isPaused) {
      tone = "border-sky-300/20 bg-sky-300/10 text-sky-100"
      eyebrow = "Paused"
      title = `${pausedByName} paused the match`
      body = isPlayer
        ? `Gameplay is temporarily paused for ${pauseSecondsLeft}s. Either player can resume early, and the move timer resets on resume.`
        : `The match is paused for ${pauseSecondsLeft}s. Spectators remain in the room while gameplay is temporarily frozen.`
    } else {
      tone = "border-red-300/20 bg-red-500/10 text-red-100"
      eyebrow = "Live Match"
      title = isPlayer ? "You are in the live arena" : "This match is now live"
      body = isPlayer
        ? "Stay in this room to play or follow the live board state turn by turn."
        : "You are spectating the live room. Betting is closed and gameplay is underway."
    }
  }

  if (status === "Finished") {
    tone = "border-amber-300/20 bg-amber-300/10 text-amber-100"
    eyebrow = "Finished"
    title = "Match complete"
    body = "This arena has resolved. Review the final state, payout context, and feed below."
  }

  return (
    <div className={`mb-6 rounded-[28px] border p-5 ${tone}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.26em] opacity-80">{eyebrow}</div>
          <h2 className="mt-2 text-2xl font-black">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-85">{body}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/arena"
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
          >
            Arena Lobby
          </Link>
          <Link
            href="/spectate"
            className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/15"
          >
            Spectate
          </Link>
        </div>
      </div>
    </div>
  )
}

function makeLiveFeed(match: ArenaMatch) {
  return [
    `${match.host.name} entered the ${match.game} room.`,
    `${match.challenger ? match.challenger.name : "The challenger"} is drawing spectator attention.`,
    `Live move update: ${match.moveText}.`,
    `${match.spectators} spectators are currently tracking this arena.`,
  ]
}

function getEmptyConnect4Board(): Connect4Cell[][] {
  return Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => null))
}

function getEmptyTttBoard(): TttCell[] {
  return Array.from({ length: 9 }, () => null)
}

function isValidConnect4Board(board: unknown): board is Connect4Cell[][] {
  return (
    Array.isArray(board) &&
    board.length === 6 &&
    board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 7 &&
        row.every((cell) => cell === "host" || cell === "challenger" || cell === null)
    )
  )
}

function isValidTttBoard(board: unknown): board is TttCell[] {
  return (
    Array.isArray(board) &&
    board.length === 9 &&
    board.every((cell) => cell === "X" || cell === "O" || cell === null)
  )
}

function getConnect4Winner(board: Connect4Cell[][]): Connect4Cell {
  const rows = 6
  const cols = 7
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c]
      if (!cell) continue

      for (const [dr, dc] of directions) {
        let count = 1

        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step
          const nc = c + dc * step

          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break
          if (board[nr][nc] !== cell) break
          count++
        }

        if (count >= 4) return cell
      }
    }
  }

  return null
}

function isConnect4Full(board: Connect4Cell[][]) {
  return board.every((row) => row.every((cell) => cell !== null))
}

function getTttWinner(board: TttCell[]): TttCell {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }

  return null
}

function getConnect4State(match: ArenaMatch) {
  const boardState = match.boardState as MatchBoardState

  if (
    boardState &&
    typeof boardState === "object" &&
    "mode" in boardState &&
    boardState.mode === "connect4-live" &&
    isValidConnect4Board((boardState as PersistedConnect4BoardState).board) &&
    (((boardState as PersistedConnect4BoardState).turn === "host") ||
      (boardState as PersistedConnect4BoardState).turn === "challenger") &&
    Number.isFinite((boardState as PersistedConnect4BoardState).turnDeadlineTs)
  ) {
    return {
      board: (boardState as PersistedConnect4BoardState).board,
      turn: (boardState as PersistedConnect4BoardState).turn,
      turnDeadlineTs: (boardState as PersistedConnect4BoardState).turnDeadlineTs,
      hasPersistedState: true,
    }
  }

  return {
    board: getEmptyConnect4Board(),
    turn: "host" as ArenaSide,
    turnDeadlineTs: 0,
    hasPersistedState: false,
  }
}

function getTttState(match: ArenaMatch) {
  const boardState = match.boardState as MatchBoardState

  if (
    boardState &&
    typeof boardState === "object" &&
    "mode" in boardState &&
    boardState.mode === "ttt-live" &&
    isValidTttBoard((boardState as PersistedTttBoardState).board) &&
    (((boardState as PersistedTttBoardState).turn === "X") ||
      (boardState as PersistedTttBoardState).turn === "O") &&
    Number.isFinite((boardState as PersistedTttBoardState).turnDeadlineTs)
  ) {
    return {
      board: (boardState as PersistedTttBoardState).board,
      turn: (boardState as PersistedTttBoardState).turn,
      turnDeadlineTs: (boardState as PersistedTttBoardState).turnDeadlineTs,
      hasPersistedState: true,
    }
  }

  return {
    board: getEmptyTttBoard(),
    turn: "X" as "X" | "O",
    turnDeadlineTs: 0,
    hasPersistedState: false,
  }
}

export default function ArenaMatchPage() {
  const params = useParams<{ id: string }>()
  const matchId = typeof params?.id === "string" ? params.id : "arena-2"

  const initialMatch = getArenaById(matchId, readArenaMatches()) ?? initialArenaMatches[1]

  const [match, setMatch] = useState<ArenaMatch>(initialMatch)
  const [betAmountInput, setBetAmountInput] = useState(String(DEFAULT_BET))
  const [selectedSide, setSelectedSide] = useState<ArenaSide | null>(null)
  const [tickets, setTickets] = useState<PersistedBetTicket[]>(
    readCurrentUserTickets(currentUser.name).filter((ticket) => ticket.matchId === matchId)
  )
  const [feed, setFeed] = useState<string[]>(makeLiveFeed(initialMatch))
  const [message, setMessage] = useState(
    "Stay in this room once both players are seated. The countdown and live match flow happen here."
  )
  const [poolFlash, setPoolFlash] = useState<ArenaSide | null>(null)
  const [countdownLineIndex, setCountdownLineIndex] = useState(0)
  const [isSubmittingBet, setIsSubmittingBet] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const syncMatch = () => {
      const latest = getArenaById(matchId, readArenaMatches())
      if (!latest) return
      setMatch(latest)
    }

    syncMatch()
    const unsubscribe = subscribeArenaMatches(syncMatch)
    return unsubscribe
  }, [matchId])

  useEffect(() => {
    const syncTickets = () => {
      setTickets(readCurrentUserTickets(currentUser.name).filter((ticket) => ticket.matchId === matchId))
    }

    syncTickets()
    const unsubscribe = subscribeSpectatorTickets(syncTickets)
    return unsubscribe
  }, [matchId])

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      const latest = getArenaById(matchId, readArenaMatches())
      if (latest) {
        setMatch(latest)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [matchId])

  useEffect(() => {
    if (match.status !== "Ready to Start") return

    const interval = setInterval(() => {
      setCountdownLineIndex((value) => (value + 1) % COUNTDOWN_HYPE_LINES.length)
    }, 2200)

    return () => clearInterval(interval)
  }, [match.status])

  const betAmount = clampBetAmount(Number(betAmountInput))
  const challenger = match.challenger
  const pauseState = normalizePauseState(match.pauseState)

  const connect4State = useMemo(() => getConnect4State(match), [match])
  const tttState = useMemo(() => getTttState(match), [match])

  const connect4Board = connect4State.board
  const connect4Turn = connect4State.turn
  const connect4TurnDeadlineTs = connect4State.turnDeadlineTs
  const hasPersistedConnect4State = connect4State.hasPersistedState

  const tttBoard = tttState.board
  const tttTurn = tttState.turn
  const tttTurnDeadlineTs = tttState.turnDeadlineTs
  const hasPersistedTttState = tttState.hasPersistedState

  const connect4Winner = useMemo(() => getConnect4Winner(connect4Board), [connect4Board])
  const tttWinner = useMemo(() => getTttWinner(tttBoard), [tttBoard])
  const tttBoardFull = tttBoard.every((cell) => cell !== null)

  const isFinished = match.status === "Finished"
  const isCountdown = match.status === "Ready to Start"
  const isPaused = match.status === "Live" && pauseState.isPaused
  const isHostUser = currentUser.name === match.host.name
  const isChallengerUser = currentUser.name === challenger?.name
  const isPlayer = isHostUser || isChallengerUser
  const isSpectatorOnly = !isPlayer
  const spectatorBetLockedForPlayers = isPlayer

  const pauseSecondsLeft =
    isPaused && pauseState.pauseExpiresAt
      ? Math.max(0, Math.ceil((pauseState.pauseExpiresAt - Date.now()) / 1000))
      : 0

  const pausedByName =
    pauseState.pausedBy === "host"
      ? match.host.name
      : pauseState.pausedBy === "challenger"
        ? challenger?.name ?? "Challenger"
        : "A player"

  const totalPlayerPot = match.playerPot
  const totalSpectatorPool = match.spectatorPool.host + match.spectatorPool.challenger
  const netSpectatorPool = totalSpectatorPool * (1 - HOUSE_RAKE)
  const bettingSecondsLeft = getArenaBettingSecondsLeft(match)
  const marketOpen = isArenaBettable(match)

  const currentTurnPlayerName = isFinished
    ? "—"
    : match.game === "Connect 4"
      ? connect4Turn === "host"
        ? match.host.name
        : challenger?.name ?? "Challenger"
      : match.game === "Tic-Tac-Toe"
        ? tttTurn === "X"
          ? match.host.name
          : challenger?.name ?? "Challenger"
        : "—"

  const currentTurnSide: ArenaSide | null =
    match.game === "Connect 4"
      ? connect4Turn
      : match.game === "Tic-Tac-Toe"
        ? tttTurn === "X"
          ? "host"
          : "challenger"
        : null

  const activeTurnDeadlineTs =
    isFinished || isCountdown || isPaused
      ? 0
      : match.game === "Connect 4"
        ? connect4TurnDeadlineTs
        : match.game === "Tic-Tac-Toe"
          ? tttTurnDeadlineTs
          : 0

  const moveSecondsLeft =
    match.status === "Live" && !isPaused && activeTurnDeadlineTs > 0
      ? Math.max(0, Math.ceil((activeTurnDeadlineTs - Date.now()) / 1000))
      : 0

  const canHostMove =
    !isFinished &&
    !isCountdown &&
    !isPaused &&
    match.status === "Live" &&
    ((match.game === "Connect 4" && connect4Turn === "host") ||
      (match.game === "Tic-Tac-Toe" && tttTurn === "X"))

  const canChallengerMove =
    !isFinished &&
    !isCountdown &&
    !isPaused &&
    match.status === "Live" &&
    ((match.game === "Connect 4" && connect4Turn === "challenger") ||
      (match.game === "Tic-Tac-Toe" && tttTurn === "O"))

  const canCurrentUserMove =
    !isFinished &&
    !isCountdown &&
    !isPaused &&
    moveSecondsLeft > 0 &&
    ((isHostUser && canHostMove) || (isChallengerUser && canChallengerMove))

  const currentUserSide: ArenaSide | null = isHostUser
    ? "host"
    : isChallengerUser
      ? "challenger"
      : null

  const currentUserPausesUsed =
    currentUserSide === "host"
      ? pauseState.pauseCountHost
      : currentUserSide === "challenger"
        ? pauseState.pauseCountChallenger
        : 0

  const currentUserPausesLeft =
    currentUserSide === null
      ? 0
      : Math.max(0, MAX_PAUSES_PER_SIDE - currentUserPausesUsed)

  const canPauseCurrentUser =
    !!currentUserSide &&
    !!challenger &&
    match.status === "Live" &&
    !isPaused &&
    match.game !== "Chess Duel" &&
    currentTurnSide === currentUserSide &&
    currentUserPausesLeft > 0

  const canResumeCurrentUser =
    !!currentUserSide && !!challenger && match.status === "Live" && isPaused

  const playerRoleLabel = isHostUser
    ? `Player • ${match.hostSideLabel}`
    : isChallengerUser
      ? `Player • ${match.challengerSideLabel}`
      : "Spectator Only"

  const hostProbability = challenger ? getWinProbability(match.host.rating, challenger.rating) : 0.5
  const challengerProbability = challenger
    ? getWinProbability(challenger.rating, match.host.rating)
    : 0.5

  const favoriteData = challenger
    ? getFavoriteData(match.host.rating, challenger.rating)
    : { leftLabel: "Waiting", rightLabel: "Waiting", favorite: "even", edge: 0 }

  const hostCurrentMultiplier = getMultiplier(
    match.spectatorPool.host,
    match.spectatorPool.challenger,
    "host"
  )
  const challengerCurrentMultiplier = getMultiplier(
    match.spectatorPool.host,
    match.spectatorPool.challenger,
    "challenger"
  )

  const hostProjection = getProjectedState(
    match.spectatorPool.host,
    match.spectatorPool.challenger,
    "host",
    betAmount
  )

  const challengerProjection = getProjectedState(
    match.spectatorPool.host,
    match.spectatorPool.challenger,
    "challenger",
    betAmount
  )

  const hostShare = getSideShare(match.spectatorPool.host, match.spectatorPool.challenger, "host")
  const challengerShare = getSideShare(
    match.spectatorPool.host,
    match.spectatorPool.challenger,
    "challenger"
  )

  const myHostTickets = tickets.filter((ticket) => ticket.side === "host")
  const myChallengerTickets = tickets.filter((ticket) => ticket.side === "challenger")

  const myHostExposure = myHostTickets.reduce((sum, ticket) => sum + ticket.amount, 0)
  const myChallengerExposure = myChallengerTickets.reduce((sum, ticket) => sum + ticket.amount, 0)

  const myExistingSide: ArenaSide | null =
    myHostExposure > 0 ? "host" : myChallengerExposure > 0 ? "challenger" : null

  const selectedProjection = selectedSide === "host" ? hostProjection : challengerProjection
  const selectedPlayerName =
    selectedSide === "host"
      ? match.host.name
      : selectedSide === "challenger"
        ? challenger?.name ?? "Opponent"
        : "None"

  const oppositePoolForSelectedSide =
    selectedSide === "host"
      ? match.spectatorPool.challenger
      : selectedSide === "challenger"
        ? match.spectatorPool.host
        : 0

  const selectedProjectedProfit =
    selectedSide && oppositePoolForSelectedSide > 0
      ? Math.max(0, selectedProjection.payout - betAmount)
      : 0

  const canBetSelectedSide =
    !!selectedSide &&
    (!myExistingSide || myExistingSide === selectedSide) &&
    !spectatorBetLockedForPlayers

  const marketNeedsOpposingLiquidity = selectedSide !== null && oppositePoolForSelectedSide <= 0
  const recentTickets = [...tickets].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)

  function persistPartialMatch(partial: Partial<ArenaMatch>) {
    const updated = updateArenaMatch(match.id, (current) => ({
      ...current,
      ...partial,
    }))

    if (updated) {
      setMatch(updated)
    }
  }

  function persistConnect4Board(
    board: Connect4Cell[][],
    turn: ArenaSide,
    turnDeadlineTs: number,
    partial?: Partial<ArenaMatch>
  ) {
    const updated = updateArenaMatch(match.id, (current) => ({
      ...current,
      ...partial,
      boardState: {
        mode: "connect4-live",
        board,
        turn,
        turnDeadlineTs,
      },
    }))

    if (updated) {
      setMatch(updated)
    }
  }

  function persistTttBoard(
    board: TttCell[],
    turn: "X" | "O",
    turnDeadlineTs: number,
    partial?: Partial<ArenaMatch>
  ) {
    const updated = updateArenaMatch(match.id, (current) => ({
      ...current,
      ...partial,
      boardState: {
        mode: "ttt-live",
        board,
        turn,
        turnDeadlineTs,
      },
    }))

    if (updated) {
      setMatch(updated)
    }
  }

  function handleSelectBetSide(side: ArenaSide) {
    if (spectatorBetLockedForPlayers) {
      setMessage("Players cannot bet on their own match. Only spectators can place arena bets.")
      return
    }

    if (myExistingSide && myExistingSide !== side) {
      const lockedSideName =
        myExistingSide === "host" ? match.host.name : challenger?.name ?? "Opponent"
      setMessage(
        `You already hold a position on ${lockedSideName}. KasRoyal v1 allows one side per match.`
      )
      return
    }

    setSelectedSide(side)

    const sideName = side === "host" ? match.host.name : challenger?.name ?? "Opponent"
    const oppositePool = side === "host" ? match.spectatorPool.challenger : match.spectatorPool.host

    if (oppositePool <= 0) {
      setMessage(
        `Selected ${sideName}. No opposing liquidity exists yet, so current projected profit is 0 KAS until bets arrive on the other side.`
      )
      return
    }

    setMessage(`Selected ${sideName}. Add to your position before lock if you want more exposure.`)
  }

  async function placeBet() {
    if (spectatorBetLockedForPlayers) {
      setMessage("Players cannot bet on their own match. Spectator betting is for non-participants only.")
      return
    }

    if (!marketOpen) {
      setMessage("Betting is closed for this match.")
      return
    }

    if (!challenger) {
      setMessage("You can't place spectator bets until both players are in the match.")
      return
    }

    if (!selectedSide) {
      setMessage("Select a side before placing a spectator bet.")
      return
    }

    if (myExistingSide && myExistingSide !== selectedSide) {
      const lockedSideName = myExistingSide === "host" ? match.host.name : challenger.name
      setMessage(
        `You already hold a position on ${lockedSideName}. You can add to that side before lock, but you cannot bet both sides in the same match.`
      )
      return
    }

    if (betAmount > currentUser.walletBalance) {
      setMessage("Insufficient KAS balance for that spectator bet.")
      return
    }

    try {
      setIsSubmittingBet(true)

      await placeArenaSpectatorBet({
        matchId: match.id,
        side: selectedSide,
        amount: betAmount,
        user: currentUser.name,
        walletAddress: currentUser.name,
      })

      const selectedPlayer = selectedSide === "host" ? match.host.name : challenger.name
      const projection = selectedSide === "host" ? hostProjection : challengerProjection
      const oppositePool =
        selectedSide === "host" ? match.spectatorPool.challenger : match.spectatorPool.host

      setPoolFlash(selectedSide)
      setTimeout(() => setPoolFlash(null), 700)

      setFeed((prev) => {
        const whale = betAmount >= WHALE_BET_THRESHOLD
        const isAddToPosition = myExistingSide === selectedSide
        const prefix = isAddToPosition ? "➕ Position Added" : whale ? "🔥 WHALE BET" : "⚡ Spectator Bet"
        const line = `${prefix}: ${betAmount} KAS on ${selectedPlayer}`
        return [line, ...prev].slice(0, 12)
      })

      setBetAmountInput(String(DEFAULT_BET))

      if (oppositePool <= 0) {
        setMessage(
          `Position added: ${betAmount} KAS on ${selectedPlayer}. Opposing liquidity is still empty, so projected profit remains 0 KAS until bets arrive on the other side.`
        )
        return
      }

      setMessage(
        `Position added: ${betAmount} KAS on ${selectedPlayer}. Projected return: ${projection.multiplier.toFixed(
          2
        )}x. Estimated payout if correct: ${projection.payout.toFixed(2)} KAS after rake.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to place spectator bet.")
    } finally {
      setIsSubmittingBet(false)
    }
  }

  function handlePauseMatch() {
    if (!currentUserSide) {
      setMessage("Only seated players can pause a live match.")
      return
    }

    try {
      const updated = pauseArenaMatch(match.id, currentUserSide)
      if (updated) {
        setMatch(updated)
        const actor = currentUserSide === "host" ? match.host.name : challenger?.name ?? "Challenger"
        setFeed((prev) => [`⏸ ${actor} used a pause`, ...prev].slice(0, 12))
        setMessage(
          `Pause started. ${actor} used one of their ${MAX_PAUSES_PER_SIDE} pauses. Match will auto-resume in ${PAUSE_DURATION_SECONDS}s or can be resumed early.`
        )
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to pause match.")
    }
  }

  function handleResumeMatch() {
    const resumedBy = currentUserSide ?? "system"

    try {
      const updated = resumeArenaMatch(match.id, resumedBy)
      if (updated) {
        setMatch(updated)
        const actor =
          currentUserSide === "host"
            ? match.host.name
            : currentUserSide === "challenger"
              ? challenger?.name ?? "Challenger"
              : "System"
        setFeed((prev) => [`▶ ${actor} resumed the match`, ...prev].slice(0, 12))
        setMessage("Match resumed. Active player's turn timer has been reset to full time.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to resume match.")
    }
  }

  function dropConnect4(col: number) {
    if (match.game !== "Connect 4") return
    if (isFinished) return
    if (isCountdown) {
      setMessage("Countdown active. Betting is open and the board unlocks at match start.")
      return
    }
    if (isPaused) {
      setMessage("Match is paused. Resume to continue gameplay.")
      return
    }
    if (connect4Winner) return
    if (isConnect4Full(connect4Board)) return
    if (match.status !== "Live") return

    if (isSpectatorOnly) {
      setMessage("Spectating only. You are not seated in this match.")
      return
    }

    if (!canCurrentUserMove) {
      setMessage(`It is not your turn. Current turn: ${currentTurnPlayerName}.`)
      return
    }

    const next = connect4Board.map((row) => [...row])
    let placed = false

    for (let row = next.length - 1; row >= 0; row--) {
      if (next[row][col] === null) {
        next[row][col] = connect4Turn
        placed = true
        break
      }
    }

    if (!placed) return

    const playerLabel = connect4Turn === "host" ? match.host.name : challenger?.name ?? "Challenger"
    setFeed((prev) => [`🎮 ${playerLabel} dropped in column ${col + 1}`, ...prev].slice(0, 12))

    const winner = getConnect4Winner(next)
    if (winner) {
      const winnerName = winner === "host" ? match.host.name : challenger?.name ?? "Challenger"
      persistConnect4Board(next, connect4Turn, 0, {
        status: "Finished",
        result: winner,
        moveText: `${winnerName} wins`,
        statusText: "Connect 4 resolved",
        finishedAt: Date.now(),
      })
      setMessage(`${winnerName} wins the Connect 4 round.`)
      return
    }

    if (isConnect4Full(next)) {
      persistConnect4Board(next, connect4Turn, 0, {
        status: "Finished",
        result: "draw",
        moveText: "Board filled",
        statusText: "Draw",
        finishedAt: Date.now(),
      })
      setMessage("Connect 4 round ended in a draw.")
      return
    }

    const nextTurn = connect4Turn === "host" ? "challenger" : "host"

    persistConnect4Board(next, nextTurn, Date.now() + CONNECT4_MOVE_SECONDS * 1000, {
      moveText: `Column ${col + 1}`,
      statusText:
        nextTurn === "host"
          ? `${match.host.name} to move`
          : `${challenger?.name ?? "Challenger"} to move`,
    })
  }

  function playTtt(index: number) {
    if (match.game !== "Tic-Tac-Toe") return
    if (isFinished) return
    if (isCountdown) {
      setMessage("Countdown active. Betting is open and the board unlocks at match start.")
      return
    }
    if (isPaused) {
      setMessage("Match is paused. Resume to continue gameplay.")
      return
    }
    if (tttWinner) return
    if (tttBoard[index] !== null) return
    if (match.status !== "Live") return

    if (isSpectatorOnly) {
      setMessage("Spectating only. You are not seated in this match.")
      return
    }

    if (!canCurrentUserMove) {
      setMessage(`It is not your turn. Current turn: ${currentTurnPlayerName}.`)
      return
    }

    const next = [...tttBoard]
    next[index] = tttTurn

    const playerLabel = tttTurn === "X" ? match.host.name : challenger?.name ?? "Challenger"
    setFeed((prev) => [`🎮 ${playerLabel} marked ${index + 1}`, ...prev].slice(0, 12))

    const winner = getTttWinner(next)
    if (winner) {
      const winnerName = winner === "X" ? match.host.name : challenger?.name ?? "Challenger"
      persistTttBoard(next, tttTurn, 0, {
        status: "Finished",
        result: winner === "X" ? "host" : "challenger",
        moveText: `${winnerName} wins`,
        statusText: "Tic-Tac-Toe resolved",
        finishedAt: Date.now(),
      })
      setMessage(`${winnerName} wins the Tic-Tac-Toe round.`)
      return
    }

    if (next.every((cell) => cell !== null)) {
      persistTttBoard(next, tttTurn, 0, {
        status: "Finished",
        result: "draw",
        moveText: "Board filled",
        statusText: "Draw",
        finishedAt: Date.now(),
      })
      setMessage("Tic-Tac-Toe ended in a draw.")
      return
    }

    const nextTurn = tttTurn === "X" ? "O" : "X"

    persistTttBoard(next, nextTurn, Date.now() + TTT_MOVE_SECONDS * 1000, {
      moveText: `Cell ${index + 1}`,
      statusText:
        nextTurn === "X"
          ? `${match.host.name} to move`
          : `${challenger?.name ?? "Challenger"} to move`,
    })
  }

  function resetCurrentGame() {
    if (isSpectatorOnly) {
      setMessage("Only seated players should reset a playable board.")
      return
    }

    if (match.game === "Connect 4") {
      persistConnect4Board(getEmptyConnect4Board(), "host", Date.now() + CONNECT4_MOVE_SECONDS * 1000, {
        status: "Live",
        result: null,
        finishedAt: undefined,
        moveText: "New round",
        statusText: `${match.host.name} to move`,
      })
      setMessage("Connect 4 board reset to a fresh empty game.")
      return
    }

    if (match.game === "Tic-Tac-Toe") {
      persistTttBoard(getEmptyTttBoard(), "X", Date.now() + TTT_MOVE_SECONDS * 1000, {
        status: "Live",
        result: null,
        finishedAt: undefined,
        moveText: "New round",
        statusText: `${match.host.name} to move`,
      })
      setMessage("Tic-Tac-Toe board reset to a fresh empty game.")
      return
    }

    persistPartialMatch({
      status: "Live",
      result: null,
      finishedAt: undefined,
      moveText: "Fresh preview",
      statusText: "Chess preview reset",
      boardState: {
        mode: "chess-preview",
        fen: "startpos",
      },
    })
    setMessage("Chess preview reset.")
  }

  useEffect(() => {
    if (match.status !== "Live") return
    if (!challenger) return

    if (match.game === "Connect 4" && !hasPersistedConnect4State) {
      persistConnect4Board(getEmptyConnect4Board(), "host", Date.now() + CONNECT4_MOVE_SECONDS * 1000, {
        moveText: "New round",
        statusText: `${match.host.name} to move`,
      })
      setMessage("Fresh Connect 4 game initialized.")
      return
    }

    if (match.game === "Tic-Tac-Toe" && !hasPersistedTttState) {
      persistTttBoard(getEmptyTttBoard(), "X", Date.now() + TTT_MOVE_SECONDS * 1000, {
        moveText: "New round",
        statusText: `${match.host.name} to move`,
      })
      setMessage("Fresh Tic-Tac-Toe game initialized.")
    }
  }, [match, challenger, hasPersistedConnect4State, hasPersistedTttState])

  const boardTurnLabel = isFinished
    ? "—"
    : isCountdown
      ? "Countdown"
      : isPaused
        ? "Paused"
        : match.game === "Connect 4"
          ? connect4Turn === "host"
            ? match.host.name
            : challenger?.name ?? "Challenger"
          : match.game === "Tic-Tac-Toe"
            ? tttTurn === "X"
              ? match.host.name
              : challenger?.name ?? "Challenger"
            : "—"

  const boardClockLabel = isFinished
    ? "—"
    : isCountdown
      ? `${bettingSecondsLeft}s`
      : isPaused
        ? `${pauseSecondsLeft}s`
        : match.status === "Live"
          ? `${moveSecondsLeft}s`
          : "—"

  const boardStateLabel =
    match.status === "Finished"
      ? "Finished"
      : isPaused
        ? "Paused"
        : isCountdown
          ? "Starting Soon"
          : match.game === "Connect 4"
            ? connect4Winner
              ? "Win"
              : isConnect4Full(connect4Board)
                ? "Draw"
                : "Live"
            : match.game === "Tic-Tac-Toe"
              ? tttWinner
                ? "Win"
                : tttBoardFull
                  ? "Draw"
                  : "Live"
              : "Preview"

  const countdownLine = COUNTDOWN_HYPE_LINES[countdownLineIndex]

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_20%,transparent_80%,rgba(255,255,255,0.02))]" />

      <div className="relative z-10 mx-auto max-w-[1700px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/8">
          <div className="whitespace-nowrap py-3 text-sm font-semibold text-emerald-200">
            <div className="animate-[marquee_24s_linear_infinite] [@keyframes_marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}]">
              {feed.join("   •   ")}
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_50px_rgba(0,255,200,0.05)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
                KasRoyal Live Match Room
              </div>

              <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">
                {match.game}
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
                Stay in the match room from the moment both players are seated. Watch the countdown,
                enjoy the pre-match hype, and jump right into the live game when the match starts.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-6">
              <StatCard label="Phase" value={formatArenaPhase(match.status)} accent="text-emerald-300" />
              <StatCard label="Player Pot" value={`${totalPlayerPot} KAS`} accent="text-amber-300" />
              <StatCard label="Spectators" value={`${match.spectators}`} accent="text-sky-300" />
              <StatCard
                label="Role"
                value={playerRoleLabel}
                accent={isSpectatorOnly ? "text-white" : "text-emerald-300"}
              />
              <StatCard
                label="Timer"
                value={
                  isCountdown
                    ? `${bettingSecondsLeft}s`
                    : isPaused
                      ? `${pauseSecondsLeft}s`
                      : match.status === "Live"
                        ? activeTurnDeadlineTs > 0
                          ? `${moveSecondsLeft}s`
                          : "—"
                        : "—"
                }
                accent={
                  isPaused
                    ? "text-sky-300"
                    : isCountdown
                      ? "text-emerald-300"
                      : moveSecondsLeft <= 5 && match.status === "Live"
                        ? "text-red-300"
                        : "text-amber-300"
                }
              />
              <Link
                href="/spectate"
                className="flex items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
              >
                Go to Spectate
              </Link>
            </div>
          </div>
        </div>

        <RoomPhaseBanner
          status={match.status}
          isPlayer={isPlayer}
          isHostUser={isHostUser}
          isChallengerUser={isChallengerUser}
          bettingSecondsLeft={bettingSecondsLeft}
          hostName={match.host.name}
          challengerName={challenger?.name ?? "Opponent"}
          isPaused={isPaused}
          pauseSecondsLeft={pauseSecondsLeft}
          pausedByName={pausedByName}
        />

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_390px]">
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Player One</p>
              <div className="mt-4 text-3xl font-black">{match.host.name}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <RankBadge rank={match.host.rank} />
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                  {favoriteData.leftLabel}
                </span>
              </div>

              <div className="mt-3 text-sm text-white/55">Side: {match.hostSideLabel}</div>

              <div className="mt-5 grid gap-3">
                <StatCard label="MMR" value={`${match.host.rating}`} />
                <StatCard label="Win Rate" value={`${match.host.winRate}%`} />
                <StatCard label="Last 10" value={match.host.last10} />
              </div>
            </div>

            {challenger ? (
              <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Player Two</p>
                <div className="mt-4 text-3xl font-black">{challenger.name}</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <RankBadge rank={challenger.rank} />
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                    {favoriteData.rightLabel}
                  </span>
                </div>

                <div className="mt-3 text-sm text-white/55">Side: {match.challengerSideLabel}</div>

                <div className="mt-5 grid gap-3">
                  <StatCard label="MMR" value={`${challenger.rating}`} />
                  <StatCard label="Win Rate" value={`${challenger.winRate}%`} />
                  <StatCard label="Last 10" value={challenger.last10} />
                </div>
              </div>
            ) : null}

            {match.status === "Live" && match.game !== "Chess Duel" && isPlayer ? (
              <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Pause Control</p>

                <div className="mt-4 grid gap-3">
                  <StatCard
                    label="Your Pauses Left"
                    value={`${currentUserPausesLeft}/${MAX_PAUSES_PER_SIDE}`}
                    accent="text-sky-300"
                  />
                  <StatCard
                    label="Pause Duration"
                    value={`${PAUSE_DURATION_SECONDS}s`}
                    accent="text-emerald-300"
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-white/8 bg-black/25 p-4 text-sm leading-6 text-white/70">
                  You can pause only on your own turn. Either player can resume early. After a pause,
                  the active move timer resets to full time.
                </div>

                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={handlePauseMatch}
                    disabled={!canPauseCurrentUser}
                    className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-4 text-sm font-black text-sky-200 transition hover:bg-sky-300/15 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Pause Match
                  </button>

                  <button
                    type="button"
                    onClick={handleResumeMatch}
                    disabled={!canResumeCurrentUser}
                    className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-4 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Resume Match
                  </button>
                </div>
              </div>
            ) : null}
          </aside>

          <section className="space-y-6">
            <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_40px_rgba(0,255,200,0.05)]">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Live Arena Board</p>
                  <h2 className="mt-2 text-3xl font-black">
                    {match.host.name}
                    {challenger ? ` vs ${challenger.name}` : " vs Waiting Opponent"}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full bg-white/5 px-4 py-3 text-sm font-semibold text-white/75">
                    Best of {match.bestOf}
                  </div>
                  <div
                    className={`rounded-full px-4 py-3 text-sm font-bold ${
                      match.status === "Live"
                        ? isPaused
                          ? "bg-sky-300/10 text-sky-300"
                          : "bg-red-500/10 text-red-300"
                        : match.status === "Waiting for Opponent" || match.status === "Ready to Start"
                          ? "bg-amber-400/10 text-amber-300"
                          : "bg-emerald-400/10 text-emerald-300"
                    }`}
                  >
                    {isPaused ? "Paused" : formatArenaPhase(match.status)}
                  </div>
                  <div
                    className={`rounded-full px-4 py-3 text-sm font-bold ${
                      marketOpen ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-white/75"
                    }`}
                  >
                    {marketOpen ? `Betting open • ${bettingSecondsLeft}s left` : "Betting closed"}
                  </div>
                  <div
                    className={`rounded-full px-4 py-3 text-sm font-bold ${
                      isPaused
                        ? "bg-sky-300/10 text-sky-300"
                        : isCountdown
                          ? "bg-fuchsia-300/10 text-fuchsia-300"
                          : match.status === "Live" && moveSecondsLeft <= 5
                            ? "bg-red-500/10 text-red-300"
                            : "bg-amber-400/10 text-amber-300"
                    }`}
                  >
                    {isPaused
                      ? `Pause • ${pauseSecondsLeft}s`
                      : isCountdown
                        ? `Starts in ${bettingSecondsLeft}s`
                        : match.status === "Live"
                          ? `Move timer • ${moveSecondsLeft}s`
                          : "Move timer idle"}
                  </div>
                  <button
                    type="button"
                    onClick={resetCurrentGame}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    Reset Board
                  </button>
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-white/8 bg-black/25 p-4 text-sm leading-6 text-white/80">
                {isFinished
                  ? `Match finished. Final state: ${match.statusText}.`
                  : isCountdown
                    ? isPlayer
                      ? `You are seated in this room. Stay here — the countdown is active and the match begins in ${bettingSecondsLeft}s.`
                      : `Match starts in ${bettingSecondsLeft}s. Betting remains open until lock, then the arena goes live.`
                    : isPaused
                      ? `Pause active. ${pausedByName} paused the match. Gameplay is frozen for ${pauseSecondsLeft}s unless resumed early.`
                      : isSpectatorOnly
                        ? "You are spectating this room. You can watch the live game here."
                        : canCurrentUserMove
                          ? `Your turn. You are seated as ${playerRoleLabel}.`
                          : `You are seated as ${playerRoleLabel}, but it is currently ${currentTurnPlayerName}'s turn.`}
              </div>

              {match.game === "Connect 4" ? (
                <GameBoardShell title="Playable Connect 4" subtitle={match.statusText}>
                  {isCountdown && challenger ? (
                    <CountdownOverlay
                      seconds={bettingSecondsLeft}
                      hostName={match.host.name}
                      challengerName={challenger.name}
                      hypeLine={countdownLine}
                    />
                  ) : null}

                  {isPaused ? (
                    <PauseOverlay
                      seconds={pauseSecondsLeft}
                      pausedByName={pausedByName}
                      canResume={canResumeCurrentUser}
                      onResume={handleResumeMatch}
                    />
                  ) : null}

                  <div className="mb-5 grid w-full max-w-4xl grid-cols-7 gap-2">
                    {Array.from({ length: 7 }).map((_, col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => dropConnect4(col)}
                        disabled={
                          isCountdown ||
                          isPaused ||
                          match.status !== "Live" ||
                          connect4Winner !== null ||
                          !canCurrentUserMove
                        }
                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08] disabled:opacity-40"
                      >
                        Drop
                      </button>
                    ))}
                  </div>

                  <div className="grid w-full max-w-4xl grid-cols-7 gap-2 rounded-[24px] border border-emerald-300/14 bg-[#07100e] p-4 shadow-[inset_0_0_24px_rgba(0,255,200,0.08)]">
                    {connect4Board.map((row, r) =>
                      row.map((cell, c) => (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          onClick={() => dropConnect4(c)}
                          disabled={
                            isCountdown ||
                            isPaused ||
                            match.status !== "Live" ||
                            connect4Winner !== null ||
                            !canCurrentUserMove
                          }
                          className={`aspect-square rounded-full border ${
                            cell === "host"
                              ? "border-amber-200/70 bg-amber-300 shadow-[0_0_14px_rgba(255,215,0,0.18)]"
                              : cell === "challenger"
                                ? "border-emerald-300/70 bg-emerald-400 shadow-[0_0_14px_rgba(0,255,200,0.18)]"
                                : "border-white/5 bg-black/45"
                          } disabled:opacity-90`}
                        />
                      ))
                    )}
                  </div>

                  <div className="mt-8 grid w-full max-w-4xl gap-4 md:grid-cols-5">
                    <StatCard label="Host MMR" value={`${match.host.rating}`} />
                    <StatCard label="Challenger MMR" value={`${challenger ? challenger.rating : 0}`} />
                    <StatCard label="Turn" value={boardTurnLabel} accent="text-emerald-300" />
                    <StatCard
                      label="Clock"
                      value={boardClockLabel}
                      accent={
                        isPaused
                          ? "text-sky-300"
                          : isCountdown
                            ? "text-fuchsia-300"
                            : !isFinished && moveSecondsLeft <= 5
                              ? "text-red-300"
                              : "text-amber-300"
                      }
                    />
                    <StatCard label="State" value={boardStateLabel} accent="text-amber-300" />
                  </div>
                </GameBoardShell>
              ) : match.game === "Tic-Tac-Toe" ? (
                <GameBoardShell title="Playable Tic-Tac-Toe" subtitle={match.statusText}>
                  {isCountdown && challenger ? (
                    <CountdownOverlay
                      seconds={bettingSecondsLeft}
                      hostName={match.host.name}
                      challengerName={challenger.name}
                      hypeLine={countdownLine}
                    />
                  ) : null}

                  {isPaused ? (
                    <PauseOverlay
                      seconds={pauseSecondsLeft}
                      pausedByName={pausedByName}
                      canResume={canResumeCurrentUser}
                      onResume={handleResumeMatch}
                    />
                  ) : null}

                  <div className="grid w-full max-w-[420px] grid-cols-3 gap-3">
                    {tttBoard.map((cell, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => playTtt(index)}
                        disabled={
                          isCountdown ||
                          isPaused ||
                          cell !== null ||
                          match.status !== "Live" ||
                          tttWinner !== null ||
                          !canCurrentUserMove
                        }
                        className={`aspect-square rounded-[24px] border border-white/10 bg-black/35 text-4xl font-black transition hover:bg-white/[0.05] disabled:opacity-70 ${
                          cell === "X" ? "text-amber-200" : cell === "O" ? "text-emerald-200" : "text-white/20"
                        }`}
                      >
                        {cell ?? ""}
                      </button>
                    ))}
                  </div>

                  <div className="mt-8 grid w-full max-w-4xl gap-4 md:grid-cols-5">
                    <StatCard label={`Host ${match.hostSideLabel}`} value="X" accent="text-amber-300" />
                    <StatCard label={`Challenger ${match.challengerSideLabel}`} value="O" accent="text-emerald-300" />
                    <StatCard label="Turn" value={boardTurnLabel} accent="text-sky-300" />
                    <StatCard
                      label="Clock"
                      value={boardClockLabel}
                      accent={
                        isPaused
                          ? "text-sky-300"
                          : isCountdown
                            ? "text-fuchsia-300"
                            : !isFinished && moveSecondsLeft <= 5
                              ? "text-red-300"
                              : "text-amber-300"
                      }
                    />
                    <StatCard label="State" value={boardStateLabel} accent="text-amber-300" />
                  </div>
                </GameBoardShell>
              ) : (
                <GameBoardShell title="Chess Match Preview" subtitle={match.statusText}>
                  {isCountdown && challenger ? (
                    <CountdownOverlay
                      seconds={bettingSecondsLeft}
                      hostName={match.host.name}
                      challengerName={challenger.name}
                      hypeLine={countdownLine}
                    />
                  ) : null}

                  <div className="grid w-full max-w-[520px] grid-cols-8 gap-1 rounded-[20px] border border-white/8 bg-black/30 p-4">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div
                        key={i}
                        className={`aspect-square rounded-[4px] ${
                          (Math.floor(i / 8) + i) % 2 === 0 ? "bg-amber-200/20" : "bg-black/50"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="mt-8 grid w-full max-w-4xl gap-4 md:grid-cols-4">
                    <StatCard label="Host MMR" value={`${match.host.rating}`} />
                    <StatCard label="Challenger MMR" value={`${challenger ? challenger.rating : 0}`} />
                    <StatCard label="Live Move" value={match.moveText} accent="text-emerald-300" />
                    <StatCard
                      label="State"
                      value={match.status === "Finished" ? "Finished" : isCountdown ? "Starting Soon" : "Preview"}
                      accent="text-amber-300"
                    />
                  </div>

                  <div className="mt-8 max-w-3xl rounded-[22px] border border-white/8 bg-black/25 px-6 py-5 text-center text-white/75">
                    Chess room is staged as a premium preview right now. Connect 4 and Tic-Tac-Toe are the
                    first playable game rooms. Chess should be the next dedicated gameplay build.
                  </div>
                </GameBoardShell>
              )}
            </div>

            <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_30px_rgba(255,200,80,0.04)]">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Spectator Market</p>
                  <h3 className="mt-2 text-3xl font-black">Live Arena Betting</h3>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <StatCard
                    label="Total Spectator Pool"
                    value={`${totalSpectatorPool.toFixed(0)} KAS`}
                    accent="text-amber-300"
                  />
                  <StatCard
                    label="Net Pool After Rake"
                    value={`${netSpectatorPool.toFixed(2)} KAS`}
                    accent="text-emerald-300"
                  />
                </div>
              </div>

              {spectatorBetLockedForPlayers ? (
                <div className="mb-5 rounded-[28px] border border-red-300/20 bg-red-500/[0.05] p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
                        Player Betting Locked
                      </div>
                      <div className="mt-2 text-2xl font-black text-white">
                        You cannot bet on your own match
                      </div>
                      <div className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
                        Active players are blocked from using the spectator market in their own arena.
                        Only non-participating spectators can place bets on this match.
                      </div>
                    </div>

                    <Link
                      href="/spectate"
                      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition hover:bg-white/10"
                    >
                      Open Spectate
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="mb-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">KasRoyal v1 Rule</div>
                  <div className="mt-2 text-lg font-black text-white">One Side Per Match</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    You may back only one side in this arena. You can add to that position before market
                    lock, but you cannot hedge both sides in the same match.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Your Locked Side</div>
                  <div className="mt-2 text-lg font-black text-emerald-300">
                    {spectatorBetLockedForPlayers
                      ? "Player In Match"
                      : myExistingSide === "host"
                        ? match.host.name
                        : myExistingSide === "challenger"
                          ? challenger?.name ?? "Opponent"
                          : "No Position Yet"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    {spectatorBetLockedForPlayers
                      ? "Participants are not allowed to use the spectator pool in their own match."
                      : myExistingSide
                        ? "Add to this side before lock if you want more exposure."
                        : "Select a side to open your position."}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Projected Profit</div>
                  <div className="mt-2 text-lg font-black text-amber-300">
                    {spectatorBetLockedForPlayers
                      ? "Locked"
                      : selectedSide && !marketNeedsOpposingLiquidity
                        ? `${selectedProjectedProfit.toFixed(2)} KAS`
                        : "0.00 KAS"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    {spectatorBetLockedForPlayers
                      ? "Join the spectator market from matches you are not playing in."
                      : selectedSide && marketNeedsOpposingLiquidity
                        ? "Opposing bets have not formed yet. Profit appears only when liquidity exists on the other side."
                        : "Profit comes from the losing side pool after rake, not from the house."}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-[28px] border border-amber-300/10 bg-black/25 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm uppercase tracking-[0.16em] text-white/45">Back Host</div>
                      <div className="mt-2 text-3xl font-black">{match.host.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <RankBadge rank={match.host.rank} />
                      </div>
                      <div className="mt-3 text-sm text-white/55">Side: {match.hostSideLabel}</div>
                      <div className="mt-4 text-sm text-white/55">
                        Win probability: {Math.round(hostProbability * 100)}%
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectBetSide("host")}
                      disabled={
                        !challenger ||
                        !marketOpen ||
                        spectatorBetLockedForPlayers ||
                        (myExistingSide !== null && myExistingSide !== "host")
                      }
                      className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                        selectedSide === "host"
                          ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black"
                          : "border border-white/10 bg-white/5 text-white"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      Back {match.host.name}
                    </button>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/45">
                      <span>Market Share</span>
                      <span>{hostShare.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500 ease-out"
                        style={{ width: `${hostShare}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div
                      className={`rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 transition-all duration-500 ${
                        poolFlash === "host" ? "scale-[1.02] ring-2 ring-amber-300/50" : ""
                      }`}
                    >
                      <div className="text-xs uppercase tracking-[0.16em] text-white/50">Current Pool</div>
                      <div className="mt-2 text-3xl font-black text-amber-300">
                        {match.spectatorPool.host.toFixed(0)} KAS
                      </div>
                      <div className="mt-4 text-xs uppercase tracking-[0.16em] text-white/50">Multiplier</div>
                      <div className="mt-1 text-2xl font-black">{hostCurrentMultiplier.toFixed(2)}x</div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/50">Your Preview</div>
                      <div className="mt-2 text-3xl font-black">
                        {!spectatorBetLockedForPlayers && selectedSide === "host" && !marketNeedsOpposingLiquidity
                          ? `${hostProjection.payout.toFixed(2)} KAS`
                          : "0.00 KAS"}
                      </div>
                      <div className="mt-4 text-xs uppercase tracking-[0.16em] text-white/50">
                        Projected Multiplier
                      </div>
                      <div className="mt-1 text-2xl font-black text-amber-300">
                        {!spectatorBetLockedForPlayers && selectedSide === "host" && !marketNeedsOpposingLiquidity
                          ? `${hostProjection.multiplier.toFixed(2)}x`
                          : "1.00x"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-emerald-400/10 bg-black/25 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm uppercase tracking-[0.16em] text-white/45">Back Challenger</div>
                      <div className="mt-2 text-3xl font-black">
                        {challenger ? challenger.name : "Waiting Opponent"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {challenger ? <RankBadge rank={challenger.rank} /> : null}
                      </div>
                      <div className="mt-3 text-sm text-white/55">Side: {match.challengerSideLabel}</div>
                      <div className="mt-4 text-sm text-white/55">
                        Win probability: {Math.round(challengerProbability * 100)}%
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectBetSide("challenger")}
                      disabled={
                        !challenger ||
                        !marketOpen ||
                        spectatorBetLockedForPlayers ||
                        (myExistingSide !== null && myExistingSide !== "challenger")
                      }
                      className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                        selectedSide === "challenger"
                          ? "bg-gradient-to-r from-emerald-300 to-emerald-500 text-black"
                          : "border border-white/10 bg-white/5 text-white"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      Back {challenger ? challenger.name : "Opponent"}
                    </button>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/45">
                      <span>Market Share</span>
                      <span>{challengerShare.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500 transition-all duration-500 ease-out"
                        style={{ width: `${challengerShare}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div
                      className={`rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 transition-all duration-500 ${
                        poolFlash === "challenger" ? "scale-[1.02] ring-2 ring-emerald-300/50" : ""
                      }`}
                    >
                      <div className="text-xs uppercase tracking-[0.16em] text-white/50">Current Pool</div>
                      <div className="mt-2 text-3xl font-black text-emerald-300">
                        {match.spectatorPool.challenger.toFixed(0)} KAS
                      </div>
                      <div className="mt-4 text-xs uppercase tracking-[0.16em] text-white/50">Multiplier</div>
                      <div className="mt-1 text-2xl font-black">{challengerCurrentMultiplier.toFixed(2)}x</div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/50">Your Preview</div>
                      <div className="mt-2 text-3xl font-black">
                        {!spectatorBetLockedForPlayers && selectedSide === "challenger" && !marketNeedsOpposingLiquidity
                          ? `${challengerProjection.payout.toFixed(2)} KAS`
                          : "0.00 KAS"}
                      </div>
                      <div className="mt-4 text-xs uppercase tracking-[0.16em] text-white/50">
                        Projected Multiplier
                      </div>
                      <div className="mt-1 text-2xl font-black text-emerald-300">
                        {!spectatorBetLockedForPlayers && selectedSide === "challenger" && !marketNeedsOpposingLiquidity
                          ? `${challengerProjection.multiplier.toFixed(2)}x`
                          : "1.00x"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Bet Slip</p>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Selected Side</div>
                  <div className="mt-2 text-xl font-black">
                    {spectatorBetLockedForPlayers
                      ? "Players Cannot Bet"
                      : selectedSide === "host"
                        ? match.host.name
                        : selectedSide === "challenger"
                          ? challenger
                            ? challenger.name
                            : "Waiting Opponent"
                          : "None"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                    Spectator Bet (KAS)
                  </label>

                  <input
                    type="number"
                    min={MIN_BET}
                    max={MAX_BET}
                    step={1}
                    inputMode="numeric"
                    value={betAmountInput}
                    onChange={(e) => setBetAmountInput(e.target.value)}
                    disabled={spectatorBetLockedForPlayers || isSubmittingBet}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-xl font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[5, 10, 25, 50].map((quick) => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setBetAmountInput(String(quick))}
                        disabled={spectatorBetLockedForPlayers || isSubmittingBet}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {quick} KAS
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 text-xs text-white/45">
                    Allowed range: {MIN_BET}–{MAX_BET} KAS
                  </div>
                </div>

                <StatCard
                  label="Total Spectator Pool"
                  value={`${totalSpectatorPool.toFixed(0)} KAS`}
                  accent="text-amber-300"
                />

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Your Exposure</div>

                  <div className="mt-3 space-y-2 text-sm text-white/75">
                    <div className="flex justify-between gap-3">
                      <span>{match.host.name}</span>
                      <span className="font-bold text-amber-300">{myHostExposure.toFixed(2)} KAS</span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span>{challenger ? challenger.name : "Opponent"}</span>
                      <span className="font-bold text-emerald-300">
                        {myChallengerExposure.toFixed(2)} KAS
                      </span>
                    </div>

                    <div className="mt-3 flex justify-between gap-3 border-t border-white/8 pt-3">
                      <span>Total</span>
                      <span className="font-black text-white">
                        {(myHostExposure + myChallengerExposure).toFixed(2)} KAS
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Position Rules</div>
                  <div className="mt-3 space-y-2 text-sm text-white/75">
                    <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                      One side only per match
                    </div>
                    <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                      Add-to-position allowed before lock
                    </div>
                    <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                      Profit only forms when the opposite side has liquidity
                    </div>
                    <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                      Players cannot bet on their own match
                    </div>
                  </div>
                </div>

                <button
                  onClick={placeBet}
                  disabled={
                    isSubmittingBet ||
                    spectatorBetLockedForPlayers ||
                    !marketOpen ||
                    !challenger ||
                    !selectedSide ||
                    !canBetSelectedSide
                  }
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-base font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingBet
                    ? "Placing Bet..."
                    : spectatorBetLockedForPlayers
                      ? "Players Cannot Use Spectator Bets"
                      : marketOpen && challenger
                        ? myExistingSide && selectedSide === myExistingSide
                          ? `Add to ${selectedPlayerName}`
                          : "Place Spectator Bet"
                        : "Betting Unavailable"}
                </button>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Match Room Status</div>
                  <div className="mt-2 text-sm leading-6 text-white/85">{message}</div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">My Recent Bets</div>

                  <div className="mt-3 space-y-2 text-sm text-white/75">
                    {recentTickets.length === 0 ? (
                      <div className="rounded-xl bg-white/[0.03] px-3 py-3 text-white/45">
                        No spectator bets placed yet.
                      </div>
                    ) : (
                      recentTickets.map((ticket) => {
                        const sideName =
                          ticket.side === "host" ? match.host.name : challenger ? challenger.name : "Opponent"

                        return (
                          <div key={ticket.id} className="rounded-xl bg-white/[0.03] px-3 py-3">
                            {ticket.amount.toFixed(0)} KAS on {sideName}
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