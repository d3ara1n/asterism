/** 测试夹具：按通用记录节点构造 agent 与工作台记录，形状只在此维护。 */
import type { Json, ModelCompletion, ToolOutcome } from "@atelier/sdk/contracts";
import { Execution, Notice, UserMessage } from "@atelier/builtin-api/contracts";
import type { NewNode, SessionNode } from "../shared/session.ts";

export const agentSource = (id: string) => ({ plugin: "atelier.builtin", resource: { sessionId: "s", id, kind: "atelier.builtin/agent" } });
export const hostSource = null;
const modelSource = { model: "p/m", adapter: "test/1", scope: "s" };
type BlockOptions = { requestParentId?: string | null; complete?: boolean; continuation?: Json; completion?: ModelCompletion | null };

const record = (contract: string, data: Json, source: NewNode["source"]): NewNode =>
  ({ contract, data, source, model: null, recipient: null });
function block(agentId: string, responseId: string, ordinal: number, body: Record<string, Json>, options: BlockOptions = {}): NewNode {
  const complete = options.complete ?? true;
  return record(Execution.id, { type: "block", block: { responseId, ordinal, complete, requestParentId: options.requestParentId ?? null,
    continuation: options.continuation ?? null, source: modelSource, ...(options.completion ? { completion: options.completion } : {}), ...body } } as Json,
    agentSource(agentId));
}
export const text = (agentId: string, responseId: string, ordinal: number, value: string, options?: BlockOptions) =>
  block(agentId, responseId, ordinal, { kind: "text", text: value }, options);
export const thinking = (agentId: string, responseId: string, ordinal: number, value = "…", options?: BlockOptions & { summary?: string }) =>
  block(agentId, responseId, ordinal, { kind: "thinking", text: value, summary: options?.summary ?? "" }, options);
export const call = (agentId: string, responseId: string, ordinal: number, callId: string, extra: { name?: string; arguments?: Json; outcome?: ToolOutcome | null } & BlockOptions = {}) =>
  block(agentId, responseId, ordinal, { kind: "toolcall", callId, name: extra.name ?? "read", argumentsText: "{}", arguments: extra.arguments ?? {},
    outcome: (extra.outcome === undefined ? { kind: "succeeded", model: [{ kind: "text", text: callId }], data: null } : extra.outcome) as Json },
    { ...extra, complete: extra.complete ?? (extra.outcome !== null) });
export const message = (agentId: string, value: string, startsTurn = true): NewNode =>
  record(UserMessage.id, { startsTurn, parts: [{ kind: "text", text: value }] }, agentSource(agentId));
export const notice = (agentId: string | null, code: string, value: string, level: "info" | "warning" | "error" = "error"): NewNode =>
  record(Notice.id, { code, message: value, level }, agentId ? agentSource(agentId) : hostSource);
export const event = (type: string, data: Json, options: { source?: NewNode["source"]; model?: string | null; recipient?: string | null } = {}): NewNode =>
  ({ contract: type, data, source: options.source ?? hostSource, model: options.model ?? null, recipient: options.recipient ?? null });
export const created = (id: string, title: string, kind = "atelier.builtin/agent") => event("resource_created", { id, title, type: kind });
export const attached = (receiverId: string, resourceId: string, model: string | null = `${resourceId} attached`) =>
  event("resource_attached", { id: resourceId, receiverId }, { model, recipient: receiverId });
export const removed = (id: string) => event("object_removed", { id });
/** 构造带身份的完整节点，供不经存储的纯函数测试使用。 */
export const node = (id: string, parentId: string | null, value: NewNode, createdAt = "2026-10-10T10:00:00Z"): SessionNode =>
  ({ ...value, id, parentId, sessionId: "s", createdAt });
/** 测试读取：把通用记录节点展开为便于断言的扁平视图（kind 由契约与载荷推出），只用于测试。 */
export type FlatNode = SessionNode & { kind: "message" | "thinking" | "text" | "toolcall" | "notice" | "event" } & Record<string, any>;
export function flat(node: SessionNode): FlatNode {
  const data = (node.data ?? {}) as Record<string, any>;
  if (node.contract === UserMessage.id) return { ...node, kind: "message", parts: data.parts } as FlatNode;
  if (node.contract === Notice.id) return { ...node, ...data, kind: "notice" } as FlatNode;
  if (node.contract === Execution.id) {
    if (data.type === "block") return { ...node, ...data.block, source: node.source, kind: data.block.kind } as FlatNode;
    if (data.type === "diagnostic") return { ...node, ...data, kind: "notice" } as FlatNode;
  }
  return { ...node, kind: "event", type: node.contract } as FlatNode;
}
