/**
 * Serialize caught errors for API 500 responses and server logs.
 * Use in route catch blocks so production returns the exact exception (Vercel logs + response body).
 */

type SerializedError = {
  error: string
  code?: string
  details?: unknown
  /** Only in development; omit in production to avoid leaking stack. */
  stack?: string
}

export function serializeApiError(e: unknown): SerializedError {
  const err = e as { message?: string; code?: string; details?: unknown; stack?: string } | null
  const message =
    e instanceof Error
      ? e.message
      : err && typeof err === "object" && typeof err.message === "string"
        ? err.message
        : String(e)
  const out: SerializedError = { error: message }
  if (err && typeof err === "object") {
    if (typeof err.code === "string") out.code = err.code
    if (err.details !== undefined) out.details = err.details
    if (process.env.NODE_ENV !== "production" && typeof err.stack === "string") {
      out.stack = err.stack
    }
  }
  return out
}

/** Message only (safe to always return in body). */
export function getApiErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  const err = e as { message?: string } | null
  if (err && typeof err === "object" && typeof err.message === "string") return err.message
  return String(e)
}
