"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import {
  clampBetAmount,
  DEFAULT_BET,
  formatArenaPhase,
  getArenaBettingSecondsLeft,
  getCurrentUser,
  getFavoriteData,
  getMultiplier,
  getProjectedState,
  getRankColors,
  getSideShare,
  getTicketsForMatch,
  getMatchResultCopy,
  getWinnerDisplayLine,
  getWinProbability,
  getWinnerDisplayName,
  getWinReasonLabel,
  HOUSE_RAKE,
  isArenaBettable,
  MAX_BET,
  MAX_PAUSES_PER_SIDE,
  MIN_BET,
  PAUSE_DURATION_SECONDS,
  TIMEOUT_STRIKES_TO_LOSE,
  placeArenaSpectatorBet,
  readCurrentUserTickets,
  subscribeSpectatorTickets,
  type ArenaMatch,
  type ArenaSide,
  type PauseState,
  type PersistedBetTicket,
  type RankTier,
  type RoomChatMessage,
  WHALE_BET_THRESHOLD,
} from "@/lib/mock/arena-data"
import { getCurrentIdentity } from "@/lib/identity"
import { createClient } from "@/lib/supabase/client"
import { getRoomById, listRoomMessages, listSpectateMessages } from "@/lib/rooms/rooms-service"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"
import { acceptAndReconcile, reconcileRoom } from "@/lib/rooms/sync-policy"
import type { Room } from "@/lib/engine/match/types"
import { getMatchRole } from "@/lib/rooms/match-role"
import { COUNTDOWN_PHRASES, PREGAME_COUNTDOWN_LINES } from "@/lib/countdown-phrases"
import type { MatchRoundRow } from "@/lib/rooms/match-events"

type Connect4Cell = "host" | "challenger" | null
type TttCell = "X" | "O" | null

const CONNECT4_MOVE_SECONDS = 20
const TTT_MOVE_SECONDS = 10

type PersistedConnect4BoardState = {
  mode: "connect4-live"
  board: Connect4Cell[][]
  turn: ArenaSide
  turnDeadlineTs: number | null
}

type PersistedTttBoardState = {
  mode: "ttt-live"
  board: TttCell[]
  turn: "X" | "O"
  turnDeadlineTs: number | null
}

type RpsChoice = "rock" | "paper" | "scissors"

type PersistedRpsBoardState = {
  mode: "rps-live"
  hostChoice: RpsChoice | null
  challengerChoice: RpsChoice | null
  revealed: boolean
  winner: "host" | "challenger" | "draw" | null
  /** Round deadline (ms). 15s per round. */
  roundExpiresAt?: number | null
}

type PersistedChessPreviewState = {
  mode: "chess-preview"
  fen?: string
  turnDeadlineTs?: null
}

type MatchBoardState =
  | PersistedConnect4BoardState
  | PersistedTttBoardState
  | PersistedRpsBoardState
  | PersistedChessPreviewState
  | Record<string, unknown>
  | undefined
  | null

function normalizePauseState(pauseState?: Partial<PauseState> | null): PauseState {
  return {
    isPaused: pauseState?.isPaused === true,
    pausedBy:
      pauseState?.pausedBy === "host" || pauseState?.pausedBy === "challenger"
        ? pauseState.pausedBy
        : null,
    pauseExpiresAt:
      typeof pauseState?.pauseExpiresAt === "number" && Number.isFinite(pauseState.pauseExpiresAt)
        ? Number(pauseState.pauseExpiresAt)
        : null,
    pauseCountHost:
      typeof pauseState?.pauseCountHost === "number" &&
      Number.isFinite(pauseState.pauseCountHost)
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
    <div className="rounded-xl border border-white/10 bg-[var(--surface-card)] p-3.5 shadow-[0_0_16px_rgba(0,0,0,0.12)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-1.5 text-xl font-black ${accent}`}>{value}</div>
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
    <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-5 shadow-[0_0_30px_rgba(0,0,0,0.2)]">
      <div className="mx-auto mb-5 w-fit rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
        {subtitle}
      </div>
      <div className="rounded-2xl border border-amber-400/10 bg-gradient-to-br from-[#0e1312] to-[#0a0e0d] p-6 shadow-[0_0_24px_rgba(251,191,36,0.06)]">
        <div className="relative flex min-h-[400px] flex-col items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-black/20 px-5 py-8 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.06),transparent_30%),radial-gradient(circle_at_bottom,rgba(251,191,36,0.04),transparent_28%)]" />
          <div className="relative z-10 mb-5 text-xs font-bold uppercase tracking-[0.18em] text-white/45">
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
  isQuickMatch,
}: {
  seconds: number
  hostName: string
  challengerName: string
  hypeLine: string
  isQuickMatch?: boolean
}) {
  const tone =
    seconds <= 5
      ? "border-red-400/30 bg-red-500/10 text-red-200"
      : seconds <= 10
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[26px] border border-white/10 bg-[rgba(3,8,7,0.88)] backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_36%),radial-gradient(circle_at_bottom,rgba(251,191,36,0.10),transparent_30%)]" />
        <div className="absolute inset-0 animate-pulse bg-[linear-gradient(115deg,transparent,rgba(255,255,255,0.04),transparent)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 text-center">
        <div className="mb-3 inline-flex animate-pulse rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
          Match Starting Soon
        </div>

        <div className="text-3xl font-black tracking-wide text-white sm:text-4xl">
          {hostName} vs {challengerName}
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
          {isQuickMatch
            ? "Match starts when the timer hits zero. No betting in Quick Play."
            : "Betting is open right now. Lock your side before the market closes and the match goes live."}
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-2">
          <div
            className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border text-4xl font-black shadow-[0_0_45px_rgba(255,215,0,0.18)] sm:h-28 sm:w-28 sm:text-5xl ${tone}`}
          >
            {seconds > 0 ? seconds : 0}
          </div>
          {seconds === 0 && (
            <p className="text-sm font-semibold text-white/80">Starting…</p>
          )}
        </div>

        <div
          className="mt-6 flex min-h-[120px] w-full max-w-3xl items-center justify-center rounded-2xl border-2 border-amber-300/30 bg-amber-300/10 px-6 py-8 text-center shadow-[0_0_32px_rgba(251,191,36,0.2)]"
          key={hypeLine}
        >
          <p className="animate-pulse text-xl font-black leading-snug text-amber-100 drop-shadow-md sm:text-2xl md:text-3xl">
            {hypeLine}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!isQuickMatch && (
            <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-300">
              Betting Active
            </div>
          )}
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

/** Between-round intermission: celebrate (win visible) then countdown. Board stays visible behind. */
function IntermissionBanner({
  phase,
  roundJustEnded,
  roundWinnerName,
  nextRoundNumber,
  secondsLeft,
}: {
  phase: "celebrate" | "countdown"
  roundJustEnded: number
  roundWinnerName: string | null
  nextRoundNumber: number
  secondsLeft: number
}) {
  return (
    <div className="z-20 mb-4 w-full rounded-2xl border-2 border-amber-300/35 bg-amber-300/15 px-5 py-4 shadow-[0_0_28px_rgba(251,191,36,0.15)]">
      <div className="mb-1.5 inline-flex rounded-full border border-amber-300/30 bg-amber-300/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
        Between rounds
      </div>
      {phase === "celebrate" ? (
        <p className="text-center text-lg font-black text-amber-100 sm:text-xl">
          {roundWinnerName != null
            ? `Round ${roundJustEnded} over — ${roundWinnerName} won!`
            : `Round ${roundJustEnded} was a draw.`}
          <span className="mt-2 block text-sm font-semibold text-amber-200/90">Next round in a moment…</span>
        </p>
      ) : (
        <p className="text-center text-lg font-black text-amber-100 sm:text-xl">
          Round {nextRoundNumber} starts in {secondsLeft}…
        </p>
      )}
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
          Move clock is frozen. When the pause ends, the active player&apos;s timer resets to full
          time.
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
  finishedResultCopy,
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
  finishedResultCopy?: string
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
      ? bettingSecondsLeft > 0
        ? `You are already in the correct room. Stay here — the countdown is live and the match starts in ${bettingSecondsLeft}s.`
        : "Match is starting… Stay here — the arena will go live shortly."
      : bettingSecondsLeft > 0
        ? `Both players are seated. Betting is still open for ${bettingSecondsLeft}s, then the match goes live.`
        : "Both players are seated. Match is starting…"
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
    const resultCopy = finishedResultCopy ?? "Match complete"
    eyebrow = resultCopy
    title = resultCopy === "Draw" ? "Match drawn" : resultCopy.startsWith("You won") ? "You won" : resultCopy.startsWith("You lost") ? "Match over" : "Match complete"
    body = "This arena has resolved. Review the final state, payout context, and feed below."
  }

  return (
    <div className={`mb-6 rounded-[28px] border p-5 ${tone}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.26em] opacity-80">
            {eyebrow}
          </div>
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

function getConnect4State(match: ArenaMatch | null) {
  const boardState = (match?.boardState ?? null) as MatchBoardState

  if (
    boardState &&
    typeof boardState === "object" &&
    "mode" in boardState &&
    boardState.mode === "connect4-live" &&
    isValidConnect4Board((boardState as PersistedConnect4BoardState).board) &&
    (((boardState as PersistedConnect4BoardState).turn === "host") ||
      (boardState as PersistedConnect4BoardState).turn === "challenger")
  ) {
    return {
      board: (boardState as PersistedConnect4BoardState).board,
      turn: (boardState as PersistedConnect4BoardState).turn,
      turnDeadlineTs: (boardState as PersistedConnect4BoardState).turnDeadlineTs ?? 0,
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

function getTttState(match: ArenaMatch | null) {
  const boardState = (match?.boardState ?? null) as MatchBoardState

  if (
    boardState &&
    typeof boardState === "object" &&
    "mode" in boardState &&
    boardState.mode === "ttt-live" &&
    isValidTttBoard((boardState as PersistedTttBoardState).board) &&
    (((boardState as PersistedTttBoardState).turn === "X") ||
      (boardState as PersistedTttBoardState).turn === "O")
  ) {
    return {
      board: (boardState as PersistedTttBoardState).board,
      turn: (boardState as PersistedTttBoardState).turn,
      turnDeadlineTs: (boardState as PersistedTttBoardState).turnDeadlineTs ?? 0,
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

/** RPS state from match. hostChoice/challengerChoice are derived only from server board_state; no local cache. */
function getRpsState(match: ArenaMatch | null) {
  const boardState = (match?.boardState ?? null) as MatchBoardState
  if (
    boardState &&
    typeof boardState === "object" &&
    "mode" in boardState &&
    (boardState as PersistedRpsBoardState).mode === "rps-live"
  ) {
    const rps = boardState as PersistedRpsBoardState
    return {
      hostChoice: rps.hostChoice ?? null,
      challengerChoice: rps.challengerChoice ?? null,
      revealed: rps.revealed === true,
      winner: rps.winner ?? null,
      roundExpiresAt: typeof rps.roundExpiresAt === "number" ? rps.roundExpiresAt : null,
      hasPersistedState: true,
    }
  }
  return {
    hostChoice: null,
    challengerChoice: null,
    revealed: false,
    winner: null,
    roundExpiresAt: null as number | null,
    hasPersistedState: false,
  }
}

function makeLiveFeed(match: ArenaMatch | null) {
  if (!match) {
    return ["Loading room state..."]
  }

  return [
    `${match.host?.name ?? "Host"} entered the ${match.game ?? "Match"} room.`,
    `${match.challenger ? match.challenger.name : "The challenger"} is drawing spectator attention.`,
    `Live move update: ${match.moveText ?? "—"}.`,
    `${match.spectators ?? 0} spectators are currently tracking this arena.`,
  ]
}

export default function ArenaMatchPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const matchId = typeof params?.id === "string" ? params.id : ""

  const [match, setMatch] = useState<ArenaMatch | null>(null)
  const [betAmountInput, setBetAmountInput] = useState(String(DEFAULT_BET))
  const [selectedSide, setSelectedSide] = useState<ArenaSide | null>(null)
  const [tickets, setTickets] = useState<PersistedBetTicket[]>([])
  const [myTickets, setMyTickets] = useState<PersistedBetTicket[]>([])
  const [feed, setFeed] = useState<string[]>(["Loading room state..."])
  const [message, setMessage] = useState(
    "Stay in this room once both players are seated. The countdown and live match flow happen here."
  )
  const [poolFlash, setPoolFlash] = useState<ArenaSide | null>(null)
  const [countdownLineIndex, setCountdownLineIndex] = useState(0)
  const [tick, setTick] = useState(0)
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([])
  const [spectateMessages, setSpectateMessages] = useState<RoomChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [spectateChatInput, setSpectateChatInput] = useState("")
  const [showCancelRoomConfirm, setShowCancelRoomConfirm] = useState(false)
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [roomLoadAttempted, setRoomLoadAttempted] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  /** Server-time sync so displayed timer matches server timeout (no clock-skew early end). */
  const [serverTimeSync, setServerTimeSync] = useState<{ serverMs: number; receivedAtMs: number }>({
    serverMs: 0,
    receivedAtMs: 0,
  })
  /** Ticks every second during pre-game countdown so displayed seconds update smoothly. */
  const [countdownTick, setCountdownTick] = useState(0)
  /** Ticks every second during RPS live round so round timer countdown updates. */
  const [rpsRoundTick, setRpsRoundTick] = useState(0)
  /** Round-by-round record when match is finished (from timeline API). */
  const [timelineRounds, setTimelineRounds] = useState<MatchRoundRow[]>([])

  const previousMatchRef = useRef<ArenaMatch | null>(null)
  const refreshChatRef = useRef<(() => Promise<void>) | null>(null)
  const refreshSpectateChatRef = useRef<(() => Promise<void>) | null>(null)
  const startedTransitionRef = useRef(false)
  const matchStatusRef = useRef<string>("")
  const countdownEndMsRef = useRef<number>(0)
  const rpsStuckLoggedRef = useRef(false)
  /** RPS live-debug: throttle render log to avoid spam (dev only). */
  const rpsDebugLastLogRef = useRef<{ at: number; status: string; shell: boolean; controls: boolean; boardMode: string; hostChoice: RpsChoice | null; challengerChoice: RpsChoice | null } | null>(null)
  /** Pregame phrase debug: throttle state log (dev only). */
  const pregamePhraseLogRef = useRef<{ at: number; fingerprint: string } | null>(null)
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null)
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const chatFormRef = useRef<HTMLFormElement | null>(null)
  /** Stick to bottom only when user is already near bottom; do not force scroll when user scrolled up (active or finished). */
  const isChatNearBottomRef = useRef(true)
  const prevChatLengthRef = useRef(0)
  const prevSpectateChatLengthRef = useRef(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const check = () => setIsMobileView(typeof window !== "undefined" && window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [mounted])

  const refreshRoom = useCallback(async () => {
    if (!matchId || typeof window === "undefined") return
    try {
      const supabase = createClient()
      const room = await getRoomById(supabase, matchId)
      if (room) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[match page] refreshRoom (ej) got room", {
            source: "refetch",
            room_id: room.id,
            raw_status: room.status,
            updatedAt: (room as { updatedAt?: number }).updatedAt ?? null,
          })
        }
        if (room.game === "Rock Paper Scissors" && room.status === "Live") {
          const intermissionUntil = (room as { roundIntermissionUntil?: number | null }).roundIntermissionUntil ?? null
          const board = room.boardState as PersistedRpsBoardState | undefined
          const looksLikeRoundStart =
            intermissionUntil == null &&
            board &&
            (board as Record<string, unknown>).revealed === false &&
            typeof (board as Record<string, unknown>).roundExpiresAt === "number"
          if (looksLikeRoundStart) {
            console.log("[client] Room state AFTER intermission (from refetch) — next round board", {
              roundIntermissionUntil: intermissionUntil,
              board_state: room.boardState,
              hostChoice: board?.hostChoice ?? (room.boardState as Record<string, unknown>)?.hostChoice,
              challengerChoice: board?.challengerChoice ?? (room.boardState as Record<string, unknown>)?.challengerChoice,
              revealed: board?.revealed ?? (room.boardState as Record<string, unknown>)?.revealed,
              roundExpiresAt: board?.roundExpiresAt ?? (room.boardState as Record<string, unknown>)?.roundExpiresAt,
            })
          }
        }
        const reconciled = reconcileRoom(room)
        setMatch((prev) => acceptAndReconcile(reconciled, prev, "ej"))
      } else {
        setMatch(null)
      }
    } catch (e) {
      console.warn("[ArenaMatchPage] refreshRoom failed:", e)
      setMatch(null)
    }
  }, [matchId])

  useEffect(() => {
    if (!matchId) return

    setRoomLoadAttempted(false)
    const syncTickets = () => {
      setTickets(getTicketsForMatch(matchId))
      setMyTickets(readCurrentUserTickets(getCurrentIdentity().id).filter((ticket) => ticket.matchId === matchId))
    }

    void refreshRoom().then(() => setRoomLoadAttempted(true))
    syncTickets()

    const unsubscribeTickets = subscribeSpectatorTickets(syncTickets)
    const supabase = createClient()
    const channel = supabase
      .channel(`room-${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        () => { void refreshRoom() }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_messages", filter: `match_id=eq.${matchId}` },
        () => { void refreshChatRef.current?.() }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "spectate_messages", filter: `match_id=eq.${matchId}` },
        () => { void refreshSpectateChatRef.current?.() }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "moves", filter: `match_id=eq.${matchId}` },
        () => { void refreshRoom() }
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void refreshRoom()
      })

    const pollInterval = window.setInterval(() => { void refreshRoom() }, 2000)

    return () => {
      unsubscribeTickets()
      supabase.removeChannel(channel)
      window.clearInterval(pollInterval)
    }
  }, [matchId, refreshRoom])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  // Initial server time sync when we need it (pre-game or Live with turn timer).
  useEffect(() => {
    if (!match) return
    const needSync =
      (match.status === "Ready to Start") ||
      (match.status === "Live" && match.turnExpiresAt != null)
    if (!needSync) return
    if (serverTimeSync.receivedAtMs > 0) return
    let cancelled = false
    fetch("/api/rooms/servertime")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || typeof data.server_time_ms !== "number") return
        setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [match?.id, match?.status, match?.turnExpiresAt, serverTimeSync.receivedAtMs])

  // During pre-game countdown: poll server time every 1s so displayed countdown matches server (no early stop at 4s from clock skew).
  useEffect(() => {
    if (!match || match.status !== "Ready to Start") return
    let cancelled = false
    const poll = () => {
      if (cancelled) return
      fetch("/api/rooms/servertime")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || typeof data.server_time_ms !== "number") return
          setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
        })
        .catch(() => {})
    }
    poll()
    const interval = window.setInterval(poll, 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [match?.id, match?.status])

  // Tick: poll room state (and get server_time_ms). During countdown or between-round intermission use 1s so transitions are detected quickly.
  useEffect(() => {
    if (!matchId || !match) return
    if (match.status !== "Ready to Start" && match.status !== "Live") return
    const intermissionUntil = typeof match.roundIntermissionUntil === "number" ? match.roundIntermissionUntil : null
    const inIntermission = match.status === "Live" && intermissionUntil != null && Date.now() < intermissionUntil
    const isRpsLiveRound = match.game === "Rock Paper Scissors" && match.status === "Live" && !inIntermission
    const intervalMs =
      match.status === "Ready to Start" || inIntermission || isRpsLiveRound ? 1000 : 2000
    const runTick = () => {
      const body: { room_id: string; client_time_ms?: number } = { room_id: matchId }
      if (match?.status === "Ready to Start") body.client_time_ms = Date.now()
      fetch("/api/rooms/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((data) => {
          if (process.env.NODE_ENV !== "production" && data?.ok && data?.room) {
            const r = data.room as { status?: string; updatedAt?: number | string }
            if (r?.status === "Ready to Start" || data.transition === "ready_to_live") {
              console.info("[tick response]", {
                room_status: r?.status,
                transition: data.transition,
                server_time_ms: data.server_time_ms,
                room_updatedAt: r?.updatedAt,
              })
            }
          }
          if (data.ok && data.room) {
            let room = data.room as Room
            // Debug: countdown reached zero → tick returned; log when we get ready_to_live
            if (data.transition === "ready_to_live" && process.env.NODE_ENV !== "production") {
              const r = room as { status?: string; boardState?: unknown }
              console.info("[match page] tick response: countdown reached zero, received ready_to_live", {
                room_status: r?.status,
                has_board_state: r?.boardState != null && typeof r?.boardState === "object",
                board_mode: r?.boardState != null && typeof r?.boardState === "object" && "mode" in (r.boardState as Record<string, unknown>) ? (r.boardState as Record<string, unknown>).mode : null,
              })
            }
            // Never apply a tick room that lacks boardState for RPS intermission→next round (partial response would preserve stale hostChoice/challengerChoice on client).
            if (
              data.transition === "intermission_next_round" &&
              room.game === "Rock Paper Scissors" &&
              (room.boardState == null || typeof room.boardState !== "object")
            ) {
              console.warn("[client] intermission_next_round RPS but room has no boardState; skipping apply, will refetch", { room_id: room.id })
              if (typeof data.server_time_ms === "number") {
                setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
              }
              void refreshRoom()
              return
            }
            // RPS next round: force-apply when we receive a fresh board (both choices null) so we never keep stale hostChoice/challengerChoice.
            const board = room.boardState as PersistedRpsBoardState | Record<string, unknown> | undefined
            const isRpsFreshRound =
              data.transition === "intermission_next_round" &&
              room.game === "Rock Paper Scissors" &&
              board &&
              typeof board === "object" &&
              (board as { mode?: string }).mode === "rps-live" &&
              (board as { hostChoice?: unknown }).hostChoice == null &&
              (board as { challengerChoice?: unknown }).challengerChoice == null &&
              (board as { revealed?: boolean }).revealed === false
            if (isRpsFreshRound) {
              const reconciled = reconcileRoom(room)
              const applied = roomToArenaMatch(reconciled)
              const appliedBoard = applied.boardState as PersistedRpsBoardState | undefined
              console.info("[client] intermission_next_round RPS: FORCE-APPLY fresh round (bypass sync reject)", {
                room_id: room.id,
                received_hostChoice: (board as { hostChoice?: unknown }).hostChoice,
                received_challengerChoice: (board as { challengerChoice?: unknown }).challengerChoice,
                received_roundExpiresAt: (board as { roundExpiresAt?: number }).roundExpiresAt,
                applied_hostChoice: appliedBoard?.hostChoice ?? null,
                applied_challengerChoice: appliedBoard?.challengerChoice ?? null,
                applied_roundExpiresAt: appliedBoard?.roundExpiresAt ?? null,
              })
              setMatch(applied)
              if (typeof data.server_time_ms === "number") {
                setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
              }
              void refreshRoom()
              return
            }
            if (data.transition === "ready_to_live") {
              room = { ...room, status: "Live" }
              console.info("[client] ready_to_live received", {
                room_id: room.id,
                room_status: room.status,
                has_boardState: room.boardState != null && typeof room.boardState === "object",
                room_updatedAt: (room as { updatedAt?: number }).updatedAt,
              })
            }
            const reconciled = reconcileRoom(room)
            setMatch((prev) => {
              const next = acceptAndReconcile(reconciled, prev, "tick")
              if (data.transition === "ready_to_live") {
                console.info("[client] ready_to_live apply result", {
                  accepted: next.status === "Live",
                  next_status: next.status,
                  had_prev: prev != null,
                  prev_status: prev?.status ?? null,
                })
              }
              return next
            })
            if (typeof data.server_time_ms === "number") {
              setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
            }
            if (data.transition === "intermission_next_round") {
              void refreshRoom()
            }
          }
        })
        .catch(() => {})
    }
    runTick()
    const t = window.setInterval(runTick, intervalMs)
    return () => clearInterval(t)
  }, [matchId, match?.id, match?.status, match?.game, match?.roundIntermissionUntil])

  // When in Ready to Start, every 2s check if countdown has ended (via ref) and call start + refetch until Live. Refs avoid tearing down interval on match refetch.
  useEffect(() => {
    if (!matchId) return
    if (match?.status === "Live" || match?.status === "Finished") {
      startedTransitionRef.current = false
      return
    }
    if (match?.status !== "Ready to Start") return

    const run = () => {
      const end = countdownEndMsRef.current
      const now = Date.now()
      // If end > 0, wait until server countdown has elapsed. If end === 0 (missing bettingClosesAt/countdownStartedAt on client), still call start — tick may not flip UI alone; avoids stuck overlay at "Starting…".
      if (end > 0 && now < end) return
      const body = { room_id: matchId, client_time_ms: now }
      fetch("/api/rooms/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.ok || !data.room) return
          const room = data.room as Room
          if (process.env.NODE_ENV !== "production") {
            console.info("[start response]", {
              ok: data.ok,
              room_status: room?.status,
              room_updatedAt: (room as { updatedAt?: number | string })?.updatedAt,
              countdownNotExpired: data.countdownNotExpired,
              alreadyLive: data.alreadyLive,
              willApply: !data.countdownNotExpired && (room?.status === "Live" || data.alreadyLive),
            })
          }
          if (data.countdownNotExpired) return
          if (room.status !== "Live" && !data.alreadyLive) return
          startedTransitionRef.current = true
          const reconciled = reconcileRoom(room)
          setMatch((prev) => acceptAndReconcile(reconciled, prev, "tick"))
          if (typeof data.server_time_ms === "number") {
            setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
          }
        })
        .catch(() => {})
      refreshRoom()
    }

    run()
    const interval = window.setInterval(run, 2000)
    return () => window.clearInterval(interval)
  }, [matchId, match?.status, refreshRoom])

  useEffect(() => {
    if (!match) return

    const prev = previousMatchRef.current
    if (prev && prev.status !== match.status) {
      if (match.status === "Ready to Start") {
        setFeed((items) => [`🚪 Both players seated in ${match.game}`, ...items].slice(0, 12))
      } else if (match.status === "Live") {
        setFeed((items) => [`🚀 ${match.game} is now live`, ...items].slice(0, 12))
      } else if (match.status === "Finished") {
        setFeed((items) => [`🏁 Match finished: ${match.statusText}`, ...items].slice(0, 12))
      }
    }

    if (prev && prev.moveText !== match.moveText && match.status === "Live") {
      setFeed((items) => [`🎮 ${match.moveText}`, ...items].slice(0, 12))
    }

    previousMatchRef.current = match
  }, [match])

  // RPS: when intermission ends (roundIntermissionUntil cleared), refresh so both host and challenger get the new round board (both choices null).
  const prevIntermissionUntilRef = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (!match || match.game !== "Rock Paper Scissors" || match.status !== "Live") {
      prevIntermissionUntilRef.current = match?.roundIntermissionUntil ?? undefined
      return
    }
    const now = typeof match.roundIntermissionUntil === "number" ? match.roundIntermissionUntil : null
    const prev = prevIntermissionUntilRef.current
    prevIntermissionUntilRef.current = now
    if (prev != null && prev > 0 && (now == null || now === 0)) {
      void refreshRoom()
    }
  }, [match?.game, match?.status, match?.roundIntermissionUntil, refreshRoom])

  // RPS: detect new round by round_number or board_state.roundExpiresAt; force refetch so both host and challenger get fresh board_state (hostChoice/challengerChoice null).
  const prevRpsRoundRef = useRef<{ round: number; roundExpiresAt: number | null }>({ round: 0, roundExpiresAt: null })
  useEffect(() => {
    if (!match || match.game !== "Rock Paper Scissors" || match.status !== "Live") return
    const board = match.boardState as PersistedRpsBoardState | undefined
    const round = match.currentRound ?? 1
    const roundExpiresAt =
      board && typeof board === "object" && typeof (board as PersistedRpsBoardState).roundExpiresAt === "number"
        ? (board as PersistedRpsBoardState).roundExpiresAt!
        : null
    const prev = prevRpsRoundRef.current
    const roundChanged = prev.round !== round || prev.roundExpiresAt !== roundExpiresAt
    prevRpsRoundRef.current = { round, roundExpiresAt }
    if (roundChanged && (round > 1 || roundExpiresAt != null)) {
      void refreshRoom()
    }
  }, [match?.game, match?.status, match?.currentRound, match?.boardState, refreshRoom])

  // RPS: when intermission time has passed but we still have intermission in state, force refetch once (host may not have received cleared update).
  const rpsStaleIntermissionRef = useRef(false)
  useEffect(() => {
    if (!match || match.game !== "Rock Paper Scissors" || match.status !== "Live") return
    const until = typeof match.roundIntermissionUntil === "number" ? match.roundIntermissionUntil : null
    if (until == null) {
      rpsStaleIntermissionRef.current = false
      return
    }
    if (Date.now() >= until && !rpsStaleIntermissionRef.current) {
      rpsStaleIntermissionRef.current = true
      void refreshRoom()
    }
  }, [match?.game, match?.status, match?.roundIntermissionUntil, rpsRoundTick])

  // RPS: debug log board_state at round start (confirm server sends hostChoice/challengerChoice null).
  const rpsBoardLogRef = useRef<number | null>(null)
  useEffect(() => {
    if (!match || match.game !== "Rock Paper Scissors" || match.status !== "Live") return
    const board = match.boardState as PersistedRpsBoardState | undefined
    if (!board || typeof board !== "object" || board.mode !== "rps-live") return
    if (board.revealed === true) return
    const exp = typeof board.roundExpiresAt === "number" ? board.roundExpiresAt : null
    if (exp != null && rpsBoardLogRef.current !== exp) {
      rpsBoardLogRef.current = exp
      console.log("RPS board_state received (round start)", JSON.stringify({
        hostChoice: board.hostChoice,
        challengerChoice: board.challengerChoice,
        revealed: board.revealed,
        winner: board.winner,
        roundExpiresAt: board.roundExpiresAt,
      }))
    }
  }, [match?.game, match?.status, match?.boardState])

  matchStatusRef.current = match?.status ?? ""
  if (match?.status === "Ready to Start" && match) {
    const endMs =
      match.bettingClosesAt ??
      (match.countdownStartedAt != null
        ? (match.countdownStartedAt as number) + (match.countdownSeconds ?? match.bettingWindowSeconds ?? 30) * 1000
        : 0)
    countdownEndMsRef.current = endMs
  }
  if (match?.status === "Live" || match?.status === "Finished") {
    rpsStuckLoggedRef.current = false
  }

  // Single interval for countdown line rotation: never torn down by match refetch, so challenger sees rotating lines like host.
  useEffect(() => {
    if (!matchId) return
    const lineInterval = window.setInterval(() => {
      const refStatus = matchStatusRef.current
      const shouldAdvance = refStatus === "Ready to Start"
      if (process.env.NODE_ENV !== "production") {
        console.info("[pregame phrase] interval", { ref_status: refStatus, advanced: shouldAdvance })
      }
      if (shouldAdvance) {
        setCountdownLineIndex((value) => value + 1)
      }
    }, 5000)
    const tickInterval = window.setInterval(() => {
      if (matchStatusRef.current === "Ready to Start") {
        setCountdownTick((t) => t + 1)
      }
    }, 1000)
    const rpsRoundInterval = window.setInterval(() => {
      setRpsRoundTick((t) => t + 1)
    }, 1000)
    return () => {
      window.clearInterval(lineInterval)
      window.clearInterval(tickInterval)
      window.clearInterval(rpsRoundInterval)
    }
  }, [matchId])

  // Diagnostic: log once when RPS is stuck (Ready to Start, countdown ended) so we can see exact client state.
  useEffect(() => {
    if (!match || match.game !== "Rock Paper Scissors" || match.status !== "Ready to Start") return
    if (countdownEndMsRef.current <= 0) return
    if (Date.now() < countdownEndMsRef.current) return
    if (rpsStuckLoggedRef.current) return
    rpsStuckLoggedRef.current = true
    const board = match.boardState as Record<string, unknown> | undefined
    console.info("[RPS stuck diagnostic] client state after countdown ended:", {
      status: match.status,
      game: match.game,
      updatedAt: match.updatedAt,
      countdownStartedAt: match.countdownStartedAt,
      bettingClosesAt: match.bettingClosesAt,
      bettingWindowSeconds: match.bettingWindowSeconds,
      board_state_mode: board?.mode,
      rps_hasPersistedState: board && typeof board === "object" && "mode" in board && (board as { mode?: string }).mode === "rps-live",
    })
  }, [match?.game, match?.status, match?.updatedAt, match?.boardState, match?.countdownStartedAt, match?.bettingClosesAt, match?.countdownSeconds, match?.bettingWindowSeconds])

  // When we leave Ready to Start, stop advancing (ref is updated above every render).
  // No extra effect needed — interval just no-ops when status isn't Ready.

  const connect4State = useMemo(() => getConnect4State(match), [match])
  const tttState = useMemo(() => getTttState(match), [match])
  // RPS: derive only from server board_state; key by round so new round never reuses stale state.
  const rpsRoundIdentity =
    match?.game === "Rock Paper Scissors" && match?.boardState && typeof match.boardState === "object"
      ? `${match.currentRound ?? 1}-${(match.boardState as PersistedRpsBoardState).roundExpiresAt ?? "x"}`
      : ""
  const rpsState = useMemo(() => getRpsState(match), [match, rpsRoundIdentity])

  const connect4Winner = useMemo(
    () => getConnect4Winner(connect4State.board),
    [connect4State.board]
  )
  const tttWinner = useMemo(() => getTttWinner(tttState.board), [tttState.board])

  /** Rotating pregame lines: funny/witty phrases every 5s; short premium lines as fallback. */
  const countdownLines = useMemo(() => {
    const base = COUNTDOWN_PHRASES.length > 0 ? [...COUNTDOWN_PHRASES] : [...PREGAME_COUNTDOWN_LINES]
    let seed = 0
    for (let i = 0; i < matchId.length; i++) seed += matchId.charCodeAt(i)
    const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    for (let i = base.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[base[i], base[j]] = [base[j], base[i]]
    }
    return base
  }, [matchId])

  const refreshChat = useCallback(async () => {
    if (!matchId || typeof window === "undefined") return
    const supabase = createClient()
    const messages = await listRoomMessages(supabase, matchId)
    const uiMessages: RoomChatMessage[] = messages.map((m) => ({
      id: m.id,
      user: m.senderDisplayName,
      text: m.message,
      ts: m.createdAt,
    }))
    setChatMessages(uiMessages)
  }, [matchId])

  const refreshSpectateChat = useCallback(async () => {
    if (!matchId || typeof window === "undefined") return
    const supabase = createClient()
    const messages = await listSpectateMessages(supabase, matchId)
    const uiMessages: RoomChatMessage[] = messages.map((m) => ({
      id: m.id,
      user: m.senderDisplayName,
      text: m.message,
      ts: m.createdAt,
    }))
    setSpectateMessages(uiMessages)
  }, [matchId])

  // Room chat: seated players (host, challenger) only can send. Everyone can read.
  const handleChatSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const text = chatInput.trim()
      if (!text) return
      try {
        const res = await fetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            match_id: matchId,
            sender_identity_id: getCurrentIdentity().id,
            sender_display_name: getCurrentUser().name,
            message: text,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setChatInput("")
          await refreshChat()
        } else {
          setMessage(typeof data?.error === "string" ? data.error : "Send failed")
        }
      } catch {
        setMessage("Send failed")
      }
    },
    [matchId, chatInput, refreshChat]
  )

  // Crowd chat: spectators only can send. Everyone (players + spectators) can read.
  const handleSpectateChatSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const text = spectateChatInput.trim()
      if (!text) return
      try {
        const res = await fetch("/api/spectate/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            match_id: matchId,
            sender_identity_id: getCurrentIdentity().id,
            sender_display_name: getCurrentUser().name,
            message: text,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setSpectateChatInput("")
          await refreshSpectateChat()
        } else {
          setMessage(typeof data?.error === "string" ? data.error : "Send failed")
        }
      } catch {
        setMessage("Send failed")
      }
    },
    [matchId, spectateChatInput, refreshSpectateChat]
  )

  useEffect(() => {
    refreshChatRef.current = refreshChat
    return () => { refreshChatRef.current = null }
  }, [refreshChat])

  useEffect(() => {
    refreshSpectateChatRef.current = refreshSpectateChat
    return () => { refreshSpectateChatRef.current = null }
  }, [refreshSpectateChat])

  useEffect(() => {
    if (!matchId) return
    refreshChat()
    const poll = window.setInterval(() => { void refreshChat() }, 1500)
    return () => window.clearInterval(poll)
  }, [matchId, refreshChat])

  useEffect(() => {
    if (!matchId) return
    refreshSpectateChat()
    const poll = window.setInterval(() => { void refreshSpectateChat() }, 1500)
    return () => window.clearInterval(poll)
  }, [matchId, refreshSpectateChat])

  useEffect(() => {
    const len = chatMessages.length
    const hadNewMessage = len > prevChatLengthRef.current
    prevChatLengthRef.current = len
    if (match?.status === "Finished") return
    if (!isChatNearBottomRef.current) return
    if (!hadNewMessage) return
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [chatMessages, match?.status])

  useEffect(() => {
    if (!matchId || match?.status !== "Finished") return
    let cancelled = false
    fetch(`/api/rooms/${matchId}/timeline`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; rounds?: MatchRoundRow[] }) => {
        if (cancelled || !data?.ok || !Array.isArray(data.rounds)) return
        setTimelineRounds(data.rounds)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [matchId, match?.status])

  const handleChatScroll = useCallback(() => {
    const el = chatScrollContainerRef.current
    if (!el) return
    const { scrollTop, clientHeight, scrollHeight } = el
    const threshold = 120
    isChatNearBottomRef.current = scrollTop + clientHeight >= scrollHeight - threshold
  }, [])

  /** Must be called unconditionally (before any early return). getMatchRole(null, id) returns spectator. */
  const roleInfo = useMemo(
    () => getMatchRole(match, getCurrentIdentity().id),
    [match, getCurrentIdentity().id]
  )

  // RPS live-debug: one render log (dev only, throttled). Must run unconditionally (before any early return).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !match || match.game !== "Rock Paper Scissors") return
    const challenger = match.challenger
    const rpsState = getRpsState(match)
    const shell_visible = match.status === "Ready to Start" && !!challenger
    const controls_visible = match.status === "Live" && !rpsState.revealed
    const board = (match.boardState ?? null) as PersistedRpsBoardState | null
    const board_mode = board && typeof board === "object" && "mode" in board ? String(board.mode) : "none"
    const now = Date.now()
    const last = rpsDebugLastLogRef.current
    const fingerprint = `${match.status}|${shell_visible}|${controls_visible}|${board_mode}|${rpsState.hostChoice}|${rpsState.challengerChoice}`
    const changed = !last || last.status !== match.status || last.shell !== shell_visible || last.controls !== controls_visible || last.boardMode !== board_mode || last.hostChoice !== rpsState.hostChoice || last.challengerChoice !== rpsState.challengerChoice
    const throttleMs = 3000
    const elapsed = last ? now - last.at : throttleMs
    if (changed || elapsed >= throttleMs) {
      const countdownEndMs =
        match.bettingClosesAt ??
        (match.countdownStartedAt != null
          ? match.countdownStartedAt + (match.countdownSeconds ?? match.bettingWindowSeconds ?? 30) * 1000
          : 0)
      const nowForCountdownMs =
        serverTimeSync.receivedAtMs > 0
          ? serverTimeSync.serverMs + (Date.now() - serverTimeSync.receivedAtMs)
          : Date.now()
      const bettingSecondsLeft =
        match.status === "Ready to Start" && countdownEndMs > 0
          ? Math.max(0, Math.ceil((countdownEndMs - nowForCountdownMs) / 1000))
          : 0
      const isIntermission =
        match.status === "Live" &&
        typeof match.roundIntermissionUntil === "number" &&
        Date.now() < match.roundIntermissionUntil
      const rawHostChoice = board && typeof board === "object" && "hostChoice" in board ? board.hostChoice : undefined
      const rawChallengerChoice = board && typeof board === "object" && "challengerChoice" in board ? board.challengerChoice : undefined
      const buttonsDisabled =
        match.status !== "Live" ||
        isIntermission ||
        (roleInfo.isHost && rpsState.hostChoice !== null) ||
        (roleInfo.isChallenger && rpsState.challengerChoice !== null)
      rpsDebugLastLogRef.current = { at: now, status: match.status, shell: shell_visible, controls: controls_visible, boardMode: board_mode, hostChoice: rpsState.hostChoice, challengerChoice: rpsState.challengerChoice }
      const renderBranch = shell_visible ? "countdown_shell" : controls_visible ? "live_controls" : "other"
      console.info("[RPS render]", {
        render_branch: renderBranch,
        raw_boardState_hostChoice: rawHostChoice,
        raw_boardState_challengerChoice: rawChallengerChoice,
        derived_hostChoice: rpsState.hostChoice,
        derived_challengerChoice: rpsState.challengerChoice,
        isHostUser: roleInfo.isHost,
        isChallengerUser: roleInfo.isChallenger,
        buttons_disabled: buttonsDisabled,
        shell_visible,
        controls_visible,
        match_status: match.status,
        updatedAt: match.updatedAt,
        board_state_mode: board_mode,
        runtime: {
          isCountdown: match.status === "Ready to Start",
          isIntermission,
          bettingSecondsLeft,
          countdownEndMs,
        },
      })
    }
  }, [match, serverTimeSync.receivedAtMs, serverTimeSync.serverMs, roleInfo.isHost, roleInfo.isChallenger])

  // Pregame phrase live-debug: role, phrase_index, match.status, etc. (dev only, throttled). Must run unconditionally (before any early return).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !match || match.status !== "Ready to Start") return
    const role = roleInfo.isHost ? "host" : roleInfo.isChallenger ? "challenger" : "spectator"
    const challenger = match.challenger
    const shell_visible = !!challenger
    const countdownEndMs =
      match.bettingClosesAt ??
      (match.countdownStartedAt != null
        ? match.countdownStartedAt + (match.countdownSeconds ?? match.bettingWindowSeconds ?? 30) * 1000
        : 0)
    const nowForCountdownMs =
      serverTimeSync.receivedAtMs > 0
        ? serverTimeSync.serverMs + (Date.now() - serverTimeSync.receivedAtMs)
        : Date.now()
    const bettingSecondsLeft =
      countdownEndMs > 0 ? Math.max(0, Math.ceil((countdownEndMs - nowForCountdownMs) / 1000)) : 0
    const fingerprint = `${role}|${match.status}|${countdownLineIndex}|${bettingSecondsLeft}|${shell_visible}`
    const now = Date.now()
    const last = pregamePhraseLogRef.current
    const throttleMs = 3000
    if (last && last.fingerprint === fingerprint && now - last.at < throttleMs) return
    pregamePhraseLogRef.current = { at: now, fingerprint }
    console.info("[pregame phrase] state", {
      role,
      phrase_index: countdownLineIndex,
      phrase_rotation_active: true,
      match_status: match.status,
      runtime_phase: "countdown",
      bettingSecondsLeft,
      countdown_started_at: match.countdownStartedAt ?? null,
      updated_at: match.updatedAt ?? null,
      shell_visible,
    })
  }, [match, roleInfo.isHost, roleInfo.isChallenger, countdownLineIndex, serverTimeSync.receivedAtMs, serverTimeSync.serverMs])

  // Ready -> Live transition is handled by the DB-authoritative /api/rooms/tick endpoint.

  if (!matchId) {
    return (
      <main className="min-h-screen bg-[#050807] text-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-8">
            <div className="text-3xl font-black">Invalid room</div>
            <p className="mt-3 text-white/65">No match ID was found in the route.</p>
            <Link
              href="/arena"
              className="mt-6 inline-flex rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white"
            >
              Back to Arena
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (!match) {
    const isLoading = !roomLoadAttempted
    return (
      <main className="min-h-screen bg-[#050807] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_0_50px_rgba(0,255,200,0.05)]">
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              KasRoyal Match Room
            </div>
            <div className="mt-5 text-4xl font-black">
              {isLoading ? "Loading room…" : "Room not found or no longer available"}
            </div>
            <p className="mt-4 max-w-2xl text-white/65">
              {isLoading
                ? "Loading match room…"
                : "This match may have ended or been canceled. Return to the Arena to find or create a new match."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/arena"
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white"
              >
                Arena Lobby
              </Link>
              <Link
                href="/spectate"
                className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-200"
              >
                Spectate
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const betAmount = clampBetAmount(Number(betAmountInput))
  const challenger = match.challenger
  const pauseState = normalizePauseState(match.pauseState)
  const spectatorPool = match.spectatorPool ?? { host: 0, challenger: 0 }

  const connect4Board = connect4State.board
  const connect4Turn = connect4State.turn
  const connect4TurnDeadlineTs = connect4State.turnDeadlineTs
  const hasPersistedConnect4State = connect4State.hasPersistedState

  const tttBoard = tttState.board
  const tttTurn = tttState.turn
  const tttTurnDeadlineTs = tttState.turnDeadlineTs
  const hasPersistedTttState = tttState.hasPersistedState

  const tttBoardFull = tttBoard.every((cell) => cell !== null)

  const isFinished = match.status === "Finished"
  const isCountdown = match.status === "Ready to Start"
  const isPaused = match.status === "Live" && pauseState.isPaused
  const isQuickMatch = match.matchMode === "quick"
  const currentUserProfile = getCurrentUser()
  const { isHost: isHostUser, isChallenger: isChallengerUser, isPlayer, isSpectatorOnly } = roleInfo
  const spectatorBetLockedForPlayers = isPlayer

  const pauseSecondsLeft =
    isPaused && pauseState.pauseExpiresAt
      ? Math.max(0, Math.ceil((pauseState.pauseExpiresAt - Date.now()) / 1000))
      : 0

  const pausedByName =
    pauseState.pausedBy === "host"
      ? match.host?.name ?? "Host"
      : pauseState.pausedBy === "challenger"
        ? challenger?.name ?? "Challenger"
        : "A player"

  const totalPlayerPot = Number(match.playerPot ?? 0)
  const totalSpectatorPool = spectatorPool.host + spectatorPool.challenger
  const netSpectatorPool = totalSpectatorPool * (1 - HOUSE_RAKE)
  // Pre-game countdown: use server-synced "now" so display matches server transition (countdown runs to 0 for both players).
  const countdownEndMs =
    match.bettingClosesAt ??
    (match.countdownStartedAt != null
      ? match.countdownStartedAt + (match.countdownSeconds ?? match.bettingWindowSeconds ?? 30) * 1000
      : 0)
  const nowForCountdownMs =
    serverTimeSync.receivedAtMs > 0
      ? serverTimeSync.serverMs + (Date.now() - serverTimeSync.receivedAtMs)
      : Date.now()
  const bettingSecondsLeft =
    match.status === "Ready to Start" && countdownEndMs > 0
      ? Math.max(0, Math.ceil((countdownEndMs - nowForCountdownMs) / 1000))
      : getArenaBettingSecondsLeft(match)
  const marketOpen = isArenaBettable(match)

  const currentTurnPlayerName = isFinished
    ? "—"
    : match.game === "Connect 4"
      ? connect4Turn === "host"
        ? match.host?.name ?? "Host"
        : challenger?.name ?? "Challenger"
      : match.game === "Tic-Tac-Toe"
        ? tttTurn === "X"
          ? match.host?.name ?? "Host"
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
  // Authoritative timer: only turn_expires_at. Use server-time sync so display matches server timeout (no early end from clock skew).
  const turnExpiresAtMs =
    match.status === "Live" && match.turnExpiresAt != null
      ? (typeof match.turnExpiresAt === "number"
          ? match.turnExpiresAt
          : new Date(String(match.turnExpiresAt)).getTime())
      : null
  const syncedNowMs =
    serverTimeSync.receivedAtMs > 0
      ? serverTimeSync.serverMs + (Date.now() - serverTimeSync.receivedAtMs)
      : Date.now()
  const moveSecondsLeft =
    match.status === "Live" && !isPaused && turnExpiresAtMs != null
      ? Math.max(0, Math.ceil((turnExpiresAtMs - syncedNowMs) / 1000))
      : 0

  const rpsRoundSecondsLeft =
    match.game === "Rock Paper Scissors" &&
    match.status === "Live" &&
    !rpsState.revealed &&
    rpsState.roundExpiresAt != null
      ? Math.max(0, Math.ceil((rpsState.roundExpiresAt - syncedNowMs) / 1000))
      : null

  const intermissionUntilMs =
    typeof match.roundIntermissionUntil === "number" ? match.roundIntermissionUntil : null
  const isIntermission =
    match.status === "Live" && intermissionUntilMs != null && Date.now() < intermissionUntilMs
  const intermissionSecondsLeft = isIntermission && intermissionUntilMs != null
    ? Math.max(0, Math.ceil((intermissionUntilMs - Date.now()) / 1000))
    : 0
  /** First 4s of intermission: show "Round over — X won!" so winning board is visible. Then 4s "Round N starts in X". */
  const intermissionPhase: "celebrate" | "countdown" =
    isIntermission && intermissionSecondsLeft >= 4 ? "celebrate" : "countdown"
  const roundJustEnded = isIntermission ? Math.max(1, (match.currentRound ?? 2) - 1) : 1
  const intermissionRoundWinnerName =
    isIntermission && match.lastRoundWinnerIdentityId != null
      ? (match.lastRoundWinnerIdentityId === match.hostIdentityId
          ? match.host?.name ?? "Host"
          : match.lastRoundWinnerIdentityId === match.challengerIdentityId
            ? challenger?.name ?? "Challenger"
            : null)
      : null
  const nextRoundNumber = match.currentRound ?? 1

  const canHostMove =
    !isFinished &&
    !isCountdown &&
    !isPaused &&
    !isIntermission &&
    match.status === "Live" &&
    ((match.game === "Connect 4" && connect4Turn === "host") ||
      (match.game === "Tic-Tac-Toe" && tttTurn === "X") ||
      (match.game === "Rock Paper Scissors" && !rpsState.revealed))

  const canChallengerMove =
    !isFinished &&
    !isCountdown &&
    !isPaused &&
    !isIntermission &&
    match.status === "Live" &&
    ((match.game === "Connect 4" && connect4Turn === "challenger") ||
      (match.game === "Tic-Tac-Toe" && tttTurn === "O") ||
      (match.game === "Rock Paper Scissors" && !rpsState.revealed))

  const canCurrentUserMove =
    !isFinished &&
    !isCountdown &&
    !isPaused &&
    (moveSecondsLeft > 0 || match.game === "Rock Paper Scissors") &&
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
    ? `Player • ${match.hostSideLabel ?? "Host"}`
    : isChallengerUser
      ? `Player • ${match.challengerSideLabel ?? "Challenger"}`
      : roleInfo.playerRoleLabel

  const hostRating = Number(match.host?.rating ?? 1000)
  const challengerRating = Number(challenger?.rating ?? 1000)
  const hostProbability = challenger ? getWinProbability(hostRating, challengerRating) : 0.5
  const challengerProbability = challenger
    ? getWinProbability(challengerRating, hostRating)
    : 0.5

  const favoriteData = challenger
    ? getFavoriteData(hostRating, challengerRating)
    : { leftLabel: "Waiting", rightLabel: "Waiting" }

  const hostCurrentMultiplier = getMultiplier(
    spectatorPool.host,
    spectatorPool.challenger,
    "host"
  )
  const challengerCurrentMultiplier = getMultiplier(
    spectatorPool.host,
    spectatorPool.challenger,
    "challenger"
  )

  const hostProjection = getProjectedState(
    spectatorPool.host,
    spectatorPool.challenger,
    "host",
    betAmount
  )

  const challengerProjection = getProjectedState(
    spectatorPool.host,
    spectatorPool.challenger,
    "challenger",
    betAmount
  )

  const hostShare = getSideShare(spectatorPool.host, spectatorPool.challenger, "host")
  const challengerShare = getSideShare(
    spectatorPool.host,
    spectatorPool.challenger,
    "challenger"
  )

  const myHostTickets = myTickets.filter((ticket) => ticket.side === "host")
  const myChallengerTickets = myTickets.filter((ticket) => ticket.side === "challenger")

  const myHostExposure = myHostTickets.reduce((sum, ticket) => sum + ticket.amount, 0)
  const myChallengerExposure = myChallengerTickets.reduce((sum, ticket) => sum + ticket.amount, 0)

  const myExistingSide: ArenaSide | null =
    myHostExposure > 0 ? "host" : myChallengerExposure > 0 ? "challenger" : null

  const selectedProjection = selectedSide === "host" ? hostProjection : challengerProjection
  const selectedPlayerName =
    selectedSide === "host"
      ? match.host?.name ?? "Host"
      : selectedSide === "challenger"
        ? challenger?.name ?? "Opponent"
        : "None"

  const oppositePoolForSelectedSide =
    selectedSide === "host"
      ? spectatorPool.challenger
      : selectedSide === "challenger"
        ? spectatorPool.host
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

  const recentTickets = [...myTickets].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)

  function persistPartialMatch(partial: Partial<ArenaMatch>) {
    if (!match) return
    setMatch((prev) => (prev ? { ...prev, ...partial } : null))
  }

  function handleSelectBetSide(side: ArenaSide) {
    if (!match) return

    if (spectatorBetLockedForPlayers) {
      setMessage("Players cannot bet on their own match. Only spectators can place arena bets.")
      return
    }

    if (myExistingSide && myExistingSide !== side) {
      const lockedSideName =
        myExistingSide === "host" ? match.host?.name ?? "Host" : challenger?.name ?? "Opponent"
      setMessage(
        `You already hold a position on ${lockedSideName}. KasRoyal v1 allows one side per match.`
      )
      return
    }

    setSelectedSide(side)

    const sideName = side === "host" ? match.host?.name ?? "Host" : challenger?.name ?? "Opponent"
    const oppositePool = side === "host" ? spectatorPool.challenger : spectatorPool.host

    if (oppositePool <= 0) {
      setMessage(
        `Selected ${sideName}. No opposing liquidity exists yet, so current projected profit is 0 KAS until bets arrive on the other side.`
      )
      return
    }

    setMessage(`Selected ${sideName}. Add to your position before lock if you want more exposure.`)
  }

  async function placeBet() {
    if (!match) return

    if (spectatorBetLockedForPlayers) {
      setMessage(
        "Players cannot bet on their own match. Spectator betting is for non-participants only."
      )
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
      const lockedSideName = myExistingSide === "host" ? match.host?.name ?? "Host" : challenger?.name ?? "Challenger"
      setMessage(
        `You already hold a position on ${lockedSideName}. You can add to that side before lock, but you cannot bet both sides in the same match.`
      )
      return
    }

    if (betAmount > currentUserProfile.walletBalance) {
      setMessage("Insufficient KAS balance for that spectator bet.")
      return
    }

    try {
      const ticket = await placeArenaSpectatorBet({
        matchId: match.id,
        side: selectedSide,
        amount: betAmount,
        user: getCurrentIdentity().id,
        walletAddress: getCurrentIdentity().id,
      })

      setPoolFlash(selectedSide)
      window.setTimeout(() => setPoolFlash(null), 700)

      const selectedPlayer = selectedSide === "host" ? match.host?.name ?? "Host" : challenger?.name ?? "Challenger"
      const projection = selectedSide === "host" ? hostProjection : challengerProjection
      const oppositePool =
        selectedSide === "host" ? spectatorPool.challenger : spectatorPool.host

      setFeed((prev) => {
        const whale = betAmount >= WHALE_BET_THRESHOLD
        const isAddToPosition = myExistingSide === selectedSide
        const prefix = isAddToPosition ? "➕ Position Added" : whale ? "🔥 WHALE BET" : "⚡ Spectator Bet"
        const line = `${prefix}: ${ticket.amount} KAS on ${selectedPlayer}`
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
    }
  }

  async function handlePauseMatch() {
    if (!match) return

    if (!currentUserSide) {
      setMessage("Only seated players can pause a live match.")
      return
    }

    try {
      const res = await fetch("/api/rooms/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: matchId,
          player_identity_id: getCurrentIdentity().id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) {
        setMessage(data.error ?? "Failed to pause match.")
        return
      }
      if (data.room) {
        const reconciled = reconcileRoom(data.room as Room)
        setMatch((prev) => acceptAndReconcile(reconciled, prev, "mutation"))
      }
      const actor = currentUserSide === "host" ? match.host?.name ?? "Host" : challenger?.name ?? "Challenger"
      setFeed((prev) => [`⏸ ${actor} used a pause`, ...prev].slice(0, 12))
      setMessage(
        `Pause started. ${actor} used one of their ${MAX_PAUSES_PER_SIDE} pauses. Match will auto-resume in ${PAUSE_DURATION_SECONDS}s or can be resumed early.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to pause match.")
    }
  }

  async function handleResumeMatch() {
    if (!match) return

    try {
      const res = await fetch("/api/rooms/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: matchId,
          player_identity_id: getCurrentIdentity().id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) {
        setMessage(data.error ?? "Failed to resume match.")
        return
      }
      if (data.room) {
        const reconciled = reconcileRoom(data.room as Room)
        setMatch((prev) => acceptAndReconcile(reconciled, prev, "mutation"))
      }
      const actor =
        currentUserSide === "host"
          ? match.host?.name ?? "Host"
          : currentUserSide === "challenger"
            ? challenger?.name ?? "Challenger"
            : "System"
      setFeed((prev) => [`▶ ${actor} resumed the match`, ...prev].slice(0, 12))
      setMessage("Match resumed. Active player's turn timer has been reset to full time.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to resume match.")
    }
  }

  async function handleCancelOpenRoom() {
    setShowCancelRoomConfirm(false)
    if (!matchId || !match) return
    if (match.challenger) return
    if (!isHostUser) return
    try {
      const res = await fetch("/api/rooms/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: matchId, host_identity_id: getCurrentIdentity().id }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessage("Room cancelled. You can create a new match from the Arena.")
        router.push("/arena")
      } else {
        setMessage(data.error ?? "Could not cancel room.")
      }
    } catch {
      setMessage("Could not cancel room. Only the host can cancel an open room with no challenger.")
    }
  }

  async function handleForfeit() {
    setShowForfeitConfirm(false)
    if (!match || !currentUserSide) return
    if (!challenger) return
    if (match.status !== "Ready to Start" && match.status !== "Live") return
    try {
      const res = await fetch("/api/rooms/forfeit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: match.id,
          forfeiter_identity_id: getCurrentIdentity().id,
        }),
      })
      const data = await res.json()
      if (data.ok && data.room) {
        const reconciled = reconcileRoom(data.room as Room)
        setMatch((prev) => acceptAndReconcile(reconciled, prev, "mutation"))
        const winnerName = currentUserSide === "host" ? challenger?.name ?? "Challenger" : match.host?.name ?? "Host"
        setFeed((prev) => [`🏳️ You forfeited. ${winnerName} wins.`, ...prev].slice(0, 12))
        setMessage(`You forfeited. ${winnerName} wins the match.`)
      } else {
        setMessage(data.error ?? "Forfeit failed.")
      }
    } catch {
      setMessage("Forfeit failed. Only seated players can forfeit in Ready to Start or Live.")
    }
  }

  async function dropConnect4(col: number) {
    if (!match) return
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
    try {
      const res = await fetch("/api/rooms/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: match.id,
          player_identity_id: getCurrentIdentity().id,
          move: col,
        }),
      })
      const data = await res.json()
      if (data.ok && data.room) {
        const reconciled = reconcileRoom(data.room as Room)
        setMatch((prev) => acceptAndReconcile(reconciled, prev, "mutation"))
        if (typeof data.server_time_ms === "number") {
          setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
        }
        const playerLabel = connect4Turn === "host" ? (match.host?.name ?? "Host") : (challenger?.name ?? "Challenger")
        setFeed((prev) => [`🎮 ${playerLabel} dropped in column ${col + 1}`, ...prev].slice(0, 12))
      } else {
        setMessage(data.error ?? "Move failed.")
      }
    } catch {
      setMessage("Move failed.")
    }
  }

  async function playTtt(index: number) {
    if (!match) return
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
    try {
      const res = await fetch("/api/rooms/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: match.id,
          player_identity_id: getCurrentIdentity().id,
          move: index,
        }),
      })
      const data = await res.json()
      if (data.ok && data.room) {
        const reconciled = reconcileRoom(data.room as Room)
        setMatch((prev) => acceptAndReconcile(reconciled, prev, "mutation"))
        if (typeof data.server_time_ms === "number") {
          setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
        }
        const playerLabel = tttTurn === "X" ? (match.host?.name ?? "Host") : (challenger?.name ?? "Challenger")
        setFeed((prev) => [`🎮 ${playerLabel} marked ${index + 1}`, ...prev].slice(0, 12))
      } else {
        setMessage(data.error ?? "Move failed.")
      }
    } catch {
      setMessage("Move failed.")
    }
  }

  async function submitRpsChoice(choice: RpsChoice) {
    if (!match) return
    if (match.game !== "Rock Paper Scissors") return
    if (isFinished) return
    if (isCountdown) {
      setMessage("Countdown active. Choices unlock at match start.")
      return
    }
    if (isPaused) {
      setMessage("Match is paused. Resume to continue gameplay.")
      return
    }
    if (rpsState.revealed) return
    if (match.status !== "Live") return
    if (isSpectatorOnly) {
      setMessage("Spectating only. You are not seated in this match.")
      return
    }
    try {
      const res = await fetch("/api/rooms/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: match.id,
          player_identity_id: getCurrentIdentity().id,
          move: choice,
        }),
      })
      const data = await res.json()
      if (data.ok && data.room) {
        const reconciled = reconcileRoom(data.room as Room)
        setMatch((prev) => acceptAndReconcile(reconciled, prev, "mutation"))
        if (typeof data.server_time_ms === "number") {
          setServerTimeSync({ serverMs: data.server_time_ms, receivedAtMs: Date.now() })
        }
        setFeed((prev) => [`✊ You chose ${choice}`, ...prev].slice(0, 12))
      } else {
        setMessage(data.error ?? "Move failed.")
      }
    } catch {
      setMessage("Move failed.")
    }
  }


  const boardTurnLabel = isFinished
    ? "—"
    : isCountdown
      ? "Countdown"
      : isPaused
        ? "Paused"
        : match.game === "Connect 4"
          ? connect4Turn === "host"
            ? match.host?.name ?? "Host"
            : challenger?.name ?? "Challenger"
          : match.game === "Tic-Tac-Toe"
            ? tttTurn === "X"
              ? match.host?.name ?? "Host"
              : challenger?.name ?? "Challenger"
            : match.game === "Rock Paper Scissors"
              ? rpsState.revealed
                ? "—"
                : (isHostUser || isChallengerUser)
                  ? "Choose or change your hand"
                  : "—"
              : "—"

  const boardClockLabel = isFinished
    ? "—"
    : isCountdown
      ? bettingSecondsLeft > 0 ? `Match starts in ${bettingSecondsLeft}s` : "Starting…"
      : isPaused
        ? `${pauseSecondsLeft}s`
        : match.game === "Rock Paper Scissors"
          ? rpsState.revealed
            ? "—"
            : rpsRoundSecondsLeft != null
              ? rpsRoundSecondsLeft > 0
                ? `Round ends in ${rpsRoundSecondsLeft}s`
                : "Round ended"
              : "—"
          : match.status === "Live"
            ? (currentTurnSide === currentUserSide ? `Your turn: ${moveSecondsLeft}s` : `Opponent turn: ${moveSecondsLeft}s`)
            : "—"

  const resultLine =
    match.status === "Finished"
      ? getMatchResultCopy(match, getCurrentIdentity().id)
      : null
  const winReasonShort =
    match.status === "Finished" && match.winReason
      ? match.winReason === "timeout"
        ? "Won by timeout"
        : match.winReason === "forfeit"
          ? "Won by forfeit"
          : match.winReason === "win"
            ? "Game win"
            : match.winReason
      : null

  const boardStateLabel =
    match.status === "Finished"
      ? resultLine && winReasonShort && resultLine !== "Draw"
        ? `${resultLine} • ${winReasonShort}`
        : resultLine ?? "Finished"
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
              : match.game === "Rock Paper Scissors"
                ? rpsState.revealed
                  ? rpsState.winner === "draw"
                    ? "Draw"
                    : "Win"
                  : "Choose"
                : "Preview"

  const countdownLine =
    countdownLines.length > 0 ? countdownLines[countdownLineIndex % countdownLines.length] : "Match starting soon…"

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_20%,transparent_80%,rgba(255,255,255,0.02))]" />

      {/* Cancel Open Room confirmation */}
      {showCancelRoomConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCancelRoomConfirm(false)} />
          <div className="relative w-full max-w-md rounded-[28px] border border-amber-300/25 bg-[#0c1210] p-6 shadow-2xl ring-1 ring-amber-300/10">
            <p className="text-lg font-bold text-white">Cancel this open room?</p>
            <p className="mt-2 text-sm text-white/70">
              No one has joined yet. The room will be removed and your wallet will no longer be locked to this match.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCancelRoomConfirm(false)}
                className="flex-1 rounded-2xl border border-white/20 bg-white/5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Keep Room
              </button>
              <button
                type="button"
                onClick={handleCancelOpenRoom}
                className="flex-1 rounded-2xl border border-amber-300/30 bg-amber-300/20 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-300/30"
              >
                Yes, Cancel Room
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Forfeit confirmation */}
      {showForfeitConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowForfeitConfirm(false)} />
          <div className="relative w-full max-w-md rounded-[28px] border border-red-300/25 bg-[#0c1210] p-6 shadow-2xl ring-1 ring-red-300/10">
            <p className="text-lg font-bold text-white">Forfeit this match?</p>
            <p className="mt-2 text-sm text-white/70">
              Your opponent will win and the match will end immediately. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowForfeitConfirm(false)}
                className="flex-1 rounded-2xl border border-white/20 bg-white/5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Keep Playing
              </button>
              <button
                type="button"
                onClick={handleForfeit}
                className="flex-1 rounded-2xl border border-red-300/30 bg-red-500/20 py-3 text-sm font-black text-red-200 transition hover:bg-red-500/30"
              >
                Yes, Forfeit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 mx-auto max-w-[1700px] px-5 py-8 md:px-8 xl:px-10">
        {match.status === "Finished" ? (
          <div className="mb-6 rounded-[28px] border-2 border-amber-300/30 bg-amber-300/10 p-6 text-center">
            <h2 className="text-2xl font-black text-amber-200">Match Over</h2>
            {match.bestOf > 1 && (match.roundScore?.host != null || match.roundScore?.challenger != null) ? (
              <p className="mt-2 text-base font-bold text-amber-100">
                Series: {match.host?.name ?? "Host"} {match.roundScore?.host ?? 0} — {match.roundScore?.challenger ?? 0} {challenger?.name ?? "Challenger"}
              </p>
            ) : null}
            {(() => {
              const resultCopy = getMatchResultCopy(match, getCurrentIdentity().id)
              const winnerName = getWinnerDisplayName(match)
              const winReasonLabel = getWinReasonLabel(match.winReason)
              return (
                <>
                  <p className="mt-2 text-lg font-bold text-white/90">{resultCopy}</p>
                  {winnerName && match.result !== "draw" && (
                    <p className="mt-1 text-sm text-white/75">
                      Winner: {winnerName}
                      {match.result === "host" && match.hostIdentityId ? ` (${match.hostIdentityId})` : match.result === "challenger" && match.challengerIdentityId ? ` (${match.challengerIdentityId})` : ""}
                    </p>
                  )}
                  {winReasonLabel && match.result !== "draw" && (
                    <p className="mt-0.5 text-xs text-white/60">Win reason: {winReasonLabel}</p>
                  )}
                </>
              )
            })()}
            {timelineRounds.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-200/90">Round-by-round</p>
                <ul className="mt-2 space-y-1 text-sm text-white/90">
                  {timelineRounds.map((r) => {
                    const winnerName =
                      r.winner_identity_id === match.hostIdentityId
                        ? (match.host?.name ?? "Host")
                        : r.winner_identity_id === match.challengerIdentityId
                          ? (challenger?.name ?? "Challenger")
                          : null
                    const resultText =
                      r.result_type === "draw"
                        ? "Draw"
                        : winnerName
                          ? `${winnerName} won`
                          : `Round ${r.round_number} (${r.result_type})`
                    return (
                      <li key={r.id}>
                        Round {r.round_number}: {resultText}
                        {r.result_type !== "draw" && winnerName ? ` — ${r.host_score_after}–${r.challenger_score_after}` : ""}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            <p className="mt-2 text-xs text-white/60">You can join or create a new match.</p>
            <Link
              href="/arena"
              className="mt-4 inline-flex rounded-2xl bg-amber-300/20 px-6 py-3 text-sm font-bold text-amber-200 transition hover:bg-amber-300/30"
            >
              Back to Arena
            </Link>
          </div>
        ) : null}

        <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/8">
          <div className="whitespace-nowrap py-3 text-sm font-semibold text-emerald-200">
            <div className="animate-[marquee_24s_linear_infinite] [@keyframes_marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}]">
              {feed.length ? feed.join("   •   ") : makeLiveFeed(match).join("   •   ")}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-[28px] border border-white/8 bg-white/[0.03] p-4 shadow-[0_0_50px_rgba(0,255,200,0.05)] sm:mb-8 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
            <div className="max-w-3xl">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300 sm:px-4 sm:py-2 sm:text-xs">
                  KasRoyal Live Match Room
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
                  You: {currentUserProfile.name}
                </span>
              </div>

              <h1 className="text-3xl font-black leading-none sm:text-5xl xl:text-6xl">
                {match.game}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60 sm:mt-4 sm:text-base sm:leading-7 xl:text-lg">
                Stay in the match room from the moment both players are seated. Watch the countdown,
                enjoy the pre-match hype, and jump right into the live game when the match starts.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:gap-3">
              <StatCard
                label="Phase"
                value={
                  isCountdown
                    ? "Pregame countdown"
                    : isPaused
                      ? "Paused"
                      : isIntermission
                        ? "Between rounds"
                        : formatArenaPhase(match.status)
                }
                accent={
                  isCountdown
                    ? "text-fuchsia-300"
                    : isPaused
                      ? "text-sky-300"
                      : isIntermission
                        ? "text-amber-300"
                        : "text-emerald-300"
                }
              />
              <StatCard label="Player Pot" value={`${totalPlayerPot} KAS`} accent="text-amber-300" />
              <StatCard label="Spectators" value={`${match.spectators}`} accent="text-sky-300" />
              <StatCard
                label="Role"
                value={playerRoleLabel}
                accent={isSpectatorOnly ? "text-white" : "text-emerald-300"}
              />
              <StatCard
                label="Match start"
                value={
                  isCountdown
                    ? bettingSecondsLeft > 0
                      ? `Starts in ${bettingSecondsLeft}s`
                      : "Starting…"
                    : "—"
                }
                accent={isCountdown ? "text-emerald-300" : "text-white/70"}
              />
              <StatCard
                label="Turn timer"
                value={
                  match.status === "Live" && moveSecondsLeft > 0
                    ? currentTurnSide === currentUserSide
                      ? `Your turn: ${moveSecondsLeft}s`
                      : `Opponent: ${moveSecondsLeft}s`
                    : isPaused
                      ? "Paused"
                      : "—"
                }
                accent={
                  isPaused
                    ? "text-sky-300"
                    : match.status === "Live" && moveSecondsLeft <= 5
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
          hostName={match.host?.name ?? "Host"}
          challengerName={challenger?.name ?? "Opponent"}
          isPaused={isPaused}
          pauseSecondsLeft={pauseSecondsLeft}
          pausedByName={pausedByName}
          finishedResultCopy={match.status === "Finished" ? getMatchResultCopy(match, getCurrentIdentity().id) : undefined}
        />

        <div className={`grid grid-cols-1 gap-6 xl:grid-rows-[auto_auto_auto] ${isQuickMatch ? "xl:grid-cols-[300px_minmax(0,1fr)]" : "xl:grid-cols-[300px_minmax(0,1fr)_minmax(420px,480px)]"}`}>
          <aside className="order-2 space-y-6 xl:order-1 xl:sticky xl:top-6 xl:row-span-1 xl:self-start">
            <div className={`rounded-[28px] border p-5 shadow-2xl ${isHostUser ? "border-emerald-400/25 bg-emerald-400/5" : "border-white/8 bg-white/[0.04]"}`}>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Player One (Host)</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-black">{match.host?.name ?? "Host"}</span>
                {isHostUser && (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/20 px-2.5 py-0.5 text-xs font-bold text-emerald-200">You</span>
                )}
              </div>

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
              <div className={`rounded-[28px] border p-5 shadow-2xl ${isChallengerUser ? "border-emerald-400/25 bg-emerald-400/5" : "border-white/8 bg-white/[0.04]"}`}>
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Player Two (Challenger)</p>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-black">{challenger.name}</span>
                  {isChallengerUser && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/20 px-2.5 py-0.5 text-xs font-bold text-emerald-200">You</span>
                  )}
                </div>

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

            {match.status === "Waiting for Opponent" && isHostUser ? (
              <div className="rounded-[28px] border border-amber-300/15 bg-amber-300/5 p-5 shadow-2xl">
                <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">Open Room</p>
                <p className="mt-2 text-sm text-white/70">
                  No challenger yet. You can cancel this room to free your wallet and create a new match.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCancelRoomConfirm(true)}
                  className="mt-4 w-full rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-300/20"
                >
                  Cancel Open Room
                </button>
              </div>
            ) : null}

            {isPlayer && challenger && (match.status === "Ready to Start" || match.status === "Live") ? (
              <div className="rounded-[28px] border border-red-300/15 bg-red-500/5 p-5 shadow-2xl">
                <p className="text-sm uppercase tracking-[0.2em] text-red-300/80">Forfeit</p>
                <p className="mt-2 text-sm text-white/70">
                  Forfeit this match. Your opponent will win and the match will end.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForfeitConfirm(true)}
                  className="mt-4 w-full rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200 transition hover:bg-red-500/20"
                >
                  Forfeit Match
                </button>
              </div>
            ) : null}

            {match.status === "Live" && (match.game === "Connect 4" || match.game === "Tic-Tac-Toe") ? (
              <div className="rounded-[28px] border border-amber-300/10 bg-amber-300/5 p-5 shadow-2xl">
                <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">Timeout Strikes</p>
                <p className="mt-1 text-xs text-white/60">
                  Move timer expired = 1 strike. {TIMEOUT_STRIKES_TO_LOSE} strikes = loss.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <StatCard
                    label={`${match.host?.name ?? "Host"}`}
                    value={`${match.timeoutStrikesHost ?? 0}/${TIMEOUT_STRIKES_TO_LOSE}`}
                    accent={(match.timeoutStrikesHost ?? 0) >= 2 ? "text-red-300" : "text-amber-300"}
                  />
                  <StatCard
                    label={challenger?.name ?? "Challenger"}
                    value={`${match.timeoutStrikesChallenger ?? 0}/${TIMEOUT_STRIKES_TO_LOSE}`}
                    accent={(match.timeoutStrikesChallenger ?? 0) >= 2 ? "text-red-300" : "text-amber-300"}
                  />
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

          <section className="order-3 space-y-6 xl:order-2 xl:col-start-2 xl:row-span-3 xl:row-start-1">
            <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_40px_rgba(0,255,200,0.05)]">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Live Arena Board</p>
                  <h2 className="mt-2 text-3xl font-black">
                    {match.host?.name ?? "Host"}
                    {challenger ? ` vs ${challenger.name}` : " vs Waiting Opponent"}
                  </h2>
                  {/* Series Scoreboard: always visible for BO1/BO3/BO5 */}
                  <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 sm:px-5 sm:py-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="text-sm font-bold uppercase tracking-wider text-amber-200/90">Series</span>
                      <span className="text-xl font-black text-amber-100 sm:text-2xl">
                        {match.host?.name ?? "Host"} <span className="text-amber-300">{match.roundScore?.host ?? 0}</span>
                        <span className="mx-2 text-white/50">—</span>
                        <span className="text-amber-300">{match.roundScore?.challenger ?? 0}</span> {challenger?.name ?? "Challenger"}
                      </span>
                      <span className="rounded-full border border-amber-300/30 bg-amber-300/15 px-3 py-1 text-sm font-bold text-amber-200">
                        BO{match.bestOf ?? 1}
                      </span>
                      {(match.bestOf === 3 || match.bestOf === 5) && (
                        <span className="text-sm text-amber-200/80">
                          First to {match.bestOf === 3 ? 2 : 3}
                        </span>
                      )}
                      {typeof match.currentRound === "number" && match.currentRound >= 1 && (match.status === "Live" || match.status === "Ready to Start") && (
                        <span className="text-sm font-semibold text-white/80">
                          Round {match.currentRound} of {match.bestOf ?? 1}
                        </span>
                      )}
                    </div>
                    {isFinished && match.result && match.result !== "draw" && (match.roundScore?.host != null || match.roundScore?.challenger != null) && (
                      <p className="mt-2 text-sm font-bold text-amber-100">
                        {match.result === "host" ? (match.host?.name ?? "Host") : (challenger?.name ?? "Challenger")} wins the series {match.roundScore?.host ?? 0}–{match.roundScore?.challenger ?? 0}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full bg-white/5 px-4 py-3 text-sm font-semibold text-white/75">
                    Best of {match.bestOf}
                  </div>
                  <div
                    className={`rounded-full px-4 py-3 text-sm font-bold ${
                      isCountdown
                        ? "bg-fuchsia-400/15 text-fuchsia-300"
                        : match.status === "Live"
                          ? isPaused
                            ? "bg-sky-300/10 text-sky-300"
                            : isIntermission
                              ? "bg-amber-400/15 text-amber-300"
                              : "bg-red-500/10 text-red-300"
                          : match.status === "Waiting for Opponent" || match.status === "Ready to Start"
                            ? "bg-amber-400/10 text-amber-300"
                            : "bg-emerald-400/10 text-emerald-300"
                    }`}
                  >
                    {isCountdown
                      ? "Pregame countdown"
                      : isPaused
                        ? "Paused"
                        : isIntermission
                          ? "Between rounds"
                          : formatArenaPhase(match.status)}
                  </div>
                  {!isQuickMatch && (
                  <div
                    className={`rounded-full px-4 py-3 text-sm font-bold ${
                      marketOpen ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-white/75"
                    }`}
                  >
                    {marketOpen ? (bettingSecondsLeft > 0 ? `Betting open • ${bettingSecondsLeft}s left` : "Betting closing…") : "Betting closed"}
                  </div>
                  )}
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
                        ? bettingSecondsLeft > 0 ? `Match starts in ${bettingSecondsLeft}s` : "Starting match…"
                        : match.status === "Live"
                          ? `Move timer • ${moveSecondsLeft}s`
                          : "Move timer idle"}
                  </div>
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-white/8 bg-black/25 p-4 text-sm leading-6 text-white/80">
                {isFinished
                  ? `Match finished. Final state: ${match.statusText}.`
                  : isIntermission
                    ? intermissionPhase === "celebrate"
                      ? (intermissionRoundWinnerName != null
                          ? `${intermissionRoundWinnerName} won Round ${roundJustEnded}. The board stays visible briefly, then the next round countdown begins.`
                          : `Round ${roundJustEnded} was a draw. Next round countdown starts in a moment.`)
                      : `Round ${nextRoundNumber} starts in ${intermissionSecondsLeft}s. Stay here — the board will reset automatically.`
                    : isCountdown
                      ? isPlayer
                        ? bettingSecondsLeft > 0 ? `You are seated in this room. Stay here — the countdown is active and the match begins in ${bettingSecondsLeft}s.` : "Match is starting… Stay here — the arena will go live shortly."
                        : bettingSecondsLeft > 0 ? `Match starts in ${bettingSecondsLeft}s. Betting remains open until lock, then the arena goes live.` : "Starting match…"
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
                      hostName={match.host?.name ?? "Host"}
                      challengerName={challenger.name}
                      hypeLine={countdownLine}
                      isQuickMatch={isQuickMatch}
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

                  {isIntermission ? (
                    <IntermissionBanner
                      phase={intermissionPhase}
                      roundJustEnded={roundJustEnded}
                      roundWinnerName={intermissionRoundWinnerName}
                      nextRoundNumber={nextRoundNumber}
                      secondsLeft={intermissionSecondsLeft}
                    />
                  ) : null}

                  {/* Connect 4: only column headers are clickable for drops — avoids wrong-column from cell taps/overlays. */}
                  <div className="mb-5 grid w-full max-w-4xl grid-cols-7 gap-2" role="group" aria-label="Connect 4 column drop targets">
                    {Array.from({ length: 7 }).map((_, col) => {
                      const disabled =
                        isCountdown ||
                        isPaused ||
                        isSpectatorOnly ||
                        match.status !== "Live" ||
                        connect4Winner !== null ||
                        !canCurrentUserMove
                      return (
                        <button
                          key={col}
                          type="button"
                          data-column={col}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            dropConnect4(col)
                          }}
                          disabled={disabled}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-40 disabled:pointer-events-none touch-manipulation"
                          aria-label={`Drop in column ${col + 1}`}
                        >
                          Drop
                        </button>
                      )
                    })}
                  </div>

                  <div className="grid w-full max-w-4xl grid-cols-7 gap-2 rounded-[24px] border border-emerald-300/14 bg-[#07100e] p-4 shadow-[inset_0_0_24px_rgba(0,255,200,0.08)]" role="grid" aria-label="Connect 4 board">
                    {connect4Board.map((row, r) =>
                      row.map((cell, c) => (
                        <div
                          key={`${r}-${c}`}
                          role="presentation"
                          className={`aspect-square rounded-full border ${
                            cell === "host"
                              ? "border-amber-200/70 bg-amber-300 shadow-[0_0_14px_rgba(255,215,0,0.18)]"
                              : cell === "challenger"
                                ? "border-emerald-300/70 bg-emerald-400 shadow-[0_0_14px_rgba(0,255,200,0.18)]"
                                : "border-white/5 bg-black/45"
                          }`}
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
                    <StatCard
                      label={match.status === "Finished" ? "Result" : "State"}
                      value={boardStateLabel}
                      accent={match.status === "Finished" ? "text-amber-300" : "text-amber-300"}
                    />
                  </div>
                </GameBoardShell>
              ) : match.game === "Tic-Tac-Toe" ? (
                <GameBoardShell title="Playable Tic-Tac-Toe" subtitle={match.statusText}>
                  {isCountdown && challenger ? (
                    <CountdownOverlay
                      seconds={bettingSecondsLeft}
                      hostName={match.host?.name ?? "Host"}
                      challengerName={challenger.name}
                      hypeLine={countdownLine}
                      isQuickMatch={isQuickMatch}
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

                  {isIntermission ? (
                    <IntermissionBanner
                      phase={intermissionPhase}
                      roundJustEnded={roundJustEnded}
                      roundWinnerName={intermissionRoundWinnerName}
                      nextRoundNumber={nextRoundNumber}
                      secondsLeft={intermissionSecondsLeft}
                    />
                  ) : null}

                  <div className="flex w-full flex-col items-center justify-center">
                    <div className="grid w-full max-w-[380px] grid-cols-3 gap-4 rounded-3xl border border-emerald-300/15 bg-[#07100e] p-6 shadow-[inset_0_0_32px_rgba(0,255,200,0.04)] sm:gap-5 sm:p-8">
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
                          className={`aspect-square rounded-2xl border text-4xl font-black transition sm:text-5xl disabled:opacity-70 ${
                            cell === "X"
                              ? "border-amber-300/30 bg-amber-300/10 text-amber-200 shadow-[0_0_20px_rgba(255,215,0,0.12)]"
                              : cell === "O"
                                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200 shadow-[0_0_20px_rgba(0,255,200,0.12)]"
                                : "border-white/10 bg-black/35 text-white/20 hover:bg-white/[0.06]"
                          }`}
                        >
                          {cell ?? ""}
                        </button>
                      ))}
                    </div>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
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
                      <StatCard
                        label={match.status === "Finished" ? "Result" : "State"}
                        value={boardStateLabel}
                        accent="text-amber-300"
                      />
                    </div>
                  </div>
                </GameBoardShell>
              ) : match.game === "Rock Paper Scissors" ? (
                <GameBoardShell title="Rock Paper Scissors" subtitle={match.statusText}>
                  {match.status === "Ready to Start" && challenger ? (
                    <CountdownOverlay
                      seconds={bettingSecondsLeft}
                      hostName={match.host?.name ?? "Host"}
                      challengerName={challenger.name}
                      hypeLine={countdownLine}
                      isQuickMatch={isQuickMatch}
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

                  {isIntermission ? (
                    <IntermissionBanner
                      phase={intermissionPhase}
                      roundJustEnded={roundJustEnded}
                      roundWinnerName={intermissionRoundWinnerName}
                      nextRoundNumber={nextRoundNumber}
                      secondsLeft={intermissionSecondsLeft}
                    />
                  ) : null}

                  <div className="flex w-full flex-col items-center justify-center">
                    {rpsState.revealed || match.status === "Finished" ? (
                      <div className="w-full max-w-md space-y-6 rounded-3xl border border-amber-300/20 bg-[#07100e] p-6 shadow-[inset_0_0_32px_rgba(255,200,80,0.06)] sm:p-8">
                        <p className="text-center text-lg font-bold uppercase tracking-wider text-amber-200/90">Reveal</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-2xl border border-amber-300/15 bg-black/30 px-4 py-3 text-center">
                            <p className="text-xs font-bold uppercase text-white/60">{match.host?.name ?? "Host"}</p>
                            <p className="mt-1 text-2xl font-black capitalize text-amber-200">
                              {rpsState.hostChoice ?? "—"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-emerald-300/15 bg-black/30 px-4 py-3 text-center">
                            <p className="text-xs font-bold uppercase text-white/60">{challenger?.name ?? "Challenger"}</p>
                            <p className="mt-1 text-2xl font-black capitalize text-emerald-200">
                              {rpsState.challengerChoice ?? "—"}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-center">
                          {rpsState.winner === "draw" ? (
                            <p className="text-xl font-bold text-white/90">Draw</p>
                          ) : rpsState.winner === "host" ? (
                            <p className="text-xl font-bold text-amber-300">{match.host?.name ?? "Host"} wins</p>
                          ) : rpsState.winner === "challenger" ? (
                            <p className="text-xl font-bold text-emerald-300">{challenger?.name ?? "Challenger"} wins</p>
                          ) : (
                            <p className="text-lg text-white/70">—</p>
                          )}
                          {match.winReason && match.status === "Finished" && (
                            <p className="mt-1 text-sm text-white/60">{match.winReason}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid w-full max-w-lg grid-cols-3 gap-4 sm:gap-6">
                        {(["rock", "paper", "scissors"] as const).map((choice) => {
                          const myChoice = isHostUser ? rpsState.hostChoice : isChallengerUser ? rpsState.challengerChoice : null
                          const isSelected = myChoice === choice
                          const disabled =
                            match.status !== "Live" ||
                            isPaused ||
                            isIntermission ||
                            rpsState.revealed ||
                            !(isHostUser || isChallengerUser)
                          return (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => submitRpsChoice(choice)}
                              disabled={disabled}
                              className={`flex flex-col items-center justify-center rounded-2xl border-2 px-6 py-8 text-center transition touch-manipulation sm:px-8 sm:py-10 ${
                                isSelected
                                  ? "border-amber-400 bg-amber-400/20 text-amber-200 shadow-[0_0_24px_rgba(255,200,80,0.2)]"
                                  : "border-white/15 bg-black/40 text-white/90 hover:border-amber-300/30 hover:bg-amber-400/10 disabled:opacity-50 disabled:pointer-events-none"
                              }`}
                            >
                              <span className="text-3xl sm:text-4xl" aria-hidden>
                                {choice === "rock" ? "✊" : choice === "paper" ? "✋" : "✌️"}
                              </span>
                              <span className="mt-2 text-lg font-bold capitalize sm:text-xl">{choice}</span>
                              {isSelected && !rpsState.revealed && (
                                <span className="mt-1 text-xs font-medium uppercase text-amber-300/90">Current choice</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <p className="mt-6 text-center text-sm text-white/60">
                      {rpsState.revealed
                        ? "Result is final."
                        : (() => {
                            const bothChosen = rpsState.hostChoice != null && rpsState.challengerChoice != null
                            if (bothChosen) return "Both chosen — resolving."
                            if (isHostUser || isChallengerUser) {
                              return rpsRoundSecondsLeft != null && rpsRoundSecondsLeft > 0
                                ? "Choose or change your hand. Round ends when both have chosen or time runs out."
                                : "Choose or change your hand. Round ends when both have chosen or time runs out."
                            }
                            return "Spectating. Round resolves when both players have chosen or time runs out."
                          })()}
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                      <StatCard label="Status" value={boardTurnLabel} accent="text-sky-300" />
                      <StatCard label="Clock" value={boardClockLabel} accent="text-amber-300" />
                      <StatCard
                        label={match.status === "Finished" ? "Result" : "State"}
                        value={boardStateLabel}
                        accent="text-amber-300"
                      />
                    </div>
                  </div>
                </GameBoardShell>
              ) : (
                <GameBoardShell title="Chess Match Preview" subtitle={match.statusText}>
                  {isCountdown && challenger ? (
                    <CountdownOverlay
                      seconds={bettingSecondsLeft}
                      hostName={match.host?.name ?? "Host"}
                      challengerName={challenger.name}
                      hypeLine={countdownLine}
                      isQuickMatch={isQuickMatch}
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
                      label={match.status === "Finished" ? "Result" : "State"}
                      value={match.status === "Finished" ? (resultLine ?? "Finished") : isCountdown ? "Starting Soon" : "Preview"}
                      accent="text-amber-300"
                    />
                  </div>

                  <div className="mt-8 max-w-3xl rounded-[22px] border border-white/8 bg-black/25 px-6 py-5 text-center text-white/75">
                    Chess room is staged as a premium preview right now. Connect 4 and Tic-Tac-Toe are the
                    first playable game rooms. Chess should be the next dedicated gameplay build.
                  </div>
                </GameBoardShell>
              )}

              {/* Room Chat — under board; mobile: fixed bottom composer so keyboard doesn't hide input */}
              <div className="mt-5 w-full">
                <div className="flex max-h-[75vh] flex-col rounded-2xl border border-emerald-400/20 bg-[var(--surface-card)] p-4 shadow-[0_0_28px_rgba(16,185,129,0.08)] ring-1 ring-emerald-400/10 md:max-h-none">
                  <div className="mb-3 flex shrink-0 items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300/90">Room Chat</p>
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                      Live
                    </span>
                  </div>
                  {/* Mobile: scrollable list with touch scroll; extra padding so last message isn't hidden behind fixed form. onScroll: only auto-scroll when user is near bottom. */}
                  <div
                    ref={chatScrollContainerRef}
                    onScroll={handleChatScroll}
                    className="min-h-[140px] flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden rounded-xl border border-white/8 bg-black/25 p-3.5 overscroll-contain md:min-h-[240px] md:max-h-[380px] md:flex-none pb-[env(safe-area-inset-bottom)] md:pb-0 max-md:pb-[88px] max-md:min-h-[120px] max-md:max-h-[50vh]"
                    style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                  >
                    {chatMessages.length === 0 ? (
                      <div className="flex min-h-[120px] items-center justify-center rounded-xl bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45 md:min-h-[220px]">
                        {isPlayer ? "No messages yet. Say something!" : "Room chat — players only. Crowd chat below for spectators."}
                      </div>
                    ) : (
                      <>
                        {chatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className="rounded-xl border border-white/5 bg-white/[0.04] px-4 py-3 transition hover:bg-white/[0.06]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-emerald-300">{msg.user}</span>
                              <span className="text-xs uppercase tracking-wider text-white/40">
                                {new Date(msg.ts).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div className="mt-2 break-words text-base leading-snug text-white/90">{msg.text}</div>
                          </div>
                        ))}
                        <div ref={chatMessagesEndRef} className="h-0 shrink-0" aria-hidden />
                      </>
                    )}
                  </div>
                  {/* Desktop: form inline. Mobile: form in portal at body — high z-index and isolation so it stays usable during live gameplay (no overlay/stacking blocking input or send). */}
                  {isMobileView && mounted && typeof document !== "undefined"
                    ? createPortal(
                        <div
                          className="fixed bottom-0 left-0 right-0 z-[2147483646] isolate border-t border-white/10 bg-[var(--surface-card)] p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.3)]"
                          style={{
                            pointerEvents: "auto",
                            touchAction: "manipulation",
                            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                          }}
                          data-mobile-chat-composer
                        >
                          <form
                            ref={chatFormRef}
                            className="flex gap-2"
                            onSubmit={handleChatSubmit}
                          >
                            <input
                              type="text"
                              inputMode="text"
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              placeholder={isPlayer ? "Type a message…" : "Room chat — players only"}
                              maxLength={500}
                              autoComplete="off"
                              disabled={!isPlayer}
                              className="min-h-[52px] min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 text-base text-white outline-none placeholder:text-white/40 focus:border-emerald-300/30 focus:ring-2 focus:ring-emerald-300/20 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
                              style={{ fontSize: "16px" }}
                              aria-label="Room chat message"
                            />
                            <button
                              type="submit"
                              disabled={!isPlayer || !chatInput.trim()}
                              className="touch-manipulation select-none min-h-[52px] min-w-[64px] shrink-0 rounded-xl border border-emerald-300/30 bg-emerald-400/20 px-5 py-3.5 text-base font-bold text-emerald-200 transition active:scale-[0.98] hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Send message"
                            >
                              Send
                            </button>
                          </form>
                        </div>,
                        document.body
                      )
                    : null}
                  {isMobileView && mounted ? (
                    <div className="mt-4 min-h-[52px] shrink-0 md:hidden" aria-hidden />
                  ) : (
                    <form
                      ref={chatFormRef}
                      className="mt-4 flex shrink-0 gap-2 md:gap-3"
                      style={{ scrollMarginBottom: 24 }}
                      onSubmit={handleChatSubmit}
                    >
                      <input
                        type="text"
                        inputMode="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={isPlayer ? "Type a message…" : "Room chat — players only"}
                        maxLength={500}
                        autoComplete="off"
                        disabled={!isPlayer}
                        className="min-h-[52px] min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 text-base text-white outline-none placeholder:text-white/40 focus:border-emerald-300/30 focus:ring-2 focus:ring-emerald-300/20 md:min-h-[48px] md:py-4 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ fontSize: "16px" }}
                        aria-label="Room chat message"
                      />
                      <button
                        type="submit"
                        disabled={!isPlayer || !chatInput.trim()}
                        className="touch-manipulation select-none min-h-[52px] min-w-[64px] shrink-0 rounded-xl border border-emerald-300/30 bg-emerald-400/20 px-5 py-3.5 text-base font-bold text-emerald-200 md:min-h-[48px] md:min-w-[52px] md:px-6 md:py-4"
                        aria-label="Send message"
                      >
                        Send
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Crowd Chat (spectator/crowd) — spectate_messages; spectators send, everyone can read */}
              <div className="mt-5 w-full">
                <div className="flex max-h-[75vh] flex-col rounded-2xl border border-amber-400/20 bg-[var(--surface-card)] p-4 shadow-[0_0_28px_rgba(251,191,36,0.08)] ring-1 ring-amber-400/10 md:max-h-none">
                  <div className="mb-3 flex shrink-0 items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/90">Crowd Chat</p>
                    <span className="rounded-full border border-amber-400/25 bg-amber-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                      Live
                    </span>
                  </div>
                  <div
                    className="min-h-[140px] flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden rounded-xl border border-white/8 bg-black/25 p-3.5 overscroll-contain md:min-h-[240px] md:max-h-[380px] md:flex-none md:pb-0 max-md:min-h-[120px] max-md:max-h-[50vh]"
                    style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                  >
                    {spectateMessages.length === 0 ? (
                      <div className="flex min-h-[120px] items-center justify-center rounded-xl bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45 md:min-h-[220px]">
                        {isSpectatorOnly ? "No crowd messages yet. Say something!" : "Crowd chat — spectators can send. You can read."}
                      </div>
                    ) : (
                      <>
                        {spectateMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className="rounded-xl border border-white/5 bg-white/[0.04] px-4 py-3 transition hover:bg-white/[0.06]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-amber-300">{msg.user}</span>
                              <span className="text-xs uppercase tracking-wider text-white/40">
                                {new Date(msg.ts).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div className="mt-2 break-words text-base leading-snug text-white/90">{msg.text}</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  <form
                    className="mt-4 flex shrink-0 gap-2 md:gap-3"
                    onSubmit={handleSpectateChatSubmit}
                  >
                    <input
                      type="text"
                      inputMode="text"
                      value={spectateChatInput}
                      onChange={(e) => setSpectateChatInput(e.target.value)}
                      placeholder={isSpectatorOnly ? "Type a crowd message…" : "Crowd chat — spectators only"}
                      maxLength={500}
                      autoComplete="off"
                      disabled={!isSpectatorOnly}
                      className="min-h-[52px] min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 text-base text-white outline-none placeholder:text-white/40 focus:border-amber-300/30 focus:ring-2 focus:ring-amber-300/20 md:min-h-[48px] md:py-4 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ fontSize: "16px" }}
                      aria-label="Crowd chat message"
                    />
                    <button
                      type="submit"
                      disabled={!isSpectatorOnly || !spectateChatInput.trim()}
                      className="touch-manipulation select-none min-h-[52px] min-w-[64px] shrink-0 rounded-xl border border-amber-300/30 bg-amber-400/20 px-5 py-3.5 text-base font-bold text-amber-200 md:min-h-[48px] md:min-w-[52px] md:px-6 md:py-4 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send crowd message"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </section>

          {/* Right column: Betting (ranked only) + Feed — hidden for Quick Match */}
          {!isQuickMatch ? (
          <>
          <div className="order-1 space-y-5 xl:order-3 xl:col-start-3 xl:row-start-1 xl:sticky xl:top-6 xl:self-start">
            <div className="min-w-0 rounded-2xl border border-amber-400/25 bg-[var(--surface-card)] p-4 shadow-[0_0_32px_rgba(251,191,36,0.1)] ring-1 ring-amber-400/10 sm:p-5">
              <div className="mb-4 flex flex-col gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90">Live Arena Betting</p>
                  <h3 className="mt-1.5 text-xl font-black text-white sm:text-2xl">Spectator Market</h3>
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
                <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4">
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

              <div className="mb-5 grid gap-3 sm:gap-4">
                <div className="min-w-0 rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">KasRoyal v1 Rule</div>
                  <div className="mt-1.5 text-base font-black text-white sm:text-lg">One Side Per Match</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-white/65">
                    Back one side only. Add to that position before lock; no hedging both sides.
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Your Locked Side</div>
                  <div className="mt-1.5 text-base font-black text-emerald-300 sm:text-lg">
                    {spectatorBetLockedForPlayers
                      ? "Player In Match"
                      : myExistingSide === "host"
                        ? match.host?.name ?? "Host"
                        : myExistingSide === "challenger"
                          ? challenger?.name ?? "Opponent"
                          : "No Position Yet"}
                  </div>
                  <div className="mt-1.5 text-sm leading-relaxed text-white/65">
                    {spectatorBetLockedForPlayers
                      ? "Participants cannot use the spectator pool in their own match."
                      : myExistingSide
                        ? "Add to this side before lock for more exposure."
                        : "Select a side to open your position."}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Projected Profit</div>
                  <div className="mt-1.5 text-base font-black text-amber-300 sm:text-lg">
                    {spectatorBetLockedForPlayers
                      ? "Locked"
                      : selectedSide && !marketNeedsOpposingLiquidity
                        ? `${selectedProjectedProfit.toFixed(2)} KAS`
                        : "0.00 KAS"}
                  </div>
                  <div className="mt-1.5 text-sm leading-relaxed text-white/65">
                    {spectatorBetLockedForPlayers
                      ? "Spectate other matches to bet."
                      : selectedSide && marketNeedsOpposingLiquidity
                        ? "Profit appears when opposing liquidity exists."
                        : "Profit from losing side pool after rake."}
                  </div>
                </div>
              </div>

              <div className="grid gap-5">
                <div className="min-w-0 rounded-2xl border border-amber-400/15 bg-black/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Back Host</div>
                      <div className="mt-2 text-3xl font-black">{match.host?.name ?? "Host"}</div>
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
                      Back {match.host?.name ?? "Host"}
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
                        {spectatorPool.host.toFixed(0)} KAS
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

                <div className="min-w-0 rounded-2xl border border-emerald-400/15 bg-black/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Back Challenger</div>
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
                        {spectatorPool.challenger.toFixed(0)} KAS
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

            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Bet Slip</p>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">Selected Side</div>
                  <div className="mt-2 text-xl font-black">
                    {spectatorBetLockedForPlayers
                      ? "Players Cannot Bet"
                      : selectedSide === "host"
                        ? match.host?.name ?? "Host"
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
                    disabled={spectatorBetLockedForPlayers}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-xl font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[5, 10, 25, 50].map((quick) => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setBetAmountInput(String(quick))}
                        disabled={spectatorBetLockedForPlayers}
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
                      <span>{match.host?.name ?? "Host"}</span>
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
                    spectatorBetLockedForPlayers ||
                    !marketOpen ||
                    !challenger ||
                    !selectedSide ||
                    !canBetSelectedSide
                  }
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-base font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {spectatorBetLockedForPlayers
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
                          ticket.side === "host" ? match.host?.name ?? "Host" : challenger ? challenger.name : "Opponent"

                        return (
                          <div key={ticket.id} className="rounded-xl bg-white/[0.03] px-3 py-3">
                            {ticket.amount.toFixed(0)} KAS on {sideName}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Live Feed — right column when ranked */}
          <div className="order-5 min-w-0 xl:col-start-3 xl:row-start-3">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Live Feed</div>
              <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto text-sm text-white/80">
                {(feed.length ? feed : makeLiveFeed(match)).map((item, idx) => (
                  <div key={`${item}-${idx}`} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
          </>
          ) : null}
        </div>
      </div>
    </main>
  )
}