import { getIgraClient, type IgraCallArgs } from "@/lib/igra-client"

export type Hex = `0x${string}`

export type KasRoyalNetworkKey =
  | "galleon_testnet"
  | "galleon_mainnet"
  | "unknown"

export type KasRoyalChainContext = {
  ok: boolean
  network: KasRoyalNetworkKey
  chainIdHex: Hex | null
  chainIdDecimal: number | null
  blockNumberHex: Hex | null
  blockNumberDecimal: number | null
  rpcUrl: string
  error?: string
}

export type WalletBalanceResult = {
  address: Hex
  weiHex: Hex
  wei: bigint
  kasFormatted: string
}

export type RawReadRequest = {
  to: Hex
  data: Hex
  from?: Hex
  valueWeiHex?: Hex
}

export type RawReadResult = {
  request: RawReadRequest
  result: Hex
}

export type TxSummary = {
  title: string
  description: string
  warnings: string[]
}

export type PreparedTxRequest = {
  chainIdHex: Hex
  chainIdDecimal: number
  from: Hex
  to: Hex
  data: Hex
  valueWeiHex: Hex
  gasLimitHex?: Hex
  gasPriceHex?: Hex
  summary: TxSummary
}

export type EstimateResult = {
  gasLimitHex: Hex
  gasLimit: bigint
  gasPriceHex: Hex
  gasPrice: bigint
}

export type ReceiptResult = {
  raw: unknown
}

export type ArenaContractAddresses = {
  arenaFactory?: Hex
  arenaEscrow?: Hex
  spectatorMarket?: Hex
  leaderboard?: Hex
  profileRegistry?: Hex
}

export type PrepareArenaCreateInput = {
  from: Hex
  data: Hex
  valueKas?: string | number
  contractAddress?: Hex
  title?: string
  description?: string
}

export type PrepareArenaJoinInput = {
  from: Hex
  data: Hex
  valueKas?: string | number
  contractAddress?: Hex
  title?: string
  description?: string
}

export type PrepareSpectatorBetInput = {
  from: Hex
  data: Hex
  valueKas?: string | number
  contractAddress?: Hex
  side: "host" | "challenger"
  title?: string
  description?: string
}

export type PrepareArenaSettleInput = {
  from: Hex
  data: Hex
  contractAddress?: Hex
  title?: string
  description?: string
}

export type PrepareProfileUpdateInput = {
  from: Hex
  data: Hex
  contractAddress?: Hex
  title?: string
  description?: string
}

export type KasRoyalChainServiceOptions = {
  defaultTimeoutMs?: number
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
const HEX_REGEX = /^0x[a-fA-F0-9]+$/
const ZERO_HEX = "0x0" as Hex
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Hex
const KAS_DECIMALS = 18

const KNOWN_CHAIN_IDS: Record<number, KasRoyalNetworkKey> = {
  38836: "galleon_testnet",
  38837: "galleon_mainnet",
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

function getOptionalAddressEnv(name: string): Hex | undefined {
  const value = getEnv(name)
  if (!value) return undefined
  return normalizeAddress(value)
}

function normalizeAddress(value: string): Hex {
  const trimmed = value.trim()
  if (!ADDRESS_REGEX.test(trimmed)) {
    throw new Error(`Invalid address: ${value}`)
  }
  return trimmed as Hex
}

function normalizeHex(value: string, fieldName = "hex"): Hex {
  const trimmed = value.trim()
  if (!HEX_REGEX.test(trimmed)) {
    throw new Error(`Invalid ${fieldName}: ${value}`)
  }
  return ensureEvenHex(trimmed as Hex)
}

function ensureEvenHex(value: Hex): Hex {
  const body = value.slice(2)
  if (body.length % 2 === 0) return value
  return `0x0${body}` as Hex
}

function bigintToHex(value: bigint): Hex {
  if (value < 0n) {
    throw new Error("Negative bigint is not allowed for hex encoding")
  }
  return `0x${value.toString(16)}` as Hex
}

function hexToBigint(value: string): bigint {
  const normalized = normalizeHex(value)
  return BigInt(normalized)
}

function hexToNumberSafe(value: string): number | null {
  try {
    const asBigint = hexToBigint(value)
    if (asBigint > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(asBigint)
  } catch {
    return null
  }
}

function parseDecimalToUnits(value: string | number, decimals = KAS_DECIMALS): bigint {
  const str = String(value).trim()

  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid decimal amount: ${value}`)
  }

  const [wholePart, fractionalPartRaw = ""] = str.split(".")
  const fractionalPart = fractionalPartRaw.slice(0, decimals).padEnd(decimals, "0")

  return BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(fractionalPart || "0")
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

  if (!fractionStr) {
    return `${negative ? "-" : ""}${whole.toString()}`
  }

  return `${negative ? "-" : ""}${whole.toString()}.${fractionStr}`
}

function assertNonEmptyHexData(value: string, fieldName = "data"): Hex {
  const hex = normalizeHex(value, fieldName)
  if (hex === ZERO_HEX) {
    throw new Error(`${fieldName} cannot be empty 0x0`)
  }
  return hex
}

function resolveKnownNetwork(chainIdDecimal: number | null): KasRoyalNetworkKey {
  if (!chainIdDecimal) return "unknown"
  return KNOWN_CHAIN_IDS[chainIdDecimal] ?? "unknown"
}

function buildWarningsBase(): string[] {
  return [
    "Never trust client-side UI amounts alone; verify contract state before signing.",
    "Only use mainnet after testing full wager, join, bet, and settlement flows on galleon_testnet.",
    "Prepared transactions here do not sign or broadcast by themselves; a wallet or signer must do that step.",
  ]
}

function dedupeWarnings(items: string[]): string[] {
  return [...new Set(items)]
}

export class KasRoyalChainService {
  private readonly client = getIgraClient()
  private readonly defaultTimeoutMs: number
  private readonly addresses: ArenaContractAddresses

  constructor(options?: KasRoyalChainServiceOptions) {
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 15000
    this.addresses = {
      arenaFactory: getOptionalAddressEnv("KASROYAL_ARENA_FACTORY_ADDRESS"),
      arenaEscrow: getOptionalAddressEnv("KASROYAL_ARENA_ESCROW_ADDRESS"),
      spectatorMarket: getOptionalAddressEnv("KASROYAL_SPECTATOR_MARKET_ADDRESS"),
      leaderboard: getOptionalAddressEnv("KASROYAL_LEADERBOARD_ADDRESS"),
      profileRegistry: getOptionalAddressEnv("KASROYAL_PROFILE_REGISTRY_ADDRESS"),
    }
  }

  getConfiguredAddresses(): ArenaContractAddresses {
    return { ...this.addresses }
  }

  async getRpcHealth(): Promise<{ ok: boolean; rpcUrl: string; error?: string }> {
    return this.client.healthcheck()
  }

  async getChainContext(): Promise<KasRoyalChainContext> {
    try {
      const [chainIdHexRaw, blockNumberHexRaw] = await Promise.all([
        this.client.getChainId(),
        this.client.getBlockNumber(),
      ])

      const chainIdHex = normalizeHex(chainIdHexRaw, "chainId")
      const blockNumberHex = normalizeHex(blockNumberHexRaw, "blockNumber")
      const chainIdDecimal = hexToNumberSafe(chainIdHex)
      const blockNumberDecimal = hexToNumberSafe(blockNumberHex)

      return {
        ok: true,
        network: resolveKnownNetwork(chainIdDecimal),
        chainIdHex,
        chainIdDecimal,
        blockNumberHex,
        blockNumberDecimal,
        rpcUrl: this.client.getRpcUrl(),
      }
    } catch (error) {
      return {
        ok: false,
        network: "unknown",
        chainIdHex: null,
        chainIdDecimal: null,
        blockNumberHex: null,
        blockNumberDecimal: null,
        rpcUrl: this.client.getRpcUrl(),
        error: error instanceof Error ? error.message : "Unknown chain context error",
      }
    }
  }

  async getWalletBalance(address: string): Promise<WalletBalanceResult> {
    const normalizedAddress = normalizeAddress(address)
    const balanceHex = normalizeHex(await this.client.getBalance(normalizedAddress), "balance")
    const wei = hexToBigint(balanceHex)

    return {
      address: normalizedAddress,
      weiHex: balanceHex,
      wei,
      kasFormatted: formatUnits(wei, KAS_DECIMALS, 6),
    }
  }

  async getAddressBalanceOrNull(address?: string): Promise<WalletBalanceResult | null> {
    if (!address) return null
    return this.getWalletBalance(address)
  }

  async readContractRaw(request: RawReadRequest): Promise<RawReadResult> {
    const args: IgraCallArgs = {
      to: normalizeAddress(request.to),
      data: assertNonEmptyHexData(request.data, "call data"),
    }

    if (request.from) {
      args.from = normalizeAddress(request.from)
    }

    if (request.valueWeiHex) {
      args.value = normalizeHex(request.valueWeiHex, "valueWeiHex")
    }

    const result = normalizeHex(await this.client.call(args), "read result")

    return {
      request: {
        to: args.to as Hex,
        data: args.data as Hex,
        from: args.from ? (args.from as Hex) : undefined,
        valueWeiHex: args.value ? (args.value as Hex) : undefined,
      },
      result,
    }
  }

  async estimateTx(tx: {
    from: Hex
    to: Hex
    data?: Hex
    valueWeiHex?: Hex
  }): Promise<EstimateResult> {
    const from = normalizeAddress(tx.from)
    const to = normalizeAddress(tx.to)
    const data = tx.data ? normalizeHex(tx.data, "tx data") : undefined
    const value = tx.valueWeiHex ? normalizeHex(tx.valueWeiHex, "tx value") : ZERO_HEX

    const gasArgs: IgraCallArgs = {
      from,
      to,
      value,
    }

    if (data) gasArgs.data = data

    const [gasLimitHexRaw, gasPriceHexRaw] = await Promise.all([
      this.client.estimateGas(gasArgs),
      this.client.getGasPrice(),
    ])

    const gasLimitHex = normalizeHex(gasLimitHexRaw, "gasLimit")
    const gasPriceHex = normalizeHex(gasPriceHexRaw, "gasPrice")

    return {
      gasLimitHex,
      gasLimit: hexToBigint(gasLimitHex),
      gasPriceHex,
      gasPrice: hexToBigint(gasPriceHex),
    }
  }

  async getReceipt(txHash: string): Promise<ReceiptResult> {
    const normalized = normalizeHex(txHash, "txHash")
    const raw = await this.client.getTransactionReceipt(normalized)
    return { raw }
  }

  async prepareNativeTransfer(input: {
    from: Hex
    to: Hex
    valueKas: string | number
    title?: string
    description?: string
  }): Promise<PreparedTxRequest> {
    const from = normalizeAddress(input.from)
    const to = normalizeAddress(input.to)
    const valueWei = parseDecimalToUnits(input.valueKas)
    const chain = await this.requireChainContext()

    const estimate = await this.estimateTx({
      from,
      to,
      valueWeiHex: bigintToHex(valueWei),
    })

    return {
      chainIdHex: chain.chainIdHex,
      chainIdDecimal: chain.chainIdDecimal,
      from,
      to,
      data: ZERO_HEX,
      valueWeiHex: bigintToHex(valueWei),
      gasLimitHex: estimate.gasLimitHex,
      gasPriceHex: estimate.gasPriceHex,
      summary: {
        title: input.title ?? "Transfer native KAS",
        description:
          input.description ??
          `Transfer ${String(input.valueKas)} KAS from ${shortAddress(from)} to ${shortAddress(to)}.`,
        warnings: dedupeWarnings([
          ...buildWarningsBase(),
          "Double-check recipient address before signing.",
        ]),
      },
    }
  }

  async prepareCreateArenaTx(input: PrepareArenaCreateInput): Promise<PreparedTxRequest> {
    const contract = input.contractAddress ?? this.addresses.arenaFactory ?? this.addresses.arenaEscrow

    if (!contract) {
      throw new Error(
        "Missing arena contract address. Set KASROYAL_ARENA_FACTORY_ADDRESS or pass contractAddress explicitly."
      )
    }

    return this.prepareContractWrite({
      from: input.from,
      to: contract,
      data: input.data,
      valueKas: input.valueKas,
      title: input.title ?? "Create arena match",
      description:
        input.description ??
        "Create a new KasRoyal arena escrow/match on-chain using the configured arena contract.",
      warnings: [
        "Creation calldata must match your deployed arena factory or escrow ABI exactly.",
        "Do not trust UI-side wager math alone; the contract must enforce entry amount, participants, and state transitions.",
      ],
    })
  }

  async prepareJoinArenaTx(input: PrepareArenaJoinInput): Promise<PreparedTxRequest> {
    const contract = input.contractAddress ?? this.addresses.arenaEscrow ?? this.addresses.arenaFactory

    if (!contract) {
      throw new Error(
        "Missing arena contract address. Set KASROYAL_ARENA_ESCROW_ADDRESS or pass contractAddress explicitly."
      )
    }

    return this.prepareContractWrite({
      from: input.from,
      to: contract,
      data: input.data,
      valueKas: input.valueKas,
      title: input.title ?? "Join arena match",
      description:
        input.description ??
        "Join an existing KasRoyal arena match and lock the player-side wager into escrow.",
      warnings: [
        "Join calldata must target the exact arena instance or factory join function you deployed.",
        "Your contract must reject duplicate joins, incorrect wager amounts, and invalid state transitions.",
      ],
    })
  }

  async prepareSpectatorBetTx(input: PrepareSpectatorBetInput): Promise<PreparedTxRequest> {
    const contract = input.contractAddress ?? this.addresses.spectatorMarket ?? this.addresses.arenaEscrow

    if (!contract) {
      throw new Error(
        "Missing spectator market contract address. Set KASROYAL_SPECTATOR_MARKET_ADDRESS or pass contractAddress explicitly."
      )
    }

    return this.prepareContractWrite({
      from: input.from,
      to: contract,
      data: input.data,
      valueKas: input.valueKas,
      title: input.title ?? `Place spectator bet (${input.side})`,
      description:
        input.description ??
        `Place a spectator-side wager on the ${input.side} side of a KasRoyal arena match.`,
      warnings: [
        "Spectator markets should lock betting before outcome certainty emerges.",
        "Contract logic must prevent late betting, duplicate settlement, and admin tampering.",
        "Use explicit match IDs and side enums in calldata so the bet destination is unambiguous.",
      ],
    })
  }

  async prepareArenaSettleTx(input: PrepareArenaSettleInput): Promise<PreparedTxRequest> {
    const contract =
      input.contractAddress ??
      this.addresses.arenaEscrow ??
      this.addresses.spectatorMarket ??
      this.addresses.arenaFactory

    if (!contract) {
      throw new Error(
        "Missing settlement contract address. Set KASROYAL_ARENA_ESCROW_ADDRESS or pass contractAddress explicitly."
      )
    }

    return this.prepareContractWrite({
      from: input.from,
      to: contract,
      data: input.data,
      valueKas: 0,
      title: input.title ?? "Settle arena match",
      description:
        input.description ??
        "Settle a finished KasRoyal arena match and distribute player/spectator payouts according to contract rules.",
      warnings: [
        "Settlement must be idempotent or protected against multiple executions.",
        "Never settle from client UI based purely on off-chain assumptions; verify final match result source first.",
      ],
    })
  }

  async prepareProfileUpdateTx(input: PrepareProfileUpdateInput): Promise<PreparedTxRequest> {
    const contract = input.contractAddress ?? this.addresses.profileRegistry

    if (!contract) {
      throw new Error(
        "Missing profile registry contract address. Set KASROYAL_PROFILE_REGISTRY_ADDRESS or pass contractAddress explicitly."
      )
    }

    return this.prepareContractWrite({
      from: input.from,
      to: contract,
      data: input.data,
      valueKas: 0,
      title: input.title ?? "Update profile",
      description:
        input.description ??
        "Update KasRoyal on-chain profile or identity-linked metadata through the configured profile registry.",
      warnings: [
        "Do not store oversized blobs directly on-chain; prefer URI-based metadata with integrity checks.",
      ],
    })
  }

  shortAddress(address: string): string {
    return shortAddress(normalizeAddress(address))
  }

  parseKasToWeiHex(valueKas: string | number): Hex {
    return bigintToHex(parseDecimalToUnits(valueKas))
  }

  formatWeiHexToKas(valueWeiHex: string, precision = 6): string {
    return formatUnits(hexToBigint(valueWeiHex), KAS_DECIMALS, precision)
  }

  formatWeiToKas(valueWei: bigint, precision = 6): string {
    return formatUnits(valueWei, KAS_DECIMALS, precision)
  }

  validateAddress(address: string): address is Hex {
    return ADDRESS_REGEX.test(address)
  }

  validateHex(value: string): value is Hex {
    return HEX_REGEX.test(value)
  }

  private async prepareContractWrite(input: {
    from: Hex
    to: Hex
    data: Hex
    valueKas?: string | number
    title: string
    description: string
    warnings?: string[]
  }): Promise<PreparedTxRequest> {
    const from = normalizeAddress(input.from)
    const to = normalizeAddress(input.to)
    const data = assertNonEmptyHexData(input.data, "contract write data")
    const valueWei = input.valueKas === undefined ? 0n : parseDecimalToUnits(input.valueKas)
    const valueWeiHex = bigintToHex(valueWei)
    const chain = await this.requireChainContext()

    const estimate = await this.estimateTx({
      from,
      to,
      data,
      valueWeiHex,
    })

    return {
      chainIdHex: chain.chainIdHex,
      chainIdDecimal: chain.chainIdDecimal,
      from,
      to,
      data,
      valueWeiHex,
      gasLimitHex: estimate.gasLimitHex,
      gasPriceHex: estimate.gasPriceHex,
      summary: {
        title: input.title,
        description: input.description,
        warnings: dedupeWarnings([
          ...buildWarningsBase(),
          ...(input.warnings ?? []),
        ]),
      },
    }
  }

  private async requireChainContext(): Promise<{
    chainIdHex: Hex
    chainIdDecimal: number
  }> {
    const chain = await this.getChainContext()

    if (!chain.ok || !chain.chainIdHex || chain.chainIdDecimal === null) {
      throw new Error(chain.error ?? "Unable to resolve active Igra chain context")
    }

    return {
      chainIdHex: chain.chainIdHex,
      chainIdDecimal: chain.chainIdDecimal,
    }
  }
}

function shortAddress(address: Hex): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

let singleton: KasRoyalChainService | null = null

export function getKasRoyalChainService(): KasRoyalChainService {
  if (!singleton) {
    singleton = new KasRoyalChainService()
  }
  return singleton
}

export const kasroyalChain = {
  get service() {
    return getKasRoyalChainService()
  },

  getConfiguredAddresses(): ArenaContractAddresses {
    return this.service.getConfiguredAddresses()
  },

  async getRpcHealth() {
    return this.service.getRpcHealth()
  },

  async getChainContext() {
    return this.service.getChainContext()
  },

  async getWalletBalance(address: string) {
    return this.service.getWalletBalance(address)
  },

  async readContractRaw(request: RawReadRequest) {
    return this.service.readContractRaw(request)
  },

  async estimateTx(tx: {
    from: Hex
    to: Hex
    data?: Hex
    valueWeiHex?: Hex
  }) {
    return this.service.estimateTx(tx)
  },

  async getReceipt(txHash: string) {
    return this.service.getReceipt(txHash)
  },

  async prepareNativeTransfer(input: {
    from: Hex
    to: Hex
    valueKas: string | number
    title?: string
    description?: string
  }) {
    return this.service.prepareNativeTransfer(input)
  },

  async prepareCreateArenaTx(input: PrepareArenaCreateInput) {
    return this.service.prepareCreateArenaTx(input)
  },

  async prepareJoinArenaTx(input: PrepareArenaJoinInput) {
    return this.service.prepareJoinArenaTx(input)
  },

  async prepareSpectatorBetTx(input: PrepareSpectatorBetInput) {
    return this.service.prepareSpectatorBetTx(input)
  },

  async prepareArenaSettleTx(input: PrepareArenaSettleInput) {
    return this.service.prepareArenaSettleTx(input)
  },

  async prepareProfileUpdateTx(input: PrepareProfileUpdateInput) {
    return this.service.prepareProfileUpdateTx(input)
  },

  parseKasToWeiHex(valueKas: string | number): Hex {
    return this.service.parseKasToWeiHex(valueKas)
  },

  formatWeiHexToKas(valueWeiHex: string, precision = 6): string {
    return this.service.formatWeiHexToKas(valueWeiHex, precision)
  },

  formatWeiToKas(valueWei: bigint, precision = 6): string {
    return this.service.formatWeiToKas(valueWei, precision)
  },

  validateAddress(address: string): address is Hex {
    return this.service.validateAddress(address)
  },

  validateHex(value: string): value is Hex {
    return this.service.validateHex(value)
  },

  shortAddress(address: string): string {
    return this.service.shortAddress(address)
  },
}

export default getKasRoyalChainService