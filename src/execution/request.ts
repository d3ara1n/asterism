import { randomUUID } from "node:crypto";
import {
  presentationSchema, type ModelRunRequest, type ModelRunResult, type ModelRunEvent, type ModelSource,
  type ModelCompletion, type ModelResponse, type SystemPrompt, type ModelRequestIdentity, type RequestTiming, type ModelTermination,
  describeError, type ErrorDetails, type ModelTools, type Usage,
} from "@asterism-app/sdk/contracts";
import { modelExpression, modelScope, type ModelSettings, type ToolOutcome } from "../shared/model.ts";
import { ModelFailure, type ModelAdapter, type ResolvedModelItem } from "../model/contract.ts";
import { finishToolResult } from "../tools/result.ts";
import { ResponseBuffer } from "./response.ts";
import { synchronous } from "../plugins/synchronous.ts";

export interface ModelExecutionEnvironment extends ModelRequestIdentity {
  adapter: ModelAdapter;
  settings: ModelSettings;
  tools?: ModelTools;
  system: SystemPrompt;
  messages: ResolvedModelItem[];
}
const unavailableTools: ModelTools = {
  declarations: [],
  async execute(calls, _signal, settle) {
    for (const call of calls) settle(call, finishToolResult({
      kind: "rejected", error: { code: "operation_unavailable", message: "This operation is unavailable." },
    }));
  },
};
/** One completion and its entire tool batch. Buffers exist only for this call; outputs go to consumers without touching the timeline. */
export async function runModelRequest(request: Pick<ModelRunRequest, "signal" | "observer" | "requestParentId" | "cache" | "completionExtensions">,
  environment: Promise<ModelExecutionEnvironment>): Promise<ModelRunResult> {
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let deliveryFailed = false;
  let deliveryError: ErrorDetails | undefined;
  const emit = (event: ModelRunEvent) => {
    if (deliveryFailed) return;
    try { synchronous(() => request.observer.event(structuredClone(event))); }
    catch (error) {
      deliveryFailed = true;
      deliveryError = describeError(error);
      console.error("Model event delivery failed.", { type: event.type,
        ...(event.type === "block" ? { kind: event.block.kind, responseId: event.block.responseId, ordinal: event.block.ordinal } : {}),
        details: deliveryError });
      controller.abort();
    }
  };
  const diagnostic = (code: string, message: string, level: "error" | "warning" = "error") => emit({ type: "diagnostic", origin: "model", code, message, level });
  let source: ModelSource | null = null;
  let responseId: string | null = null;
  let completion: ModelCompletion | null = null;
  let timing: RequestTiming | null = null;
  let usage: Usage | null = null;
  let providerResponseId: string | undefined;
  let response: ResponseBuffer | undefined;
  let generationCompleted = false;
  let generation: ModelTermination = { reason: "completed" };
  let failureDiagnostic: Extract<ModelRunEvent, { type: "diagnostic" }> | undefined;
  let responseMetadata: ModelResponse | null = null;
  const outcomes = new Map<string, ToolOutcome>();
  let callIds: string[] = [];
  let termination: { reason: "completed" } | { reason: "cancelled" } | { reason: "failed"; code: string; details?: ErrorDetails; retryable?: boolean } = { reason: "completed" };
  try {
    // Consume preparation Promise rejections even after cancellation to avoid unhandled exceptions.
    const { adapter, settings, system, messages, userAgent, sessionId, tools: suppliedTools } = await environment;
    const execution = settings.model.capabilities.tools ? suppliedTools ?? unavailableTools : unavailableTools;
    signal.throwIfAborted();
    source = { model: modelExpression(settings), adapter: adapter.format(settings), scope: modelScope(settings) };
    responseId = randomUUID();
    const tools = [...execution.declarations];
    const prepared = adapter.prepare({ settings, system, messages, userAgent, sessionId, tools });
    const extendCompletion = request.completionExtensions;
    const extensions = presentationSchema.array().parse(extendCompletion
      ? synchronous(() => extendCompletion(structuredClone({ system, tools }))) : []);
    // The platform delivers only fully prepared blocks, saving terminal state with the highest-index block; the executor owns grouping and projection.
    const buffer = response = new ResponseBuffer({ responseId, requestParentId: request.requestParentId, source }, (block, type) => {
      if (type !== "block" && block.kind === "toolcall") emit({ type, block });
      else emit({ type: "block", block });
    }, extensions);
    const progress = () => emit({ type: "progress", blocks: buffer.live() });
    // Materialize progress once per display batch; terminal events flush before finalization.
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingProgress = Promise.resolve();
    const flushProgress = () => {
      clearTimeout(progressTimer);
      progressTimer = undefined;
      pendingProgress = pendingProgress.then(async () => {
        await buffer.preview((name, args) => execution.preview?.(name, args) ?? {});
        progress();
      });
      return pendingProgress;
    };
    try {
      for await (const event of prepared.stream(signal)) {
        if (event.type === "finish") responseMetadata = event.response ?? null;
        // The adapter handles aborts and delivers previously acquired terminal state; check cancellation again before the tool batch starts.
        buffer.accept(event);
        if (event.type === "part.delta") {
          progressTimer ??= setTimeout(() => {
            void flushProgress().catch(error => controller.abort(error));
          }, 32);
        } else await flushProgress();
      }
      signal.throwIfAborted();
      const finish = buffer.finish;
      if (!finish) throw new ModelFailure("interrupted", "The model stream ended without a terminal response.", undefined, "model", true);
      if (buffer.empty) throw new ModelFailure("empty_response", "The model response ended without any content blocks.", undefined, "model", true);
      if (!["stop", "tool-calls"].includes(finish.reason)) throw new ModelFailure("incomplete",
        `The model response ended with finish reason "${finish.reason}"${finish.rawFinishReason ? ` (${finish.rawFinishReason})` : ""}. No tools were executed.`,
        undefined, "model", finish.reason === "error" || finish.reason === "interrupted");
      await flushProgress();
      // Cancellation before publication leaves no tool input that looks submitted for execution.
      signal.throwIfAborted();
      generationCompleted = true;
      completion = buffer.terminate(generation);
      buffer.seal(completion);
      // A failed tool.begin write aborts through the delivery controller; never execute an input that was not saved.
      signal.throwIfAborted();
      const calls = buffer.calls();
      callIds = calls.map(call => call.part.callId);
      const byCall = new Map(calls.map(call => [call.part.callId, call]));
      await execution.execute(calls.map(call => ({ callId: call.part.callId, name: call.part.name, arguments: call.arguments })),
        signal, (call, outcome) => {
          outcomes.set(call.callId, outcome);
          buffer.settle(byCall.get(call.callId)!, outcome); progress();
        }, {
          prepared(call, info) { buffer.prepare(byCall.get(call.callId)!, info); progress(); },
          started(call, info) { buffer.start(byCall.get(call.callId)!, info); progress(); },
          published(call, data) { buffer.publish(byCall.get(call.callId)!, data); progress(); },
        });
      if (request.cache?.expectHit && finish.usage?.cacheRead === 0 && (finish.usage.input ?? 0) > 2048)
        diagnostic("cache_miss", "The provider reported no cached input for this request.", "warning");
      // Deliver tool outcomes as feedback for the next request; the outer cancellation signal and controller manage the agent lifetime.
      signal.throwIfAborted();
    } finally {
      await flushProgress();
    }
  } catch (error) {
    if (error instanceof ModelFailure && error.response) responseMetadata = error.response;
    if (error instanceof ModelFailure && error.timing) timing = error.timing;
    if (error instanceof ModelFailure) { usage = error.usage ?? null; providerResponseId = error.providerResponseId; }
    if (deliveryFailed) termination = { reason: "failed", code: "event_delivery" };
    else if (request.signal.aborted) {
      failureDiagnostic = { type: "diagnostic", origin: "model", code: "cancelled", message: "Execution was cancelled.", level: "warning" };
      termination = { reason: "cancelled" };
      if (!generationCompleted) generation = { reason: "cancelled" };
    } else {
      const code = error instanceof ModelFailure ? error.code : "execution_failed";
      const details = describeError(error);
      const origin = error instanceof ModelFailure ? error.origin : "software";
      const message = error instanceof Error ? error.message : details.message;
      const retryable = !generationCompleted && error instanceof ModelFailure && error.retryable;
      failureDiagnostic = { type: "diagnostic", origin, code, message, level: "error", details };
      termination = { reason: "failed", code, details, retryable };
      if (!generationCompleted) generation = { reason: "failed", origin, code, message, details, retryable };
    }
  } finally {
    if (response) {
      completion ??= response.terminate(generation, { timing, usage, providerResponseId });
      response.close(completion);
    }
    if (failureDiagnostic) emit({ ...failureDiagnostic, ...(responseId ? { responseId } : {}) });
    emit({ type: "progress", blocks: [] });
  }
  if (deliveryFailed) termination = { reason: "failed", code: "event_delivery", details: deliveryError };
  return { ...termination, responseId, source, completion, timing: completion?.timing ?? timing, response: responseMetadata,
    tools: callIds.flatMap(id => outcomes.has(id) ? [structuredClone(outcomes.get(id)!)] : []) };
}
