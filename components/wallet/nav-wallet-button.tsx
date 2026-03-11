"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  clearStoredSelectedWalletKey,
  connectInjectedWallet,
  discoverInjectedWallets,
  getStoredSelectedWalletKey,
  getWalletSession,
  shortAddress,
  subscribeWalletEvents,
  type WalletProviderOption,
  type WalletSession,
} from "@/lib/wallet/wallet-client"

const DISCONNECT_STORAGE_KEY = "kasroyal_wallet_disconnected"

function getDisconnectFlag() {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(DISCONNECT_STORAGE_KEY) === "1"
}

function setDisconnectFlag(value: boolean) {
  if (typeof window === "undefined") return
  if (value) {
    window.localStorage.setItem(DISCONNECT_STORAGE_KEY, "1")
  } else {
    window.localStorage.removeItem(DISCONNECT_STORAGE_KEY)
  }
}

export default function NavWalletButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [walletOptions, setWalletOptions] = useState<WalletProviderOption[]>([])
  const [selectedWalletKey, setSelectedWalletKey] = useState<string | null>(null)
  const [session, setSession] = useState<WalletSession | null>(null)

  const refreshWallets = useCallback(() => {
    const options = discoverInjectedWallets()
    setWalletOptions(options)

    const stored = getStoredSelectedWalletKey()

    if (stored && options.some((item) => item.id === stored || item.key === stored)) {
      setSelectedWalletKey(stored)
      return
    }

    setSelectedWalletKey((current) => {
      if (current && options.some((item) => item.id === current || item.key === current)) {
        return current
      }

      const first = options[0]
      return (first?.key ?? first?.id ?? null) as string | null
    })
  }, [])

  const hydrate = useCallback(async () => {
    try {
      if (getDisconnectFlag()) {
        setSession(null)
        return
      }

      const stored = getStoredSelectedWalletKey()
      if (!stored) {
        setSession(null)
        return
      }

      const next = await getWalletSession(undefined, stored)
      setSession(next)
    } catch {
      setSession(null)
    }
  }, [])

  useEffect(() => {
    refreshWallets()
    void hydrate()

    const handleChanged = () => {
      refreshWallets()
      void hydrate()
    }

    window.addEventListener("kasroyal-wallet-changed", handleChanged)

    return () => {
      window.removeEventListener("kasroyal-wallet-changed", handleChanged)
    }
  }, [hydrate, refreshWallets])

  useEffect(() => {
    const cleanup = subscribeWalletEvents(
      {
        onAccountsChanged: () => {
          void hydrate()
        },
        onChainChanged: () => {
          void hydrate()
        },
        onDisconnectLike: () => {
          setSession(null)
        },
      },
      undefined,
      getStoredSelectedWalletKey() ?? undefined
    )

    return () => {
      cleanup()
    }
  }, [hydrate])

  async function handleConnect() {
    try {
      setLoading(true)
      setError(null)

      const fallback = walletOptions[0]
      const providerKey =
        selectedWalletKey ?? ((fallback?.key ?? fallback?.id ?? null) as string | null)

      if (!providerKey) {
        throw new Error("No wallet provider detected.")
      }

      setDisconnectFlag(false)
      const next = await connectInjectedWallet("galleon_testnet", undefined, providerKey)
      setSession(next)
      setOpen(false)
      window.dispatchEvent(new Event("kasroyal-wallet-changed"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.")
    } finally {
      setLoading(false)
    }
  }

  function handleDisconnect() {
    clearStoredSelectedWalletKey()
    setDisconnectFlag(true)
    setSession(null)
    setOpen(false)
    setError(null)
    window.dispatchEvent(new Event("kasroyal-wallet-changed"))
  }

  const buttonLabel = useMemo(() => {
    if (session) return shortAddress(session.account)
    return "Connect Wallet"
  }, [session])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-500/15"
      >
        {buttonLabel}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[340px] rounded-3xl border border-white/10 bg-[#050807]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/70">
              KasRoyal Wallet
            </div>
            <div className="mt-2 text-lg font-black text-white">
              {session ? "Wallet Connected" : "Connect Wallet"}
            </div>
          </div>

          {session ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Account</div>
                <div className="mt-2 break-all text-sm font-bold text-white">
                  {session.account}
                </div>
                <div className="mt-2 text-sm text-emerald-300">
                  {session.balanceKas}{" "}
                  {session.networkKey === "galleon_testnet" ? "iKAS" : "KAS"}
                </div>
              </div>

              <div className="grid gap-2">
                <Link
                  href="/wallet"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-white/[0.08]"
                >
                  Open Wallet Layer
                </Link>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
                >
                  Disconnect Wallet
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">
                  Choose Provider
                </div>

                <div className="mt-3 grid gap-2">
                  {walletOptions.length > 0 ? (
                    walletOptions.map((wallet) => {
                      const walletKey = (wallet.key ?? wallet.id) as string
                      const active = walletKey === selectedWalletKey

                      return (
                        <button
                          key={`${walletKey}-${wallet.source}`}
                          type="button"
                          onClick={() => {
                            setSelectedWalletKey(walletKey)
                            setError(null)
                          }}
                          className={`rounded-2xl border px-4 py-3 text-left transition ${
                            active
                              ? "border-emerald-300/25 bg-emerald-400/10"
                              : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="text-sm font-bold text-white">{wallet.label}</div>
                          <div className="mt-1 text-[11px] text-white/50">{wallet.source}</div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm text-white/55">
                      No injected wallets detected.
                    </div>
                  )}
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-300/20 bg-red-400/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={loading || walletOptions.length === 0 || !selectedWalletKey}
                  className="rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-3 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Connecting..." : "Connect Wallet"}
                </button>

                <Link
                  href="/wallet"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-white/[0.08]"
                >
                  Open Wallet Layer
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}