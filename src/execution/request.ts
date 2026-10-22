import { randomUUID } from "node:crypto";
import {
  presentationSchema, type ModelRunRequest, type ModelRunResult, type ModelRunEvent, type ModelSource,
  type ModelCompletion, type ModelResponse, type SystemPrompt, type ModelRequestIdentity, type RequestTiming,
} from "@atelier/sdk/contracts";
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
/** 一次补全及完整工具批次。缓冲只在此次调用内存在，输出交给消费者，不接触时间线。 */
export async function runModelRequest(request: ModelRunRequest, environment: Promise<ModelExecutionEnvironment>, handover?: ContentLease): Promise<ModelRunResult> {
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
  let timing: RequestTiming | null = null;
  let responseMetadata: ModelResponse | null = null;
  const outcomes = new Map<string, ToolOutcome>();
  let callIds: string[] = [];
  let termination: { reason: "completed" } | { reason: "cancelled" } | { reason: "failed"; code: string } = { reason: "completed" };
  try {
    // 即使已取消也消费准备 Promise 的拒绝，避免遗留未处理异常。
    const { adapter, settings, capabilities, system, messages, userAgent, sessionId, topLevelTools = [] } = await environment;
    signal.throwIfAborted();
    source = { model: modelExpression(settings), adapter: adapter.version, scope: modelScope(settings) };
    responseId = randomUUID();
    const tools = settings.model.capabilities.tools ? coreDeclarations(topLevelTools) : [];
    const prepared = adapter.prepare({ settings, system, messages, userAgent, sessionId, tools });
    const extendCompletion = request.completionExtensions;
    const extensions = presentationSchema.array().parse(extendCompletion
      ? synchronous(() => extendCompletion(structuredClone({ system, tools }))) : []);
    // 平台只交付准备完整的块，终态随最高序号块保存；分组与投影由执行体负责。
    const response = new ResponseBuffer({ responseId, requestParentId: request.requestParentId, source }, block => {
      emit({ type: "block", block });
    }, extensions);
    const progress = () => emit({ type: "progress", blocks: response.live() });
    // 合并工具参数的高频解析；正文与思考仍即时发布，计时器不越过响应生命周期。
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
        // 适配层处理中止并交付此前取得的终态；工具批次开始前再检查取消。
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
      if (!finish) throw new ModelFailure("interrupted", "The model stream ended without a terminal response.");
      if (response.empty) throw new ModelFailure("empty_response", "The model response ended without any content blocks.");
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
        }, handover, topLevelTools);
      if (request.cache?.expectHit && finish.usage?.cacheRead === 0 && (finish.usage.input ?? 0) > 2048)
        diagnostic("cache_miss", "The provider reported no cached input for this request.", "warning");
      // 工具结局作为下一请求的反馈交付；代理生命周期由外层取消信号与控制器管理。
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
      emit({ type: "diagnostic", code, message: error instanceof ModelFailure ? error.message : "Execution could not be completed.", level: "error" });
      termination = { reason: "failed", code };
    }
  } finally { emit({ type: "progress", blocks: [] }); }
  if (deliveryFailed) termination = { reason: "failed", code: "event_delivery" };
  return { ...termination, responseId, source, completion, timing: completion?.timing ?? timing, response: responseMetadata,
    tools: callIds.flatMap(id => outcomes.has(id) ? [structuredClone(outcomes.get(id)!)] : []) };
}
