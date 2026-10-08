import { randomUUID } from "node:crypto";
import { ConversationError, pathTo, type ConversationStore } from "../conversation/store.ts";
import { projectModel, type ExtensionRegistry } from "../conversation/projection.ts";
import type { InFlightTurn } from "../history/fold.ts";
import { modelScope, type ModelSettings, type ToolPart } from "../shared/conversation.ts";
import type { AgentConfiguration } from "../shared/configuration.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import { allowedTool, executeToolBatch, type RuntimeTool } from "./tools.ts";
import { composeSystemPrompt } from "../model/system-prompt.ts";

export interface RunOptions {
  store: ConversationStore; adapter: ModelAdapter; agent: AgentConfiguration; settings: ModelSettings; turn: InFlightTurn;
  tools: RuntimeTool[]; signal: AbortSignal; extensions?: ExtensionRegistry;
}
/** 一轮冻结授权，多次请求；所有执行事实提交成功后才推进到下一阶段。 */
export async function runAgent(options: RunOptions): Promise<void> {
  const { store, adapter, agent, settings, turn, tools, signal } = options;
  const system = composeSystemPrompt(agent);
  const selectedTools = settings.model.capabilities.tools ? tools.filter(t => allowedTool(agent, t.name)) : [];
  let activeNode: string | null = null;
  let turnStatus: "completed" | "failed" | "cancelled" = "completed";
  try {
    // 费用限额尚无价格契约，不能静默忽略用户已经设置的限制。
    if (agent.maxCost !== null) throw new ConversationError("unavailable", "Cost limits require model pricing support, which is not available yet.");
    const current = store.read();
    const bindingData = { bindingVersion: turn.binding_version, resources: turn.bindings };
    const currentPath = pathTo(current);
    const lastBindings = currentPath.slice(currentPath.findLastIndex(n => n.kind === "compaction") + 1)
      .findLast(n => n.kind === "extension" && n.extension === "weft.bindings");
    if (!lastBindings || lastBindings.kind !== "extension" || JSON.stringify(lastBindings.data) !== JSON.stringify(bindingData)) {
      store.append({ type: "node.appended", node: { id: randomUUID(), parentId: current.cursor, kind: "extension", createdAt: new Date().toISOString(),
        extension: "weft.bindings", version: 1, data: bindingData, model: "required", user: "omit" } });
    }
    const limit = agent.maxTurns ?? 32;
    for (let requestIndex = 0; requestIndex < limit; requestIndex++) {
      signal.throwIfAborted();
      const state = store.read();
      const prepared = adapter.prepare({ settings, system,
        messages: projectModel(state, options.extensions), tools: selectedTools.map(({ name, description, parameters }) => ({ name, description, parameters })) });
      const nodeId = randomUUID();
      activeNode = nodeId;
      store.append({ type: "node.appended", node: { id: nodeId, parentId: state.cursor, kind: "model", createdAt: new Date().toISOString(), turnId: turn.turn_id,
        request: { adapter: adapter.version, scope: modelScope(settings), historySeq: state.seq, bindingVersion: turn.binding_version },
        state: "streaming", parts: [], usage: null, finishReason: null, responseId: null, rawFinishReason: null, replay: null, error: null } });
      let finished = false;
      // 同一块的网络碎片合并成有序落盘片段；只发布已提交增量。
      let pending: { partId: string; delta: string } | null = null;
      let committedAt = performance.now();
      const flush = () => {
        if (pending) store.append({ type: "part.delta", nodeId, ...pending });
        pending = null;
        committedAt = performance.now();
      };
      try {
        for await (const event of prepared.stream(signal)) {
          signal.throwIfAborted();
          if (finished) throw new ModelFailure("protocol", "The provider emitted data after the response ended.");
          if (event.type === "part.delta") {
            if ((pending as { partId: string } | null)?.partId !== event.partId) flush();
            pending ??= { partId: event.partId, delta: "" };
            pending.delta += event.delta;
            if (pending.delta.length >= 1024 || performance.now() - committedAt >= 50) flush();
            continue;
          }
          flush();
          if (event.type === "part.start") store.append({ type: "part.started", nodeId, part: event.part });
          if (event.type === "part.end") store.append({ type: "part.ended", nodeId, partId: event.partId, arguments: event.arguments });
          if (event.type === "finish") {
            store.append({ type: "response.finished", nodeId, usage: event.usage, finishReason: event.reason, replay: event.replay, responseId: event.responseId, rawFinishReason: event.rawFinishReason });
            finished = true;
          }
        }
      } finally { flush(); }
      signal.throwIfAborted();
      if (!finished) throw new ModelFailure("interrupted", "The model stream ended without a terminal response.");
      const response = store.model(nodeId);
      const calls = response.parts.filter((p): p is ToolPart => p.kind === "tool");
      if (!["stop", "tool-calls"].includes(response.finishReason!)) throw new ModelFailure("incomplete", "The model response did not finish normally. No tools were executed.");
      await executeToolBatch(store, nodeId, calls, selectedTools, agent, turn, signal);
      signal.throwIfAborted();
      if (store.model(nodeId).parts.some(p => p.kind === "tool" && p.outcome?.kind === "unknown")) throw new ModelFailure("unknown_outcome", "A tool outcome is unknown. Automatic continuation stopped.");
      store.append({ type: "node.sealed", nodeId, state: "complete", error: null });
      activeNode = null;
      if (!calls.length) return;
    }
    throw new ModelFailure("request_limit", "The agent reached the model request limit. Continue explicitly to resume.");
  } catch (error) {
    turnStatus = signal.aborted ? "cancelled" : "failed";
    if (activeNode) {
      const node = store.model(activeNode);
      if (node.state === "tools") for (const part of node.parts) if (part.kind === "tool" && part.execution !== "settled") {
        store.append({ type: "tool.settled", nodeId: activeNode, partId: part.id,
          outcome: part.execution === "running" ? { kind: "unknown", message: "Tool execution stopped before its outcome was recorded." }
            : { kind: "cancelled", message: "The tool was not executed." } });
      }
      store.append({ type: "node.sealed", nodeId: activeNode, state: turnStatus === "cancelled" ? "cancelled" : "failed",
        error: { code: signal.aborted ? "cancelled" : error instanceof ModelFailure || error instanceof ConversationError ? error.code : "execution_failed",
          message: signal.aborted ? "Execution was cancelled." : error instanceof ModelFailure || error instanceof ConversationError ? error.message : "Execution could not be completed." } });
    }
    // 请求前的失败也需要持久化，不构造虚假的模型回复。
    if (!activeNode) store.history.append(store.branchId, { type: "execution_failed", payload: { agent_id: store.agentId, turn_id: turn.turn_id,
      code: signal.aborted ? "cancelled" : error instanceof ModelFailure || error instanceof ConversationError ? error.code : "execution_failed",
      message: error instanceof ModelFailure || error instanceof ConversationError ? error.message : "Execution could not be completed." } });
  } finally {
    store.history.endTurn(store.branchId, { turn_id: turn.turn_id, status: turnStatus });
  }
}
