import type { ModelRunResult } from "@asterism-app/sdk/contracts";

export interface AgentRequestOutcome {
  reason: ModelRunResult["reason"];
  hasTools: boolean;
  /** A failed record delivery ends execution without consuming another input. */
  halt?: boolean;
}
export interface AgentLoopPort {
  requestLimit(): number;
  request(index: number, signal: AbortSignal): Promise<AgentRequestOutcome>;
  completed(signal: AbortSignal): Promise<void>;
  consume(boundary: "request" | "turn"): boolean;
  limitReached(): void;
}
export type AgentLoopStatus = "completed" | "failed" | "awaiting";

/** Request iteration and turn boundaries are independent of conversation storage and workbench presentation. */
export async function runAgentLoop(port: AgentLoopPort, signal: AbortSignal): Promise<AgentLoopStatus> {
  let request = 0;
  for (;;) {
    signal.throwIfAborted();
    const limit = port.requestLimit();
    let status: AgentLoopStatus;
    if (request >= limit) {
      port.limitReached();
      status = "awaiting";
    } else {
      const result = await port.request(request, signal);
      request++;
      status = result.reason === "cancelled" ? "awaiting" : result.reason;
      if (result.halt) return status;
      if (signal.aborted || result.reason === "cancelled") return "awaiting";
      if (result.reason === "completed") {
        if (request < limit && port.consume("request")) continue;
        if (result.hasTools) continue;
        await port.completed(signal);
      }
    }
    signal.throwIfAborted();
    if (!port.consume("turn")) return status;
    request = 0;
  }
}
