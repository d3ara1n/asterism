import type { ErrorDetails, ModelRunResult } from "@asterism-app/sdk/contracts";
import { setTimeout } from "node:timers/promises";
import { nextRetry, retryDelay } from "./retry.ts";

export interface AgentRequestOutcome {
  reason: ModelRunResult["reason"];
  hasTools: boolean;
  /** A failed record delivery ends execution without consuming another input. */
  halt?: boolean;
  retryable?: boolean;
  details?: ErrorDetails;
}
export interface AgentLoopPort {
  /** Requests allowed per turn; omitted means unbounded. */
  requestLimit?(): number;
  request(index: number, signal: AbortSignal): Promise<AgentRequestOutcome>;
  completed(signal: AbortSignal): Promise<void>;
  consume(): boolean;
  /** Decides whether to continue with another turn after the current outcome is known. */
  nextTurn(reason: AgentLoopStatus): boolean;
  retry?: { maxRetries: number; waiting?(attempt: number, resumeAt: number): void; requesting?(attempt: number): void };
}
export type AgentLoopStatus = "completed" | "failed" | "cancelled" | "limited";

/** Request iteration and turn boundaries are independent of conversation storage and workbench presentation. */
export async function runAgentLoop(port: AgentLoopPort, signal: AbortSignal): Promise<AgentLoopStatus> {
  let request = 0, retries = 0;
  for (;;) {
    signal.throwIfAborted();
    const limit = port.requestLimit?.() ?? Infinity;
    let status: AgentLoopStatus;
    if (request >= limit) status = "limited";
    else {
      port.retry?.requesting?.(retries);
      const result = await port.request(request, signal);
      request++;
      status = result.reason;
      if (result.halt) return status;
      if (signal.aborted || result.reason === "cancelled") return "cancelled";
      const retry = nextRetry(result, retries, port.retry?.maxRetries ?? 0, limit - request);
      if (retry !== null) {
        retries = retry;
        const delay = retryDelay(result.details, retries);
        port.retry?.waiting?.(retries, Date.now() + delay);
        await setTimeout(delay, undefined, { signal });
        port.consume();
        continue;
      }
      retries = 0;
      if (result.reason === "completed") {
        if (request < limit && port.consume()) continue;
        if (result.hasTools) continue;
        await port.completed(signal);
      }
    }
    signal.throwIfAborted();
    if (!port.nextTurn(status)) return status;
    request = 0;
    retries = 0;
  }
}
