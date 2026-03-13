/**
 * Safe server-side logging for critical flows. No secrets, no PII.
 * Use in API routes only (Node). For client, use console or a client-safe logger.
 */

type LogContext = Record<string, string | number | boolean | null | undefined>

function sanitize(ctx: LogContext): LogContext {
  const out: LogContext = {}
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined || v === null) continue
    if (typeof v === "string" && v.length > 64) out[k] = v.slice(0, 64) + "..."
    else out[k] = v
  }
  return out
}

export function logRoomAction(
  action: string,
  roomId: string,
  extra?: LogContext
): void {
  if (process.env.NODE_ENV !== "production") {
    const ctx = sanitize({ action, roomId, ...extra })
    console.log("[room]", JSON.stringify(ctx))
  }
}

export function logApiError(route: string, message: string, code?: number): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[api:${route}]`, code ?? 500, message)
  }
}
