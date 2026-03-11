"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  buildLeaderboardFromArena,
  currentUser,
  getRankColors,
  readArenaMatches,
  subscribeArenaMatches,
  type LeaderboardEntry,
  type RankTier,
} from "@/lib/mock/arena-data"

function RankBadge({ rank }: { rank: RankTier }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${getRankColors(
        rank
      )}`}
    >
      {rank}
    </span>
  )
}

function StatCard({
  label,
  value,
  accent = "text-white",
  helper,
}: {
  label: string
  value: string
  accent?: string
  helper?: string
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-2 text-3xl font-black ${accent}`}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-white/45">{helper}</div> : null}
    </div>
  )
}

function getStreakColor(streak: string) {
  return streak.startsWith("W") ? "text-emerald-300" : "text-red-300"
}

function getMedal(position: number) {
  if (position === 1) return "👑"
  if (position === 2) return "🥈"
  if (position === 3) return "🥉"
  return `#${position}`
}

function getGlowClass(glow?: LeaderboardEntry["avatarGlow"]) {
  if (glow === "amber") return "shadow-[0_0_30px_rgba(255,215,0,0.18)]"
  if (glow === "emerald") return "shadow-[0_0_30px_rgba(0,255,200,0.18)]"
  if (glow === "sky") return "shadow-[0_0_30px_rgba(80,180,255,0.18)]"
  if (glow === "fuchsia") return "shadow-[0_0_30px_rgba(217,70,239,0.18)]"
  return ""
}

function getFavoriteGameColor(game: string) {
  if (game === "Chess Duel") return "text-amber-300"
  if (game === "Connect 4") return "text-emerald-300"
  if (game === "Tic-Tac-Toe") return "text-sky-300"
  return "text-white"
}

function PlayerInitials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-black text-white/85">
      {initials}
    </div>
  )
}

function PodiumCard({
  player,
  featured = false,
}: {
  player: LeaderboardEntry & { position: number }
  featured?: boolean
}) {
  return (
    <div
      className={`rounded-[28px] border border-white/8 bg-white/[0.04] p-6 ${getGlowClass(
        player.avatarGlow
      )} ${featured ? "lg:min-h-[420px]" : "lg:min-h-[360px]"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <PlayerInitials name={player.name} />
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              {featured ? "Champion" : "Top Contender"}
            </div>
            <div className={`mt-2 font-black ${featured ? "text-4xl" : "text-3xl"}`}>
              {player.name}
            </div>
          </div>
        </div>

        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-black ${
            player.position === 1
              ? "border-amber-300/20 bg-amber-300/10 text-amber-300"
              : player.position === 2
              ? "border-zinc-300/20 bg-zinc-300/10 text-zinc-200"
              : "border-orange-300/20 bg-orange-300/10 text-orange-200"
          }`}
        >
          {getMedal(player.position)}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <RankBadge rank={player.rank} />
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
          {player.rating} MMR
        </span>
      </div>

      <div className={`mt-6 grid gap-3 ${featured ? "sm:grid-cols-2" : "grid-cols-2"}`}>
        <StatCard label="Win Rate" value={`${player.winRate}%`} />
        <StatCard label="Record" value={`${player.wins}-${player.losses}`} />
        <StatCard label="Streak" value={player.streak} accent={getStreakColor(player.streak)} />
        <StatCard
          label="Favorite"
          value={player.favoriteGame}
          accent={getFavoriteGameColor(player.favoriteGame)}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-white/8 bg-black/25 p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-white/45">Earnings</div>
        <div className="mt-2 text-3xl font-black text-emerald-300">{player.earnings} KAS</div>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    const sync = () => {
      const matches = readArenaMatches()
      setRows(buildLeaderboardFromArena(matches))
    }

    sync()
    const unsubscribe = subscribeArenaMatches(sync)
    return unsubscribe
  }, [])

  const rankedRows = useMemo(
    () =>
      rows.map((row, index) => ({
        ...row,
        position: index + 1,
      })),
    [rows]
  )

  const leader = rankedRows[0]
  const second = rankedRows[1]
  const third = rankedRows[2]
  const tableRows = rankedRows.slice(0, 20)

  const avgWinRate =
    rankedRows.length > 0
      ? Math.round(rankedRows.reduce((sum, player) => sum + player.winRate, 0) / rankedRows.length)
      : 0

  const totalEarnings = rankedRows.reduce((sum, player) => sum + player.earnings, 0)
  const currentUserEntry = rankedRows.find((player) => player.name === currentUser.name)
  const currentUserRank = currentUserEntry?.position ?? null

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.06),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_20%,transparent_80%,rgba(255,255,255,0.02))]" />
      <div className="absolute left-[-80px] top-20 h-[340px] w-[340px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="absolute right-[-80px] top-32 h-[340px] w-[340px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1550px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-4 overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/8">
          <div className="animate-[marquee_24s_linear_infinite] whitespace-nowrap py-3 text-sm font-semibold text-emerald-200 [@keyframes_marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}]">
            KASROYAL RANKINGS • LIVE COMPETITIVE LADDER • EARNINGS • WIN RATE • MMR • STREAKS •
            TOP PLAYERS •
          </div>
        </div>

        <div className="mb-8 overflow-hidden rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_50px_rgba(0,255,200,0.05)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
                KasRoyal Competitive Rankings
              </div>

              <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">
                Leaderboard
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
                Live competitive rankings powered by shared KasRoyal arena data. As matches launch,
                resolve, and earnings grow, the board updates to reflect real platform momentum.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard
                label="Top Player"
                value={leader ? leader.name : "—"}
                accent="text-amber-300"
              />
              <StatCard
                label="Tracked Players"
                value={`${rankedRows.length}`}
                accent="text-emerald-300"
              />
              <StatCard
                label="Avg Win Rate"
                value={`${avgWinRate}%`}
                accent="text-sky-300"
              />
              <Link
                href="/arena"
                className="flex items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
              >
                Back to Arena
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <StatCard
            label="Current User Rank"
            value={currentUserRank ? `#${currentUserRank}` : "Unranked"}
            accent="text-emerald-300"
            helper={currentUser.name}
          />
          <StatCard
            label="Highest Rating"
            value={leader ? `${leader.rating}` : "0"}
            accent="text-amber-300"
          />
          <StatCard
            label="Top Earnings"
            value={leader ? `${leader.earnings} KAS` : "0 KAS"}
            accent="text-fuchsia-300"
          />
          <StatCard
            label="Board Earnings"
            value={`${totalEarnings} KAS`}
            accent="text-sky-300"
          />
        </div>

        {currentUserEntry ? (
          <div className="mb-8 rounded-[30px] border border-emerald-300/12 bg-gradient-to-br from-emerald-400/[0.06] to-white/[0.02] p-5 shadow-[0_0_40px_rgba(0,255,200,0.04)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">
                  Your Position
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-black">
                    {currentUserEntry.name} • #{currentUserEntry.position}
                  </h2>
                  <RankBadge rank={currentUserEntry.rank} />
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
                    {currentUserEntry.rating} MMR
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-sm font-semibold text-white/70">
                Premium Skill Arena
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              <StatCard label="Win Rate" value={`${currentUserEntry.winRate}%`} accent="text-emerald-300" />
              <StatCard
                label="Record"
                value={`${currentUserEntry.wins}-${currentUserEntry.losses}`}
              />
              <StatCard
                label="Streak"
                value={currentUserEntry.streak}
                accent={getStreakColor(currentUserEntry.streak)}
              />
              <StatCard
                label="Favorite Game"
                value={currentUserEntry.favoriteGame}
                accent={getFavoriteGameColor(currentUserEntry.favoriteGame)}
              />
              <StatCard
                label="Earnings"
                value={`${currentUserEntry.earnings} KAS`}
                accent="text-amber-300"
              />
            </div>
          </div>
        ) : null}

        <div className="mb-8 grid gap-4 lg:grid-cols-[1.15fr_0.925fr_0.925fr]">
          {leader ? <PodiumCard player={leader} featured /> : null}
          {second ? <PodiumCard player={second} /> : null}
          {third ? <PodiumCard player={third} /> : null}
        </div>

        <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Ranked Table
              </p>
              <h2 className="mt-2 text-3xl font-black">Top Players</h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/60">
              Showing top {tableRows.length} players
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-white/45">
                  <th className="px-4 py-2">Rank</th>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Tier</th>
                  <th className="px-4 py-2">MMR</th>
                  <th className="px-4 py-2">Win Rate</th>
                  <th className="px-4 py-2">Record</th>
                  <th className="px-4 py-2">Streak</th>
                  <th className="px-4 py-2">Favorite Game</th>
                  <th className="px-4 py-2">Earnings</th>
                </tr>
              </thead>

              <tbody>
                {tableRows.map((player) => {
                  const isCurrentUser = player.name === currentUser.name

                  return (
                    <tr
                      key={player.id}
                      className={`text-sm text-white/85 ${
                        isCurrentUser
                          ? "bg-emerald-400/[0.06] shadow-[0_0_25px_rgba(0,255,200,0.05)]"
                          : "bg-black/20"
                      }`}
                    >
                      <td
                        className={`rounded-l-2xl border-y border-l px-4 py-5 text-xl font-black ${
                          isCurrentUser
                            ? "border-emerald-300/18 text-emerald-300"
                            : "border-white/8 text-amber-300"
                        }`}
                      >
                        #{player.position}
                      </td>
                      <td
                        className={`border-y px-4 py-5 ${
                          isCurrentUser ? "border-emerald-300/18" : "border-white/8"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <PlayerInitials name={player.name} />
                          <div>
                            <div className="font-black">{player.name}</div>
                            {isCurrentUser ? (
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                                You
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td
                        className={`border-y px-4 py-5 ${
                          isCurrentUser ? "border-emerald-300/18" : "border-white/8"
                        }`}
                      >
                        <RankBadge rank={player.rank} />
                      </td>
                      <td
                        className={`border-y px-4 py-5 font-bold ${
                          isCurrentUser ? "border-emerald-300/18" : "border-white/8"
                        }`}
                      >
                        {player.rating}
                      </td>
                      <td
                        className={`border-y px-4 py-5 font-bold ${
                          isCurrentUser ? "border-emerald-300/18" : "border-white/8"
                        }`}
                      >
                        {player.winRate}%
                      </td>
                      <td
                        className={`border-y px-4 py-5 font-bold ${
                          isCurrentUser ? "border-emerald-300/18" : "border-white/8"
                        }`}
                      >
                        {player.wins}-{player.losses}
                      </td>
                      <td
                        className={`border-y px-4 py-5 font-black ${getStreakColor(
                          player.streak
                        )} ${isCurrentUser ? "border-emerald-300/18" : "border-white/8"}`}
                      >
                        {player.streak}
                      </td>
                      <td
                        className={`border-y px-4 py-5 font-bold ${getFavoriteGameColor(
                          player.favoriteGame
                        )} ${isCurrentUser ? "border-emerald-300/18" : "border-white/8"}`}
                      >
                        {player.favoriteGame}
                      </td>
                      <td
                        className={`rounded-r-2xl border-y border-r px-4 py-5 font-black text-emerald-300 ${
                          isCurrentUser ? "border-emerald-300/18" : "border-white/8"
                        }`}
                      >
                        {player.earnings} KAS
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}