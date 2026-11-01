import { MessagingError, type CallResult } from "@asterism-app/sdk/runtime";
import type { Json } from "@asterism-app/sdk/contracts";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * A write definitely did not happen when the provider rejected it or failed before sending: any MessagingError except
 * request_failed, or a request_failed carrying a retry delay, which the platform returns only for refused requests.
 */
export function definitelyNotSent(error: unknown): boolean {
  return error instanceof MessagingError && (error.code !== "request_failed" || error.retryAfterMs !== undefined);
}

/**
 * Report a messaging failure with its code and cause instead of the host's generic tool failure.
 * Reads fail; writes fail only when nothing was sent, and otherwise report an unknown outcome with the cause.
 */
export function messagingFailure(error: unknown, effect: "read" | "write", aborted: boolean): CallResult<Json> {
  if (aborted) return { kind: "cancelled", message: "The messaging operation was cancelled." };
  if (effect === "write" && !definitelyNotSent(error))
    return { kind: "unknown", message: `The message may have been sent: ${message(error)}` };
  return { kind: "failed", error: { code: error instanceof MessagingError ? error.code : "request_failed", message: message(error) } };
}

export async function messagingOutcome<T extends Json>(effect: "read" | "write", signal: AbortSignal, work: () => Promise<T>): Promise<CallResult<T>> {
  try {
    signal.throwIfAborted();
    return { kind: "succeeded", data: await work() };
  } catch (error) { return messagingFailure(error, effect, signal.aborted) as CallResult<T>; }
}
