import type { ErrorDetails } from "@asterism-app/sdk/contracts";

/** Additional whole-request attempts after an eligible upstream failure. */
export const agentRequestRetries = 3;

/** Both consecutive recovery and the caller's remaining request budget bound the next attempt. */
export function nextRetry(result: { reason: string; retryable?: boolean }, previous: number, maximum: number, remaining: number): number | null {
  return result.reason === "failed" && result.retryable && previous < maximum && remaining > 0 ? previous + 1 : null;
}

/** Provider delays take precedence; retry numbering starts at one after the initial failed attempt. */
export function retryDelay(details: ErrorDetails | undefined, attempt: number, now = Date.now(), random = Math.random()): number {
  const headers = Object.fromEntries(Object.entries(details?.responseHeaders ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  const milliseconds = headers["retry-after-ms"];
  if (milliseconds !== undefined && milliseconds.trim() && Number.isFinite(Number(milliseconds)) && Number(milliseconds) >= 0)
    return Number(milliseconds);
  const after = headers["retry-after"];
  if (after?.trim()) {
    const delay = Number.isFinite(Number(after)) ? Number(after) * 1000 : Date.parse(after) - now;
    if (Number.isFinite(delay) && delay >= 0) return delay;
  }
  return Math.round(1000 * 2 ** (attempt - 1) * (0.8 + random * 0.4));
}
