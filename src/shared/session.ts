import { z } from "zod";
import { coreChannel } from "./core.ts";
import { userInputPartsSchema } from "./model-input.ts";
import { modelInputPartsSchema } from "@atelier/sdk/contracts";
import { jsonSchema } from "./model.ts";
import { modelExpressionSchema, thinkingSchema } from "./configuration.ts";
import { pointSchema, workbenchCommands, workbenchSnapshotSchema } from "./workbench.ts";
import { resourceCallSchema, contractReferenceSchema, toolInvocationSchema, toolRunningResultSchema } from "@atelier/sdk/contracts";

const id = z.string().min(1).max(160);
/** 记录来源：plugin 由宿主按写入通道打戳；resource 为经校验的发出资源，null 表示会话级记录。 */
export const recordSourceSchema = z.strictObject({ plugin: id, resource: z.strictObject({ id, kind: id }).nullable() });
export type RecordSource = z.infer<typeof recordSourceSchema>;
/**
 * 会话树节点即通用记录：契约身份、宿主打戳的来源与不透明载荷；宿主不解释 data。
 * model 非空时作为文本投影给 recipient（null 为全部执行体）；每条记录都进入路径并推进游标。
 */
export const sessionNodeSchema = z.strictObject({
  id, sessionId: id, parentId: id.nullable(), createdAt: z.string(), source: recordSourceSchema,
  contract: id, data: jsonSchema, model: z.string().nullable(), recipient: id.nullable(),
});
export type SessionNode = z.infer<typeof sessionNodeSchema>;
export type NewNode = Omit<SessionNode, "id" | "sessionId" | "parentId" | "createdAt">;

// ---- 会话能力接口 ----
const uuid = z.string().uuid();
export const sessionVersion = 16;
export const viewPositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("live") }),
  z.strictObject({ kind: z.literal("history"), nodeId: id.nullable() }),
]);
export type ViewPosition = z.infer<typeof viewPositionSchema>;
export const sessionChannel = coreChannel("session");
export const sessionChangedChannel = coreChannel("session-changed");
export const sessionCommandSchema = z.discriminatedUnion("type", [
  // 首页组合入口：建立会话、创建第一个代理资源并向它提交首条输入。
  z.strictObject({ type: z.literal("start"), submissionId: uuid, agent: id, model: modelExpressionSchema, thinking: thinkingSchema.nullable(), parts: userInputPartsSchema, contentScopeId: uuid.optional() }),
  z.strictObject({ type: z.literal("read"), sessionId: id, position: viewPositionSchema }),
  z.strictObject({ type: z.literal("select"), sessionId: id, nodeId: id.nullable() }),
  // 资源卡片的行为入口：按对象类型路由到资源控制器，command 由该资源模块校验。
  z.strictObject({ type: z.literal("resource.command"), sessionId: id, objectId: id, command: resourceCallSchema, contentScopeId: uuid.optional() }),
  // 向工作台添加资源；input 由该资源模块校验。
  z.strictObject({ type: z.literal("resource.create"), sessionId: id, kind: id, creation: contractReferenceSchema, input: jsonSchema, position: pointSchema,
    /** 请求身份：准备阶段可凭它取消。 */
    requestId: uuid.optional(), contentScopeId: uuid.optional() }),
  // 取消仍在准备中的创建；已进入事务或不存在的请求不受影响。
  z.strictObject({ type: z.literal("resource.create.cancel"), sessionId: id, requestId: uuid }),
  ...workbenchCommands,
]);
export type SessionCommand = z.infer<typeof sessionCommandSchema>;
export type SessionMutation = Exclude<SessionCommand, { type: "read" }>;
/** 仅在运行时存在的输出投影；没有父指针，不属于可选择的历史节点。 */
const liveBase = { id, objectId: id, responseId: id, ordinal: z.number().int().nonnegative() };
export const liveBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...liveBase, kind: z.literal("text"), text: z.string(), endedAt: z.number().nonnegative().nullable() }),
  z.strictObject({ ...liveBase, kind: z.literal("thinking"), text: z.string(), startedAt: z.number().nonnegative(), endedAt: z.number().nonnegative().nullable() }),
  z.strictObject({ ...liveBase, kind: z.literal("toolcall"), name: id, argumentsText: z.string(),
    arguments: jsonSchema, state: z.enum(["input", "ready", "executing"]),
    invocation: toolInvocationSchema.nullable(), result: toolRunningResultSchema.nullable() }),
]);
export type LiveBlock = z.infer<typeof liveBlockSchema>;
const revision = z.number().int().nonnegative();
/** 进度可独立替换；revision 指出它依赖的持久视图版本，version 表示内存进度先后。 */
export const sessionProgressSchema = z.strictObject({
  revision, version: revision,
  /** 运行中执行体的临时输出，按发出对象归属。 */
  live: z.array(liveBlockSchema),
  /** 所有尚未收束的被捕获资源；外部状态的持续运行不计入。 */
  unsettledObjectIds: z.array(id),
});
export type SessionProgress = z.infer<typeof sessionProgressSchema>;
/** 同次读取固定路径与对象投影；seq 是节点序号，revision 还涵盖选择、对象数据与布局。 */
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
const errorCode = z.string().min(1);
export const sessionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), reply: sessionReplySchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: errorCode, message: z.string(), display: uiTextSchema.optional() }) }),
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
import { uiTextSchema } from "@atelier/sdk/contracts";
