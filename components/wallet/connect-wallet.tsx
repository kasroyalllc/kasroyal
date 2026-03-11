"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  clearAppWalletConnectionState,
  clearStoredSelectedWalletKey,
  connectInjectedWallet,
  discoverInjectedWallets,
  enrichWalletOptions,
  getPreferredWalletKey,
  getStoredAppMessage,
  getStoredAppSignature,
  getStoredSelectedWalletKey,
  getWalletSession,
  hasInjectedWallet,
  isAppWalletConnected,
  shortAddress,
  subscribeWalletEvents,
  switchOrAddIgraNetwork,
  type EnrichedWalletProviderOption,
  type WalletNetworkKey,
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

export default function ConnectWallet({
  defaultNetwork = "galleon_testnet",
  onSessionChange,
}: {
  defaultNetwork?: WalletNetworkKey
  onSessionChange?: (session: WalletSession | null) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [session, setSession] = useState<WalletSession | null>(null)
  const [walletOptions, setWalletOptions] = useState<EnrichedWalletProviderOption[]>([])
  const [selectedWalletKey, setSelectedWalletKey] = useState<string | null>(null)
  const [hasWallet, setHasWallet] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manuallyDisconnected, setManuallyDisconnected] = useState(false)
  const [debugOpen, setDebugOpen] = useState(true)

  const refreshWalletOptions = useCallback(async () => {
    const options = discoverInjectedWallets()
    const enriched = await enrichWalletOptions(options)
    const visible = enriched.filter((item) => !item.isDuplicateMirror)

    setWalletOptions(visible)

    const stored = getStoredSelectedWalletKey()

    if (stored && visible.some((item) => item.key === stored)) {
      setSelectedWalletKey((current) => current ?? stored)
      return
    }

    setSelectedWalletKey((current) => {
      if (current && visible.some((item) => item.key === current)) return current
      return getPreferredWalletKey(visible)
    })
  }, [])

  const syncSession = useCallback(
    async (walletKey?: string | null) => {
      try {
        if (getDisconnectFlag() || !isAppWalletConnected()) {
          setManuallyDisconnected(getDisconnectFlag())
          setSession(null)
          onSessionChange?.(null)
          return
        }

        const providerKey = walletKey ?? selectedWalletKey ?? getStoredSelectedWalletKey()

        if (!providerKey) {
          setSession(null)
          onSessionChange?.(null)
          return
        }

        const next = await getWalletSession(undefined, providerKey)
        setSession(next)
        onSessionChange?.(next)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to read wallet session."
        setError(message)
        setSession(null)
        onSessionChange?.(null)
      }
    },
    [onSessionChange, selectedWalletKey]
  )

  useEffect(() => {
    let mountedRef = true

    async function boot() {
      setMounted(true)

      const available = await hasInjectedWallet()

      if (!mountedRef) return

      setHasWallet(available)
      await refreshWalletOptions()

      const disconnected = getDisconnectFlag()
      setManuallyDisconnected(disconnected)

      if (!available || disconnected || !isAppWalletConnected()) {
        setSession(null)
        onSessionChange?.(null)
        return
      }

      const stored = getStoredSelectedWalletKey()

      if (stored) {
        setSelectedWalletKey((current) => current ?? stored)
        await syncSession(stored)
      }
    }

    void boot()

    return () => {
      mountedRef = false
    }
  }, [onSessionChange, refreshWalletOptions, syncSession])

  useEffect(() => {
    if (!mounted) return

    const cleanup = subscribeWalletEvents(
      {
        onAccountsChanged: () => {
          if (!getDisconnectFlag() && isAppWalletConnected()) {
            void syncSession()
          }
        },
        onChainChanged: () => {
          if (!getDisconnectFlag() && isAppWalletConnected()) {
            void syncSession()
          }
        },
        onDisconnectLike: () => {
          setSession(null)
          onSessionChange?.(null)
        },
      },
      undefined,
      selectedWalletKey ?? getStoredSelectedWalletKey() ?? undefined
    )

    return () => {
      cleanup()
    }
  }, [mounted, onSessionChange, selectedWalletKey, syncSession])

  async function handleConnect() {
    try {
      setLoading(true)
      setError(null)

      if (!selectedWalletKey) {
        throw new Error("Choose a wallet first.")
      }

      setDisconnectFlag(false)
      setManuallyDisconnected(false)

      const next = await connectInjectedWallet(defaultNetwork, undefined, selectedWalletKey)

      setSession(next)
      onSessionChange?.(next)
      window.dispatchEvent(new Event("kasroyal-wallet-changed"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.")
    } finally {
      setLoading(false)
    }
  }

  async function handleSwitch(network: WalletNetworkKey) {
    try {
      setSwitching(true)
      setError(null)

      const providerKey = selectedWalletKey ?? getStoredSelectedWalletKey()

      if (!providerKey) {
        throw new Error("Choose a wallet first.")
      }

      if (!isAppWalletConnected()) {
        throw new Error("Connect inside KasRoyal before switching networks.")
      }

      await switchOrAddIgraNetwork(network, undefined, providerKey)
      await syncSession(providerKey)
      window.dispatchEvent(new Event("kasroyal-wallet-changed"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch network.")
    } finally {
      setSwitching(false)
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true)
      setError(null)
      await refreshWalletOptions()
      await syncSession()
      window.dispatchEvent(new Event("kasroyal-wallet-changed"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh wallet.")
    } finally {
      setRefreshing(false)
    }
  }

  function handleDisconnect() {
    setDisconnectFlag(true)
    setManuallyDisconnected(true)
    clearStoredSelectedWalletKey()
    clearAppWalletConnectionState()
    setSelectedWalletKey(getPreferredWalletKey(discoverInjectedWallets()))
    setSession(null)
    setError(null)
    onSessionChange?.(null)
    window.dispatchEvent(new Event("kasroyal-wallet-changed"))
  }

  function handleWalletChoice(key: string) {
    setSelectedWalletKey(key)
    setSession(null)
    setError(null)
    setDisconnectFlag(false)
    clearAppWalletConnectionState()
  }

  async function handleForgetWallet() {
    clearStoredSelectedWalletKey()
    clearAppWalletConnectionState()
    setSelectedWalletKey(null)
    setSession(null)
    setError(null)
    setDisconnectFlag(false)
    setManuallyDisconnected(false)
    onSessionChange?.(null)
    await refreshWalletOptions()
    window.dispatchEvent(new Event("kasroyal-wallet-changed"))
  }

  const selectedWallet = useMemo(() => {
    if (!selectedWalletKey) return null
    return walletOptions.find((item) => item.key === selectedWalletKey) ?? null
  }, [selectedWalletKey, walletOptions])

  const hiddenMirrorCount = useMemo(() => {
    const allCount = walletOptions.reduce((sum, option) => {
      return sum + Math.max(option.duplicateCount - 1, 0)
    }, 0)
    return allCount
  }, [walletOptions])

  const statusLabel = useMemo(() => {
    if (!mounted) return "Loading"
    if (hasWallet === false) return "No Wallet Installed"
    if (manuallyDisconnected) return "Disconnected"
    if (!session) return "Not Connected"
    return session.networkLabel
  }, [mounted, hasWallet, manuallyDisconnected, session])

  const debugPayload = useMemo(() => {
    if (!mounted) return null

    return {
      appWalletConnected: isAppWalletConnected(),
      storedSelectedWalletKey: getStoredSelectedWalletKey(),
      selectedWalletKey,
      connectedProviderId: session?.providerId ?? null,
      connectedProviderKey: session?.providerKey ?? null,
      connectedProviderKind: session?.providerKind ?? null,
      connectedProviderSource: session?.providerSource ?? null,
      currentChainIdHex: session?.chainIdHex ?? null,
      currentChainIdDecimal: session?.chainIdDecimal ?? null,
      storedSignaturePresent: !!getStoredAppSignature(),
      storedMessagePresent: !!getStoredAppMessage(),
      providers: walletOptions.map((wallet) => ({
        id: wallet.id,
        key: wallet.key,
        kind: wallet.kind,
        label: wallet.label,
        source: wallet.source,
        accountPreview: wallet.accountPreview,
        chainIdHex: wallet.chainIdHex,
        duplicateCount: wallet.duplicateCount,
        canonicalKey: wallet.canonicalKey,
      })),
    }
  }, [mounted, selectedWalletKey, session, walletOptions])

  if (!mounted) {
    return (
      <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
        <div className="mb-4">
          <div className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
            Wallet Engine
          </div>
          <h3 className="mt-2 text-2xl font-black">Connect Wallet</h3>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4 text-white/60">
          Loading wallet state...
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
      <div className="mb-4">
        <div className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
          Wallet Engine
        </div>
        <h3 className="mt-2 text-2xl font-black">Connect Wallet</h3>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Status</div>
          <div className="mt-2 text-xl font-black text-white">{statusLabel}</div>
          <div className="mt-2 text-sm text-white/60">
            {session
              ? `${session.providerLabel} • ${shortAddress(session.account)}`
              : hasWallet === false
              ? "Install an injected EVM wallet like MetaMask, Rabby, or KasWare."
              : manuallyDisconnected
              ? "KasRoyal wallet session cleared."
              : "Choose a wallet below, then connect and sign manually."}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Wallet Choice</div>
            {hiddenMirrorCount > 0 ? (
              <div className="rounded-full border border-amber-300/15 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                {hiddenMirrorCount} mirror hidden
              </div>
            ) : null}
          </div>

          {walletOptions.length === 0 ? (
            <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/55">
              No injected wallets detected.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {walletOptions.map((wallet) => {
                const active = wallet.key === selectedWalletKey

                return (
                  <button
                    key={wallet.key}
                    type="button"
                    onClick={() => handleWalletChoice(wallet.key)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-emerald-300/25 bg-emerald-400/10 ring-1 ring-emerald-300/20"
                        : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-white">{wallet.label}</div>
                        <div className="mt-1 text-xs text-white/55">{wallet.source}</div>
                        {wallet.accountPreview ? (
                          <div className="mt-1 text-[11px] text-emerald-300/80">
                            {shortAddress(wallet.accountPreview)}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                        {wallet.kind}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="mt-3 text-xs text-white/45">
            Selected: {selectedWallet ? `${selectedWallet.label} • ${selectedWallet.source}` : "None"}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">
              Connected Account
            </div>
            <div className="mt-2 break-all text-sm font-bold text-white">
              {session?.account ?? "Not connected"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Balance</div>
            <div className="mt-2 text-2xl font-black text-emerald-300">
              {session
                ? `${session.balanceKas} ${
                    session.networkKey === "galleon_testnet" ? "iKAS" : "KAS"
                  }`
                : "—"}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={handleConnect}
            disabled={loading || hasWallet === false || walletOptions.length === 0 || !selectedWalletKey}
            className="rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Connecting + Signing..." : "Connect Wallet"}
          </button>

          <button
            onClick={handleDisconnect}
            disabled={!session && !manuallyDisconnected}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Disconnect Wallet
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing || hasWallet === false}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh Wallets"}
          </button>

          <button
            onClick={() => void handleForgetWallet()}
            className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
          >
            Forget Selected Wallet
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => void handleSwitch("galleon_testnet")}
            disabled={switching || hasWallet === false || !(selectedWalletKey ?? getStoredSelectedWalletKey())}
            className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {switching ? "Switching..." : "Use Galleon Testnet"}
          </button>

          <button
            onClick={() => void handleSwitch("galleon_mainnet")}
            disabled={switching || hasWallet === false || !(selectedWalletKey ?? getStoredSelectedWalletKey())}
            className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {switching ? "Switching..." : "Use Igra Mainnet"}
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Notes</div>
          <div className="mt-2 text-sm leading-6 text-white/85">
            KasRoyal now requires both account access and a signed message to establish an app
            session. Duplicate provider mirrors are collapsed so you stop seeing two paths into the
            same wallet account.
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">
              Wallet Debug Panel
            </div>
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/[0.08]"
            >
              {debugOpen ? "Hide Debug" : "Show Debug"}
            </button>
          </div>

          {debugOpen && debugPayload ? (
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/8 bg-[#060909] p-4 text-xs leading-6 text-emerald-200">
{JSON.stringify(debugPayload, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}