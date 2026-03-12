"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  clearAppWalletConnectionState,
  clearStoredSelectedWalletKey,
  connectInjectedWallet,
  discoverInjectedWallets,
  enrichWalletOptions,
  getPreferredWalletKey,
  getStoredSelectedWalletKey,
  getWalletSession,
  isAppWalletConnected,
  shortAddress,
  subscribeWalletEvents,
  type EnrichedWalletProviderOption,
} from "@/lib/wallet/wallet-client"

type ProfileData = {
  displayName: string
  avatarUrl: string
}

type WalletPreview = {
  account: string
  balanceKas: string
  networkLabel: string
  providerLabel: string
}

type NavbarArenaMatch = {
  id: string
  status: "Waiting for Opponent" | "Ready to Start" | "Live" | "Finished"
  wager: number
  spectators: number
}

const defaultProfile: ProfileData = {
  displayName: "KasRoyal User",
  avatarUrl: "",
}

const DISCONNECT_STORAGE_KEY = "kasroyal_wallet_disconnected"
const ARENA_STORAGE_KEY = "kasroyal_arena_matches"
const ARENA_EVENT_NAME = "kasroyal-arena-matches-updated"

const navItems = [
  { href: "/arena", label: "Arena" },
  { href: "/spectate", label: "Spectate" },
  { href: "/bets", label: "Bets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
  { href: "/tx", label: "Tx Console" },
]

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

function normalizeNavbarArenaMatch(value: unknown): NavbarArenaMatch | null {
  if (!value || typeof value !== "object") return null

  const match = value as Partial<NavbarArenaMatch>

  if (
    typeof match.id !== "string" ||
    (match.status !== "Waiting for Opponent" &&
      match.status !== "Ready to Start" &&
      match.status !== "Live" &&
      match.status !== "Finished")
  ) {
    return null
  }

  return {
    id: match.id,
    status: match.status,
    wager: typeof match.wager === "number" && Number.isFinite(match.wager) ? match.wager : 0,
    spectators:
      typeof match.spectators === "number" && Number.isFinite(match.spectators)
        ? match.spectators
        : 0,
  }
}

function readArenaMatchesForNavbar(): NavbarArenaMatch[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(ARENA_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => normalizeNavbarArenaMatch(item))
      .filter((item): item is NavbarArenaMatch => item !== null)
  } catch {
    return []
  }
}

function DesktopNavLink({
  href,
  label,
  onNavigate,
}: {
  href: string
  label: string
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="inline-flex items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] px-5 py-3 text-[15px] font-bold text-white/84 shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:border-emerald-300/18 hover:bg-white/[0.08] hover:text-white"
    >
      {label}
    </Link>
  )
}

function LiveStatPill({
  label,
  value,
  tone = "white",
}: {
  label: string
  value: string
  tone?: "white" | "amber" | "emerald" | "sky"
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : tone === "emerald"
        ? "text-emerald-300"
        : tone === "sky"
          ? "text-sky-300"
          : "text-white"

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className={`mt-1 text-sm font-black ${toneClass}`}>{value}</div>
    </div>
  )
}

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [profile, setProfile] = useState<ProfileData>(defaultProfile)
  const [wallet, setWallet] = useState<WalletPreview | null>(null)
  const [walletOptions, setWalletOptions] = useState<EnrichedWalletProviderOption[]>([])
  const [selectedWalletKey, setSelectedWalletKey] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [arenaStats, setArenaStats] = useState({
    open: 0,
    ready: 0,
    live: 0,
    volume: 0,
    spectators: 0,
  })

  const walletMenuRef = useRef<HTMLDivElement | null>(null)
  const walletButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let mountedRef = true
    setMounted(true)

    const syncProfile = () => {
      const stored = window.localStorage.getItem("kasroyal-profile")

      if (!stored) {
        setProfile(defaultProfile)
        return
      }

      try {
        const parsed = JSON.parse(stored) as Partial<ProfileData>
        setProfile({
          displayName:
            typeof parsed.displayName === "string" && parsed.displayName.trim().length > 0
              ? parsed.displayName
              : defaultProfile.displayName,
          avatarUrl:
            typeof parsed.avatarUrl === "string" && parsed.avatarUrl.trim().length > 0
              ? parsed.avatarUrl
              : "",
        })
      } catch {
        setProfile(defaultProfile)
      }
    }

    const syncWalletOptions = async () => {
      const options = discoverInjectedWallets()
      const enriched = await enrichWalletOptions(options)
      const visible = enriched.filter((item) => !item.isDuplicateMirror)

      if (!mountedRef) return

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
    }

    const syncWallet = async () => {
      if (getDisconnectFlag() || !isAppWalletConnected()) {
        setWallet(null)
        return
      }

      try {
        const stored = getStoredSelectedWalletKey()

        if (!stored) {
          setWallet(null)
          return
        }

        const session = await getWalletSession(undefined, stored)

        if (!session) {
          setWallet(null)
          return
        }

        setWallet({
          account: session.account,
          balanceKas: session.balanceKas,
          networkLabel: session.networkLabel,
          providerLabel: session.providerLabel,
        })
      } catch {
        setWallet(null)
      }
    }

    const syncArenaStats = () => {
      const matches = readArenaMatchesForNavbar()

      const open = matches.filter((match) => match.status === "Waiting for Opponent").length
      const ready = matches.filter((match) => match.status === "Ready to Start").length
      const live = matches.filter((match) => match.status === "Live").length
      const volume = matches
        .filter((match) => match.status !== "Finished")
        .reduce((sum, match) => sum + match.wager, 0)
      const spectators = matches
        .filter((match) => match.status !== "Finished")
        .reduce((sum, match) => sum + match.spectators, 0)

      setArenaStats({
        open,
        ready,
        live,
        volume,
        spectators,
      })
    }

    const handleProfileChanged = () => {
      syncProfile()
    }

    const handleWalletChanged = () => {
      void syncWalletOptions()
      void syncWallet()
    }

    const handleArenaChanged = () => {
      syncArenaStats()
    }

    syncProfile()
    void syncWalletOptions()
    void syncWallet()
    syncArenaStats()

    window.addEventListener("storage", handleProfileChanged)
    window.addEventListener("kasroyal-profile-updated", handleProfileChanged as EventListener)
    window.addEventListener("storage", handleWalletChanged)
    window.addEventListener("kasroyal-wallet-changed", handleWalletChanged as EventListener)
    window.addEventListener("storage", handleArenaChanged)
    window.addEventListener(ARENA_EVENT_NAME, handleArenaChanged as EventListener)

    const cleanupWalletEvents = subscribeWalletEvents(
      {
        onAccountsChanged: () => {
          if (isAppWalletConnected()) {
            void syncWallet()
          }
        },
        onChainChanged: () => {
          if (isAppWalletConnected()) {
            void syncWallet()
          }
        },
        onDisconnectLike: () => {
          setWallet(null)
        },
      },
      undefined,
      getStoredSelectedWalletKey() ?? undefined
    )

    return () => {
      mountedRef = false
      window.removeEventListener("storage", handleProfileChanged)
      window.removeEventListener("kasroyal-profile-updated", handleProfileChanged as EventListener)
      window.removeEventListener("storage", handleWalletChanged)
      window.removeEventListener("kasroyal-wallet-changed", handleWalletChanged as EventListener)
      window.removeEventListener("storage", handleArenaChanged)
      window.removeEventListener(ARENA_EVENT_NAME, handleArenaChanged as EventListener)
      cleanupWalletEvents()
    }
  }, [])

  useEffect(() => {
    if (!walletMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return

      const clickedMenu = walletMenuRef.current?.contains(target)
      const clickedButton = walletButtonRef.current?.contains(target)

      if (!clickedMenu && !clickedButton) {
        setWalletMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWalletMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [walletMenuOpen])

  async function handleConnect() {
    try {
      setConnecting(true)
      setError(null)

      const providerKey = selectedWalletKey ?? getPreferredWalletKey(walletOptions)

      if (!providerKey) {
        throw new Error("No injected wallet detected.")
      }

      setDisconnectFlag(false)

      const session = await connectInjectedWallet("galleon_testnet", undefined, providerKey)

      setWallet({
        account: session.account,
        balanceKas: session.balanceKas,
        networkLabel: session.networkLabel,
        providerLabel: session.providerLabel,
      })

      setWalletMenuOpen(false)
      window.dispatchEvent(new Event("kasroyal-wallet-changed"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.")
    } finally {
      setConnecting(false)
    }
  }

  function handleDisconnect() {
    clearStoredSelectedWalletKey()
    clearAppWalletConnectionState()
    setDisconnectFlag(true)
    setWallet(null)
    setWalletMenuOpen(false)
    setError(null)
    window.dispatchEvent(new Event("kasroyal-wallet-changed"))
  }

  const walletButtonText = useMemo(() => {
    if (!mounted) return "Connect Wallet"
    if (wallet?.account) return shortAddress(wallet.account)
    return "Connect Wallet"
  }, [mounted, wallet])

  const walletSubtext = useMemo(() => {
    if (!mounted) return "Open wallet panel"
    if (wallet?.account) return `${wallet.networkLabel} • ${wallet.providerLabel}`
    return "Wallet Layer"
  }, [mounted, wallet])

  const visibleMirrorHiddenCount = useMemo(() => {
    return walletOptions.reduce((sum, option) => sum + Math.max(option.duplicateCount - 1, 0), 0)
  }, [walletOptions])

  return (
    <header className="sticky top-0 z-50">
      <div className="relative border-b border-emerald-300/10 bg-[#050807]/96 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_42%),linear-gradient(to_right,rgba(255,200,80,0.03),transparent_20%,transparent_80%,rgba(0,255,200,0.03))]" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-300/25 to-transparent" />

        <div className="relative mx-auto max-w-[1460px] px-4 py-4 md:px-6 xl:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex shrink-0 items-center">
              <Link
                href="/"
                onClick={() => setWalletMenuOpen(false)}
                className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition hover:border-emerald-300/20 hover:bg-white/[0.05]"
              >
                <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-emerald-300/12 bg-black/40">
                  <div className="absolute inset-0 rounded-xl bg-emerald-300/10 blur-md" />
                  <Image
                    src="/kasroyal-logo-navbar.png"
                    alt="KasRoyal"
                    width={32}
                    height={32}
                    style={{ width: "auto", height: "30px" }}
                    className="relative rounded-md"
                    priority
                  />
                </div>

                <div className="hidden min-w-0 sm:block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300/75">
                    Premium Skill Arena
                  </div>
                  <div className="truncate text-base font-black tracking-[0.16em] text-white">
                    KASROYAL
                  </div>
                </div>
              </Link>
            </div>

            <div className="hidden flex-1 justify-center xl:flex">
              <div className="rounded-[30px] border border-white/8 bg-white/[0.03] px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                <nav className="flex items-center justify-center gap-3">
                  {navItems.map((item) => (
                    <DesktopNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      onNavigate={() => setWalletMenuOpen(false)}
                    />
                  ))}
                </nav>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Link
                href="/profile"
                onClick={() => setWalletMenuOpen(false)}
                className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-white/[0.08] lg:flex"
              >
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-emerald-300/20 bg-black/40">
                  {profile.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-black text-white/85">
                      {profile.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="text-left">
                  <div className="text-[11px] text-white/50">Profile</div>
                  <div className="max-w-[140px] truncate text-sm font-bold text-white">
                    {profile.displayName}
                  </div>
                </div>
              </Link>

              <div className="relative">
                <button
                  ref={walletButtonRef}
                  type="button"
                  onClick={() => {
                    setWalletMenuOpen((v) => !v)
                    setError(null)
                  }}
                  className="group rounded-2xl border border-white/10 bg-[#101514] px-4 py-3 text-xs font-semibold text-white/95 shadow-[0_10px_30px_rgba(0,0,0,0.38)] transition hover:border-emerald-300/20 hover:bg-[#141a18] md:px-5 md:text-sm"
                >
                  <div className="text-left">
                    <div className="font-bold text-white">{walletButtonText}</div>
                    <div className="hidden text-[10px] text-white/55 md:block">{walletSubtext}</div>
                  </div>
                </button>

                {walletMenuOpen ? (
                  <div
                    ref={walletMenuRef}
                    className="absolute right-0 top-[calc(100%+14px)] z-50 w-[400px] max-w-[calc(100vw-24px)] rounded-[28px] border border-white/10 bg-[#08100f]/98 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.78)] backdrop-blur-2xl"
                  >
                    <div className="mb-4">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/70">
                        KasRoyal Wallet
                      </div>
                      <div className="mt-2 text-xl font-black text-white">
                        {wallet ? "Wallet Connected" : "Connect Wallet"}
                      </div>
                      <div className="mt-1 text-sm text-white/50">
                        Secure your KasRoyal app session with wallet access and signature approval.
                      </div>
                    </div>

                    {wallet ? (
                      <div className="space-y-3">
                        <div className="rounded-[22px] border border-white/8 bg-black/35 p-4 shadow-[inset_0_0_18px_rgba(255,255,255,0.02)]">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                            Connected Account
                          </div>
                          <div className="mt-2 break-all text-sm font-bold text-white">
                            {wallet.account}
                          </div>
                          <div className="mt-3 text-base font-black text-emerald-300">
                            {wallet.balanceKas} KAS
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            {wallet.networkLabel} • {wallet.providerLabel}
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Link
                            href="/wallet"
                            onClick={() => setWalletMenuOpen(false)}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-white/[0.08]"
                          >
                            Open Wallet Layer
                          </Link>

                          <button
                            type="button"
                            onClick={handleDisconnect}
                            className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-200 transition hover:bg-red-400/15"
                          >
                            Disconnect Wallet
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-[22px] border border-white/8 bg-black/35 p-4 shadow-[inset_0_0_18px_rgba(255,255,255,0.02)]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                              Choose Provider
                            </div>
                            {visibleMirrorHiddenCount > 0 ? (
                              <div className="rounded-full border border-amber-300/15 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                                {visibleMirrorHiddenCount} mirror hidden
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2">
                            {walletOptions.length > 0 ? (
                              walletOptions.map((walletOption) => {
                                const active = walletOption.key === selectedWalletKey

                                return (
                                  <button
                                    key={walletOption.key}
                                    type="button"
                                    onClick={() => {
                                      setSelectedWalletKey(walletOption.key)
                                      setError(null)
                                    }}
                                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                                      active
                                        ? "border-emerald-300/25 bg-emerald-400/10 ring-1 ring-emerald-300/20"
                                        : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-bold text-white">
                                          {walletOption.label}
                                        </div>
                                        <div className="mt-1 text-[11px] text-white/50">
                                          {walletOption.source}
                                        </div>
                                        {walletOption.accountPreview ? (
                                          <div className="mt-1 text-[11px] text-emerald-300/80">
                                            {shortAddress(walletOption.accountPreview)}
                                          </div>
                                        ) : null}
                                      </div>

                                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                                        {walletOption.kind}
                                      </div>
                                    </div>
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
                            disabled={connecting || walletOptions.length === 0 || !selectedWalletKey}
                            className="rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-200 px-4 py-3 text-sm font-black text-black shadow-[0_0_24px_rgba(255,215,0,0.20)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {connecting ? "Connecting + Signing..." : "Connect Wallet"}
                          </button>

                          <Link
                            href="/wallet"
                            onClick={() => setWalletMenuOpen(false)}
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
            </div>
          </div>

          <div className="mt-4 hidden items-center justify-center gap-3 xl:flex">
            <LiveStatPill label="Open Lobbies" value={`${arenaStats.open}`} tone="amber" />
            <LiveStatPill label="Ready Rooms" value={`${arenaStats.ready}`} tone="sky" />
            <LiveStatPill label="Live Matches" value={`${arenaStats.live}`} tone="emerald" />
            <LiveStatPill label="Wager Volume" value={`${arenaStats.volume} KAS`} tone="white" />
            <LiveStatPill label="Spectators" value={`${arenaStats.spectators}`} tone="sky" />
          </div>

          <div className="relative mx-auto mt-3 flex max-w-[1460px] items-center justify-center gap-2 overflow-x-auto pb-1 xl:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setWalletMenuOpen(false)}
                className="whitespace-nowrap rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-xs font-bold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:hidden">
            <LiveStatPill label="Open" value={`${arenaStats.open}`} tone="amber" />
            <LiveStatPill label="Ready" value={`${arenaStats.ready}`} tone="sky" />
            <LiveStatPill label="Live" value={`${arenaStats.live}`} tone="emerald" />
            <LiveStatPill label="Volume" value={`${arenaStats.volume} KAS`} tone="white" />
          </div>
        </div>
      </div>
    </header>
  )
}