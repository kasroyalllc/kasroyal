"use client"
import { useState } from "react"

const ROWS = 6
const COLS = 7

export default function Connect4() {
  const emptyBoard = Array(ROWS).fill(null).map(() => Array(COLS).fill(null))

  const [board, setBoard] = useState(emptyBoard)
  const [player, setPlayer] = useState<"yellow" | "green">("yellow")
  const [winner, setWinner] = useState<string | null>(null)

  function checkWinner(b: (string | null)[][]) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!b[r][c]) continue

        for (const [dr, dc] of directions) {
          let count = 1

          for (let i = 1; i < 4; i++) {
            const nr = r + dr * i
            const nc = c + dc * i

            if (
              nr >= 0 &&
              nr < ROWS &&
              nc >= 0 &&
              nc < COLS &&
              b[nr][nc] === b[r][c]
            ) {
              count++
            } else {
              break
            }
          }

          if (count === 4) {
            return b[r][c]
          }
        }
      }
    }

    return null
  }

  function dropPiece(col: number) {
    if (winner) return

    const newBoard = board.map((r) => [...r])
    let placed = false

    for (let r = ROWS - 1; r >= 0; r--) {
      if (!newBoard[r][col]) {
        newBoard[r][col] = player
        placed = true
        break
      }
    }

    if (!placed) return

    const win = checkWinner(newBoard)
    setBoard(newBoard)

    if (win) {
      setWinner(win)
    } else {
      setPlayer(player === "yellow" ? "green" : "yellow")
    }
  }

  function resetGame() {
    setBoard(emptyBoard)
    setPlayer("yellow")
    setWinner(null)
  }

  const currentPlayerName = player === "yellow" ? "Player 1" : "Player 2"
  const winnerName =
    winner === "yellow" ? "Player 1" : winner === "green" ? "Player 2" : null

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              KasRoyal Arena
            </p>
            <h1 className="text-4xl font-black">Connect 4 Match</h1>
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
                <div className="mt-1 flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full bg-yellow-400" />
                  <div className="text-lg font-bold">Player 1</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Player 2</div>
                <div className="mt-1 flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full bg-emerald-400" />
                  <div className="text-lg font-bold">Player 2</div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="text-sm text-white/60">Pot</div>
                <div className="mt-1 text-2xl font-black text-amber-300">
                  20 KAS
                </div>
                <div className="mt-1 text-sm text-white/50">
                  10 KAS vs 10 KAS
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

          <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
                  Live Board
                </p>
                <h2 className="text-2xl font-black">Drop your piece</h2>
              </div>

              {!winner ? (
                <div className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-300">
                  Turn: {currentPlayerName}
                </div>
              ) : (
                <div className="rounded-full bg-amber-300/15 px-4 py-2 text-sm font-semibold text-amber-300">
                  Winner: {winnerName}
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-white/6 bg-[#0d1110] p-4">
              <div className="grid grid-cols-7 gap-3">
                {board.map((row, rowIndex) =>
                  row.map((cell, colIndex) => (
                    <button
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => dropPiece(colIndex)}
                      className={`aspect-square rounded-full border border-white/10 transition hover:scale-105 ${
                        cell === "yellow"
                          ? "bg-yellow-400"
                          : cell === "green"
                            ? "bg-emerald-400"
                            : "bg-black/40"
                      }`}
                    />
                  ))
                )}
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
              {!winner && (
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
                    Payout preview: 19.6 KAS
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
                  Server-authoritative board state coming next.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}