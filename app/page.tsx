"use client"

import Image from "next/image"
import Link from "next/link"

const skillArenas = [
  {
    title: "Chess Duel",
    subtitle: "High-skill 1v1 strategy battles with premium live spectator betting.",
    href: "/arena",
    tag: "Strategic 1v1",
    entry: "25 KAS Entry",
    volume: "412 KAS Today",
    glow: "emerald" as const,
  },
  {
    title: "Connect 4",
    subtitle: "Fast tactical rounds with dynamic odds and strong mid-match action.",
    href: "/arena",
    tag: "Fast Arena Action",
    entry: "10 KAS Entry",
    volume: "286 KAS Today",
    glow: "amber" as const,
  },
  {
    title: "Tic-Tac-Toe",
    subtitle: "Quick-fire arena matches built for rapid wagers and instant rematches.",
    href: "/arena",
    tag: "Quick Wager Matches",
    entry: "5 KAS Entry",
    volume: "128 KAS Today",
    glow: "sky" as const,
  },
]

const leaderboard = [
  { rank: 1, icon: "👑", name: "KaspaKing01", amount: "$12,589.67", streak: "8W", tier: "Royal Crown" },
  { rank: 2, icon: "🔥", name: "CryptoCrush44", amount: "$10,352.26", streak: "5W", tier: "Diamond II" },
  { rank: 3, icon: "⚡", name: "TurboBetGuy", amount: "$8,685.20", streak: "4W", tier: "Diamond I" },
  { rank: 4, icon: "🎯", name: "StakeLord", amount: "$7,248.66", streak: "3W", tier: "Gold III" },
  { rank: 5, icon: "💠", name: "LuckyDog23", amount: "$6,730.96", streak: "2W", tier: "Gold II" },
]

const sideCards = [
  {
    title: "Recent Big Bets",
    subtitle: "Whale spectator tickets and biggest live arena positions.",
    tone: "amber" as const,
    stat: "42 KAS",
  },
  {
    title: "Top Win Streak",
    subtitle: "Current hottest players climbing the KasRoyal ladder.",
    tone: "emerald" as const,
    stat: "9 Wins",
  },
  {
    title: "Biggest Pot Today",
    subtitle: "Highest combined match pot across all live arenas.",
    tone: "amber" as const,
    stat: "210 KAS",
  },
  {
    title: "Live Spectators",
    subtitle: "Audience activity across active matches and betting pools.",
    tone: "emerald" as const,
    stat: "128 Live",
  },
]

const tickerItems = [
  "🔥 TurboBetGuy placed 12 KAS on KaspaKing01",
  "⚡ BetMaster22 entered a Diamond II live arena",
  "🎯 CryptoCrush44 reached a 5-win streak",
  "💰 Biggest pool today reached 210 KAS",
  "👀 128 live spectators across KasRoyal arenas",
]

const particles = [
  { left: "6%", top: "14%", size: 6, delay: "0s", duration: "11s", color: "amber" },
  { left: "16%", top: "36%", size: 10, delay: "1s", duration: "13s", color: "emerald" },
  { left: "24%", top: "72%", size: 7, delay: "2s", duration: "12s", color: "amber" },
  { left: "38%", top: "18%", size: 8, delay: "0.5s", duration: "14s", color: "emerald" },
  { left: "52%", top: "32%", size: 11, delay: "1.5s", duration: "12s", color: "amber" },
  { left: "64%", top: "12%", size: 7, delay: "2.5s", duration: "15s", color: "emerald" },
  { left: "74%", top: "54%", size: 9, delay: "0.8s", duration: "13s", color: "amber" },
  { left: "84%", top: "26%", size: 8, delay: "1.8s", duration: "11s", color: "emerald" },
  { left: "92%", top: "68%", size: 6, delay: "2.2s", duration: "16s", color: "amber" },
]

function playClick() {
  try {
    const audio = new Audio("/click.mp3")
    audio.volume = 0.35
    void audio.play()
  } catch {}
}

function RankBadge({
  label,
  tone = "emerald",
}: {
  label: string
  tone?: "emerald" | "amber" | "sky"
}) {
  const styles =
    tone === "emerald"
      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
      : tone === "amber"
      ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
      : "border-sky-300/25 bg-sky-300/10 text-sky-200"

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${styles}`}
    >
      {label}
    </span>
  )
}

function LiveChip({
  label,
  tone,
}: {
  label: string
  tone: "emerald" | "amber" | "red"
}) {
  const styles =
    tone === "emerald"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
      : tone === "amber"
      ? "border-amber-300/20 bg-amber-300/10 text-amber-200"
      : "border-red-300/20 bg-red-400/10 text-red-200"

  return (
    <div className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${styles}`}>
      {label}
    </div>
  )
}

function SoundLink({
  href,
  className,
  children,
}: {
  href: string
  className: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={className} onClick={playClick}>
      {children}
    </Link>
  )
}

function SectionHeader({
  title,
  href,
}: {
  title: string
  href: string
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.24em] text-white/45">
          KasRoyal
        </div>
        <h2 className="text-2xl font-black tracking-wide text-amber-100 md:text-3xl">{title}</h2>
      </div>

      <Link
        href={href}
        onClick={playClick}
        className="rounded-xl border border-amber-300/15 bg-black/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80 transition hover:border-emerald-300/20 hover:bg-white/5 hover:text-emerald-200"
      >
        See All
      </Link>
    </div>
  )
}

function StatPill({
  value,
  label,
}: {
  value: string
  label: string
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 px-3 py-2">
      <div className="text-base font-black text-amber-100">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{label}</div>
    </div>
  )
}

function PortraitCard({
  name,
  accent,
  valueA,
  valueB,
  rank,
  mmr,
}: {
  name: string
  accent: "emerald" | "amber"
  valueA: string
  valueB: string
  rank: string
  mmr: string
}) {
  const accentGlow =
    accent === "emerald"
      ? "border-emerald-300/20 bg-emerald-300/10"
      : "border-amber-300/20 bg-amber-300/10"

  const dot = accent === "emerald" ? "bg-emerald-400" : "bg-amber-300"
  const ring =
    accent === "emerald"
      ? "shadow-[0_0_25px_rgba(0,255,200,0.12)]"
      : "shadow-[0_0_25px_rgba(255,200,80,0.10)]"

  const glowBar =
    accent === "emerald"
      ? "bg-[linear-gradient(90deg,rgba(0,255,200,0.45),transparent)]"
      : "bg-[linear-gradient(90deg,rgba(255,200,80,0.45),transparent)]"

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,#11110f,#0a0d0c)] p-4 shadow-[0_0_30px_rgba(0,0,0,0.18)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.02))]" />
      <div className={`pointer-events-none absolute left-0 top-0 h-[2px] w-full ${glowBar}`} />

      <div
        className={`relative mx-auto mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border ${accentGlow} ${ring}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%)]" />
        <div className="absolute inset-3 rounded-full border border-white/6 bg-black/25" />
        <div className="absolute left-1/2 top-[24%] h-8 w-8 -translate-x-1/2 rounded-full bg-white/10" />
        <div className="absolute left-1/2 top-[50%] h-10 w-14 -translate-x-1/2 rounded-t-full bg-white/10" />
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="truncate text-xl font-black">{name}</span>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <RankBadge label={rank} tone={accent === "emerald" ? "emerald" : "amber"} />
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">
            {mmr}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">{valueA}</div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">{valueB}</div>
        </div>
      </div>
    </div>
  )
}

function ArenaVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="relative grid grid-cols-4 gap-1.5 rounded-[14px] border border-white/8 bg-black/30 p-3">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square h-6 w-6 rounded-[4px] ${
              (Math.floor(i / 4) + i) % 2 === 0 ? "bg-amber-200/20" : "bg-black/50"
            }`}
          />
        ))}
        <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(0,255,200,0.45)]" />
      </div>
    )
  }

  if (index === 1) {
    return (
      <div className="relative grid grid-cols-7 gap-1.5 rounded-[16px] border border-white/8 bg-black/30 p-3">
        {Array.from({ length: 21 }).map((_, i) => {
          const filled = [1, 3, 7, 8, 10, 12, 14, 16, 17].includes(i)
          const alt = [2, 6, 9, 11, 15, 18].includes(i)

          return (
            <div
              key={i}
              className={`aspect-square h-5 w-5 rounded-full border ${
                filled
                  ? "border-amber-200/60 bg-amber-300 shadow-[0_0_10px_rgba(255,215,0,0.12)]"
                  : alt
                  ? "border-emerald-300/60 bg-emerald-400 shadow-[0_0_10px_rgba(0,255,200,0.10)]"
                  : "border-white/5 bg-black/40"
              }`}
            />
          )
        })}
        <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(255,215,0,0.45)]" />
      </div>
    )
  }

  return (
    <div className="relative grid grid-cols-3 gap-2 rounded-[16px] border border-white/8 bg-black/30 p-3">
      {["X", "O", "X", "", "O", "", "X", "", "O"].map((cell, i) => (
        <div
          key={i}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-sm font-black ${
            cell === "X" ? "text-amber-200" : cell === "O" ? "text-emerald-200" : "text-white/20"
          }`}
        >
          {cell}
        </div>
      ))}
      <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.45)]" />
    </div>
  )
}

function LeaderboardNav() {
  return (
    <div className="flex flex-wrap gap-2">
      <SoundLink
        href="/arena"
        className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200 shadow-[0_0_18px_rgba(0,255,200,0.08)]"
      >
        Arena
      </SoundLink>
      <SoundLink
        href="/spectate"
        className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.06]"
      >
        Spectate
      </SoundLink>
      <SoundLink
        href="/leaderboard"
        className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.06]"
      >
        Leaderboard
      </SoundLink>
      <SoundLink
        href="/profile"
        className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.06]"
      >
        Profile
      </SoundLink>
      <SoundLink
        href="/tx"
        className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.06]"
      >
        Tx Console
      </SoundLink>
    </div>
  )
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050807] text-white">
      <style jsx global>{`
        @keyframes driftGlow {
          0% { transform: translate3d(0,0,0) scale(1); opacity: 0.32; }
          50% { transform: translate3d(0,-18px,0) scale(1.06); opacity: 0.46; }
          100% { transform: translate3d(0,0,0) scale(1); opacity: 0.32; }
        }
        @keyframes floatParticle {
          0% { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.2; }
          50% { transform: translateY(-18px) translateX(6px) scale(1.12); opacity: 0.7; }
          100% { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.2; }
        }
        @keyframes pulseArena {
          0% { box-shadow: 0 0 0 rgba(0,255,200,0.06); }
          50% { box-shadow: 0 0 28px rgba(0,255,200,0.12); }
          100% { box-shadow: 0 0 0 rgba(0,255,200,0.06); }
        }
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-120%); opacity: 0; }
          50% { opacity: 0.35; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        .ambient-drift {
          animation: driftGlow 14s ease-in-out infinite;
        }
        .particle-float {
          animation-name: floatParticle;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .arena-pulse {
          animation: pulseArena 3.2s ease-in-out infinite;
        }
        .marquee-line {
          animation: marquee 22s linear infinite;
          white-space: nowrap;
        }
        .glass-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 15%, rgba(255,255,255,0.08) 50%, transparent 85%);
          transform: translateX(-120%);
          animation: shimmer 5.8s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] opacity-[0.10]" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-drift absolute -left-10 top-20 h-[420px] w-[420px] rounded-full bg-amber-300/10 blur-[120px]" />
        <div className="ambient-drift absolute right-[-60px] top-32 h-[420px] w-[420px] rounded-full bg-emerald-300/10 blur-[120px]" />
        <div className="ambient-drift absolute bottom-0 left-[20%] h-[300px] w-[300px] rounded-full bg-emerald-300/8 blur-[110px]" />
        <div className="ambient-drift absolute bottom-10 right-[18%] h-[260px] w-[260px] rounded-full bg-amber-300/8 blur-[110px]" />

        {particles.map((p, i) => (
          <div
            key={i}
            className={`particle-float absolute rounded-full ${
              p.color === "amber" ? "bg-amber-300/40" : "bg-emerald-300/40"
            } blur-[1px]`}
            style={{
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.08),transparent_26%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_18%,transparent_82%,rgba(255,255,255,0.02))]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,200,80,0.10),transparent_18%),radial-gradient(circle_at_80%_20%,rgba(0,255,200,0.10),transparent_18%),radial-gradient(circle_at_30%_80%,rgba(0,255,200,0.07),transparent_16%),radial-gradient(circle_at_85%_75%,rgba(255,200,80,0.07),transparent_18%)] opacity-30" />

      <div className="relative z-10 mx-auto max-w-[1460px] px-4 pb-14 pt-3 md:px-6 xl:px-8">
        <div className="mx-auto mb-3 max-w-[1180px] overflow-hidden rounded-2xl border border-emerald-300/10 bg-black/30 px-6 py-2.5 shadow-[0_0_18px_rgba(0,255,200,0.04)]">
          <div className="marquee-line text-sm font-semibold text-emerald-200/90">
            {tickerItems.join("   •   ")}
          </div>
        </div>

        <div className="mx-auto mb-4 grid max-w-[1180px] gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative overflow-hidden rounded-2xl border border-amber-300/15 bg-black/35 px-4 py-3 shadow-[0_0_22px_rgba(255,200,80,0.05)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-36 bg-[radial-gradient(circle_at_center,rgba(255,200,80,0.12),transparent_60%)] blur-2xl" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/kasroyal-logo-navbar.png"
                  alt="KasRoyal"
                  width={26}
                  height={26}
                  className="h-[26px] w-auto"
                />
                <div>
                  <div className="text-xs font-semibold text-white/70">Arena Volume</div>
                  <div className="text-2xl font-black text-amber-300">$3,254,780.12</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/75">
                Live Pools
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <SoundLink
              href="/wallet"
              className="rounded-2xl border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.16),rgba(16,185,129,0.08))] px-5 py-3 text-sm font-bold text-emerald-100 shadow-[0_0_24px_rgba(0,255,200,0.08)] transition hover:scale-[1.02] hover:border-emerald-300/30 hover:bg-[linear-gradient(180deg,rgba(16,185,129,0.22),rgba(16,185,129,0.10))]"
            >
              CONNECT WALLET
            </SoundLink>

            <SoundLink
              href="/arena"
              className="rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-200 px-5 py-3 text-sm font-black text-black shadow-[0_0_24px_rgba(255,215,0,0.20)] transition hover:scale-[1.02]"
            >
              ENTER ARENA
            </SoundLink>
          </div>
        </div>

        <section className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[34px] border border-amber-300/15 bg-black/30 px-5 py-5 shadow-[0_0_60px_rgba(255,200,80,0.05)] backdrop-blur-xl md:px-8 md:py-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,200,0.16),transparent_45%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_25%,transparent_75%,rgba(255,255,255,0.02))]" />
          <div className="pointer-events-none absolute left-0 top-0 hidden h-full w-36 bg-[radial-gradient(circle_at_center,rgba(255,200,80,0.16),transparent_55%)] blur-2xl md:block" />
          <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-36 bg-[radial-gradient(circle_at_center,rgba(0,255,200,0.14),transparent_55%)] blur-2xl md:block" />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-amber-300/10 to-transparent blur-xl" />
          <div className="pointer-events-none absolute left-1/2 top-[20%] h-[260px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-[120px]" />

          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              <LiveChip label="Skill Arenas First" tone="emerald" />
              <LiveChip label="Spectator Betting" tone="amber" />
              <LiveChip label="Galleon Testnet" tone="emerald" />
            </div>

            <div className="relative mx-auto mb-4 flex max-w-[980px] justify-center px-2 py-1">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,200,80,0.07),transparent_60%)]" />
              <Image
                src="/kasroyal-hero-banner.png"
                alt="KasRoyal"
                width={1200}
                height={600}
                priority
                className="relative z-10 h-auto w-full max-w-[720px] object-contain drop-shadow-[0_0_80px_rgba(0,255,200,0.28)]"
              />
            </div>

            <h1 className="text-3xl font-black tracking-[0.12em] text-amber-100 sm:text-4xl md:text-5xl">
              PLAY • BET • WIN ON KASPA
            </h1>

            <p className="mx-auto mt-2.5 max-w-3xl text-sm leading-7 text-white/65 md:text-lg">
              KasRoyal is a competitive skill arena platform built for fast 1v1 play, live
              spectators, and premium on-chain wagering flows across Kaspa / IgraLabs.
            </p>

            <div className="mx-auto mt-4 grid max-w-4xl gap-3 text-left md:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-sm leading-6 text-white/75">
                Connect your wallet and sign into KasRoyal from the wallet layer.
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-sm leading-6 text-white/75">
                Explore skill arenas first: Chess Duel, Connect 4, and Tic-Tac-Toe.
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-sm leading-6 text-white/75">
                Use the tx console to test create, join, bet, and settlement flows on testnet.
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <SoundLink
                href="/wallet"
                className="rounded-2xl border border-emerald-300/20 bg-gradient-to-r from-emerald-400/30 to-emerald-300/10 px-7 py-3.5 text-sm font-black text-amber-100 shadow-[0_0_35px_rgba(0,255,200,0.18)] transition hover:scale-[1.02] md:px-8 md:text-base"
              >
                CONNECT WALLET
              </SoundLink>

              <SoundLink
                href="/arena"
                className="rounded-2xl border border-amber-300/20 bg-black/30 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/5 md:text-base"
              >
                ENTER ARENA
              </SoundLink>

              <SoundLink
                href="/tx"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.08] md:text-base"
              >
                OPEN TX CONSOLE
              </SoundLink>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-[1180px]">
          <SectionHeader title="SKILL ARENAS" href="/arena" />

          <div className="grid gap-4 lg:grid-cols-3">
            {skillArenas.map((game, index) => (
              <div
                key={game.title}
                className="group relative overflow-hidden rounded-[26px] border border-amber-300/12 bg-black/30 p-3 shadow-[0_0_24px_rgba(255,200,80,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300/20 hover:shadow-[0_0_38px_rgba(0,255,200,0.12)]"
              >
                <div
                  className={`pointer-events-none absolute inset-0 opacity-80 ${
                    game.glow === "emerald"
                      ? "bg-[radial-gradient(circle_at_top_left,rgba(0,255,200,0.12),transparent_45%)]"
                      : game.glow === "amber"
                      ? "bg-[radial-gradient(circle_at_top_left,rgba(255,200,80,0.12),transparent_45%)]"
                      : "bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_45%)]"
                  }`}
                />

                <div className="glass-shimmer relative overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,#13110d,#0a0d0c)] p-4">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_35%)]" />

                  <div className="relative mb-4 flex min-h-[116px] items-center justify-center rounded-[18px] border border-white/8 bg-black/20 transition group-hover:border-emerald-300/15 group-hover:bg-black/25">
                    <ArenaVisual index={index} />
                  </div>

                  <div className="relative">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-2xl font-black text-amber-100">{game.title}</h3>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                          KasRoyal Arena
                        </div>
                      </div>

                      <RankBadge
                        label={game.tag}
                        tone={game.glow === "emerald" ? "emerald" : game.glow === "amber" ? "amber" : "sky"}
                      />
                    </div>

                    <p className="min-h-[48px] text-sm leading-6 text-white/65">{game.subtitle}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <StatPill value={game.entry} label="Suggested Entry" />
                    <StatPill value={game.volume} label="Arena Volume" />
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs font-semibold text-white/55">Open lobbies available</div>

                    <SoundLink
                      href={game.href}
                      className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-400/15"
                    >
                      Enter
                    </SoundLink>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-[1180px]">
          <SectionHeader title="LIVE ARENAS" href="/arena" />

          <div className="overflow-hidden rounded-[28px] border border-amber-300/12 bg-black/30 p-3 shadow-[0_0_30px_rgba(0,255,200,0.05)]">
            <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-red-300/20 bg-red-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-red-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </div>
                <LiveChip label="38 Viewers" tone="amber" />
                <LiveChip label="Betting Locks in 18s" tone="red" />
                <LiveChip label="73 KAS Pot" tone="emerald" />
              </div>

              <div className="flex items-center justify-start gap-2 lg:justify-end">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                  Featured Match
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
              <PortraitCard
                name="CryptoCrush44"
                accent="emerald"
                valueA="Bankroll $720.50"
                valueB="Bet Side 47%"
                rank="Gold I"
                mmr="1528 MMR"
              />

              <div className="arena-pulse relative overflow-hidden rounded-[24px] border border-amber-300/15 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.16),transparent_34%),linear-gradient(180deg,#120f0c,#0b0d0c)] p-4 shadow-[0_0_40px_rgba(255,200,80,0.06)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,200,0.10),transparent_48%)]" />
                <div className="pointer-events-none absolute inset-0 rounded-[24px] ring-1 ring-amber-300/10" />

                <div className="relative">
                  <div className="mb-3 flex items-center justify-center">
                    <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-200 shadow-[0_0_20px_rgba(255,200,80,0.10)]">
                      Connect 4 • Arena #184
                    </div>
                  </div>

                  <div className="mx-auto mb-4 max-w-[620px] rounded-[22px] border border-emerald-300/18 bg-black/25 p-5 shadow-[0_0_35px_rgba(0,255,200,0.12)] transition hover:scale-[1.01]">
                    <div className="grid grid-cols-7 gap-2 rounded-[18px] border border-white/8 bg-[#0d1110] p-5 shadow-[inset_0_0_20px_rgba(0,255,200,0.08)]">
                      {Array.from({ length: 42 }).map((_, i) => {
                        const filled = [2, 4, 7, 10, 12, 18, 20, 23, 25, 27, 30, 31, 33].includes(i)
                        const alt = [8, 15, 16, 22, 24, 29, 32, 34, 35].includes(i)

                        return (
                          <div
                            key={i}
                            className={`aspect-square rounded-full border transition ${
                              filled
                                ? "border-amber-200/60 bg-amber-300 shadow-[0_0_14px_rgba(255,215,0,0.16)]"
                                : alt
                                ? "border-emerald-300/60 bg-emerald-400 shadow-[0_0_14px_rgba(0,255,200,0.14)]"
                                : "border-white/5 bg-black/40"
                            }`}
                          />
                        )
                      })}
                    </div>
                  </div>

                  <div className="mb-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/8 bg-black/25 px-3 py-3 text-center">
                      <div className="text-lg font-black text-amber-100">41%</div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                        Bet On Left
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-300/14 bg-emerald-400/8 px-3 py-3 text-center shadow-[0_0_18px_rgba(0,255,200,0.08)]">
                      <div className="text-lg font-black text-emerald-200">VS</div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                        Locked Arena
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-black/25 px-3 py-3 text-center">
                      <div className="text-lg font-black text-amber-100">59%</div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                        Bet On Right
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 flex items-center justify-center gap-2">
                    <RankBadge label="Diamond II" tone="sky" />
                    <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-5 py-2 text-2xl font-black text-amber-100 shadow-[0_0_18px_rgba(0,255,200,0.10)]">
                      VS
                    </div>
                    <RankBadge label="Gold I" tone="amber" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-center">
                    <div className="rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-sm font-bold text-white/90">
                      Odds Shift Active
                    </div>
                    <SoundLink
                      href="/arena/match/arena-1"
                      className="rounded-2xl border border-emerald-300/18 bg-emerald-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-400/15"
                    >
                      View Match
                    </SoundLink>
                  </div>
                </div>
              </div>

              <PortraitCard
                name="BetMaster22"
                accent="amber"
                valueA="Bankroll $1,429.64"
                valueB="Bet Side 53%"
                rank="Diamond II"
                mmr="1842 MMR"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-[1180px]">
          <div className="mb-4 flex flex-col gap-4 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] px-4 py-4 shadow-[0_0_28px_rgba(0,255,200,0.04)] backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/18 bg-emerald-400/10 shadow-[0_0_18px_rgba(0,255,200,0.10)]">
                <Image
                  src="/kasroyal-logo-navbar.png"
                  alt="KasRoyal"
                  width={24}
                  height={24}
                  className="h-6 w-auto"
                />
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                  Premium Skill Arena
                </div>
                <div className="text-xl font-black text-amber-100">KasRoyal Command Center</div>
              </div>
            </div>

            <LeaderboardNav />

            <div className="rounded-[20px] border border-white/8 bg-black/35 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-black text-white">
                  K
                </div>
                <div>
                  <div className="text-sm font-black text-white">KasRoyal User</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                    0xc1ad...44b3
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SectionHeader title="LEADERBOARD" href="/leaderboard" />

          <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
            <div className="overflow-hidden rounded-[26px] border border-amber-300/12 bg-black/30 shadow-[0_0_28px_rgba(255,200,80,0.04)]">
              <div className="grid grid-cols-[62px_minmax(0,1fr)_88px_140px] border-b border-white/8 bg-white/[0.02] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                <div>Rank</div>
                <div>Player</div>
                <div className="text-right">Streak</div>
                <div className="text-right">Winnings</div>
              </div>

              <div className="divide-y divide-white/8">
                {leaderboard.map((user, index) => (
                  <div
                    key={user.rank}
                    className={`group relative grid grid-cols-[62px_minmax(0,1fr)_88px_140px] items-center gap-2 px-4 py-3 transition hover:bg-white/[0.03] ${
                      index === 0 ? "bg-[linear-gradient(90deg,rgba(255,200,80,0.08),transparent_60%)]" : ""
                    }`}
                  >
                    <div
                      className={`pointer-events-none absolute left-0 top-0 h-full w-[2px] ${
                        index === 0
                          ? "bg-[linear-gradient(to_bottom,rgba(255,200,80,0.65),transparent)]"
                          : "bg-[linear-gradient(to_bottom,rgba(0,255,200,0.24),transparent)]"
                      }`}
                    />

                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-300/15 bg-amber-300/10 text-xs font-black text-amber-100">
                        {user.rank}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="text-base">{user.icon}</div>
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-black text-white md:text-base">{user.name}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <RankBadge
                              label={user.tier}
                              tone={index === 0 ? "amber" : index === 1 ? "sky" : "emerald"}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-200">{user.streak}</div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">
                        Current
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-black text-amber-200">{user.amount}</div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">
                        Total
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {sideCards.map((card) => (
                <div
                  key={card.title}
                  className="group relative overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,#11110d,#0a0d0c)] p-4 transition hover:border-emerald-300/15 hover:shadow-[0_0_24px_rgba(0,255,200,0.06)]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_34%)]" />
                  <div
                    className={`mb-3 flex h-20 items-end justify-between rounded-[18px] border border-white/8 px-3 py-3 ${
                      card.tone === "amber"
                        ? "bg-[radial-gradient(circle_at_center,rgba(255,200,80,0.14),transparent_45%)]"
                        : "bg-[radial-gradient(circle_at_center,rgba(0,255,200,0.14),transparent_45%)]"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">
                      Live Metric
                    </div>
                    <div className="text-sm font-black text-amber-200">{card.stat}</div>
                  </div>

                  <div className="text-sm font-black text-white/95">{card.title}</div>
                  <div className="mt-1 min-h-[36px] text-[11px] leading-5 text-white/55">{card.subtitle}</div>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">
                      Live Tracking
                    </span>

                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        card.tone === "amber" ? "bg-amber-300" : "bg-emerald-400"
                      } shadow-[0_0_12px_rgba(255,255,255,0.15)]`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}