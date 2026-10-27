import type { RequestTiming } from "@asterism/sdk/contracts";
import { wrapLanguageModel, type LanguageModel } from "ai";
import type { ModelEvent } from "./contract.ts";

type ProviderPart = Awaited<ReturnType<ReturnType<typeof wrapLanguageModel>["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never;

/** From model invocation start to received terminal state; excludes subsequent caller tool execution. */
export class RequestTimer {
  private readonly startedAt = new Date().toISOString();
  private readonly started = performance.now();
  private firstOutputMs: number | null = null;
  private firstTextMs: number | null = null;
  private firstReasoningMs: number | null = null;
  private lastOutputMs: number | null = null;
  private outputChunks = 0;
  private result: RequestTiming | undefined;

  output(kind: "text" | "thinking" | "toolcall", delta: string): void {
    if (!delta.length || this.result) return;
    const elapsed = performance.now() - this.started;
    this.firstOutputMs ??= elapsed;
    if (kind === "text") this.firstTextMs ??= elapsed;
    if (kind === "thinking") this.firstReasoningMs ??= elapsed;
    this.lastOutputMs = elapsed;
    this.outputChunks++;
  }

  end(outcome: RequestTiming["outcome"]): RequestTiming {
    return this.result ??= {
      startedAt: this.startedAt, endedAt: new Date().toISOString(),
      durationMs: performance.now() - this.started,
      firstOutputMs: this.firstOutputMs, firstTextMs: this.firstTextMs,
      firstReasoningMs: this.firstReasoningMs, lastOutputMs: this.lastOutputMs,
      outputChunks: this.outputChunks, outcome,
    };
  }
}

/** Sample as the SDK receives provider content; consumer progress publication and stream finalization do not alter measurements. */
export function measureModel(model: Exclude<LanguageModel, string>, protocol: string, timer: RequestTimer) {
  let completion: Extract<ModelEvent, { type: "finish" }> | undefined;
  let responseId: string | undefined;
  const callsWithInput = new Set<string>();
  const measured = wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    wrapStream: async ({ doStream }) => {
      const result = await doStream();
      return { ...result, stream: result.stream.pipeThrough(new TransformStream<ProviderPart, ProviderPart>({
        transform(part, controller) {
          if (part.type === "text-delta") timer.output("text", part.delta);
          if (part.type === "reasoning-delta" && protocol !== "openai-responses") timer.output("thinking", part.delta);
          if (part.type === "raw" && protocol === "openai-responses" && part.rawValue && typeof part.rawValue === "object") {
            const raw = part.rawValue as Record<string, unknown>;
            if ((raw.type === "response.reasoning_text.delta" || raw.type === "response.reasoning_summary_text.delta") && typeof raw.delta === "string")
              timer.output("thinking", raw.delta);
          }
          if (part.type === "tool-input-delta") {
            timer.output("toolcall", part.delta);
            if (part.delta.length) callsWithInput.add(part.id);
          }
          if (part.type === "tool-call" && !callsWithInput.has(part.toolCallId)) timer.output("toolcall", part.input);
          if (part.type === "response-metadata") responseId = part.id ?? responseId;
          if (part.type === "error") timer.end("failed");
          if (part.type === "finish") {
            const u = part.usage;
            completion = { type: "finish", reason: part.finishReason.unified, rawFinishReason: part.finishReason.raw,
              responseId, timing: timer.end("completed"), usage: {
                input: u.inputTokens.total ?? null, output: u.outputTokens.total ?? null,
                total: u.inputTokens.total == null && u.outputTokens.total == null ? null : (u.inputTokens.total ?? 0) + (u.outputTokens.total ?? 0),
                reasoning: u.outputTokens.reasoning ?? null, cacheRead: u.inputTokens.cacheRead ?? null, cacheWrite: u.inputTokens.cacheWrite ?? null,
              } };
          }
          controller.enqueue(part);
        },
      })) };
    },
  } });
  return { model: measured, get completion() { return completion; } };
}
