import { MessagingError, type CallResult } from "@asterism-app/sdk/runtime";
import type { Json } from "@asterism-app/sdk/contracts";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Preparation has not contacted the platform's message-delivery endpoint. Keep its original error classification. */
class UnsentMessageError extends MessagingError {
  constructor(cause: unknown) {
    super(cause instanceof MessagingError ? cause.code : "request_failed", message(cause), {
      cause, ...(cause instanceof MessagingError && cause.retryAfterMs !== undefined ? { retryAfterMs: cause.retryAfterMs } : {}),
    });
  }
}

export async function prepareSend<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  try { return await work(); }
  catch (error) {
    signal.throwIfAborted();
    throw definitelyNotSent(error) ? error : new UnsentMessageError(error);
  }
}

/**
 * Preparation failures are explicitly unsent. Other MessagingErrors describe refusals except request_failed without a
 * retry delay, which may have occurred after delivery. Rate-limit delays accompany refused requests.
 */
export function definitelyNotSent(error: unknown): boolean {
  return error instanceof UnsentMessageError ||
    error instanceof MessagingError && (error.code !== "request_failed" || error.retryAfterMs !== undefined);
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
