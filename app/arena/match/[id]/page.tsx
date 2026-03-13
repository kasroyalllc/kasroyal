"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
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
  getWinProbability,
  HOUSE_RAKE,
  isArenaBettable,
  MAX_BET,
  MAX_PAUSES_PER_SIDE,
  MIN_BET,
  PAUSE_DURATION_SECONDS,
  TIMEOUT_STRIKES_TO_LOSE,
  pauseArenaMatch,
  placeArenaSpectatorBet,
  readCurrentUserTickets,
  resumeArenaMatch,
  subscribeSpectatorTickets,
  type ArenaMatch,
  type ArenaSide,
  type PauseState,
  type PersistedBetTicket,
  type RankTier,
  type RoomChatMessage,
  upsertMatchLocally,
  WHALE_BET_THRESHOLD,
} from "@/lib/mock/arena-data"
import { getCurrentIdentity } from "@/lib/identity"
import { createClient } from "@/lib/supabase/client"
import { getRoomById, listRoomMessages } from "@/lib/rooms/rooms-service"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"

type Connect4Cell = "host" | "challenger" | null
type TttCell = "X" | "O" | null

const CONNECT4_MOVE_SECONDS = 20
const TTT_MOVE_SECONDS = 10

const COUNTDOWN_HYPE_LINES_POOL = [
  "Crowd is pretending they knew the winner all along…",
  "Somebody just bet like they saw the future.",
  "The arena announcer is losing his voice already.",
  "Last call before chaos begins.",
  "Smart money and dumb luck are now both in the room.",
  "♞ Knights are stretching before battle...",
  "🔥 Crowd money is starting to heat up...",
  "💰 Last-minute action hitting the market...",
  "🎯 Smart money is circling the underdog...",
  "⚡ Bets are flying before lock...",
  "👑 Crowns up. Match ignition incoming...",
  "🧠 The house always wins. Just kidding. Maybe.",
  "🎲 Place your bets. No refunds after zero.",
  "⏱️ T-minus something. Get ready.",
  "🐴 Dark horse energy in the room.",
  "💎 Diamond hands only past this point.",
  "🚀 To the moon or to the lobby. Your call.",
  "🎪 Pre-match circus. You're in it.",
  "🍿 Best seat in the house. Don't leave.",
  "🃏 Cards on the table in 30 seconds.",
  "🏆 Someone's about to win. Might be you.",
  "📢 Final call. Actually we have a timer.",
  "🌶️ Spice level: about to go live.",
  "🦁 Only the bold stay past zero.",
  "⚔️ Swords up. Match is loading.",
  "🎰 Odds are odds. Bet with your head.",
  "🦅 Eagle eye on the board. Get set.",
  "🐉 Dragon energy. Match incoming.",
  "🛡️ Shields up. Countdown active.",
  "🎺 Fanfare in 3… 2… 1…",
  "🧲 Magnetic pull to the arena.",
  "🌈 Fortune favors the ready.",
  "🔮 Crystal ball says: place your side.",
  "🪙 Coins in. No take-backs at zero.",
  "🎭 Drama in 30. Stay tuned.",
  "🦊 Smart foxes lock in now.",
  "🐺 Wolves are circling. Join or watch.",
  "🌙 Midnight energy. Match at dawn.",
  "☕ Last sips before the board drops.",
  "🪨 Rock solid? Lock your side.",
  "✂️ Paper beats… actually we do board games.",
  "🃏 Joker's wild. Timer's not.",
  "🎪 Step right up. Timer's running.",
  "🔔 Bell's about to ring. Get set.",
  "📣 Hype train. All aboard.",
  "🛒 Last chance aisle. Betting closes at zero.",
  "🧩 Pieces moving soon. Stay put.",
  "🎨 Masterpiece in progress. You're in it.",
  "🏅 Medals not handed out yet. Compete.",
  "🪵 Logs on the fire. Match is heating up.",
  "🌊 Wave of action incoming.",
  "🦋 Butterfly effect. Your bet matters.",
  "🔬 Lab conditions. Fair play only.",
  "📐 Angles and edges. Lock the side.",
  "🎯 Bullseye in 30. Aim now.",
  "🪁 Kites up. Match winds are blowing.",
  "🧨 Fuse lit. Stand clear at zero.",
  "🎬 Director says action in 30.",
  "🦉 Wise owls have already locked in.",
  "🍀 Luck is a factor. So is the timer.",
  "⛵ Sails set. Match harbor in sight.",
  "🔑 Key moment. Don't close the tab.",
  "🎸 Guitar solo in 30. Metaphorically.",
  "🪶 Light as a feather. Stakes are not.",
  "🌵 Desert island energy. One match.",
  "🦔 Hedge your bets? No. One side only.",
  "🎩 Top hats optional. Focus required.",
  "🪨 Steady hands win. Timer's ticking.",
  "🌶️ Hot take: lock your side now.",
]

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

type PersistedChessPreviewState = {
  mode: "chess-preview"
  fen?: string
  turnDeadlineTs?: null
}

type MatchBoardState =
  | PersistedConnect4BoardState
  | PersistedTttBoardState
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

        <div className="mt-6 flex items-center justify-center gap-4">
          <div
            className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border text-4xl font-black shadow-[0_0_45px_rgba(255,215,0,0.18)] sm:h-28 sm:w-28 sm:text-5xl ${tone}`}
          >
            {seconds}
          </div>
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

function makeLiveFeed(match: ArenaMatch | null) {
  if (!match) {
    return ["Loading room state..."]
  }

  return [
    `${match.host.name} entered the ${match.game} room.`,
    `${match.challenger ? match.challenger.name : "The challenger"} is drawing spectator attention.`,
    `Live move update: ${match.moveText}.`,
    `${match.spectators} spectators are currently tracking this arena.`,
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
  const [chatInput, setChatInput] = useState("")
  const [showCancelRoomConfirm, setShowCancelRoomConfirm] = useState(false)
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)

  const previousMatchRef = useRef<ArenaMatch | null>(null)
  const refreshChatRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const refreshRoom = useCallback(async () => {
    if (!matchId || typeof window === "undefined") return
    const supabase = createClient()
    const room = await getRoomById(supabase, matchId)
    if (room) {
      const arenaMatch = roomToArenaMatch(room)
      upsertMatchLocally(arenaMatch)
      setMatch(arenaMatch)
    } else {
      setMatch(null)
    }
  }, [matchId])

  useEffect(() => {
    if (!matchId) return

    const syncTickets = () => {
      setTickets(getTicketsForMatch(matchId))
      setMyTickets(readCurrentUserTickets(getCurrentIdentity().id).filter((ticket) => ticket.matchId === matchId))
    }

    refreshRoom()
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
        { event: "INSERT", schema: "public", table: "moves", filter: `match_id=eq.${matchId}` },
        () => { void refreshRoom() }
      )
      .subscribe()

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

  useEffect(() => {
    if (!matchId || !match) return
    if (match.status !== "Ready to Start" && match.status !== "Live") return
    const t = window.setInterval(() => {
      fetch("/api/rooms/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: matchId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.room) {
            const updated = roomToArenaMatch(data.room)
            upsertMatchLocally(updated)
            setMatch(updated)
          }
        })
        .catch(() => {})
    }, 2000)
    return () => clearInterval(t)
  }, [matchId, match?.id, match?.status])

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

  useEffect(() => {
    if (!match || match.status !== "Ready to Start") return

    const interval = window.setInterval(() => {
      setCountdownLineIndex((value) => value + 1)
    }, 2000)

    return () => window.clearInterval(interval)
  }, [match])

  const connect4State = useMemo(() => getConnect4State(match), [match])
  const tttState = useMemo(() => getTttState(match), [match])

  const connect4Winner = useMemo(
    () => getConnect4Winner(connect4State.board),
    [connect4State.board]
  )
  const tttWinner = useMemo(() => getTttWinner(tttState.board), [tttState.board])

  const countdownLines = useMemo(() => {
    const base = [...COUNTDOWN_HYPE_LINES_POOL]
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

  useEffect(() => {
    refreshChatRef.current = refreshChat
    return () => { refreshChatRef.current = null }
  }, [refreshChat])

  useEffect(() => {
    if (!matchId) return
    refreshChat()
    const poll = window.setInterval(() => { void refreshChat() }, 1500)
    return () => window.clearInterval(poll)
  }, [matchId, refreshChat])

  useEffect(() => {
    if (!matchId || !match || match.status !== "Ready to Start" || !match.challenger) return
    const secondsLeft = getArenaBettingSecondsLeft(match)
    if (secondsLeft > 0) return
    fetch("/api/rooms/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: matchId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.room) {
          const updated = roomToArenaMatch(data.room)
          upsertMatchLocally(updated)
          setMatch(updated)
        }
      })
      .catch(() => {})
  }, [matchId, match?.id, match?.status, match?.challenger, tick])

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
    return (
      <main className="min-h-screen bg-[#050807] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_0_50px_rgba(0,255,200,0.05)]">
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              KasRoyal Match Room
            </div>
            <div className="mt-5 text-4xl font-black">Room not loaded yet</div>
            <p className="mt-4 max-w-2xl text-white/65">
              This room has not synced into the local engine yet, or the match no longer exists.
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

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[#050807] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_0_50px_rgba(0,255,200,0.05)]">
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              KasRoyal Match Room
            </div>
            <div className="mt-5 text-4xl font-black">Loading room…</div>
            <p className="mt-4 max-w-2xl text-white/65">
              Preparing match room. This avoids server/client mismatch.
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
  const currentIdentityId = getCurrentIdentity().id.toLowerCase()
  const currentUserProfile = getCurrentUser()
  const isHostUser =
    (match.hostIdentityId && match.hostIdentityId.toLowerCase() === currentIdentityId) ||
    match.host.name === currentUserProfile.name
  const isChallengerUser =
    (match.challengerIdentityId && match.challengerIdentityId.toLowerCase() === currentIdentityId) ||
    (!!challenger && challenger.name === currentUserProfile.name)
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
  const totalSpectatorPool = spectatorPool.host + spectatorPool.challenger
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
      ? match.host.name
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
        myExistingSide === "host" ? match.host.name : challenger?.name ?? "Opponent"
      setMessage(
        `You already hold a position on ${lockedSideName}. KasRoyal v1 allows one side per match.`
      )
      return
    }

    setSelectedSide(side)

    const sideName = side === "host" ? match.host.name : challenger?.name ?? "Opponent"
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
      const lockedSideName = myExistingSide === "host" ? match.host.name : challenger.name
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

      const selectedPlayer = selectedSide === "host" ? match.host.name : challenger.name
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

  function handlePauseMatch() {
    if (!match) return

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
    if (!match) return

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
        const updated = roomToArenaMatch(data.room)
        setMatch(updated)
        upsertMatchLocally(updated)
        const winnerName = currentUserSide === "host" ? challenger.name : match.host.name
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
        const updated = roomToArenaMatch(data.room)
        upsertMatchLocally(updated)
        setMatch(updated)
        const playerLabel = connect4Turn === "host" ? match.host.name : challenger?.name ?? "Challenger"
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
        const updated = roomToArenaMatch(data.room)
        upsertMatchLocally(updated)
        setMatch(updated)
        const playerLabel = tttTurn === "X" ? match.host.name : challenger?.name ?? "Challenger"
        setFeed((prev) => [`🎮 ${playerLabel} marked ${index + 1}`, ...prev].slice(0, 12))
      } else {
        setMessage(data.error ?? "Move failed.")
      }
    } catch {
      setMessage("Move failed.")
    }
  }

  function resetCurrentGame() {
    if (!match) return

    if (isSpectatorOnly) {
      setMessage("Only seated players should reset a playable board.")
      return
    }

    if (match.game === "Connect 4" || match.game === "Tic-Tac-Toe") {
      setMessage("Board state is server-authoritative. Reset is not available for this game.")
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
        turnDeadlineTs: null,
      },
    })
    setMessage("Chess preview reset.")
  }

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
            <p className="mt-2 text-sm text-white/80">{match.statusText}</p>
            <p className="mt-1 text-xs text-white/60">You are no longer in an active match. You can join or create a new one.</p>
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
              <div className="mb-2 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300 sm:mb-4 sm:px-4 sm:py-2 sm:text-xs">
                KasRoyal Live Match Room
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

        <div className={`grid grid-cols-1 gap-6 xl:grid-rows-[auto_auto_auto] ${isQuickMatch ? "xl:grid-cols-[300px_minmax(0,1fr)]" : "xl:grid-cols-[300px_minmax(0,1fr)_minmax(420px,480px)]"}`}>
          <aside className="order-2 space-y-6 xl:order-1 xl:sticky xl:top-6 xl:row-span-1 xl:self-start">
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
                    label={`${match.host.name}`}
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
                  {!isQuickMatch && (
                  <div
                    className={`rounded-full px-4 py-3 text-sm font-bold ${
                      marketOpen ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-white/75"
                    }`}
                  >
                    {marketOpen ? `Betting open • ${bettingSecondsLeft}s left` : "Betting closed"}
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
                      <StatCard label="State" value={boardStateLabel} accent="text-amber-300" />
                    </div>
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

              {/* Room Chat — under board, center column, premium size */}
              <div className="mt-5 w-full">
                <div className="rounded-2xl border border-emerald-400/20 bg-[var(--surface-card)] p-4 shadow-[0_0_28px_rgba(16,185,129,0.08)] ring-1 ring-emerald-400/10">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300/90">Room Chat</p>
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                      Live
                    </span>
                  </div>
                  <div className="min-h-[240px] max-h-[380px] space-y-2.5 overflow-y-auto rounded-xl border border-white/8 bg-black/25 p-3.5">
                    {chatMessages.length === 0 ? (
                      <div className="flex min-h-[220px] items-center justify-center rounded-xl bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45">
                        No messages yet. Say something!
                      </div>
                    ) : (
                      chatMessages.map((msg) => (
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
                      ))
                    )}
                  </div>
                  <form
                    className="mt-4 flex gap-3"
                    onSubmit={async (e) => {
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
                            sender_display_name: currentUserProfile.name,
                            message: text,
                          }),
                        })
                        if (res.ok) {
                          setChatInput("")
                          await refreshChat()
                        }
                      } catch {
                        // keep input on error
                      }
                    }}
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message…"
                      maxLength={500}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-4 text-base text-white outline-none placeholder:text-white/40 focus:border-emerald-300/30 focus:ring-2 focus:ring-emerald-300/20"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="rounded-xl border border-emerald-300/30 bg-emerald-400/20 px-6 py-4 text-base font-bold text-emerald-200 transition hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-50"
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
                        ? match.host.name
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