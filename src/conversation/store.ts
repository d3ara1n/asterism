import { conversationMutationSchema, toolOutcomeSchema, type ConversationMutation, type ConversationNode, type ModelNode } from "../shared/conversation.ts";
import type { HistoryKernel } from "../history/kernel.ts";
import type { EventBody, StoredEvent } from "../history/schema.ts";
import { canContinue } from "../shared/conversation-view.ts";
export { canContinue } from "../shared/conversation-view.ts";

export class ConversationError extends Error {
  constructor(readonly code: "invalid_request" | "not_found" | "conflict" | "unavailable", message: string) { super(message); }
}
export interface ConversationState { created: boolean; cursor: string | null; nodes: Map<string, ConversationNode>; seq: number }
export function pathTo(state: ConversationState, cursor = state.cursor): ConversationNode[] {
  const path: ConversationNode[] = [];
  const seen = new Set<string>();
  while (cursor !== null) {
    if (seen.has(cursor)) throw new ConversationError("conflict", "Conversation contains a cycle.");
    seen.add(cursor);
    const node = state.nodes.get(cursor);
    if (!node) throw new ConversationError("not_found", "Conversation node not found.");
    path.unshift(node); cursor = node.parentId;
  }
  return path;
}
function requireSafePath(state: ConversationState, cursor: string | null): void {
  if (pathTo(state, cursor).some(node => !canContinue(node))) throw new ConversationError("conflict", "Cannot continue from an incomplete execution. Select an earlier complete node.");
}
export function applyMutation(state: ConversationState, mutation: ConversationMutation): void {
  if (mutation.type === "created") {
    if (state.created) throw new ConversationError("conflict", "Conversation already exists.");
    state.created = true; return;
  }
  if (!state.created) throw new ConversationError("not_found", "Conversation not found.");
  if (mutation.type === "cursor.selected") {
    requireSafePath(state, mutation.nodeId); state.cursor = mutation.nodeId; return;
  }
  if (mutation.type === "node.appended") {
    const node = mutation.node;
    if (state.nodes.has(node.id) || node.parentId !== state.cursor) throw new ConversationError("conflict", "Invalid conversation parent or duplicate node.");
    requireSafePath(state, node.parentId);
    if (node.kind === "model" && (node.state !== "streaming" || node.parts.length || node.usage || node.replay || node.error || node.finishReason)) {
      throw new ConversationError("invalid_request", "A model node must start empty.");
    }
    state.nodes.set(node.id, node); state.cursor = node.id; return;
  }
  const node = state.nodes.get(mutation.nodeId);
  if (!node || node.kind !== "model") throw new ConversationError("not_found", "Model node not found.");
  if (node.id !== state.cursor || !["streaming", "tools"].includes(node.state)) throw new ConversationError("conflict", "Model node is already sealed or not current.");
  if (mutation.type === "node.sealed") {
    if (mutation.state === "complete" && (node.state !== "tools" || node.parts.some(p => !p.complete || p.kind === "tool" && (p.execution !== "settled" || !p.outcome || p.outcome.kind === "unknown")))) {
      throw new ConversationError("conflict", "Cannot seal incomplete model output or unresolved tools.");
    }
    node.state = mutation.state; node.error = mutation.error; return;
  }
  if (mutation.type === "response.finished") {
    if (node.state !== "streaming" || node.parts.some(p => !p.complete)) throw new ConversationError("conflict", "Response contains unfinished parts.");
    node.state = "tools"; node.usage = mutation.usage; node.finishReason = mutation.finishReason; node.replay = mutation.replay;
    node.responseId = mutation.responseId ?? null; node.rawFinishReason = mutation.rawFinishReason ?? null; return;
  }
  if (mutation.type === "part.started") {
    if (node.state !== "streaming" || node.parts.some(p => p.id === mutation.part.id || p.kind === "tool" && mutation.part.kind === "tool" && p.callId === mutation.part.callId)) {
      throw new ConversationError("conflict", "Duplicate part or invalid response state.");
    }
    const part = mutation.part;
    if (part.complete || part.kind === "tool" && (part.execution !== "proposed" || part.outcome !== null)) throw new ConversationError("invalid_request", "Invalid initial part state.");
    node.parts.push(part); return;
  }
  const part = node.parts.find(p => p.id === mutation.partId);
  if (!part) throw new ConversationError("not_found", "Response part not found.");
  if (mutation.type === "part.delta" || mutation.type === "part.ended") {
    if (node.state !== "streaming" || part.complete) throw new ConversationError("conflict", "Response part is already complete.");
    if (mutation.type === "part.delta") {
      if (part.kind === "tool") part.argumentsText += mutation.delta;
      else part.text += mutation.delta;
    } else {
      part.complete = true;
      if (part.kind === "tool") part.arguments = mutation.arguments ?? null;
    }
    return;
  }
  if (node.state !== "tools" || part.kind !== "tool" || !part.complete || part.execution === "settled") {
    throw new ConversationError("conflict", "Tool is not executable.");
  }
  if (mutation.type === "tool.started") {
    if (part.execution !== "proposed") throw new ConversationError("conflict", "Tool is already running.");
    part.execution = "running";
  } else {
    part.execution = "settled"; part.outcome = mutation.outcome;
  }
}
export function foldConversation(events: StoredEvent[], agentId: string): ConversationState {
  const state: ConversationState = { created: false, cursor: null, nodes: new Map(), seq: 0 };
  for (const event of events) {
    state.seq = event.seq;
    if (event.type === "conversation_event" && event.payload.agentId === agentId) applyMutation(state, structuredClone(event.payload.mutation));
  }
  return state;
}

/** 节点树是事件的可重建投影；所有变更先校验，再追加，绝不更新旧记录。 */
export class ConversationStore {
  constructor(readonly history: HistoryKernel, readonly branchId: string, readonly agentId: string, private readonly changed: (seq: number) => void = () => {}) {}
  read(atSeq?: number): ConversationState {
    const events = this.history.eventsOn(this.branchId);
    if (atSeq !== undefined && !events.some(e => e.seq === atSeq)) throw new ConversationError("not_found", "History position not found.");
    return foldConversation(atSeq === undefined ? events : events.filter(e => e.seq <= atSeq), this.agentId);
  }
  append(raw: ConversationMutation, preceding: EventBody[] = []): void {
    const mutation = conversationMutationSchema.parse(raw);
    applyMutation(this.read(), structuredClone(mutation));
    const event = this.history.atomic(() => {
      for (const body of preceding) this.history.append(this.branchId, body);
      return this.history.append(this.branchId, { type: "conversation_event", payload: { version: 1, agentId: this.agentId, mutation } });
    });
    try { this.changed(event.seq); } catch { /* 通知失败不改变已提交事实；消费方可重新查询。 */ }
  }
  model(id: string): ModelNode {
    const node = this.read().nodes.get(id);
    if (!node || node.kind !== "model") throw new ConversationError("not_found", "Model node not found.");
    return node;
  }
  recover(): void {
    const events = this.history.eventsOn(this.branchId);
    for (const node of this.read().nodes.values()) {
      if (node.kind !== "model" || !["streaming", "tools"].includes(node.state)) continue;
      if (node.state === "tools") for (const part of node.parts) {
        if (part.kind !== "tool" || part.execution === "settled") continue;
        const started = events.find(e => {
          if (e.type !== "operation_started" || e.payload.agent_id !== this.agentId) return false;
          const params = e.payload.params as { nodeId?: string; callId?: string } | null;
          return params?.nodeId === node.id && params?.callId === part.callId;
        });
        const finished = started?.type === "operation_started"
          ? events.find(e => e.type === "operation_finished" && e.payload.operation_id === started.payload.operation_id) : null;
        const recorded = toolOutcomeSchema.safeParse(finished?.type === "operation_finished" ? finished.payload.result : null);
        this.append({ type: "tool.settled", nodeId: node.id, partId: part.id,
          outcome: recorded.success ? recorded.data : part.execution === "running"
            ? { kind: "unknown", message: "The process stopped before the tool outcome was recorded." }
            : { kind: "cancelled", message: "The tool was not started before the process stopped." } });
      }
      this.append({ type: "node.sealed", nodeId: node.id, state: "interrupted", error: { code: "interrupted", message: "The previous execution was interrupted. No work was replayed." } });
    }
  }
}
