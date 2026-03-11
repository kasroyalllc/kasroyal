import { NextResponse } from "next/server"
import { getIgraClient } from "@/lib/igra-client"

export async function GET() {
  try {
    const client = getIgraClient()
    const health = await client.healthcheck()

    return NextResponse.json(
      {
        ok: health.ok,
        rpcUrl: health.rpcUrl,
        error: health.error ?? null,
      },
      {
        status: health.ok ? 200 : 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
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