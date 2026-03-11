"use client"
import { useState } from "react"

export default function DicePage() {
  const [bet, setBet] = useState(10)
  const [target, setTarget] = useState(50)
  const [roll, setRoll] = useState<number | null>(null)
  const [message, setMessage] = useState("Choose a target and roll the dice.")
  const [isRolling, setIsRolling] = useState(false)

  const multiplier = Number((99 / target).toFixed(2))

  function rollDice() {
    if (isRolling) return
    if (bet < 1) return

    setIsRolling(true)
    setRoll(null)
    setMessage("Rolling...")

    setTimeout(() => {
      const value = Math.floor(Math.random() * 100) + 1
      setRoll(value)

      if (value > target) {
        const payout = (bet * multiplier * 0.99).toFixed(2)
        setMessage(`You won. Roll: ${value}. Payout: ${payout} KAS`)
      } else {
        setMessage(`You lost. Roll: ${value}. You needed over ${target}.`)
      }

      setIsRolling(false)
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
            <h1 className="text-4xl font-black">Dice Roll</h1>
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
                  Win if roll is over
                </label>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="w-full"
                />
                <div className="mt-2 flex items-center justify-between text-sm text-white/70">
                  <span>5</span>
                  <span className="font-bold text-amber-300">{target}</span>
                  <span>95</span>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="text-sm text-white/60">Base Multiplier</div>
                <div className="mt-1 text-2xl font-black text-amber-300">
                  {multiplier}x
                </div>
                <div className="mt-1 text-sm text-white/60">
                  House edge applied on payout
                </div>
              </div>

              <button
                onClick={rollDice}
                disabled={isRolling || bet < 1}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-3 font-bold text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRolling ? "Rolling..." : "Roll Dice"}
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
                  Live Result
                </p>
                <h2 className="text-2xl font-black">Roll over to win</h2>
              </div>

              <div className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-white/80">
                Bet: {bet} KAS
              </div>
            </div>

            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-white/6 bg-[#0d1110] p-6">
              <div className="grid h-40 w-40 place-items-center rounded-[28px] border-4 border-emerald-300/40 bg-emerald-300/10 text-5xl font-black text-emerald-200 shadow-2xl">
                {isRolling ? "..." : roll ?? "?"}
              </div>

              <p className="mt-8 text-center text-lg text-white/80">
                {message}
              </p>

              <div className="mt-4 rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-white/75">
                Win condition: roll over {target}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}