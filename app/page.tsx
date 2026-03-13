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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050807] text-white">
      <style jsx global>{`
        @keyframes driftGlow {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.4; }
        }
        @keyframes pulseRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.2); }
          50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
        }
        .ambient-drift { animation: driftGlow 12s ease-in-out infinite; }
        .pulse-ring { animation: pulseRing 2s ease-in-out infinite; }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-drift absolute -left-20 top-0 h-[380px] w-[380px] rounded-full bg-emerald-500/10 blur-[100px]" />
        <div className="ambient-drift absolute right-0 top-20 h-[320px] w-[320px] rounded-full bg-amber-400/10 blur-[100px]" />
        <div className="ambient-drift absolute bottom-0 left-1/3 h-[280px] w-[280px] rounded-full bg-emerald-500/8 blur-[80px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent),radial-gradient(ellipse_60%_40%_at_80%_50%,rgba(251,191,36,0.06),transparent)]" />

      <div className="relative z-10 mx-auto max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 md:pt-8">
        {/* Hero: one clear value prop + Quick vs Ranked */}
        <section className="mb-10 text-center md:mb-12">
          <div className="mb-4 flex justify-center">
            <Image
              src="/kasroyal-logo-navbar.png"
              alt="KasRoyal"
              width={40}
              height={40}
              className="h-10 w-10 opacity-95"
            />
          </div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-300">
            <LiveDot />
            Skill arena · Spectator betting · Kaspa
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
            Play. Bet. Win.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/60 md:text-base">
            KasRoyal is the live skill arena on Kaspa. 1v1 matches, real-time spectator betting, premium UX.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/arena"
              onClick={playClick}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/20 px-6 py-3.5 text-sm font-bold text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.15)] transition hover:border-emerald-400/50 hover:bg-emerald-500/25 hover:text-white"
            >
              Quick Match
            </Link>
            <Link
              href="/arena"
              onClick={playClick}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/20 px-6 py-3.5 text-sm font-bold text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.12)] transition hover:border-amber-400/50 hover:bg-amber-400/25 hover:text-white"
            >
              Ranked Match
            </Link>
            <Link
              href="/spectate"
              onClick={playClick}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              Spectate
            </Link>
          </div>
        </section>

        {/* Live arenas: real rooms */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white md:text-xl">
              Live arenas
            </h2>
            <span className="text-xs font-medium uppercase tracking-wider text-white/45">
              {liveRooms.length} match{liveRooms.length !== 1 ? "es" : ""}
            </span>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--border-strong)] bg-white/[0.02] p-3 md:p-4">
            {liveRooms.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-white/50">
                No live matches. Create or join one in the Arena.
              </div>
            )}
          </div>
        </section>

        {/* Skill arenas strip + CTA — games before lobbies */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white md:text-xl">
              Skill arenas
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {GAMES.map((g) => (
              <Link
                key={g.name}
                href={g.href}
                onClick={playClick}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3.5 transition hover:border-emerald-400/20 hover:bg-emerald-500/5"
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
              className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] transition hover:from-emerald-400 hover:to-emerald-500"
            >
              Enter Arena
            </Link>
          </div>
        </section>

        {/* Open seats: joinable + ready */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white md:text-xl">
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
          <div className="rounded-[var(--radius-card)] border border-[var(--border-strong)] bg-white/[0.02] p-3 md:p-4">
            {openRooms.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-white/50">
                No open seats. Create a Quick or Ranked match in the Arena.
              </div>
            )}
          </div>
        </section>

        {/* Recently resolved: trust */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white md:text-xl">
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
          <div className="rounded-[var(--radius-card)] border border-[var(--border-strong)] bg-white/[0.02] p-3 md:p-4">
            {recentResolved.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-sm text-white/45">
                No resolved matches yet.
              </div>
            )}
          </div>
        </section>

        {/* Footer strip: wallet + tx */}
        <section className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 pt-6">
          <Link
            href="/wallet"
            onClick={playClick}
            className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15"
          >
            Connect wallet
          </Link>
          <Link
            href="/arena"
            onClick={playClick}
            className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/15"
          >
            Arena
          </Link>
          <Link
            href="/spectate"
            onClick={playClick}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10"
          >
            Spectate
          </Link>
          <Link
            href="/tx"
            onClick={playClick}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/10"
          >
            Tx console
          </Link>
        </section>
      </div>
    </main>
  )
}
