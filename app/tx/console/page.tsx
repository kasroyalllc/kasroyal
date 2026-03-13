"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import ConnectWallet from "@/components/wallet/connect-wallet"
import {
  sendPreparedTransaction,
  type PreparedTxLike,
  type WalletSession,
} from "@/lib/wallet/wallet-client"

type TxAction =
  | "create_arena"
  | "join_arena"
  | "spectator_bet"
  | "settle_arena"
  | "update_profile"
  | "native_transfer"

type TxApiResponse = {
  ok: boolean
  prepared?: PreparedTxLike & {
    summary?: {
      title: string
      description: string
      warnings: string[]
    }
  }
  error?: string
  details?: unknown
}

const actionOptions: Array<{
  value: TxAction
  label: string
  description: string
}> = [
  {
    value: "create_arena",
    label: "Create Arena",
    description: "Prepare a transaction to create a new KasRoyal match or arena escrow.",
  },
  {
    value: "join_arena",
    label: "Join Arena",
    description: "Prepare a transaction for a second player to join the arena and lock their wager.",
  },
  {
    value: "spectator_bet",
    label: "Spectator Bet",
    description: "Prepare a transaction to place a spectator-side bet into the live market.",
  },
  {
    value: "settle_arena",
    label: "Settle Arena",
    description: "Prepare a settlement transaction for payout distribution after the match resolves.",
  },
  {
    value: "update_profile",
    label: "Update Profile",
    description: "Prepare an on-chain profile registry update request.",
  },
  {
    value: "native_transfer",
    label: "Native Transfer",
    description: "Prepare a plain native transfer transaction for testing the flow.",
  },
]

const sampleAddresses = {
  from: "0x1111111111111111111111111111111111111111",
  to: "0x2222222222222222222222222222222222222222",
}

const sampleData = {
  createArena: "0xaabbccdd",
  joinArena: "0xbbccddee",
  spectatorBet: "0xccddeeff",
  settleArena: "0xddeeff00",
  updateProfile: "0xeeff0011",
}

function shortValue(value?: string | null, left = 8, right = 6) {
  if (!value) return "—"
  if (value.length <= left + right + 3) return value
  return `${value.slice(0, left)}...${value.slice(-right)}`
}

function prettyAction(action: TxAction) {
  return actionOptions.find((item) => item.value === action)?.label ?? action
}

function StatusBox({
  title,
  value,
  accent = "text-white",
}: {
  title: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">{title}</div>
      <div className={`mt-2 break-words text-xl font-black ${accent}`}>{value}</div>
    </div>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-2 break-all text-sm font-bold text-white">{value}</div>
    </div>
  )
}

export default function TxConsolePage() {
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null)
  const [action, setAction] = useState<TxAction>("create_arena")
  const [from, setFrom] = useState(sampleAddresses.from)
  const [to, setTo] = useState(sampleAddresses.to)
  const [data, setData] = useState(sampleData.createArena)
  const [valueKas, setValueKas] = useState("10")
  const [side, setSide] = useState<"host" | "challenger">("host")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [result, setResult] = useState<TxApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const selectedActionMeta = useMemo(() => {
    return actionOptions.find((item) => item.value === action)
  }, [action])

  function applyPreset(nextAction: TxAction) {
    setAction(nextAction)

    if (nextAction === "create_arena") {
      setData(sampleData.createArena)
      setValueKas("10")
    } else if (nextAction === "join_arena") {
      setData(sampleData.joinArena)
      setValueKas("10")
    } else if (nextAction === "spectator_bet") {
      setData(sampleData.spectatorBet)
      setValueKas("5")
      setSide("host")
    } else if (nextAction === "settle_arena") {
      setData(sampleData.settleArena)
      setValueKas("0")
    } else if (nextAction === "update_profile") {
      setData(sampleData.updateProfile)
      setValueKas("0")
    } else if (nextAction === "native_transfer") {
      setData("0x0")
      setValueKas("1")
    }
  }

  async function prepareTransaction() {
    try {
      setLoading(true)
      setResult(null)
      setSendError(null)
      setTxHash(null)

      const payload: Record<string, unknown> = {
        action,
        from,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
      }

      if (action === "native_transfer") {
        payload.to = to
        payload.valueKas = valueKas
      } else {
        payload.data = data
        if (action === "create_arena" || action === "join_arena" || action === "spectator_bet") {
          payload.valueKas = valueKas
        }
        if (action === "spectator_bet") {
          payload.side = side
        }
      }

      const response = await fetch("/api/kasroyal/tx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const json = (await response.json()) as TxApiResponse
      setResult(json)
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown tx page error",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSendWithWallet() {
    try {
      if (!result?.ok || !result.prepared) {
        throw new Error("Prepare a transaction before sending it.")
      }

      if (!walletSession) {
        throw new Error("Connect your wallet before sending a transaction.")
      }

      setSending(true)
      setSendError(null)
      setTxHash(null)

      const hash = await sendPreparedTransaction(result.prepared, walletSession.account)
      setTxHash(hash)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send transaction.")
    } finally {
      setSending(false)
    }
  }

  const prepared = result?.prepared
  const warnings = prepared?.summary?.warnings ?? []

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050807] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] opacity-[0.10]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.08),transparent_24%)]" />
      <div className="pointer-events-none absolute left-[-60px] top-20 h-[320px] w-[320px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-60px] top-36 h-[320px] w-[320px] rounded-full bg-amber-300/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1650px] px-5 py-8 md:px-8 xl:px-10">
        <div className="mb-6 flex flex-col gap-4 rounded-[30px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_0_40px_rgba(16,185,129,0.05)] lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <div className="mb-4 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-amber-300">
              Developer · Tx Console
            </div>

            <h1 className="text-4xl font-black leading-none sm:text-5xl xl:text-6xl">
              Transaction Builder
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/60 sm:text-lg">
              Prepares transaction payloads for arena creation, joining, spectator betting,
              settlement, profile updates, and native transfers. For production activity, use Wallet Activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/activity"
              className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/15"
            >
              Wallet Activity
            </Link>
            <Link
              href="/wallet"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/80 transition hover:bg-white/10"
            >
              Wallet
            </Link>
            <Link
              href="/arena"
              className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-300 transition hover:bg-amber-300/15"
            >
              Arena
            </Link>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <ConnectWallet
              onSessionChange={(session) => {
                setWalletSession(session)
                if (session?.account) {
                  setFrom(session.account)
                }
              }}
            />

            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Transaction Input
              </p>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                    Action
                  </label>

                  <div className="mt-3 grid gap-2">
                    {actionOptions.map((item) => {
                      const active = item.value === action

                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => applyPreset(item.value)}
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            active
                              ? "border-emerald-300/25 bg-emerald-400/10"
                              : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="text-base font-black">{item.label}</div>
                          <div className="mt-1 text-sm text-white/55">{item.description}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                    From Address
                  </label>
                  <input
                    type="text"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm font-bold text-white outline-none"
                    placeholder="0x..."
                  />
                </div>

                {action === "native_transfer" ? (
                  <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                    <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                      To Address
                    </label>
                    <input
                      type="text"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm font-bold text-white outline-none"
                      placeholder="0x..."
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                    <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                      Calldata
                    </label>
                    <textarea
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      className="mt-3 min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm font-bold text-white outline-none"
                      placeholder="0x..."
                    />
                  </div>
                )}

                {(action === "create_arena" ||
                  action === "join_arena" ||
                  action === "spectator_bet" ||
                  action === "native_transfer") && (
                  <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                    <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                      Value (KAS)
                    </label>
                    <input
                      type="text"
                      value={valueKas}
                      onChange={(e) => setValueKas(e.target.value)}
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm font-bold text-white outline-none"
                      placeholder="0"
                    />
                  </div>
                )}

                {action === "spectator_bet" && (
                  <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                    <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                      Bet Side
                    </label>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSide("host")}
                        className={`rounded-2xl px-4 py-4 text-sm font-black transition ${
                          side === "host"
                            ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black"
                            : "border border-white/10 bg-white/5 text-white"
                        }`}
                      >
                        Host
                      </button>

                      <button
                        type="button"
                        onClick={() => setSide("challenger")}
                        className={`rounded-2xl px-4 py-4 text-sm font-black transition ${
                          side === "challenger"
                            ? "bg-gradient-to-r from-emerald-300 to-emerald-500 text-black"
                            : "border border-white/10 bg-white/5 text-white"
                        }`}
                      >
                        Challenger
                      </button>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                    Optional Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm font-bold text-white outline-none"
                    placeholder={prettyAction(action)}
                  />
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/45">
                    Optional Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-3 min-h-[100px] w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm font-bold text-white outline-none"
                    placeholder={selectedActionMeta?.description}
                  />
                </div>

                <button
                  onClick={prepareTransaction}
                  disabled={loading}
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-4 text-base font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Preparing..." : "Prepare Transaction"}
                </button>
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Prepared Result
              </p>
              <h2 className="mt-2 text-3xl font-black">Transaction Payload Preview</h2>

              {!result ? (
                <div className="mt-5 rounded-[22px] border border-white/8 bg-black/25 p-6 text-white/60">
                  Prepare a transaction to see the generated request here.
                </div>
              ) : !result.ok || !prepared ? (
                <div className="mt-5 rounded-[22px] border border-red-300/20 bg-red-400/10 p-6 text-red-200">
                  {result.error ?? "Failed to prepare transaction."}
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatusBox
                      title="Action"
                      value={prettyAction(action)}
                      accent="text-emerald-300"
                    />
                    <StatusBox
                      title="Chain ID"
                      value={String(prepared.chainIdDecimal)}
                      accent="text-sky-300"
                    />
                    <StatusBox
                      title="From"
                      value={shortValue(prepared.from, 10, 8)}
                      accent="text-amber-300"
                    />
                    <StatusBox
                      title="To"
                      value={shortValue(prepared.to, 10, 8)}
                      accent="text-emerald-300"
                    />
                  </div>

                  <div className="grid gap-3">
                    <Field label="Summary Title" value={prepared.summary?.title ?? "—"} />
                    <Field
                      label="Summary Description"
                      value={prepared.summary?.description ?? "—"}
                    />
                    <Field label="From Address" value={prepared.from} />
                    <Field label="To Address" value={prepared.to} />
                    <Field label="Data" value={prepared.data} />
                    <Field label="Value (wei hex)" value={prepared.valueWeiHex} />
                    <Field label="Gas Limit" value={prepared.gasLimitHex ?? "Not estimated"} />
                    <Field label="Gas Price" value={prepared.gasPriceHex ?? "Not estimated"} />
                    <Field label="Chain ID (hex)" value={prepared.chainIdHex} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      onClick={handleSendWithWallet}
                      disabled={sending || !walletSession}
                      className="rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-5 py-4 text-base font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sending ? "Sending..." : "Send With Wallet"}
                    </button>

                    <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/45">
                        Wallet Sender
                      </div>
                      <div className="mt-2 break-all text-sm font-bold text-white">
                        {walletSession?.account ?? "Connect wallet first"}
                      </div>
                    </div>
                  </div>

                  {txHash ? (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                      Transaction sent successfully. Tx hash: <span className="break-all font-bold">{txHash}</span>
                    </div>
                  ) : null}

                  {sendError ? (
                    <div className="rounded-2xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200">
                      {sendError}
                    </div>
                  ) : null}

                  <div className="rounded-[22px] border border-white/8 bg-black/25 p-5">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                      Warnings
                    </div>

                    <div className="mt-4 space-y-3">
                      {warnings.length === 0 ? (
                        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-white/60">
                          No warnings generated.
                        </div>
                      ) : (
                        warnings.map((warning, index) => (
                          <div
                            key={`${warning}-${index}`}
                            className="rounded-xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"
                          >
                            {warning}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Usage Notes
              </p>
              <h3 className="mt-2 text-3xl font-black">How To Use This Safely</h3>

              <div className="mt-5 grid gap-4 xl:grid-cols-3">
                <div className="rounded-[22px] border border-white/8 bg-black/25 p-5 text-sm leading-7 text-white/70">
                  These are prepared transaction requests. The send step uses your connected injected wallet to sign and broadcast them.
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/25 p-5 text-sm leading-7 text-white/70">
                  The sample calldata values are placeholders. Once your Igra contracts are deployed, replace them with real ABI-encoded contract calls.
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/25 p-5 text-sm leading-7 text-white/70">
                  Keep testing on Galleon Testnet until arena creation, joining, spectator betting, and settlement all work end to end.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
