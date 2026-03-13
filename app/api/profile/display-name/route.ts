import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/**
 * Set display name for an identity (wallet). Enforces globally unique display names (case-insensitive).
 * Rejects with 409 if "That profile name is already taken."
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const identityId = String(body.identity_id ?? "").trim().toLowerCase()
    const displayName = String(body.display_name ?? "").trim()

    if (!identityId) {
      return NextResponse.json(
        { ok: false, error: "identity_id required" },
        { status: 400 }
      )
    }

    if (!displayName || displayName.length > 64) {
      return NextResponse.json(
        { ok: false, error: "display_name required and must be 1–64 characters" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const trimmedName = displayName.trim()

    const { data: existingRows } = await supabase
      .from("profiles")
      .select("identity_id")
      .ilike("display_name", trimmedName)

    const takenByOther =
      Array.isArray(existingRows) &&
      existingRows.some((row: { identity_id: string }) => row.identity_id.toLowerCase() !== identityId)
    if (takenByOther) {
      return NextResponse.json(
        { ok: false, error: "That profile name is already taken." },
        { status: 409 }
      )
    }

    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        identity_id: identityId,
        display_name: trimmedName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "identity_id" }
    )

    if (upsertError) {
      if (upsertError.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "That profile name is already taken." },
          { status: 409 }
        )
      }
      throw upsertError
    }

    return NextResponse.json({ ok: true, display_name: trimmedName })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to update display name" },
      { status: 500 }
    )
  }
}
