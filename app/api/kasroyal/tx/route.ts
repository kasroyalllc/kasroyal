import { NextRequest, NextResponse } from "next/server"
import { kasroyalChain } from "@/lib/kasroyal-chain"

type TxAction =
  | "create_arena"
  | "join_arena"
  | "spectator_bet"
  | "settle_arena"
  | "update_profile"
  | "native_transfer"

type Body = {
  action?: TxAction
  from?: string
  to?: string
  data?: string
  valueKas?: string | number
  side?: "host" | "challenger"
  title?: string
  description?: string
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details: details ?? null,
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body

    if (!body.action) {
      return badRequest("Missing required field: action")
    }

    if (!body.from) {
      return badRequest("Missing required field: from")
    }

    let prepared: unknown

    switch (body.action) {
      case "create_arena": {
        if (!body.data) return badRequest("Missing required field for create_arena: data")
        prepared = await kasroyalChain.prepareCreateArenaTx({
          from: body.from as `0x${string}`,
          data: body.data as `0x${string}`,
          valueKas: body.valueKas ?? 0,
          title: body.title,
          description: body.description,
        })
        break
      }

      case "join_arena": {
        if (!body.data) return badRequest("Missing required field for join_arena: data")
        prepared = await kasroyalChain.prepareJoinArenaTx({
          from: body.from as `0x${string}`,
          data: body.data as `0x${string}`,
          valueKas: body.valueKas ?? 0,
          title: body.title,
          description: body.description,
        })
        break
      }

      case "spectator_bet": {
        if (!body.data) return badRequest("Missing required field for spectator_bet: data")
        if (!body.side) return badRequest("Missing required field for spectator_bet: side")
        prepared = await kasroyalChain.prepareSpectatorBetTx({
          from: body.from as `0x${string}`,
          data: body.data as `0x${string}`,
          valueKas: body.valueKas ?? 0,
          side: body.side,
          title: body.title,
          description: body.description,
        })
        break
      }

      case "settle_arena": {
        if (!body.data) return badRequest("Missing required field for settle_arena: data")
        prepared = await kasroyalChain.prepareArenaSettleTx({
          from: body.from as `0x${string}`,
          data: body.data as `0x${string}`,
          title: body.title,
          description: body.description,
        })
        break
      }

      case "update_profile": {
        if (!body.data) return badRequest("Missing required field for update_profile: data")
        prepared = await kasroyalChain.prepareProfileUpdateTx({
          from: body.from as `0x${string}`,
          data: body.data as `0x${string}`,
          title: body.title,
          description: body.description,
        })
        break
      }

      case "native_transfer": {
        if (!body.to) return badRequest("Missing required field for native_transfer: to")
        if (body.valueKas === undefined || body.valueKas === null) {
          return badRequest("Missing required field for native_transfer: valueKas")
        }

        prepared = await kasroyalChain.prepareNativeTransfer({
          from: body.from as `0x${string}`,
          to: body.to as `0x${string}`,
          valueKas: body.valueKas,
          title: body.title,
          description: body.description,
        })
        break
      }

      default:
        return badRequest("Unsupported action", body.action)
    }

    return NextResponse.json(
      {
        ok: true,
        prepared,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown tx preparation error",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  }
}