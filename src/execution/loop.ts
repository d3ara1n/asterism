import { randomUUID } from "node:crypto";
import { modelExpression, modelScope, type Json, type ModelSettings, type ToolOutcome } from "../shared/model.ts";
import type { AgentConfiguration } from "../shared/configuration.ts";
import type { NewNode } from "../shared/session.ts";
import { ModelFailure, type ModelAdapter, type StreamPart } from "../model/contract.ts";
import { composeSystemPrompt } from "../model/system-prompt.ts";
import { projectForAgent } from "../session/projection.ts";
import { linkedResources } from "../session/fold.ts";
import type { SessionTree } from "../session/tree.ts";
import { allowedTool, executeToolBatch, type PendingCall, type RuntimeTool } from "./tools.ts";

export interface RunOptions {
  tree: SessionTree; sessionId: string; agentId: string; adapter: ModelAdapter; agent: AgentConfiguration; settings: ModelSettings;
  tools: RuntimeTool[]; signal: AbortSignal; changed?: () => void;
  /** 每次请求前即时读取环境文件（AGENTS.md）；不进会话树。 */
  context?: () => Promise<{ file: string; text: string }[]>;
}
interface Live { part: StreamPart; ordinal: number; text: string; arguments: Json; continuation: Json; done: boolean }

/** 代理控制器的一轮：流增量只在内存；块完成即落为节点；toolcall 取得结局后与结果一起落。 */
export async function runAgent(options: RunOptions): Promise<void> {
  const { tree, sessionId, agentId, adapter, agent, settings, tools, signal } = options;
  const append = (node: NewNode) => { tree.append(sessionId, node); try { options.changed?.(); } catch { /* 查询可恢复 */ } };
  const notice = (code: string, message: string, level: "error" | "warning" = "error") => append({ kind: "notice", agentId, level, code, message });
  const selected = settings.model.capabilities.tools ? tools.filter(t => allowedTool(agent, t.name)) : [];
  const base = { agentId, adapter: adapter.version, scope: modelScope(settings) };
  try {
    if (agent.maxCost !== null) throw new ModelFailure("unavailable", "Cost limits require model pricing support, which is not available yet.");
    for (let request = 0; request < (agent.maxTurns ?? 32); request++) {
      signal.throwIfAborted();
      const path = tree.path(sessionId);
      const prepared = adapter.prepare({ settings, system: composeSystemPrompt(agent, await (options.context?.() ?? Promise.resolve([]))), messages: projectForAgent(path, agentId),
        tools: selected.map(({ name, description, parameters }) => ({ name, description, parameters })) });
      const responseId = randomUUID();
      const live = new Map<string, Live>();
      let ordinal = 0;
      let finish: { reason: string; usage: import("../shared/model.ts").Usage | null } | null = null;
      const emitBlock = (l: Live, complete: boolean) => {
        if (l.part.kind === "toolcall") return; // toolcall 待结果后落
        append({ ...base, kind: l.part.kind, responseId, ordinal: l.ordinal, complete, continuation: l.continuation, text: l.text });
      };
      try {
        for await (const event of prepared.stream(signal)) {
          signal.throwIfAborted();
          if (finish) throw new ModelFailure("protocol", "The provider emitted data after the response ended.");
          if (event.type === "part.start") live.set(event.part.id, { part: event.part, ordinal: ordinal++, text: "", arguments: null, continuation: null, done: false });
          else if (event.type === "part.delta") { const l = live.get(event.partId); if (l) l.text += event.delta; }
          else if (event.type === "part.end") {
            const l = live.get(event.partId);
            if (!l) continue;
            l.done = true; l.arguments = event.arguments ?? null; l.continuation = event.continuation ?? null;
            emitBlock(l, true);
          } else finish = { reason: event.reason, usage: event.usage };
        }
        if (!finish) throw new ModelFailure("interrupted", "The model stream ended without a terminal response.");
      } catch (error) {
        // 未完成的文本/思考与工具参数填充留档，不发给模型
        for (const l of live.values()) {
          if (l.done && l.part.kind !== "toolcall") continue;
          if (l.part.kind === "toolcall") append({ ...base, kind: "toolcall", responseId, ordinal: l.ordinal, complete: false, continuation: l.continuation,
            callId: l.part.callId, name: l.part.name, argumentsText: l.text, arguments: l.arguments, outcome: null });
          else emitBlock(l, false);
        }
        throw error;
      }
      const calls = [...live.values()].filter(l => l.part.kind === "toolcall");
      if (!["stop", "tool-calls"].includes(finish.reason)) {
        for (const l of calls) appendCall(l, null, false);
        append({ kind: "response_end", agentId, responseId, usage: finish.usage, finishReason: finish.reason, model: modelExpression(settings) });
        throw new ModelFailure("incomplete", "The model response did not finish normally. No tools were executed.");
      }
      const linked = linkedResources(tree.path(sessionId), agentId);
      const byCall = new Map(calls.map(l => [(l.part as { callId: string }).callId, l]));
      let unknown = false;
      await executeToolBatch(calls.map(l => ({ callId: (l.part as { callId: string }).callId, name: (l.part as { name: string }).name, arguments: l.arguments })),
        selected, agent, linked, signal, (call: PendingCall, outcome: ToolOutcome) => {
          if (outcome.kind === "unknown") unknown = true;
          appendCall(byCall.get(call.callId)!, outcome, true);
        });
      append({ kind: "response_end", agentId, responseId, usage: finish.usage, finishReason: finish.reason, model: modelExpression(settings) });
      // 前缀缓存未命中（非首次请求、输入较大却零读取）时提示用户；环境变化导致失效属预期，只做通知。
      if (request > 0 && finish.usage?.cacheRead === 0 && (finish.usage.input ?? 0) > 2048) notice("cache_miss", "The provider reported no cached input for this request.", "warning");
      const window = settings.model.contextWindow;
      if (window && (finish.usage?.input ?? 0) > window * 0.8) notice("context_budget", "Context usage is above 80% of the model's window.", "warning");
      if (unknown) throw new ModelFailure("unknown_outcome", "A tool outcome is unknown. Automatic continuation stopped.");
      signal.throwIfAborted();
      if (!calls.length) return;
      function appendCall(l: Live, outcome: ToolOutcome | null, complete: boolean) {
        const p = l.part as { callId: string; name: string };
        append({ ...base, kind: "toolcall", responseId, ordinal: l.ordinal, complete, continuation: l.continuation,
          callId: p.callId, name: p.name, argumentsText: l.text, arguments: l.arguments, outcome });
      }
    }
    throw new ModelFailure("request_limit", "The agent reached the model request limit. Continue explicitly to resume.");
  } catch (error) {
    if (signal.aborted) notice("cancelled", "Execution was cancelled.", "warning");
    else notice(error instanceof ModelFailure ? error.code : "execution_failed",
      error instanceof ModelFailure ? error.message : "Execution could not be completed.");
  }
}
