import { randomUUID } from "node:crypto";
import type { ModelRunRequest, ModelRunResult, ModelRunEvent, ModelSource, ModelCompletion, ModelBlock } from "@atelier/sdk/contracts";
import { modelExpression, modelScope, type ModelSettings, type ToolOutcome } from "../shared/model.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import type { SystemPrompt } from "@atelier/sdk/contracts";
import type { ModelItem } from "../session/projection.ts";
import { executeCoreBatch, coreDeclarations } from "./core.ts";
import type { AgentCapabilities } from "./capabilities.ts";
import { ResponseBuffer } from "./response.ts";
import { synchronous } from "../plugins/synchronous.ts";

export interface ModelExecutionEnvironment {
  adapter: ModelAdapter;
  settings: ModelSettings;
  capabilities: AgentCapabilities;
  system: SystemPrompt;
  messages: ModelItem[];
}
/** 一次补全及完整工具批次。缓冲只在此次调用内存在，输出交给消费者，不接触时间轴。 */
export async function runModelRequest(request: ModelRunRequest, environment: Promise<ModelExecutionEnvironment>): Promise<ModelRunResult> {
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let deliveryFailed = false;
  const emit = (event: ModelRunEvent) => {
    if (deliveryFailed) return;
    try { synchronous(() => request.observer.event(structuredClone(event))); }
    catch { deliveryFailed = true; controller.abort(); }
  };
  const diagnostic = (code: string, message: string, level: "error" | "warning" = "error") => emit({ type: "diagnostic", code, message, level });
  let source: ModelSource | null = null;
  let responseId: string | null = null;
  let completion: ModelCompletion | null = null;
  const outcomes = new Map<string, ToolOutcome>();
  let callIds: string[] = [];
  let termination: { reason: "completed" } | { reason: "cancelled" } | { reason: "failed"; code: string } = { reason: "completed" };
  try {
    // 即使已取消也消费准备 Promise 的拒绝，避免遗留未处理异常。
    const { adapter, settings, capabilities, system, messages } = await environment;
    signal.throwIfAborted();
    source = { model: modelExpression(settings), adapter: adapter.version, scope: modelScope(settings) };
    responseId = randomUUID();
    const identity = { agentId: request.object.id, responseId, requestParentId: request.requestParentId, model: source.model, adapter: source.adapter, scope: source.scope };
    const prepared = adapter.prepare({ settings, system, messages, tools: settings.model.capabilities.tools ? coreDeclarations() : [] });
    const response = new ResponseBuffer(identity, node => {
      if (node.kind !== "thinking" && node.kind !== "text" && node.kind !== "toolcall") throw new ModelFailure("protocol", "Unexpected response block.");
      const { agentId: _agentId, model: _model, adapter: _adapter, scope: _scope,
        usage: _usage, finishReason: _finishReason, rawFinishReason: _raw, providerResponseId: _provider, ...block } = node;
      emit({ type: "block", block: { ...block, source: source! } as ModelBlock });
      // 响应状态机只需本次调用内的块身份；不保存或获取时间轴节点 ID。
      return String(node.ordinal);
    }, (ordinal, terminal) => {
      completion = terminal;
      emit({ type: "completion", responseId: responseId!, requestParentId: request.requestParentId, source: source!,
        ordinal: ordinal === null ? null : Number(ordinal), completion: terminal });
    });
    const progress = () => emit({ type: "progress", blocks: response.live().map(({ agentId: _agentId, ...block }) => block) });
    try {
      for await (const event of prepared.stream(signal)) {
        signal.throwIfAborted();
        response.accept(event);
        progress();
      }
      signal.throwIfAborted();
      const finish = response.finish;
      if (!finish) throw new ModelFailure("interrupted", "The model stream ended without a terminal response.");
      if (!["stop", "tool-calls"].includes(finish.reason)) throw new ModelFailure("incomplete", "The model response did not finish normally. No tools were executed.");
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
        });
      if (request.cache?.expectHit && finish.usage?.cacheRead === 0 && (finish.usage.input ?? 0) > 2048)
        diagnostic("cache_miss", "The provider reported no cached input for this request.", "warning");
      if (settings.model.contextWindow && (finish.usage?.input ?? 0) > settings.model.contextWindow * 0.8)
        diagnostic("context_budget", "Context usage is above 80% of the model's window.", "warning");
      if ([...outcomes.values()].some(outcome => outcome.kind === "unknown"))
        throw new ModelFailure("unknown_outcome", "A tool outcome is unknown. Automatic continuation stopped.");
      signal.throwIfAborted();
    } finally { response.close(); }
  } catch (error) {
    if (deliveryFailed) termination = { reason: "failed", code: "event_delivery" };
    else if (request.signal.aborted) {
      diagnostic("cancelled", "Execution was cancelled.", "warning"); termination = { reason: "cancelled" };
    } else {
      const code = error instanceof ModelFailure ? error.code : "execution_failed";
      diagnostic(code, error instanceof ModelFailure ? error.message : "Execution could not be completed.");
      termination = { reason: "failed", code };
    }
  } finally { emit({ type: "progress", blocks: [] }); }
  if (deliveryFailed) termination = { reason: "failed", code: "event_delivery" };
  return { ...termination, responseId, source, completion, tools: callIds.flatMap(id => outcomes.has(id) ? [structuredClone(outcomes.get(id)!)] : []) };
}
