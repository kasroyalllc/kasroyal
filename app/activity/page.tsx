"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import ConnectWallet from "@/components/wallet/connect-wallet"
import { getCurrentIdentity } from "@/lib/identity"
import {
  shortAddress,
  type WalletSession,
} from "@/lib/wallet/wallet-client"

const DEV_CONSOLE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEV_CONSOLE === "true" ||
  process.env.NODE_ENV === "development"

function StatCard({
  label,
  value,
  accent = "text-white",
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-4 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className={`mt-2 text-xl font-black ${accent}`}>{value}</div>
    </div>
  )
}

function ActivityRow({
  type,
  title,
  detail,
  time,
}: {
  type: string
  title: string
  detail?: string
  time: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 transition hover:bg-white/[0.04]">
      <div className="min-w-0">
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
          {type}
        </span>
        <p className="mt-2 font-bold text-white/90">{title}</p>
        {detail ? <p className="mt-0.5 text-sm text-white/55">{detail}</p> : null}
      </div>
      <span className="shrink-0 text-[11px] font-medium text-white/45">{time}</span>
    </div>
  )
}

function EmptyActivity({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
      <p className="text-sm text-white/55">{message}</p>
    </div>
  )
}

export default function ActivityPage() {
  const [session, setSession] = useState<WalletSession | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [copied, setCopied] = useState(false)

  const identity = getCurrentIdentity()

  const handleCopyAddress = useCallback(() => {
    if (!session?.account) return
    void navigator.clipboard.writeText(session.account).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [session?.account])

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050807] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-0 h-[300px] w-[300px] rounded-full bg-emerald-500/10 blur-[100px]" />
        <div className="absolute right-0 top-20 h-[280px] w-[280px] rounded-full bg-amber-400/08 blur-[100px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(16,185,129,0.06),transparent)]" />

      <div className="relative z-10 mx-auto max-w-[1000px] px-4 py-8 md:px-6 md:py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
            Wallet Activity
          </div>
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            Activity & status
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
            Connected wallet, recent activity, and transaction history. Use quick actions to copy address or open explorer.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <ConnectWallet key={refreshKey} onSessionChange={setSession} />

            {/* Wallet Status */}
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-5 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                Wallet status
              </p>
              <div className="mt-4 space-y-3">
                <StatCard
                  label="Connected wallet"
                  value={session ? shortAddress(session.account, 8, 6) : "Not connected"}
                  accent={session ? "text-emerald-300" : "text-white/60"}
                />
                <StatCard
                  label="Network"
                  value={session?.networkLabel ?? "—"}
                  accent="text-sky-300"
                />
                <StatCard
                  label="Balance"
                  value={session ? `${session.balanceKas} KAS` : "—"}
                  accent="text-amber-300"
                />
                <StatCard
                  label="Identity"
                  value={identity?.displayName ?? identity?.id?.slice(0, 12) ?? "Guest"}
                  accent="text-white/90"
                />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-5 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                Quick actions
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  disabled={!session?.account}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copied ? "Copied" : "Copy address"}
                </button>
                <a
                  href="https://explorer.kaspa.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Open block explorer
                </a>
                <Link
                  href="/wallet"
                  className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Reconnect / change wallet
                </Link>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Refresh activity
                </button>
              </div>
            </div>

            {DEV_CONSOLE_ENABLED ? (
              <Link
                href="/tx/console"
                className="block rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-center text-sm font-bold text-amber-200 transition hover:bg-amber-500/20"
              >
                Developer: Tx Console →
              </Link>
            ) : null}
          </aside>

          <section className="space-y-6">
            {/* Recent Activity */}
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-5 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">
                    Recent activity
                  </p>
                  <h2 className="mt-1 text-xl font-black">Room created · Joined · Wagers · Payouts</h2>
                </div>
              </div>
              <div className="space-y-2">
                <EmptyActivity message="Recent match and wallet events will appear here. Create or join a room, place a wager, or receive a payout to see activity." />
              </div>
            </div>

            {/* Pending Transactions */}
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-5 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
                Pending transactions
              </p>
              <h2 className="mt-1 text-xl font-black">Pending match actions · Payouts · Wagers</h2>
              <div className="mt-4">
                <EmptyActivity message="No pending transactions. Pending match moves, wagers, or payouts will show here." />
              </div>
            </div>

            {/* Completed Transactions */}
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-card)] p-5 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80">
                Completed transactions
              </p>
              <h2 className="mt-1 text-xl font-black">Status · Timestamp · Tx hash · Amount</h2>
              <div className="mt-4 space-y-2">
                <EmptyActivity message="Completed on-chain transactions will appear here with status, time, and tx hash when available." />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
