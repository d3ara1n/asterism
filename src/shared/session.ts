import { z } from "zod";
import { jsonSchema, toolOutcomeSchema, usageSchema } from "./model.ts";
import { thinkingSchema } from "./configuration.ts";
import { pointSchema, workbenchCommands, workbenchSnapshotSchema } from "./workbench.ts";
import { toolInvocationSchema, toolRunningResultSchema } from "./tool-result.ts";

const id = z.string().min(1).max(160);
/** 会话树节点共有字段：父指针组织分支，agentId 标明归属代理（事件与通知可无归属）。 */
const base = { id, sessionId: id, parentId: id.nullable(), createdAt: z.string() };
export const completionSchema = z.strictObject({
  usage: usageSchema.nullable(), finishReason: z.string(),
  rawFinishReason: z.string().nullable(), providerResponseId: z.string().nullable(),
});
export type BlockCompletion = z.infer<typeof completionSchema>;
export const emptyCompletion = { usage: null, finishReason: null, rawFinishReason: null, providerResponseId: null } as const;
/** 同一次模型响应的 block 共享 responseId，ordinal 为其在响应内的顺序；投影按此重组。 */
const block = { ...base, agentId: id, responseId: id, ordinal: z.number().int().nonnegative(), complete: z.boolean(),
  requestParentId: id.nullable(), model: z.string(),
  usage: usageSchema.nullable(), finishReason: z.string().nullable(),
  rawFinishReason: z.string().nullable(), providerResponseId: z.string().nullable(),
  /** 协议续接资料（signature、itemId 等），只由对应适配器读取。 */
  continuation: jsonSchema, adapter: z.string(), scope: z.string() };

export const sessionNodeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("message"), agentId: id, text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("thinking"), text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("text"), text: z.string() }),
  // toolcall 与结果同一节点：只有得到结果才 complete；未完成的填充以 complete=false 留作审计。
  z.strictObject({ ...block, kind: z.literal("toolcall"), callId: id, name: id, argumentsText: z.string(), arguments: jsonSchema,
    outcome: toolOutcomeSchema.nullable() }).refine(node => node.complete === (node.outcome !== null),
    "A complete tool call must have an outcome; incomplete calls cannot have one."),
  // 重建工作台与上下文的对象事件；model 非空时作为文本投影给该代理。
  z.strictObject({ ...base, kind: z.literal("event"), agentId: id.nullable(), type: id, data: jsonSchema, model: z.string().nullable() }),
  z.strictObject({ ...base, kind: z.literal("notice"), agentId: id.nullable(), level: z.enum(["info", "warning", "error"]),
    code: z.string(), message: z.string(),
    /** 无内容块的异常响应保留诊断资料，不伪造模型输出块。 */
    response: completionSchema.extend({ responseId: id, requestParentId: id.nullable(), model: z.string() }).optional() }),
]);
export type SessionNode = z.infer<typeof sessionNodeSchema>;
export type BlockNode = Extract<SessionNode, { kind: "thinking" | "text" | "toolcall" }>;
export type NewNode = SessionNode extends infer N ? N extends SessionNode ? Omit<N, "id" | "sessionId" | "parentId" | "createdAt"> : never : never;

// ---- 会话能力接口 ----
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(100_000);
export const sessionVersion = 8;
export const viewPositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("live") }),
  z.strictObject({ kind: z.literal("history"), nodeId: id.nullable() }),
]);
export type ViewPosition = z.infer<typeof viewPositionSchema>;
export const sessionChannel = "weft:session";
export const sessionChangedChannel = "weft:session-changed";
export const sessionCommandSchema = z.discriminatedUnion("type", [
  // 首页组合入口：建立会话、创建第一个代理资源并向它提交首条输入。
  z.strictObject({ type: z.literal("start"), submissionId: uuid, agentConfigurationId: id, modelId: id, thinking: thinkingSchema.nullable(), text }),
  z.strictObject({ type: z.literal("read"), sessionId: id, position: viewPositionSchema }),
  z.strictObject({ type: z.literal("select"), sessionId: id, nodeId: id.nullable() }),
  // 资源卡片的行为入口：按对象类型路由到资源控制器，command 由该资源模块校验。
  z.strictObject({ type: z.literal("resource.command"), sessionId: id, objectId: id, command: jsonSchema }),
  // 向工作台添加资源；input 由该资源模块校验。
  z.strictObject({ type: z.literal("resource.create"), sessionId: id, kind: id, input: jsonSchema, position: pointSchema }),
  ...workbenchCommands,
]);
export type SessionCommand = z.infer<typeof sessionCommandSchema>;
export type SessionMutation = Exclude<SessionCommand, { type: "read" }>;
/** 仅在运行时存在的输出投影；没有父指针，不属于可选择的历史节点。 */
const liveBase = { id, agentId: id, responseId: id, ordinal: z.number().int().nonnegative() };
export const liveBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...liveBase, kind: z.literal("text"), text: z.string() }),
  z.strictObject({ ...liveBase, kind: z.literal("thinking"), text: z.string(), startedAt: z.number().nonnegative() }),
  z.strictObject({ ...liveBase, kind: z.literal("toolcall"), name: id, argumentsText: z.string(),
    arguments: jsonSchema, state: z.enum(["input", "ready", "executing"]),
    invocation: toolInvocationSchema.nullable(), result: toolRunningResultSchema.nullable() }),
]);
export type LiveBlock = z.infer<typeof liveBlockSchema>;
const revision = z.number().int().nonnegative();
/** 进度可独立替换；revision 指出它依赖的持久视图版本，version 表示内存进度先后。 */
export const sessionProgressSchema = z.strictObject({
  revision, version: revision, runningAgentIds: z.array(id), live: z.array(liveBlockSchema),
  /** 所有尚未收束的被捕获资源；外部状态的持续运行不计入。 */
  unsettledObjectIds: z.array(id),
});
export type SessionProgress = z.infer<typeof sessionProgressSchema>;
/** 同次读取固定路径与对象投影；seq 是节点序号，revision 还涵盖计量、选择与布局。 */
export const sessionSnapshotSchema = z.strictObject({
  sessionId: id, title: z.string(), cursor: id.nullable(), at: id.nullable(), seq: revision, revision,
  nodes: z.array(sessionNodeSchema),
  workbench: workbenchSnapshotSchema, progress: sessionProgressSchema,
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
export const sessionReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("view"), snapshot: sessionSnapshotSchema }),
  z.strictObject({ kind: z.literal("accepted"), sessionId: id }),
]);
export type SessionReply = z.infer<typeof sessionReplySchema>;
const errorCode = z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]);
export const sessionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), reply: sessionReplySchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: errorCode, message: z.string() }) }),
]);
export type SessionResult = z.infer<typeof sessionResultSchema>;
export const sessionRequestSchema = z.strictObject({ kind: z.literal("session.request"), version: z.literal(sessionVersion), id: uuid, command: sessionCommandSchema });
export const sessionResponseSchema = z.strictObject({ kind: z.literal("session.response"), version: z.literal(sessionVersion), id: uuid, result: sessionResultSchema });
export const sessionChangedSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("session.changed"), sessionId: id, revision }),
  z.strictObject({ kind: z.literal("session.progress"), sessionId: id, progress: sessionProgressSchema }),
]);
export type SessionChanged = z.infer<typeof sessionChangedSchema>;
export interface SessionBridge {
  execute(command: SessionCommand): Promise<SessionResult>;
  onChanged(listener: (event: SessionChanged) => void): () => void;
}
