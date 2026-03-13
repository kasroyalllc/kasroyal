"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { listActiveRooms, listRecentResolvedRooms } from "@/lib/rooms/rooms-service"
import { roomToArenaMatch } from "@/lib/rooms/room-adapter"
import type { Room } from "@/lib/engine/match/types"
import type { ArenaMatch } from "@/lib/engine/match-types"

const GAMES: { name: string; href: string; tag: string }[] = [
  { name: "Connect 4", href: "/arena", tag: "Fast" },
  { name: "Tic-Tac-Toe", href: "/arena", tag: "Quick" },
  { name: "Chess Duel", href: "/arena", tag: "Strategic" },
]

function playClick() {
  try {
    const audio = new Audio("/click.mp3")
    audio.volume = 0.35
    void audio.play()
  } catch {}
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  )
}

/** Premium live-arena style centerpiece for the hero — product preview feel. 7×6 Connect 4 style grid. */
function HeroCenterpiece() {
  const cols = 7
  const rows = 6
  const hostCells = [35, 37, 39, 28, 30, 21, 14, 7]
  const challengerCells = [36, 38, 40, 29, 31, 22, 15]

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="rounded-[var(--radius-card)] border border-[var(--border-strong)] bg-[var(--surface-card)] overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.05)]">
        <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
            Live arena
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            <LiveDot />
            Live
          </span>
        </div>
        <div className="p-4 md:p-5">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/45">Host</div>
              <div className="mt-0.5 truncate text-sm font-bold text-amber-100">Player 1</div>
            </div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/45">Challenger</div>
              <div className="mt-0.5 truncate text-sm font-bold text-emerald-100">Player 2</div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 md:p-4">
            <div
              className="grid gap-1.5 md:gap-2"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: rows * cols }).map((_, i) => {
                const isHost = hostCells.includes(i)
                const isChallenger = challengerCells.includes(i)
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded-full border transition ${
                      isHost
                        ? "border-amber-400/50 bg-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                        : isChallenger
                          ? "border-emerald-400/50 bg-emerald-400/80 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                          : "border-white/10 bg-white/[0.06]"
                    }`}
                  />
                )
              })}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50">
            <span>Connect 4</span>
            <span>47% · 53%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const [liveRooms, setLiveRooms] = useState<ArenaMatch[]>([])
  const [openRooms, setOpenRooms] = useState<ArenaMatch[]>([])
  const [recentResolved, setRecentResolved] = useState<ArenaMatch[]>([])

  const loadRooms = useCallback(async () => {
    const supabase = createClient()
    const [active, resolved] = await Promise.all([
      listActiveRooms(supabase),
      listRecentResolvedRooms(supabase, 6),
    ])
    const activeMatch = active.map((r: Room) => roomToArenaMatch(r))
    const live = activeMatch.filter((m) => m.status === "Live")
    const open = activeMatch.filter(
      (m) => m.status === "Waiting for Opponent" || m.status === "Ready to Start"
    )
    setLiveRooms(live)
    setOpenRooms(open)
    setRecentResolved(resolved.map((r: Room) => roomToArenaMatch(r)))
  }, [])

  useEffect(() => {
    loadRooms()
  }, [loadRooms])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("matches-home")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          void loadRooms()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadRooms])

  const activeRoomCount = liveRooms.length + openRooms.length

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050807] text-white">
      <style jsx global>{`
        @keyframes driftGlow {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.35; }
        }
        @keyframes pulseRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.2); }
          50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
        }
        .ambient-drift { animation: driftGlow 14s ease-in-out infinite; }
        .pulse-ring { animation: pulseRing 2s ease-in-out infinite; }
      `}</style>

      {/* Hero background: cinematic but restrained */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="ambient-drift absolute -left-40 -top-20 h-[500px] w-[500px] rounded-full bg-emerald-500/12 blur-[140px]" />
        <div className="ambient-drift absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-amber-400/10 blur-[120px]" />
        <div className="ambient-drift absolute bottom-1/4 left-1/4 h-[350px] w-[350px] rounded-full bg-emerald-500/08 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,rgba(16,185,129,0.14),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_80%_20%,rgba(251,191,36,0.08),transparent_45%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.02)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        {/* ——— HERO: dominant, cinematic, premium ——— */}
        <section
          className="relative flex min-h-[72vh] flex-col items-center justify-center py-16 text-center md:min-h-[70vh] md:py-24 lg:py-28"
          aria-label="Hero"
        >
          <div className="mx-auto max-w-4xl">
            {/* Large KasRoyal hero artwork: premium framed arena poster, integrated into page */}
            <div className="relative mx-auto mb-8 w-full max-w-[420px] sm:max-w-[500px] md:mb-10 md:max-w-[560px] lg:max-w-[600px]">
              {/* Outer halo / ambient bloom */}
              <div className="absolute -inset-10 rounded-[28px] bg-emerald-500/10 blur-[60px]" aria-hidden />
              <div className="absolute -inset-6 rounded-2xl bg-amber-400/06 blur-3xl" aria-hidden />
              {/* Premium card frame: glass surface, emerald/gold border glow */}
              <div
                className="relative overflow-hidden rounded-2xl border-2 border-white/10 bg-gradient-to-b from-white/[0.06] to-black/40"
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.06), inset 0 0 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(16,185,129,0.2), 0 0 24px rgba(16,185,129,0.12), 0 0 48px rgba(251,191,36,0.06)",
                }}
              >
                {/* Inner glow bleed behind image */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-emerald-500/05 via-transparent to-amber-400/05" aria-hidden />
                <div className="relative p-[10px] md:p-3">
                  <div className="relative overflow-hidden rounded-xl">
                    <Image
                      src="/kasroyal-hero-banner.png"
                      alt="KasRoyal — Skill arena · Spectator betting"
                      width={600}
                      height={300}
                      priority
                      className="h-auto w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300 md:mb-8">
              <LiveDot />
              Skill arena · Spectator betting · Kaspa
            </div>
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl md:tracking-[-0.02em]">
              Play. Bet. Win.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/70 md:mt-6 md:text-xl md:leading-relaxed">
              The live skill arena on Kaspa. 1v1 matches, real-time spectator betting, premium UX.
            </p>

            {/* CTA hierarchy: primary → secondary → tertiary */}
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-4 md:mt-10">
              <Link
                href="/arena"
                onClick={playClick}
                className="order-1 w-full min-w-[200px] rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 py-4 text-center text-base font-bold text-white shadow-[0_0_32px_rgba(16,185,129,0.25)] transition hover:from-emerald-400 hover:to-emerald-500 hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] sm:w-auto"
              >
                Enter Arena
              </Link>
              <Link
                href="/arena"
                onClick={playClick}
                className="order-2 w-full min-w-[200px] rounded-2xl border-2 border-amber-400/40 bg-amber-400/10 px-8 py-4 text-center text-base font-bold text-amber-100 transition hover:border-amber-400/60 hover:bg-amber-400/20 sm:w-auto"
              >
                Ranked Match
              </Link>
              <Link
                href="/spectate"
                onClick={playClick}
                className="order-3 text-sm font-semibold text-white/60 transition hover:text-white/90"
              >
                Spectate →
              </Link>
            </div>
          </div>

          {/* Hero centerpiece: premium live arena visual */}
          <div className="mt-12 w-full md:mt-16 lg:mt-20">
            <HeroCenterpiece />
          </div>

          {/* Live trust strip: Supabase-backed counts */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 md:mt-14">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Active rooms</span>
              <span className="ml-2 text-sm font-black text-white">{activeRoomCount}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Live</span>
              <span className="ml-2 text-sm font-black text-emerald-400">{liveRooms.length}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Open seats</span>
              <span className="ml-2 text-sm font-black text-amber-400">{openRooms.length}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Resolved</span>
              <span className="ml-2 text-sm font-black text-white/80">{recentResolved.length}</span>
            </div>
          </div>
        </section>

        {/* ——— Live arenas ——— */}
        <section className="mb-14 md:mb-20" aria-label="Live arenas">
          <div className="mb-4 flex items-center justify-between md:mb-5">
            <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Live arenas
            </h2>
            <span className="text-xs font-medium uppercase tracking-wider text-white/45">
              {liveRooms.length} match{liveRooms.length !== 1 ? "es" : ""}
            </span>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--border-strong)] bg-white/[0.02] p-4 md:p-6">
            {liveRooms.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {liveRooms.slice(0, 6).map((m) => (
                  <Link
                    key={m.id}
                    href={`/arena/match/${m.id}`}
                    onClick={playClick}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-4 transition hover:border-emerald-400/25 hover:bg-emerald-500/10"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <LiveDot />
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                          {m.game}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold text-white">
                        {m.host.name} vs {m.challenger?.name ?? "…"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 group-hover:bg-white/10">
                      Watch
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center md:p-10">
                <p className="text-lg font-bold text-white/90">No live arenas right now</p>
                <p className="mt-2 max-w-md mx-auto text-sm text-white/55">
                  Be the first to start a match. Create a Quick or Ranked game and invite a challenger.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/arena"
                    onClick={playClick}
                    className="rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-5 py-3 text-sm font-bold text-emerald-200 hover:bg-emerald-500/30"
                  >
                    Start a Match
                  </Link>
                  <Link
                    href="/arena"
                    onClick={playClick}
                    className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
                  >
                    Enter Arena
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ——— Skill arenas ——— */}
        <section className="mb-14 md:mb-20" aria-label="Skill arenas">
          <div className="mb-4 md:mb-5">
            <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Skill arenas
            </h2>
          </div>
          <div className="flex flex-wrap gap-4">
            {GAMES.map((g) => (
              <Link
                key={g.name}
                href={g.href}
                onClick={playClick}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 transition hover:border-emerald-400/20 hover:bg-emerald-500/5"
              >
                <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold uppercase text-white/70">
                  {g.tag}
                </span>
                <span className="font-semibold text-white">{g.name}</span>
              </Link>
            ))}
            <Link
              href="/arena"
              onClick={playClick}
              className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(16,185,129,0.2)] transition hover:from-emerald-400 hover:to-emerald-500"
            >
              Enter Arena
            </Link>
          </div>
        </section>

        {/* ——— Open seats ——— */}
        <section className="mb-14 md:mb-20" aria-label="Open seats">
          <div className="mb-4 flex items-center justify-between md:mb-5">
            <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Open seats
            </h2>
            <Link
              href="/arena"
              onClick={playClick}
              className="text-xs font-semibold uppercase tracking-wider text-emerald-400 hover:text-emerald-300"
            >
              Arena →
            </Link>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--border-strong)] bg-white/[0.02] p-4 md:p-6">
            {openRooms.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {openRooms.slice(0, 6).map((m) => (
                  <Link
                    key={m.id}
                    href={`/arena/match/${m.id}`}
                    onClick={playClick}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-amber-400/20 hover:bg-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            m.status === "Ready to Start"
                              ? "border border-amber-400/25 bg-amber-400/10 text-amber-300"
                              : "border border-white/15 bg-white/5 text-white/70"
                          }`}
                        >
                          {m.status === "Ready to Start" ? "Starting soon" : "Open"}
                        </span>
                        <span className="text-xs text-white/50">{m.game}</span>
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold text-white">
                        {m.host.name} vs {m.challenger?.name ?? "Waiting…"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 group-hover:bg-amber-400/20">
                      Join
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center md:p-10">
                <p className="text-lg font-bold text-white/90">No open seats right now</p>
                <p className="mt-2 max-w-md mx-auto text-sm text-white/55">
                  Create a Quick or Ranked match to open a seat, or check back soon for new lobbies.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/arena"
                    onClick={playClick}
                    className="rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-5 py-3 text-sm font-bold text-emerald-200 hover:bg-emerald-500/30"
                  >
                    Start a Match
                  </Link>
                  <Link
                    href="/arena"
                    onClick={playClick}
                    className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
                  >
                    Enter Arena
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ——— Recently resolved ——— */}
        <section className="mb-14 md:mb-20" aria-label="Recently resolved">
          <div className="mb-4 flex items-center justify-between md:mb-5">
            <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Recently resolved
            </h2>
            <Link
              href="/arena"
              onClick={playClick}
              className="text-xs font-semibold uppercase tracking-wider text-white/50 hover:text-white/70"
            >
              History →
            </Link>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--border-strong)] bg-white/[0.02] p-4 md:p-6">
            {recentResolved.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentResolved.map((m) => (
                  <Link
                    key={m.id}
                    href={`/arena/match/${m.id}`}
                    onClick={playClick}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white/90">
                        {m.host.name} vs {m.challenger?.name ?? "—"}
                      </div>
                      <div className="mt-0.5 text-xs text-white/45">{m.game}</div>
                    </div>
                    <span className="shrink-0 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/60">
                      Result
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center md:p-10">
                <p className="text-lg font-bold text-white/90">No resolved matches yet</p>
                <p className="mt-2 max-w-md mx-auto text-sm text-white/55">
                  Finished games will appear here. Start or join a match to see results.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/arena"
                    onClick={playClick}
                    className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
                  >
                    Enter Arena
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ——— Footer ——— */}
        <section className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 py-8 md:py-10" aria-label="Footer">
          <Link
            href="/wallet"
            onClick={playClick}
            className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15"
          >
            Connect wallet
          </Link>
          <Link
            href="/arena"
            onClick={playClick}
            className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-400/15"
          >
            Arena
          </Link>
          <Link
            href="/spectate"
            onClick={playClick}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
          >
            Spectate
          </Link>
          <Link
            href="/activity"
            onClick={playClick}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/50 hover:bg-white/10"
          >
            Wallet Activity
          </Link>
        </section>
      </div>
    </main>
  )
}
