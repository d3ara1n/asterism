import { z } from "zod";
import { agentSelectionSchema, jsonSchema, toolOutcomeSchema, usageSchema } from "./model.ts";
import { thinkingSchema } from "./configuration.ts";

const id = z.string().min(1).max(160);
/** 会话树节点共有字段：父指针组织分支，agentId 标明归属代理（事件与通知可无归属）。 */
const base = { id, sessionId: id, parentId: id.nullable(), createdAt: z.string() };
/** 同一次模型响应的 block 共享 responseId，ordinal 为其在响应内的顺序；投影按此重组。 */
const block = { ...base, agentId: id, responseId: id, ordinal: z.number().int().nonnegative(), complete: z.boolean(),
  /** 协议续接资料（signature、itemId 等），只由对应适配器读取。 */
  continuation: jsonSchema, adapter: z.string(), scope: z.string() };

export const sessionNodeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("message"), agentId: id, text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("thinking"), text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("text"), text: z.string() }),
  // toolcall 与结果同一节点：只有得到结果才 complete；未完成的填充以 complete=false 留作审计。
  z.strictObject({ ...block, kind: z.literal("toolcall"), callId: id, name: id, argumentsText: z.string(), arguments: jsonSchema,
    outcome: toolOutcomeSchema.nullable() }),
  // 响应收束：用量与结束原因，不发给模型。
  z.strictObject({ ...base, kind: z.literal("response_end"), agentId: id, responseId: id, usage: usageSchema.nullable(),
    finishReason: z.string().nullable(), model: z.string() }),
  // 重建工作台与上下文的对象事件；model 非空时作为文本投影给该代理。
  z.strictObject({ ...base, kind: z.literal("event"), agentId: id.nullable(), type: id, data: jsonSchema, model: z.string().nullable() }),
  z.strictObject({ ...base, kind: z.literal("notice"), agentId: id.nullable(), level: z.enum(["info", "warning", "error"]),
    code: z.string(), message: z.string() }),
]);
export type SessionNode = z.infer<typeof sessionNodeSchema>;
export type BlockNode = Extract<SessionNode, { kind: "thinking" | "text" | "toolcall" }>;
export type NewNode = SessionNode extends infer N ? N extends SessionNode ? Omit<N, "id" | "sessionId" | "parentId" | "createdAt"> : never : never;

// ---- 会话能力接口（IPC 版本 2） ----
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(100_000);
export const sessionVersion = 2;
export const sessionChannel = "weft:session";
export const sessionChangedChannel = "weft:session-changed";
export const sessionCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), submissionId: uuid, agentConfigurationId: id, modelId: id, thinking: thinkingSchema.nullable(), text }),
  z.strictObject({ type: z.literal("submit"), submissionId: uuid, sessionId: id, agentId: id, text }),
  z.strictObject({ type: z.literal("continue"), sessionId: id, agentId: id }),
  z.strictObject({ type: z.literal("configure"), sessionId: id, agentId: id, selection: agentSelectionSchema }),
  z.strictObject({ type: z.literal("read"), sessionId: id }),
  z.strictObject({ type: z.literal("select"), sessionId: id, nodeId: id.nullable() }),
  z.strictObject({ type: z.literal("cancel"), sessionId: id }),
]);
export type SessionCommand = z.infer<typeof sessionCommandSchema>;
const agentStateSchema = z.strictObject({ id, name: z.string(), running: z.boolean(),
  selection: agentSelectionSchema.nullable(), selectionRevision: z.number().int().nonnegative() });
export type AgentState = z.infer<typeof agentStateSchema>;
/** 会话快照：全部节点（含不完整块与旁支）、游标、各代理环境与运行状态；投影由消费方完成。 */
export const sessionSnapshotSchema = z.strictObject({
  sessionId: id, title: z.string(), cursor: id.nullable(), seq: z.number().int().nonnegative(),
  nodes: z.array(sessionNodeSchema), agents: z.array(agentStateSchema), running: z.boolean(),
  selectionRevision: z.number().int().nonnegative(),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
const errorCode = z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]);
export const sessionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), snapshot: sessionSnapshotSchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: errorCode, message: z.string() }) }),
]);
export type SessionResult = z.infer<typeof sessionResultSchema>;
export const sessionRequestSchema = z.strictObject({ kind: z.literal("session.request"), version: z.literal(sessionVersion), id: uuid, command: sessionCommandSchema });
export const sessionResponseSchema = z.strictObject({ kind: z.literal("session.response"), version: z.literal(sessionVersion), id: uuid, result: sessionResultSchema });
export const sessionChangedSchema = z.strictObject({ kind: z.literal("session.changed"), sessionId: id, seq: z.number().int().nonnegative(), selectionRevision: z.number().int().nonnegative() });
export type SessionChanged = z.infer<typeof sessionChangedSchema>;
export interface SessionBridge {
  execute(command: SessionCommand): Promise<SessionResult>;
  onChanged(listener: (event: SessionChanged) => void): () => void;
}
