import { randomUUID } from "node:crypto";
import {
  presentationSchema, type ModelRunRequest, type ModelRunResult, type ModelRunEvent, type ModelSource,
  type ModelCompletion, type ModelResponse, type SystemPrompt, type ModelRequestIdentity, type RequestTiming,
  describeError, type ErrorDetails,
} from "@asterism/sdk/contracts";
import { modelExpression, modelScope, type ModelSettings, type ToolOutcome } from "../shared/model.ts";
import { ModelFailure, type ModelAdapter, type ResolvedModelItem } from "../model/contract.ts";
import { executeCoreBatch, coreDeclarations, previewCoreCall } from "./core.ts";
import type { AgentCapabilities } from "./capabilities.ts";
import { ResponseBuffer } from "./response.ts";
import { synchronous } from "../plugins/synchronous.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import type { BoundTopLevelTool } from "../plugins/top-level-tools.ts";

export interface ModelExecutionEnvironment extends ModelRequestIdentity {
  adapter: ModelAdapter;
  settings: ModelSettings;
  capabilities: AgentCapabilities;
  topLevelTools?: readonly BoundTopLevelTool[];
  system: SystemPrompt;
  messages: ResolvedModelItem[];
}
/** One completion and its entire tool batch. Buffers exist only for this call; outputs go to consumers without touching the timeline. */
export async function runModelRequest(request: ModelRunRequest, environment: Promise<ModelExecutionEnvironment>, handover?: ContentLease): Promise<ModelRunResult> {
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
  let responseMetadata: ModelResponse | null = null;
  const outcomes = new Map<string, ToolOutcome>();
  let callIds: string[] = [];
  let termination: { reason: "completed" } | { reason: "cancelled" } | { reason: "failed"; code: string; details?: ErrorDetails } = { reason: "completed" };
  try {
    // Consume preparation Promise rejections even after cancellation to avoid unhandled exceptions.
    const { adapter, settings, capabilities, system, messages, userAgent, sessionId, topLevelTools = [] } = await environment;
    signal.throwIfAborted();
    source = { model: modelExpression(settings), adapter: adapter.version, scope: modelScope(settings) };
    responseId = randomUUID();
    const tools = settings.model.capabilities.tools ? coreDeclarations(topLevelTools) : [];
    const prepared = adapter.prepare({ settings, system, messages, userAgent, sessionId, tools });
    const extendCompletion = request.completionExtensions;
    const extensions = presentationSchema.array().parse(extendCompletion
      ? synchronous(() => extendCompletion(structuredClone({ system, tools }))) : []);
    // The platform delivers only fully prepared blocks, saving terminal state with the highest-index block; the executor owns grouping and projection.
    const response = new ResponseBuffer({ responseId, requestParentId: request.requestParentId, source }, block => {
      emit({ type: "block", block });
    }, extensions);
    const progress = () => emit({ type: "progress", blocks: response.live() });
    // Coalesce frequent tool-argument parsing while publishing text and reasoning immediately; the timer stays within the response lifetime.
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingProgress = Promise.resolve();
    const flushProgress = () => {
      clearTimeout(progressTimer);
      progressTimer = undefined;
      pendingProgress = pendingProgress.then(async () => {
        await response.preview((name, args) => previewCoreCall(name, args, capabilities, topLevelTools));
        progress();
      });
      return pendingProgress;
    };
    try {
      for await (const event of prepared.stream(signal)) {
        if (event.type === "finish") responseMetadata = event.response ?? null;
        // The adapter handles aborts and delivers previously acquired terminal state; check cancellation again before the tool batch starts.
        response.accept(event);
        if (event.type === "part.delta") {
          if (response.isToolInput(event.partId)) progressTimer ??= setTimeout(() => {
            void flushProgress().catch(error => controller.abort(error));
          }, 50);
          else progress();
        } else await flushProgress();
      }
      signal.throwIfAborted();
      const finish = response.finish;
      if (!finish) throw new ModelFailure("interrupted", "The model stream ended without a terminal response.", undefined, "model");
      if (response.empty) throw new ModelFailure("empty_response", "The model response ended without any content blocks.", undefined, "model");
      if (!["stop", "tool-calls"].includes(finish.reason)) throw new ModelFailure("incomplete",
        `The model response ended with finish reason "${finish.reason}"${finish.rawFinishReason ? ` (${finish.rawFinishReason})` : ""}. No tools were executed.`,
        undefined, "model");
      const calls = response.calls();
      callIds = calls.map(call => call.part.callId);
      const byCall = new Map(calls.map(call => [call.part.callId, call]));
      await executeCoreBatch(calls.map(call => ({ callId: call.part.callId, name: call.part.name, arguments: call.arguments })),
        settings.model.capabilities.tools ? capabilities : null, signal, (call, outcome) => {
          outcomes.set(call.callId, outcome);
          response.settle(byCall.get(call.callId)!, outcome); progress();
        }, {
          prepared(call, info) { response.prepare(byCall.get(call.callId)!, info); progress(); },
          started(call, info) { response.start(byCall.get(call.callId)!, info); progress(); },
          published(call, data) { response.publish(byCall.get(call.callId)!, data); progress(); },
        }, handover, topLevelTools);
      if (request.cache?.expectHit && finish.usage?.cacheRead === 0 && (finish.usage.input ?? 0) > 2048)
        diagnostic("cache_miss", "The provider reported no cached input for this request.", "warning");
      // Deliver tool outcomes as feedback for the next request; the outer cancellation signal and controller manage the agent lifetime.
      signal.throwIfAborted();
    } finally {
      try { await flushProgress(); }
      finally { response.close(); completion = response.completion; }
    }
  } catch (error) {
    if (error instanceof ModelFailure && error.response) responseMetadata = error.response;
    if (error instanceof ModelFailure && error.timing) timing = error.timing;
    if (deliveryFailed) termination = { reason: "failed", code: "event_delivery" };
    else if (request.signal.aborted) {
      diagnostic("cancelled", "Execution was cancelled.", "warning"); termination = { reason: "cancelled" };
    } else {
      const code = error instanceof ModelFailure ? error.code : "execution_failed";
      const details = describeError(error);
      emit({ type: "diagnostic", origin: error instanceof ModelFailure ? error.origin : "software",
        code, message: error instanceof Error ? error.message : details.message, level: "error", details });
      termination = { reason: "failed", code, details };
    }
  } finally { emit({ type: "progress", blocks: [] }); }
  if (deliveryFailed) termination = { reason: "failed", code: "event_delivery", details: deliveryError };
  return { ...termination, responseId, source, completion, timing: completion?.timing ?? timing, response: responseMetadata,
    tools: callIds.flatMap(id => outcomes.has(id) ? [structuredClone(outcomes.get(id)!)] : []) };
}
