"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import ConnectWallet from "@/components/wallet/connect-wallet"
import { type WalletSession } from "@/lib/wallet/wallet-client"

type ChainApiResponse = {
  ok: boolean
  health?: {
    ok: boolean
    rpcUrl: string
    error?: string
  }
  chainContext?: {
    ok: boolean
    network: "galleon_testnet" | "galleon_mainnet" | "unknown"
    chainIdHex: string | null
    chainIdDecimal: number | null
    blockNumberHex: string | null
    blockNumberDecimal: number | null
    rpcUrl: string
    error?: string
  }
  configuredAddresses?: {
    arenaFactory?: string
    arenaEscrow?: string
    spectatorMarket?: string
    leaderboard?: string
    profileRegistry?: string
  }
  query?: {
    address: string | null
  }
  balance?: {
    address: string
    weiHex: string
    wei: string | bigint
    kasFormatted: string
  } | null
  addressError?: string | null
  error?: string
}

function shortValue(value?: string | null, left = 8, right = 6) {
  if (!value) return "Not Set"
  if (value.length <= left + right + 3) return value
  return `${value.slice(0, left)}...${value.slice(-right)}`
}

function networkLabel(network?: string) {
  if (network === "galleon_testnet") return "Galleon Testnet"
  if (network === "galleon_mainnet") return "Galleon Mainnet"
  return "Unknown Network"
}

function safeDisplayValue(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return "Not available"
}

function StatusPill({
  ok,
  label,
}: {
  ok: boolean
  label: string
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${
        ok
          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300"
          : "border-red-300/25 bg-red-400/10 text-red-300"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          ok ? "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.8)]" : "bg-red-400"
        }`}
      />
      {label}
    </div>
  )
}

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
    <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className={`mt-2 break-words text-2xl font-black ${accent}`}>{value}</div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "emerald" | "amber"
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
      ? "text-amber-300"
      : "text-white"

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-sm text-white/55">{label}</div>
      <div className={`max-w-[60%] truncate text-right text-sm font-bold ${toneClass}`}>
        {value}
      </div>
    </div>
  )
}

function AddressCard({
  title,
  value,
}: {
  title: string
  value?: string
}) {
  const isSet = Boolean(value)

  return (
    <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,#101311,#0b0e0d)] p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">{title}</div>
      <div
        className={`mt-3 break-all text-sm font-bold ${
          isSet ? "text-emerald-200" : "text-white/45"
        }`}
      >
        {value ?? "Not configured yet"}
      </div>
    </div>
  )
}

export default function WalletPage() {
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null)
  const [addressInput, setAddressInput] = useState("")
  const [submittedAddress, setSubmittedAddress] = useState("")
  const [data, setData] = useState<ChainApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedSubmittedAddress = submittedAddress.trim()

  const apiUrl = useMemo(() => {
    const base = "/api/kasroyal/chain"
    if (!trimmedSubmittedAddress) return base
    return `${base}?address=${encodeURIComponent(trimmedSubmittedAddress)}`
  }, [trimmedSubmittedAddress])

  const loadData = useCallback(
    async (showRefreshState = false) => {
      try {
        setError(null)

        if (showRefreshState) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        const response = await fetch(apiUrl, {
          method: "GET",
          cache: "no-store",
        })

        const json = (await response.json()) as ChainApiResponse

        if (!response.ok || !json.ok) {
          throw new Error(json.error || "Failed to load KasRoyal chain data.")
        }

        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown wallet page error")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [apiUrl]
  )

  useEffect(() => {
    void loadData(false)
  }, [loadData])

  const rpcHealthy = Boolean(data?.health?.ok)
  const chainHealthy = Boolean(data?.chainContext?.ok)
  const network = networkLabel(data?.chainContext?.network)
  const addressDisplay = safeDisplayValue(
    data?.balance?.address,
    submittedAddress,
    walletSession?.account,
    "No address loaded"
  )
  const rpcErrorDisplay = safeDisplayValue(
    data?.health?.error,
    data?.chainContext?.error,
    "None"
  )

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050807] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] opacity-[0.10]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.08),transparent_24%)]" />
      <div className="pointer-events-none absolute left-[-60px] top-20 h-[320px] w-[320px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-60px] top-36 h-[320px] w-[320px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1600px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-6 flex flex-col gap-4 rounded-[30px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_40px_rgba(16,185,129,0.05)] lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              KasRoyal Wallet & Chain Console
            </div>

            <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">
              Wallet Layer
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
              This page is your live bridge between the KasRoyal UI, your Igra RPC client,
              configured contract addresses, and real wallet-signing flows.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusPill ok={rpcHealthy} label={rpcHealthy ? "RPC Online" : "RPC Offline"} />
            <StatusPill ok={chainHealthy} label={chainHealthy ? network : "Chain Unknown"} />
            <Link
              href="/activity"
              className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
            >
              Wallet Activity
            </Link>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <ConnectWallet
              onSessionChange={(session) => {
                setWalletSession(session)
                if (session?.account) {
                  setAddressInput(session.account)
                  setSubmittedAddress(session.account)
                }
              }}
            />

            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Balance Lookup
              </p>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                    Wallet Address
                  </label>

                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="0x..."
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm font-bold text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSubmittedAddress(addressInput.trim())}
                    className="rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01]"
                  >
                    Lookup Balance
                  </button>

                  <button
                    onClick={() => void loadData(true)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </div>

                <StatCard
                  label="Wallet Balance"
                  value={
                    walletSession
                      ? `${walletSession.balanceKas} ${
                          walletSession.networkKey === "galleon_testnet" ? "iKAS" : "KAS"
                        }`
                      : "—"
                  }
                  accent="text-emerald-300"
                />

                {data?.addressError ? (
                  <div className="rounded-2xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200">
                    {data.addressError}
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                    Chain Overview
                  </p>
                  <h2 className="mt-2 text-3xl font-black">KasRoyal Runtime State</h2>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="RPC Health"
                  value={rpcHealthy ? "ONLINE" : "OFFLINE"}
                  accent={rpcHealthy ? "text-emerald-300" : "text-red-300"}
                />
                <StatCard
                  label="Network"
                  value={network}
                  accent={chainHealthy ? "text-amber-300" : "text-red-300"}
                />
                <StatCard
                  label="Chain ID"
                  value={data?.chainContext?.chainIdDecimal?.toString() ?? "—"}
                  accent="text-sky-300"
                />
                <StatCard
                  label="Block Number"
                  value={data?.chainContext?.blockNumberDecimal?.toString() ?? "—"}
                  accent="text-amber-300"
                />
              </div>

              <div className="mt-5 grid gap-3">
                <InfoRow
                  label="RPC URL"
                  value={data?.health?.rpcUrl ?? "Not available"}
                  tone="emerald"
                />
                <InfoRow
                  label="Chain ID (hex)"
                  value={data?.chainContext?.chainIdHex ?? "—"}
                />
                <InfoRow
                  label="Block Number (hex)"
                  value={data?.chainContext?.blockNumberHex ?? "—"}
                />
                <InfoRow
                  label="RPC Error"
                  value={rpcErrorDisplay}
                  tone={
                    data?.health?.error || data?.chainContext?.error ? "amber" : "emerald"
                  }
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Contract Address Layer
              </p>
              <h3 className="mt-2 text-3xl font-black">Configured KasRoyal Contracts</h3>

              <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <AddressCard title="Arena Factory" value={data?.configuredAddresses?.arenaFactory} />
                <AddressCard title="Arena Escrow" value={data?.configuredAddresses?.arenaEscrow} />
                <AddressCard
                  title="Spectator Market"
                  value={data?.configuredAddresses?.spectatorMarket}
                />
                <AddressCard title="Leaderboard" value={data?.configuredAddresses?.leaderboard} />
                <AddressCard
                  title="Profile Registry"
                  value={data?.configuredAddresses?.profileRegistry}
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Wallet Result
              </p>
              <h3 className="mt-2 text-3xl font-black">Queried Balance State</h3>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-[22px] border border-white/8 bg-black/25 p-5">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                    Address
                  </div>
                  <div className="mt-3 break-all text-base font-bold text-white">
                    {addressDisplay}
                  </div>

                  <div className="mt-6 grid gap-3">
                    <InfoRow
                      label="Short"
                      value={
                        data?.balance?.address
                          ? shortValue(data.balance.address, 10, 8)
                          : walletSession?.account
                          ? shortValue(walletSession.account, 10, 8)
                          : "—"
                      }
                    />
                    <InfoRow
                      label="Balance (KAS)"
                      value={data?.balance?.kasFormatted ?? walletSession?.balanceKas ?? "—"}
                      tone="emerald"
                    />
                    <InfoRow
                      label="Balance (wei hex)"
                      value={data?.balance?.weiHex ?? walletSession?.balanceWeiHex ?? "—"}
                      tone="amber"
                    />
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/8 bg-black/25 p-5">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                    Why This Matters
                  </div>

                  <div className="mt-4 space-y-3 text-sm leading-7 text-white/70">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                      Your wallet is now able to connect to Igra-compatible injected EVM providers and sign transactions from the browser.
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                      This same wallet layer powers your transaction builder for create arena, join arena, spectator bet, and settlement.
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                      The next upgrade is wiring live contract calldata generation from actual arena/match UI instead of using placeholder call data.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}