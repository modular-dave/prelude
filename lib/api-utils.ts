import { NextResponse } from "next/server";

/**
 * Standardized JSON error response for API routes.
 * Usage: `return apiError("Not found", 404);`
 */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse an integer from a query/path param with a fallback and optional bounds.
 * Returns the fallback if the value is null, undefined, or not a valid integer.
 * Clamps to [min, max] when provided.
 */
export function parseIntParam(
  value: string | null | undefined,
  fallback: number,
  min?: number,
  max?: number,
): number {
  if (value == null) return fallback;
  let parsed = parseInt(value, 10);
  if (isNaN(parsed)) return fallback;
  if (min !== undefined) parsed = Math.max(min, parsed);
  if (max !== undefined) parsed = Math.min(max, parsed);
  return parsed;
}

/**
 * Wrap a promise with a timeout. Rejects with an error if the promise
 * doesn't resolve within the specified milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}
