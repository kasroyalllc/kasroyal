"use client"
import { useEffect, useMemo, useState } from "react"
import { Chess } from "chess.js"

const files = ["a", "b", "c", "d", "e", "f", "g", "h"]
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"]
const START_TIME = 300

export default function ChessPage() {
  const [game, setGame] = useState(new Chess())
  const [status, setStatus] = useState("White to move")
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [legalTargets, setLegalTargets] = useState<string[]>([])
  const [message, setMessage] = useState(
    "Click a piece, then click a highlighted destination square."
  )

  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)

  const [whiteTime, setWhiteTime] = useState(START_TIME)
  const [blackTime, setBlackTime] = useState(START_TIME)

  const boardSquares = useMemo(() => {
    const out: string[] = []
    for (const rank of ranks) {
      for (const file of files) {
        out.push(`${file}${rank}`)
      }
    }
    return out
  }, [])

  const turnLabel = game.turn() === "w" ? "White" : "Black"
  const gameOver =
    status.includes("wins") || status === "Draw" || status.includes("timeout")

  useEffect(() => {
    if (gameOver) return

    const timer = setInterval(() => {
      if (game.turn() === "w") {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            setStatus("Black wins on timeout")
            setMessage("White ran out of time.")
            return 0
          }
          return prev - 1
        })
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            setStatus("White wins on timeout")
            setMessage("Black ran out of time.")
            return 0
          }
          return prev - 1
        })
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [game, gameOver])

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  function updateStatus(nextGame: Chess) {
    if (nextGame.isCheckmate()) {
      const winner =
        nextGame.turn() === "w"
          ? "Black wins by checkmate"
          : "White wins by checkmate"
      setStatus(winner)
      setMessage("Checkmate.")
    } else if (nextGame.isDraw()) {
      setStatus("Draw")
      setMessage("Draw.")
    } else if (nextGame.inCheck()) {
      setStatus(
        nextGame.turn() === "w"
          ? "White to move — Check"
          : "Black to move — Check"
      )
      setMessage("Check.")
    } else {
      setStatus(nextGame.turn() === "w" ? "White to move" : "Black to move")
      setMessage("Move completed.")
    }
  }

  function clearSelection() {
    setSelectedSquare(null)
    setLegalTargets([])
  }

  function handleSquareClick(square: string) {
    if (gameOver) return

    const piece = game.get(square)
    const turn = game.turn()

    if (!selectedSquare) {
      if (!piece) return
      if (piece.color !== turn) return

      const moves = game.moves({ square, verbose: true })
      if (!moves.length) return

      setSelectedSquare(square)
      setLegalTargets(moves.map((m) => m.to))
      setMessage(`Selected ${square}. Choose a destination.`)
      return
    }

    if (square === selectedSquare) {
      clearSelection()
      setMessage("Selection cleared.")
      return
    }

    if (piece && piece.color === turn) {
      const moves = game.moves({ square, verbose: true })
      if (!moves.length) return

      setSelectedSquare(square)
      setLegalTargets(moves.map((m) => m.to))
      setMessage(`Selected ${square}. Choose a destination.`)
      return
    }

    const nextGame = new Chess(game.fen())
    const move = nextGame.move({
      from: selectedSquare,
      to: square,
      promotion: "q",
    })

    if (!move) {
      setMessage("Illegal move.")
      clearSelection()
      return
    }

    setGame(nextGame)
    setMoveHistory(nextGame.history())
    setLastMove({ from: move.from, to: move.to })

    clearSelection()
    updateStatus(nextGame)
  }

  function resetGame() {
    setGame(new Chess())
    setMoveHistory([])
    setLastMove(null)
    clearSelection()
    setStatus("White to move")
    setMessage("Click a piece, then click a highlighted destination square.")
    setWhiteTime(START_TIME)
    setBlackTime(START_TIME)
  }

  function renderPiece(square: string) {
    const piece = game.get(square)
    if (!piece) return null

    const name = `${piece.color}${piece.type}`

    return (
      <img
        src={`/pieces/${name}.svg`}
        alt={name}
        className="h-12 w-12 select-none pointer-events-none drop-shadow-xl transition-all duration-200 ease-in-out"
      />
    )
  }

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.10),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.08),transparent_24%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              KasRoyal Arena
            </p>
            <h1 className="text-4xl font-black md:text-5xl">Chess Duel</h1>
            <p className="mt-2 text-white/60">
              Premium 1v1 skill match on KasRoyal.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
              Turn: {turnLabel}
            </div>
            <a
              href="/lobby"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Back to Lobby
            </a>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[300px_1fr_280px]">
          <aside className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
              Match Info
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">White Player</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold text-white">Player 1</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                    White
                  </span>
                </div>
                <div className="mt-3 text-2xl font-black text-amber-300">
                  {formatTime(whiteTime)}
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Black Player</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold text-white">Player 2</span>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    Black
                  </span>
                </div>
                <div className="mt-3 text-2xl font-black text-emerald-300">
                  {formatTime(blackTime)}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="text-sm text-white/60">Pot</div>
                <div className="mt-1 text-2xl font-black text-amber-300">
                  20 KAS
                </div>
                <div className="mt-1 text-sm text-white/55">10 KAS vs 10 KAS</div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">House Rake</div>
                <div className="mt-1 text-xl font-bold text-emerald-300">2%</div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Projected Winner Payout</div>
                <div className="mt-1 text-xl font-bold text-amber-300">19.6 KAS</div>
              </div>
            </div>
          </aside>

          <section className="rounded-[28px] border border-amber-300/10 bg-white/[0.04] p-6 shadow-[0_0_40px_rgba(0,255,200,0.06)]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
                  Live Board
                </p>
                <h2 className="text-2xl font-black">KasRoyal Match Table</h2>
              </div>

              <div className="max-w-md rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/80">
                {message}
              </div>
            </div>

            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Board Status</div>
                <div className="mt-1 text-lg font-bold text-white">{status}</div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">How to Move</div>
                <div className="mt-1 text-sm text-white/80">
                  Click a piece, then click a glowing target square.
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-[#0f1513] to-[#0a0d0c] p-5 shadow-[0_0_30px_rgba(255,200,80,0.06)]">
              <div className="mx-auto grid max-w-[720px] grid-cols-8 overflow-hidden rounded-2xl border border-black/40 shadow-2xl">
                {boardSquares.map((square, index) => {
                  const fileIndex = index % 8
                  const rankIndex = Math.floor(index / 8)
                  const dark = (fileIndex + rankIndex) % 2 === 1
                  const isSelected = selectedSquare === square
                  const isLegal = legalTargets.includes(square)
                  const isLast =
                    lastMove &&
                    (square === lastMove.from || square === lastMove.to)

                  return (
                    <button
                      key={square}
                      onClick={() => handleSquareClick(square)}
                      className={`relative flex aspect-square items-center justify-center transition-all duration-200 hover:brightness-110
                      ${dark ? "bg-[#0f3e36]" : "bg-[#d8c59a]"}
                      ${isSelected ? "z-10 ring-4 ring-amber-300 shadow-[inset_0_0_20px_rgba(255,215,0,0.25)]" : ""}
                      ${isLast ? "ring-2 ring-yellow-400/60" : ""}`}
                    >
                      {isLegal && (
                        <>
                          <span className="absolute h-5 w-5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(0,255,200,0.65)]" />
                          <span className="absolute inset-0 bg-emerald-400/10" />
                        </>
                      )}

                      {renderPiece(square)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={resetGame}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 px-6 py-3 font-bold text-black shadow-[0_0_24px_rgba(255,215,0,0.18)] transition hover:scale-[1.02]"
              >
                New Game
              </button>

              <a
                href="/lobby"
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-semibold text-white/90 transition hover:bg-white/10"
              >
                Exit Match
              </a>
            </div>
          </section>

          <aside className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
              Match Status
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="text-sm text-white/60">Current Turn</div>
                <div className="mt-1 text-xl font-bold text-white">{turnLabel}</div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Selected Square</div>
                <div className="mt-1 text-lg font-bold text-amber-300">
                  {selectedSquare ?? "None"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Legal Moves</div>
                <div className="mt-1 text-sm text-white/80 break-words">
                  {legalTargets.length ? legalTargets.join(", ") : "None"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Move History</div>
                <div className="mt-1 text-sm text-white/80 break-words max-h-[180px] overflow-y-auto">
                  {moveHistory.length
                    ? moveHistory.map((m, i) => (
                        <div key={i}>
                          {i + 1}. {m}
                        </div>
                      ))
                    : "None"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Mode</div>
                <div className="mt-1 text-lg font-bold text-white">
                  1v1 Skill Match
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Security</div>
                <div className="mt-1 text-sm text-white/80">
                  Client prototype active. Server-authoritative match validation comes next.
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}