"use client"
import { useState } from "react"

type Side = "Heads" | "Tails"

export default function CoinFlipPage() {
  const [bet, setBet] = useState(10)
  const [choice, setChoice] = useState<Side>("Heads")
  const [result, setResult] = useState<Side | null>(null)
  const [message, setMessage] = useState("Pick a side and flip the coin.")
  const [isFlipping, setIsFlipping] = useState(false)

  function flipCoin() {
    if (isFlipping) return

    setIsFlipping(true)
    setResult(null)
    setMessage("Flipping...")

    setTimeout(() => {
      const landed: Side = Math.random() < 0.5 ? "Heads" : "Tails"
      setResult(landed)

      if (landed === choice) {
        const payout = (bet * 1.98).toFixed(2)
        setMessage(`You won. Payout: ${payout} KAS`)
      } else {
        setMessage(`You lost ${bet} KAS`)
      }

      setIsFlipping(false)
    }, 1200)
  }

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              KasRoyal House Game
            </p>
            <h1 className="text-4xl font-black">Coin Flip</h1>
          </div>

          <a
            href="/lobby"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
          >
            Back to Lobby
          </a>
        </div>

        <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
              Bet Settings
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-sm text-white/70">
                  Bet Amount (KAS)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={bet}
                  onChange={(e) => setBet(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">
                  Choose Side
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setChoice("Heads")}
                    className={`rounded-xl px-4 py-3 font-bold transition ${
                      choice === "Heads"
                        ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black"
                        : "border border-white/10 bg-white/5 text-white"
                    }`}
                  >
                    Heads
                  </button>

                  <button
                    onClick={() => setChoice("Tails")}
                    className={`rounded-xl px-4 py-3 font-bold transition ${
                      choice === "Tails"
                        ? "bg-gradient-to-r from-emerald-300 to-emerald-500 text-black"
                        : "border border-white/10 bg-white/5 text-white"
                    }`}
                  >
                    Tails
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="text-sm text-white/60">Payout Multiplier</div>
                <div className="mt-1 text-2xl font-black text-amber-300">
                  1.98x
                </div>
                <div className="mt-1 text-sm text-white/60">
                  Approx house edge: 1%
                </div>
              </div>

              <button
                onClick={flipCoin}
                disabled={isFlipping || bet < 1}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-3 font-bold text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFlipping ? "Flipping..." : "Flip Coin"}
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
                  Live Result
                </p>
                <h2 className="text-2xl font-black">Heads or Tails</h2>
              </div>

              <div className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-white/80">
                Bet: {bet} KAS
              </div>
            </div>

            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-white/6 bg-[#0d1110] p-6">
              <div
                className={`flex h-40 w-40 items-center justify-center rounded-full border-4 text-3xl font-black shadow-2xl transition-all duration-300 ${
                  result === "Heads"
                    ? "border-amber-300 bg-amber-300/20 text-amber-200"
                    : result === "Tails"
                    ? "border-emerald-300 bg-emerald-300/20 text-emerald-200"
                    : "border-white/10 bg-black/40 text-white/60"
                }`}
              >
                {isFlipping ? "..." : result ?? "?"}
              </div>

              <p className="mt-8 text-center text-lg text-white/80">
                {message}
              </p>

              {result && (
                <div className="mt-4 rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-white/75">
                  You picked: {choice} • Result: {result}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}