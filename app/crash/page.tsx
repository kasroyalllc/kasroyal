"use client"
import { useEffect, useRef, useState } from "react"

const HOUSE_EDGE = 0.04
const INSTANT_CRASH_CHANCE = 0.08
const MAX_BET = 10
const MAX_MULTIPLIER = 100

export default function CrashPage() {
  const [bet, setBet] = useState(5)
  const [multiplier, setMultiplier] = useState(1.0)
  const [isRunning, setIsRunning] = useState(false)
  const [hasCrashed, setHasCrashed] = useState(false)
  const [hasCashedOut, setHasCashedOut] = useState(false)
  const [message, setMessage] = useState("Set your bet and start the round.")
  const [crashPoint, setCrashPoint] = useState(1.0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  function clearTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function generateCrashPoint() {
    const instant = Math.random() < INSTANT_CRASH_CHANCE
    if (instant) return 1.0

    const u = Math.random()
    const raw = (1 - HOUSE_EDGE) / u
    const bounded = Math.max(1.01, Math.min(raw, MAX_MULTIPLIER))
    return Number(bounded.toFixed(2))
  }

  function startRound() {
    if (isRunning) return
    if (bet < 1) return

    const safeBet = Math.min(Math.max(1, bet), MAX_BET)
    if (safeBet !== bet) {
      setBet(safeBet)
    }

    const nextCrash = generateCrashPoint()

    setCrashPoint(nextCrash)
    setMultiplier(1.0)
    setIsRunning(true)
    setHasCrashed(false)
    setHasCashedOut(false)
    setMessage("Round started. Cash out before it crashes.")

    if (nextCrash === 1.0) {
      setTimeout(() => {
        setMultiplier(1.0)
        setHasCrashed(true)
        setIsRunning(false)
        setMessage(`Instant crash at 1.00x. You lost ${safeBet} KAS.`)
      }, 250)
      return
    }

    let current = 1.0

    intervalRef.current = setInterval(() => {
      current = Number((current + 0.02).toFixed(2))
      setMultiplier(current)

      if (current >= nextCrash) {
        clearTimer()
        setMultiplier(nextCrash)
        setIsRunning(false)
        setHasCrashed(true)

        if (!hasCashedOut) {
          setMessage(`Crashed at ${nextCrash.toFixed(2)}x. You lost ${safeBet} KAS.`)
        }
      }
    }, 80)
  }

  function cashOut() {
    if (!isRunning || hasCashedOut || hasCrashed) return

    clearTimer()

    const payout = (bet * multiplier).toFixed(2)

    setHasCashedOut(true)
    setIsRunning(false)
    setMessage(`You cashed out at ${multiplier.toFixed(2)}x. Payout: ${payout} KAS`)
  }

  useEffect(() => {
    return () => {
      clearTimer()
    }
  }, [])

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              KasRoyal House Game
            </p>
            <h1 className="text-4xl font-black">Crash</h1>
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
                  max={MAX_BET}
                  value={bet}
                  onChange={(e) => setBet(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                />
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="text-sm text-white/60">House Edge</div>
                <div className="mt-1 text-2xl font-black text-amber-300">
                  4%
                </div>
                <div className="mt-1 text-sm text-white/60">
                  Plus instant-crash pressure
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Instant Crash Chance</div>
                <div className="mt-1 text-xl font-bold text-red-300">
                  8%
                </div>
                <div className="mt-1 text-sm text-white/60">
                  Prevents ultra-safe early cash-out abuse
                </div>
              </div>

              <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                <div className="text-sm text-white/60">Current Max Bet</div>
                <div className="mt-1 text-xl font-bold text-emerald-300">
                  {MAX_BET} KAS
                </div>
              </div>

              <button
                onClick={startRound}
                disabled={isRunning || bet < 1}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-3 font-bold text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? "Running..." : "Start Round"}
              </button>

              <button
                onClick={cashOut}
                disabled={!isRunning || hasCashedOut}
                className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-3 font-bold text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cash Out
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-300/80">
                  Live Multiplier
                </p>
                <h2 className="text-2xl font-black">Cash out before the crash</h2>
              </div>

              <div className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-white/80">
                Bet: {bet} KAS
              </div>
            </div>

            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-white/6 bg-[#0d1110] p-6">
              <div
                className={`text-7xl font-black transition-all ${
                  hasCrashed ? "text-red-400" : "text-emerald-300"
                }`}
              >
                {multiplier.toFixed(2)}x
              </div>

              <p className="mt-8 text-center text-lg text-white/80">
                {message}
              </p>

              {hasCrashed && (
                <div className="mt-4 rounded-full bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300">
                  Crash point: {crashPoint.toFixed(2)}x
                </div>
              )}

              {hasCashedOut && !hasCrashed && (
                <div className="mt-4 rounded-full bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                  Cashed out safely
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}