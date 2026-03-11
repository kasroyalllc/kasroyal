"use client"

export type Hex = `0x${string}`

export type WalletNetworkKey = "galleon_testnet" | "galleon_mainnet"
export type WalletProviderKind =
  | "metamask"
  | "rabby"
  | "coinbase"
  | "kasware"
  | "injected"
  | "unknown"

export type ProviderSource =
  | "window.ethereum"
  | "window.ethereum.providers"
  | "window.kasware.ethereum"
  | "unknown"

export type WalletSession = {
  account: Hex
  chainIdHex: Hex
  chainIdDecimal: number
  networkKey: WalletNetworkKey | "unknown"
  networkLabel: string
  providerLabel: string
  providerId: string
  providerKey: string
  providerKind: WalletProviderKind
  providerSource: ProviderSource
  balanceWeiHex: Hex
  balanceKas: string
  signature: string | null
  signedMessage: string | null
}

export type PreparedTxLike = {
  chainIdHex: Hex
  chainIdDecimal: number
  from: Hex
  to: Hex
  data: Hex
  valueWeiHex: Hex
  gasLimitHex?: Hex
  gasPriceHex?: Hex
  summary?: {
    title?: string
    description?: string
    warnings?: string[]
  }
}

export type WalletProviderOption = {
  id: string
  key: string
  kind: WalletProviderKind
  label: string
  source: ProviderSource
  provider: Eip1193Provider
  flags: {
    isMetaMask: boolean
    isRabby: boolean
    isCoinbaseWallet: boolean
    isKasware: boolean
  }
}

export type EnrichedWalletProviderOption = WalletProviderOption & {
  accountPreview: string | null
  chainIdHex: Hex | null
  duplicateGroupKey: string | null
  duplicateCount: number
  isDuplicateMirror: boolean
  canonicalKey: string
}

type Eip1193RequestArgs = {
  method: string
  params?: unknown[] | object
}

type ProviderErrorLike = {
  code?: number
  message?: string
}

export type Eip1193Provider = {
  request(args: Eip1193RequestArgs): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
  isMetaMask?: boolean
  isRabby?: boolean
  isCoinbaseWallet?: boolean
  isKasware?: boolean
  providers?: Eip1193Provider[]
  selectedProvider?: Eip1193Provider
  [key: string]: unknown
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
    kasware?: {
      ethereum?: Eip1193Provider
      [key: string]: unknown
    }
  }
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
const HEX_REGEX = /^0x[a-fA-F0-9]+$/
const ZERO_HEX = "0x0" as Hex
const KAS_DECIMALS = 18

const SELECTED_PROVIDER_STORAGE_KEY = "kasroyal_selected_wallet_provider_key"
const APP_CONNECTED_STORAGE_KEY = "kasroyal_app_wallet_connected"
const APP_SIGNATURE_STORAGE_KEY = "kasroyal_app_wallet_signature"
const APP_MESSAGE_STORAGE_KEY = "kasroyal_app_wallet_message"

export const SUPPORTED_IGRA_NETWORKS: Record<
  WalletNetworkKey,
  {
    key: WalletNetworkKey
    chainIdHex: Hex
    chainIdDecimal: number
    chainName: string
    nativeCurrency: {
      name: string
      symbol: string
      decimals: number
    }
    rpcUrls: string[]
    blockExplorerUrls: string[]
  }
> = {
  galleon_testnet: {
    key: "galleon_testnet",
    chainIdHex: "0x97b4",
    chainIdDecimal: 38836,
    chainName: "Galleon Testnet",
    nativeCurrency: {
      name: "iKAS",
      symbol: "iKAS",
      decimals: 18,
    },
    rpcUrls: ["https://galleon-testnet.igralabs.com:8545"],
    blockExplorerUrls: ["https://explorer.galleon-testnet.igralabs.com"],
  },
  galleon_mainnet: {
    key: "galleon_mainnet",
    chainIdHex: "0x97b1",
    chainIdDecimal: 38833,
    chainName: "Igra Mainnet",
    nativeCurrency: {
      name: "iKAS",
      symbol: "iKAS",
      decimals: 18,
    },
    rpcUrls: ["https://rpc.igralabs.com:8545"],
    blockExplorerUrls: ["https://explorer.igralabs.com"],
  },
}

function isBrowser() {
  return typeof window !== "undefined"
}

function normalizeHex(value: string, fieldName = "hex"): Hex {
  const trimmed = value.trim()
  if (!HEX_REGEX.test(trimmed)) {
    throw new Error(`Invalid ${fieldName}: ${value}`)
  }
  return trimmed.toLowerCase() as Hex
}

function normalizeAddress(value: string, fieldName = "address"): Hex {
  const trimmed = value.trim()
  if (!ADDRESS_REGEX.test(trimmed)) {
    throw new Error(`Invalid ${fieldName}: ${value}`)
  }
  return trimmed as Hex
}

function hexToBigint(value: string): bigint {
  return BigInt(normalizeHex(value))
}

function hexToNumberSafe(value: string): number {
  const n = Number(hexToBigint(value))
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Hex value exceeds safe integer range: ${value}`)
  }
  return n
}

function formatUnits(value: bigint, decimals = KAS_DECIMALS, precision = 6): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const fraction = abs % base

  if (fraction === 0n) {
    return `${negative ? "-" : ""}${whole.toString()}`
  }

  let fractionStr = fraction.toString().padStart(decimals, "0")
  if (precision >= 0 && precision < decimals) {
    fractionStr = fractionStr.slice(0, precision)
  }
  fractionStr = fractionStr.replace(/0+$/, "")

  return `${negative ? "-" : ""}${whole.toString()}${fractionStr ? `.${fractionStr}` : ""}`
}

function getProviderKind(provider: Eip1193Provider, source: ProviderSource): WalletProviderKind {
  if (source === "window.kasware.ethereum") return "kasware"
  if (provider.isKasware) return "kasware"
  if (provider.isRabby) return "rabby"
  if (provider.isCoinbaseWallet) return "coinbase"
  if (provider.isMetaMask) return "metamask"
  return "injected"
}

function getProviderLabel(provider: Eip1193Provider, source: ProviderSource): string {
  const kind = getProviderKind(provider, source)
  if (kind === "kasware") return "KasWare EVM"
  if (kind === "rabby") return "Rabby"
  if (kind === "coinbase") return "Coinbase Wallet"
  if (kind === "metamask") return "MetaMask"
  if (kind === "injected") return "Injected Wallet"
  return "Unknown Wallet"
}

function getProviderId(provider: Eip1193Provider, source: ProviderSource): string {
  const kind = getProviderKind(provider, source)
  if (kind === "kasware") return "kasware"
  if (kind === "rabby") return "rabby"
  if (kind === "coinbase") return "coinbase"
  if (kind === "metamask") return "metamask"
  return `injected-${getProviderLabel(provider, source).toLowerCase().replace(/\s+/g, "-")}`
}

function getSourceShort(source: ProviderSource): string {
  if (source === "window.ethereum") return "eth"
  if (source === "window.ethereum.providers") return "eth-providers"
  if (source === "window.kasware.ethereum") return "kasware"
  return "unknown"
}

function getProviderKey(id: string, source: ProviderSource, index: number) {
  return `${id}::${getSourceShort(source)}::${index}`
}

function providerPreferenceScore(kind: WalletProviderKind, source: ProviderSource): number {
  const kindScore =
    kind === "rabby"
      ? 500
      : kind === "metamask"
      ? 400
      : kind === "coinbase"
      ? 300
      : kind === "kasware"
      ? 200
      : 100

  const sourceScore =
    source === "window.ethereum.providers"
      ? 30
      : source === "window.ethereum"
      ? 20
      : source === "window.kasware.ethereum"
      ? 10
      : 0

  return kindScore + sourceScore
}

function dedupeProviderOptions(options: WalletProviderOption[]): WalletProviderOption[] {
  const seenRefs = new Set<Eip1193Provider>()
  const seenKeys = new Set<string>()
  const result: WalletProviderOption[] = []

  for (const option of options) {
    if (seenRefs.has(option.provider)) continue
    if (seenKeys.has(option.key)) continue
    seenRefs.add(option.provider)
    seenKeys.add(option.key)
    result.push(option)
  }

  return result
}

function createWalletOption(
  provider: Eip1193Provider | undefined,
  source: ProviderSource,
  index: number
): WalletProviderOption | null {
  if (!provider || typeof provider.request !== "function") return null

  const id = getProviderId(provider, source)

  return {
    id,
    key: getProviderKey(id, source, index),
    kind: getProviderKind(provider, source),
    label: getProviderLabel(provider, source),
    source,
    provider,
    flags: {
      isMetaMask: !!provider.isMetaMask,
      isRabby: !!provider.isRabby,
      isCoinbaseWallet: !!provider.isCoinbaseWallet,
      isKasware: !!provider.isKasware,
    },
  }
}

export function discoverInjectedWallets(): WalletProviderOption[] {
  if (!isBrowser()) return []

  const options: WalletProviderOption[] = []

  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    window.ethereum.providers.forEach((provider, index) => {
      const option = createWalletOption(provider, "window.ethereum.providers", index)
      if (option) options.push(option)
    })
  }

  if (window.ethereum) {
    const option = createWalletOption(window.ethereum, "window.ethereum", 0)
    if (option) options.push(option)
  }

  if (window.kasware?.ethereum) {
    const option = createWalletOption(window.kasware.ethereum, "window.kasware.ethereum", 0)
    if (option) options.push(option)
  }

  return dedupeProviderOptions(options)
}

async function safeGetAccounts(provider: Eip1193Provider): Promise<Hex[]> {
  try {
    const result = await provider.request({ method: "eth_accounts" })
    if (!Array.isArray(result)) return []
    return result
      .map((item) => String(item))
      .filter((item) => ADDRESS_REGEX.test(item))
      .map((item) => item as Hex)
  } catch {
    return []
  }
}

async function safeGetChainId(provider: Eip1193Provider): Promise<Hex | null> {
  try {
    const result = await provider.request({ method: "eth_chainId" })
    return normalizeHex(String(result), "chainId")
  } catch {
    return null
  }
}

export async function enrichWalletOptions(
  options: WalletProviderOption[]
): Promise<EnrichedWalletProviderOption[]> {
  const enrichedBase = await Promise.all(
    options.map(async (option) => {
      const accounts = await safeGetAccounts(option.provider)
      const chainIdHex = await safeGetChainId(option.provider)
      const accountPreview = accounts[0] ?? null
      const duplicateGroupKey =
        accountPreview && chainIdHex
          ? `${accountPreview.toLowerCase()}::${chainIdHex.toLowerCase()}`
          : null

      return {
        ...option,
        accountPreview,
        chainIdHex,
        duplicateGroupKey,
        duplicateCount: 1,
        isDuplicateMirror: false,
        canonicalKey: option.key,
      } satisfies EnrichedWalletProviderOption
    })
  )

  const groups = new Map<string, EnrichedWalletProviderOption[]>()

  for (const option of enrichedBase) {
    if (!option.duplicateGroupKey) continue
    const existing = groups.get(option.duplicateGroupKey) ?? []
    existing.push(option)
    groups.set(option.duplicateGroupKey, existing)
  }

  const canonicalByGroup = new Map<string, string>()

  for (const [groupKey, members] of groups.entries()) {
    const sorted = [...members].sort((a, b) => {
      return (
        providerPreferenceScore(b.kind, b.source) - providerPreferenceScore(a.kind, a.source)
      )
    })
    canonicalByGroup.set(groupKey, sorted[0].key)
  }

  return enrichedBase.map((option) => {
    if (!option.duplicateGroupKey) return option

    const members = groups.get(option.duplicateGroupKey) ?? [option]
    const canonicalKey = canonicalByGroup.get(option.duplicateGroupKey) ?? option.key

    return {
      ...option,
      duplicateCount: members.length,
      canonicalKey,
      isDuplicateMirror: members.length > 1 && canonicalKey !== option.key,
    }
  })
}

export function getStoredSelectedWalletKey(): string | null {
  if (!isBrowser()) return null
  return window.localStorage.getItem(SELECTED_PROVIDER_STORAGE_KEY)
}

export function setStoredSelectedWalletKey(key: string | null) {
  if (!isBrowser()) return
  if (!key) {
    window.localStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SELECTED_PROVIDER_STORAGE_KEY, key)
}

export function clearStoredSelectedWalletKey() {
  if (!isBrowser()) return
  window.localStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY)
}

export function isAppWalletConnected() {
  if (!isBrowser()) return false
  return window.localStorage.getItem(APP_CONNECTED_STORAGE_KEY) === "1"
}

export function setAppWalletConnected(value: boolean) {
  if (!isBrowser()) return
  if (value) {
    window.localStorage.setItem(APP_CONNECTED_STORAGE_KEY, "1")
  } else {
    window.localStorage.removeItem(APP_CONNECTED_STORAGE_KEY)
  }
}

export function clearAppWalletConnectionState() {
  if (!isBrowser()) return
  window.localStorage.removeItem(APP_CONNECTED_STORAGE_KEY)
  window.localStorage.removeItem(APP_SIGNATURE_STORAGE_KEY)
  window.localStorage.removeItem(APP_MESSAGE_STORAGE_KEY)
}

export function getStoredAppSignature(): string | null {
  if (!isBrowser()) return null
  return window.localStorage.getItem(APP_SIGNATURE_STORAGE_KEY)
}

export function getStoredAppMessage(): string | null {
  if (!isBrowser()) return null
  return window.localStorage.getItem(APP_MESSAGE_STORAGE_KEY)
}

function setStoredAppSignature(signature: string | null) {
  if (!isBrowser()) return
  if (!signature) {
    window.localStorage.removeItem(APP_SIGNATURE_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(APP_SIGNATURE_STORAGE_KEY, signature)
}

function setStoredAppMessage(message: string | null) {
  if (!isBrowser()) return
  if (!message) {
    window.localStorage.removeItem(APP_MESSAGE_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(APP_MESSAGE_STORAGE_KEY, message)
}

export function findWalletOptionByKey(selectedWalletKey?: string | null): WalletProviderOption | null {
  if (!selectedWalletKey) return null
  const providers = discoverInjectedWallets()
  return providers.find((item) => item.key === selectedWalletKey) ?? null
}

export function getPreferredWalletKey(
  options: Array<{ key: string; kind: WalletProviderKind; source: ProviderSource }>
): string | null {
  if (options.length === 0) return null

  const sorted = [...options].sort((a, b) => {
    return providerPreferenceScore(b.kind, b.source) - providerPreferenceScore(a.kind, a.source)
  })

  return sorted[0]?.key ?? null
}

function detectProviderLabel(provider: Eip1193Provider, source: ProviderSource): string {
  return getProviderLabel(provider, source)
}

function getNetworkKeyFromChainId(chainIdHex: Hex): WalletNetworkKey | "unknown" {
  const normalized = chainIdHex.toLowerCase()

  if (normalized === SUPPORTED_IGRA_NETWORKS.galleon_testnet.chainIdHex) {
    return "galleon_testnet"
  }

  if (normalized === SUPPORTED_IGRA_NETWORKS.galleon_mainnet.chainIdHex) {
    return "galleon_mainnet"
  }

  return "unknown"
}

function getNetworkLabelFromChainId(chainIdHex: Hex): string {
  const key = getNetworkKeyFromChainId(chainIdHex)
  if (key === "unknown") return `Unknown Network (${chainIdHex})`
  return SUPPORTED_IGRA_NETWORKS[key].chainName
}

export function shortAddress(address?: string | null, left = 6, right = 4) {
  if (!address) return "Not Connected"
  if (address.length <= left + right + 3) return address
  return `${address.slice(0, left)}...${address.slice(-right)}`
}

export function getInjectedProvider(selectedWalletKey?: string): Eip1193Provider {
  if (!isBrowser()) {
    throw new Error("Wallet provider is only available in the browser.")
  }

  const providers = discoverInjectedWallets()

  if (providers.length === 0) {
    throw new Error(
      "No injected wallet found. Install MetaMask, Rabby, KasWare, or another EVM wallet extension."
    )
  }

  if (!selectedWalletKey) {
    throw new Error("No wallet provider selected. Choose a wallet first.")
  }

  const selected = providers.find((item) => item.key === selectedWalletKey)

  if (!selected) {
    throw new Error(`Selected wallet "${selectedWalletKey}" is not currently exposed by the browser.`)
  }

  return selected.provider
}

export async function hasInjectedWallet(): Promise<boolean> {
  return discoverInjectedWallets().length > 0
}

export async function requestAccounts(
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<Hex[]> {
  const activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  const result = await activeProvider.request({
    method: "eth_requestAccounts",
  })

  if (!Array.isArray(result)) {
    throw new Error("Wallet returned an invalid accounts response.")
  }

  return result.map((item) => normalizeAddress(String(item), "account"))
}

export async function getAccounts(
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<Hex[]> {
  const activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  const result = await activeProvider.request({
    method: "eth_accounts",
  })

  if (!Array.isArray(result)) {
    throw new Error("Wallet returned an invalid accounts response.")
  }

  return result.map((item) => normalizeAddress(String(item), "account"))
}

export async function getChainId(
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<Hex> {
  const activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  const result = await activeProvider.request({
    method: "eth_chainId",
  })

  return normalizeHex(String(result), "chainId")
}

export async function getNativeBalance(
  address: string,
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<{ balanceWeiHex: Hex; balanceKas: string }> {
  const activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  const normalizedAddress = normalizeAddress(address)

  const result = await activeProvider.request({
    method: "eth_getBalance",
    params: [normalizedAddress, "latest"],
  })

  const balanceWeiHex = normalizeHex(String(result), "balance")
  const balanceKas = formatUnits(hexToBigint(balanceWeiHex), KAS_DECIMALS, 6)

  return {
    balanceWeiHex,
    balanceKas,
  }
}

function utf8ToHex(value: string): Hex {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `0x${hex}` as Hex
}

function buildSignInMessage(params: {
  address: string
  providerLabel: string
  chainIdHex: string
}) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return [
    "KasRoyal Sign-In",
    "",
    "Sign this message to prove wallet ownership for your KasRoyal app session.",
    "",
    `Address: ${params.address}`,
    `Provider: ${params.providerLabel}`,
    `Chain ID: ${params.chainIdHex}`,
    `Nonce: ${nonce}`,
  ].join("\n")
}

async function signConnectMessage(
  provider: Eip1193Provider,
  address: string,
  message: string
): Promise<string> {
  try {
    const result = await provider.request({
      method: "personal_sign",
      params: [message, address],
    })
    return String(result)
  } catch {
    const result = await provider.request({
      method: "personal_sign",
      params: [utf8ToHex(message), address],
    })
    return String(result)
  }
}

function extractProviderErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybe = error as ProviderErrorLike
    if (typeof maybe.message === "string" && maybe.message.trim().length > 0) {
      return maybe.message
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Unknown wallet provider error."
}

function extractProviderErrorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    const maybe = error as ProviderErrorLike
    if (typeof maybe.code === "number") {
      return maybe.code
    }
  }
  return undefined
}

export async function switchOrAddIgraNetwork(
  networkKey: WalletNetworkKey,
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<void> {
  const activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  const network = SUPPORTED_IGRA_NETWORKS[networkKey]

  try {
    await activeProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }],
    })
    return
  } catch (error) {
    const code = extractProviderErrorCode(error)
    const message = extractProviderErrorMessage(error)

    if (code !== 4902) {
      throw new Error(
        `Failed to switch network. Wallet said: ${message}. Try adding the chain manually in the wallet first.`
      )
    }
  }

  try {
    await activeProvider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: network.chainIdHex,
          chainName: network.chainName,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: network.rpcUrls,
          blockExplorerUrls: network.blockExplorerUrls,
        },
      ],
    })
  } catch (error) {
    const message = extractProviderErrorMessage(error)
    throw new Error(
      `Failed to add network. Wallet said: ${message}. Add ${network.chainName} manually with chain id ${network.chainIdDecimal}.`
    )
  }
}

export async function getWalletSession(
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<WalletSession | null> {
  const activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  const providerOption = findWalletOptionByKey(selectedWalletKey)

  const accounts = await getAccounts(activeProvider)

  if (accounts.length === 0) {
    return null
  }

  const account = accounts[0]
  const chainIdHex = await getChainId(activeProvider)
  const balance = await getNativeBalance(account, activeProvider)

  return {
    account,
    chainIdHex,
    chainIdDecimal: hexToNumberSafe(chainIdHex),
    networkKey: getNetworkKeyFromChainId(chainIdHex),
    networkLabel: getNetworkLabelFromChainId(chainIdHex),
    providerLabel: detectProviderLabel(activeProvider, providerOption?.source ?? "unknown"),
    providerId: providerOption?.id ?? "unknown",
    providerKey: providerOption?.key ?? "unknown",
    providerKind: providerOption?.kind ?? "unknown",
    providerSource: providerOption?.source ?? "unknown",
    balanceWeiHex: balance.balanceWeiHex,
    balanceKas: balance.balanceKas,
    signature: getStoredAppSignature(),
    signedMessage: getStoredAppMessage(),
  }
}

export async function connectInjectedWallet(
  networkKey: WalletNetworkKey = "galleon_testnet",
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<WalletSession> {
  if (!selectedWalletKey && !provider) {
    throw new Error("Pick a wallet provider before connecting.")
  }

  const activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  const providerOption = findWalletOptionByKey(selectedWalletKey)

  const accounts = await requestAccounts(activeProvider)

  if (accounts.length === 0) {
    throw new Error("Wallet did not return any accounts.")
  }

  try {
    await switchOrAddIgraNetwork(networkKey, activeProvider)
  } catch {
    // allow connection to continue even if switch fails
  }

  const chainIdHex = await getChainId(activeProvider)
  const signMessage = buildSignInMessage({
    address: accounts[0],
    providerLabel: providerOption?.label ?? "Injected Wallet",
    chainIdHex,
  })

  const signature = await signConnectMessage(activeProvider, accounts[0], signMessage)

  if (!signature || signature === "0x") {
    throw new Error("Wallet did not return a valid signature.")
  }

  const session = await getWalletSession(activeProvider, selectedWalletKey)

  if (!session) {
    throw new Error("Failed to establish wallet session.")
  }

  if (selectedWalletKey) {
    setStoredSelectedWalletKey(selectedWalletKey)
  }

  setStoredAppMessage(signMessage)
  setStoredAppSignature(signature)
  setAppWalletConnected(true)

  return {
    ...session,
    signature,
    signedMessage: signMessage,
  }
}

export async function sendPreparedTransaction(
  prepared: PreparedTxLike,
  expectedAccount?: string,
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): Promise<Hex> {
  const storedKey = selectedWalletKey ?? getStoredSelectedWalletKey()

  if (!storedKey) {
    throw new Error("No app wallet provider is selected.")
  }

  if (!isAppWalletConnected()) {
    throw new Error("KasRoyal wallet session is not connected. Connect inside the app first.")
  }

  const activeProvider = provider ?? getInjectedProvider(storedKey)
  const session = await getWalletSession(activeProvider, storedKey)

  if (!session) {
    throw new Error("Wallet is not connected.")
  }

  if (expectedAccount && session.account.toLowerCase() !== expectedAccount.toLowerCase()) {
    throw new Error("Connected wallet account does not match the expected sender.")
  }

  if (session.chainIdHex.toLowerCase() !== prepared.chainIdHex.toLowerCase()) {
    throw new Error(
      `Wallet is on ${session.networkLabel} (${session.chainIdHex}) but transaction expects chain ${prepared.chainIdDecimal} (${prepared.chainIdHex}).`
    )
  }

  if (session.account.toLowerCase() !== prepared.from.toLowerCase()) {
    throw new Error("Prepared transaction sender does not match the connected wallet.")
  }

  const txParams: Record<string, string> = {
    from: prepared.from,
    to: prepared.to,
    value: prepared.valueWeiHex || ZERO_HEX,
  }

  if (prepared.data && prepared.data !== ZERO_HEX) {
    txParams.data = prepared.data
  }

  if (prepared.gasLimitHex) {
    txParams.gas = prepared.gasLimitHex
  }

  if (prepared.gasPriceHex) {
    txParams.gasPrice = prepared.gasPriceHex
  }

  const result = await activeProvider.request({
    method: "eth_sendTransaction",
    params: [txParams],
  })

  return normalizeHex(String(result), "txHash")
}

export function subscribeWalletEvents(
  handlers: {
    onAccountsChanged?: (accounts: Hex[]) => void
    onChainChanged?: (chainIdHex: Hex) => void
    onDisconnectLike?: () => void
  },
  provider?: Eip1193Provider,
  selectedWalletKey?: string
): () => void {
  let activeProvider: Eip1193Provider

  try {
    activeProvider = provider ?? getInjectedProvider(selectedWalletKey)
  } catch {
    return () => {}
  }

  if (!activeProvider.on || !activeProvider.removeListener) {
    return () => {}
  }

  const handleAccountsChanged = (accountsRaw: unknown) => {
    if (!Array.isArray(accountsRaw)) {
      handlers.onDisconnectLike?.()
      return
    }

    const accounts = accountsRaw
      .map((item) => String(item))
      .filter((item) => ADDRESS_REGEX.test(item))
      .map((item) => item as Hex)

    handlers.onAccountsChanged?.(accounts)

    if (accounts.length === 0) {
      handlers.onDisconnectLike?.()
    }
  }

  const handleChainChanged = (chainIdRaw: unknown) => {
    try {
      const chainIdHex = normalizeHex(String(chainIdRaw), "chainId")
      handlers.onChainChanged?.(chainIdHex)
    } catch {
      // ignore malformed provider event
    }
  }

  activeProvider.on("accountsChanged", handleAccountsChanged)
  activeProvider.on("chainChanged", handleChainChanged)

  return () => {
    activeProvider.removeListener?.("accountsChanged", handleAccountsChanged)
    activeProvider.removeListener?.("chainChanged", handleChainChanged)
  }
}