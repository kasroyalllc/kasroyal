import { NextRequest, NextResponse } from "next/server"
import { kasroyalChain } from "@/lib/kasroyal-chain"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const addressParam = searchParams.get("address")?.trim()

    const [health, chainContext] = await Promise.all([
      kasroyalChain.getRpcHealth(),
      kasroyalChain.getChainContext(),
    ])

    let balance: {
      address: string
      weiHex: string
      wei: string
      kasFormatted: string
    } | null = null

    let addressError: string | null = null

    if (addressParam) {
      if (!kasroyalChain.validateAddress(addressParam)) {
        addressError = "Invalid wallet address format."
      } else {
        try {
          const rawBalance = await kasroyalChain.getWalletBalance(addressParam)

          balance = {
            address: rawBalance.address,
            weiHex: rawBalance.weiHex,
            wei: rawBalance.wei.toString(),
            kasFormatted: rawBalance.kasFormatted,
          }
        } catch (error) {
          addressError =
            error instanceof Error ? error.message : "Failed to fetch wallet balance."
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        health,
        chainContext,
        configuredAddresses: kasroyalChain.getConfiguredAddresses(),
        query: {
          address: addressParam ?? null,
        },
        balance,
        addressError,
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
        error: error instanceof Error ? error.message : "Unknown chain route error",
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