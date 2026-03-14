import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/** Lightweight endpoint so the client can sync to server time as soon as a Live match is shown (avoids waiting for first tick and prevents timer ending early from clock skew). */
export async function GET() {
  return NextResponse.json(
    { server_time_ms: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
