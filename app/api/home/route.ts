import { NextResponse } from "next/server"
import { getKasRoyalHomeData } from "@/lib/kasroyal-data"

export async function GET() {
  const data = getKasRoyalHomeData()

  return NextResponse.json(
    {
      ok: true,
      updatedAt: new Date().toISOString(),
      data,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}