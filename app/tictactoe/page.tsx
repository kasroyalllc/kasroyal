"use client"
import { useState } from "react"

export default function TicTacToePage() {
  const emptyBoard = Array(9).fill(null) as (string | null)[]
  const [board, setBoard] = useState<(string | null)[]>(emptyBoard)
  const [player, setPlayer] = useState<"X" | "O">("X")
  const [winner, setWinner] = useState<string | null>(null)
  const [isDraw, setIsDraw] = useState(false)

  const winPatterns = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]

  function checkWinner(nextBoard: (string | null)[]) {
    for (const [a, b, c] of winPatterns) {
      if (
        nextBoard[a] &&
        nextBoard[a] === nextBoard[b] &&
        nextBoard[a] === nextBoard[c]
      ) {
        return nextBoard[a]
      }
    }

    if (nextBoard.every((cell) => cell !== null)) {
      return "draw"
    }

    return null
  }

  function play(index: number) {
    if (board[index] || winner || isDraw) return

    const nextBoard = [...board]
    nextBoard[index] = player

    const result = checkWinner(nextBoard)
    setBoard(nextBoard)

    if (result === "draw") {
      setIsDraw(true)
      return
    }

    if (result) {
      setWinner(result)
      return
    }

    setPlayer(player === "X" ? "O" : "X")
  }

  function resetGame() {
    setBoard(Array(9).fill(null))
    setPlayer("X")
    setWinner(null)
    setIsDraw(false)
  }

  const currentPlayerName = player === "X" ? "Player 1" : "Player 2"
  const winnerName =
    winner === "X" ? "Player 1" : winner === "O" ? "Player 2" : null

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              KasRoyal Arena
            </p>
            <h1 className="text-4xl font-black">Tic-Tac-Toe Duel</h1>
          </div>

          <a
            href="/lobby"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
          >
            Back to Lobby
          </a>
        </div>

        <div className="grid gap-8 lg:grid-cols-[320px_1fr_320px]">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
              Match Info
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Player 1</div>
                <div className="mt-1 text-lg font-bold text-amber-300">
                  X
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Player 2</div>
                <div className="mt-1 text-lg font-bold text-emerald-300">
                  O
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="text-sm text-white/60">Pot</div>
                <div className="mt-1 text-2xl font-black text-amber-300">
                  6 KAS
                </div>
                <div className="mt-1 text-sm text-white/50">
                  3 KAS vs 3 KAS
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">House Rake</div>
                <div className="mt-1 text-lg font-bold text-emerald-300">
                  2%
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
                  Live Board
                </p>
                <h2 className="text-2xl font-black">Place your mark</h2>
              </div>

              {!winner && !isDraw ? (
                <div className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-300">
                  Turn: {currentPlayerName}
                </div>
              ) : winner ? (
                <div className="rounded-full bg-amber-300/15 px-4 py-2 text-sm font-semibold text-amber-300">
                  Winner: {winnerName}
                </div>
              ) : (
                <div className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80">
                  Draw
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-white/6 bg-[#0d1110] p-5">
              <div className="grid grid-cols-3 gap-4">
                {board.map((cell, index) => (
                  <button
                    key={index}
                    onClick={() => play(index)}
                    className="flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-4xl font-black transition hover:scale-[1.03] hover:bg-white/5"
                  >
                    <span
                      className={
                        cell === "X"
                          ? "text-amber-300"
                          : cell === "O"
                          ? "text-emerald-300"
                          : "text-white/20"
                      }
                    >
                      {cell ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={resetGame}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-3 text-sm font-bold text-black"
              >
                New Game
              </button>

              <a
                href="/lobby"
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90"
              >
                Exit Match
              </a>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
              Match Status
            </p>

            <div className="mt-5 space-y-4">
              {!winner && !isDraw && (
                <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                  <div className="text-sm text-white/60">Current Turn</div>
                  <div className="mt-2 text-xl font-bold">
                    {currentPlayerName}
                  </div>
                </div>
              )}

              {winner && (
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                  <div className="text-sm text-white/60">Match Result</div>
                  <div className="mt-2 text-2xl font-black text-amber-300">
                    {winnerName} Wins
                  </div>
                  <div className="mt-2 text-sm text-white/60">
                    Payout preview: 5.88 KAS
                  </div>
                </div>
              )}

              {isDraw && (
                <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                  <div className="text-sm text-white/60">Match Result</div>
                  <div className="mt-2 text-2xl font-black text-white">
                    Draw
                  </div>
                  <div className="mt-2 text-sm text-white/60">
                    In production, this would trigger refund or rematch logic
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Game Type</div>
                <div className="mt-2 text-lg font-bold">1v1 Skill Match</div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Security Model</div>
                <div className="mt-2 text-sm text-white/80">
                  Server-authoritative match state coming later
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}