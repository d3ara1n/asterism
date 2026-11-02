import type { Usage } from "@asterism-app/sdk/contracts";

/** Anthropic streams input metering in message_start and cumulative output in message_delta, before any finish event.
 * Accumulating them keeps metering for responses that fail or end early. */
export function anthropicUsage() {
  let uncachedInput: number | null = null;
  return {
    observe(previous: Usage | null, value: unknown, includeOutput: boolean): Usage | null {
      if (!value || typeof value !== "object") return previous;
      const raw = value as Record<string, unknown>;
      const next = { ...(previous ?? { input: null, output: null, total: null, reasoning: null, cacheRead: null, cacheWrite: null }) };
      if (typeof raw.input_tokens === "number") uncachedInput = raw.input_tokens;
      if (typeof raw.cache_read_input_tokens === "number") next.cacheRead = raw.cache_read_input_tokens;
      if (typeof raw.cache_creation_input_tokens === "number") next.cacheWrite = raw.cache_creation_input_tokens;
      if (uncachedInput !== null) next.input = uncachedInput + (next.cacheRead ?? 0) + (next.cacheWrite ?? 0);
      // message_start reports input metering; its initial output count does not describe subsequent generation.
      if (includeOutput && typeof raw.output_tokens === "number") next.output = raw.output_tokens;
      const detail = raw.output_tokens_details as { thinking_tokens?: unknown } | undefined;
      if (typeof detail?.thinking_tokens === "number") next.reasoning = detail.thinking_tokens;
      // A total is reported only when both sides are known; summing a missing side would understate it.
      next.total = next.input === null || next.output === null ? null : next.input + next.output;
      return next;
    },
  };
}
