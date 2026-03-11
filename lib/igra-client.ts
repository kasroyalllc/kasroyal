type JsonRpcId = string | number | null

type JsonRpcSuccess<T> = {
  jsonrpc: "2.0"
  id: JsonRpcId
  result: T
}

type JsonRpcError = {
  jsonrpc: "2.0"
  id: JsonRpcId
  error: {
    code: number
    message: string
    data?: unknown
  }
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError

export type IgraRpcConfig = {
  rpcUrl: string
  apiKey?: string
  timeoutMs?: number
}

export type IgraHealthResult = {
  ok: boolean
  rpcUrl: string
  error?: string
}

export type IgraCallArgs = {
  to?: string
  from?: string
  data?: string
  value?: string
  gas?: string
  gasPrice?: string
}

export type IgraSendTxArgs = {
  from: string
  to?: string
  data?: string
  value?: string
  gas?: string
  gasPrice?: string
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

function getRequiredEnv(name: string): string {
  const value = getEnv(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function createRequestId(): string {
  return `kr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
  }
}

export class IgraRpcClient {
  private readonly rpcUrl: string
  private readonly apiKey?: string
  private readonly timeoutMs: number

  constructor(config?: Partial<IgraRpcConfig>) {
    this.rpcUrl = config?.rpcUrl ?? getRequiredEnv("IGRA_RPC_URL")
    this.apiKey = config?.apiKey ?? getEnv("IGRA_RPC_API_KEY")
    this.timeoutMs = config?.timeoutMs ?? Number(getEnv("IGRA_RPC_TIMEOUT_MS") ?? 15000)
  }

  getRpcUrl(): string {
    return this.rpcUrl
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
      headers["x-api-key"] = this.apiKey
    }

    return headers
  }

  async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const payload = {
      jsonrpc: "2.0" as const,
      id: createRequestId(),
      method,
      params,
    }

    const response = await fetchWithTimeout(
      this.rpcUrl,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      },
      this.timeoutMs
    )

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Igra RPC HTTP ${response.status}: ${text || response.statusText}`)
    }

    const json = (await response.json()) as JsonRpcResponse<T>

    if ("error" in json) {
      throw new Error(
        `Igra RPC error ${json.error.code}: ${json.error.message}${
          json.error.data ? ` | ${JSON.stringify(json.error.data)}` : ""
        }`
      )
    }

    return json.result
  }

  async healthcheck(): Promise<IgraHealthResult> {
    const candidateMethods = ["web3_clientVersion", "net_version", "eth_chainId"]

    for (const method of candidateMethods) {
      try {
        await this.rpc(method, [])
        return {
          ok: true,
          rpcUrl: this.rpcUrl,
        }
      } catch {
        // try next method
      }
    }

    try {
      const response = await fetchWithTimeout(
        this.rpcUrl,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: createRequestId(),
            method: "web3_clientVersion",
            params: [],
          }),
        },
        this.timeoutMs
      )

      return {
        ok: response.ok,
        rpcUrl: this.rpcUrl,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      }
    } catch (error) {
      return {
        ok: false,
        rpcUrl: this.rpcUrl,
        error: error instanceof Error ? error.message : "Unknown RPC error",
      }
    }
  }

  async getChainId(): Promise<string> {
    return this.rpc<string>("eth_chainId", [])
  }

  async getBlockNumber(): Promise<string> {
    return this.rpc<string>("eth_blockNumber", [])
  }

  async getBalance(address: string, blockTag: string = "latest"): Promise<string> {
    return this.rpc<string>("eth_getBalance", [address, blockTag])
  }

  async call(args: IgraCallArgs, blockTag: string = "latest"): Promise<string> {
    return this.rpc<string>("eth_call", [args, blockTag])
  }

  async getTransactionReceipt(txHash: string): Promise<unknown> {
    return this.rpc<unknown>("eth_getTransactionReceipt", [txHash])
  }

  async sendRawTransaction(rawTx: string): Promise<string> {
    return this.rpc<string>("eth_sendRawTransaction", [rawTx])
  }

  async estimateGas(args: IgraCallArgs): Promise<string> {
    return this.rpc<string>("eth_estimateGas", [args])
  }

  async getGasPrice(): Promise<string> {
    return this.rpc<string>("eth_gasPrice", [])
  }
}

let singleton: IgraRpcClient | null = null

export function getIgraClient(): IgraRpcClient {
  if (!singleton) {
    singleton = new IgraRpcClient()
  }
  return singleton
}