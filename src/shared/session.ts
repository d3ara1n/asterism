import { z } from "zod";
import type { LivePatch } from "./live-patch.ts";
import { userInputPartsSchema, submissionIdSchema } from "@asterism/builtin-api/contracts";
import {
  resourceCallSchema, contractReferenceSchema, toolInvocationSchema,
  toolRunningResultSchema, uiTextSchema,
} from "@asterism/sdk/contracts";
import { jsonSchema } from "./model.ts";
import { modelExpressionSchema, thinkingSchema } from "./configuration.ts";
import { pointSchema, workbenchCommands, workbenchSnapshotSchema, type WorkbenchSnapshot } from "./workbench.ts";
import { templateCommands, templateObjectSummarySchema } from "./templates.ts";

const id = z.string().min(1).max(160);
/** 来源：null 表示软件本身；否则 plugin 由宿主按写入通道打戳，resource 为经校验的发出资源。记录与事件共用。 */
export const sourceSchema = z.strictObject({ plugin: id, resource: z.strictObject({ sessionId: id, id, kind: id }).nullable() }).nullable();
/**
 * 会话树节点即通用记录：契约身份、宿主打戳的来源与不透明载荷；宿主不解释 data。
 * model 非空时作为文本投影给 recipient（null 为全部执行体）；每条记录都进入路径并推进游标。
 */
export const sessionNodeSchema = z.strictObject({
  id, sessionId: id, parentId: id.nullable(), createdAt: z.string(), source: sourceSchema,
  contract: id, data: jsonSchema, model: z.string().nullable(), recipient: id.nullable(),
});
export type SessionNode = z.infer<typeof sessionNodeSchema>;
export type NewNode = Omit<SessionNode, "id" | "sessionId" | "parentId" | "createdAt">;

// ---- 会话能力接口 ----
const uuid = z.string().uuid();
export const sessionCommandSchema = z.discriminatedUnion("type", [
  // 首页组合入口：建立会话、创建第一个代理资源并向它提交首条输入。
  z.strictObject({ type: z.literal("start"), submissionId: submissionIdSchema, agent: id, model: modelExpressionSchema.nullable(), thinking: thinkingSchema.nullable(), parts: userInputPartsSchema, contentScopeId: uuid.optional() }),
  z.strictObject({ type: z.literal("read"), sessionId: id }),
  z.strictObject({ type: z.literal("watch"), sessionId: id }),
  z.strictObject({ type: z.literal("unwatch"), sessionId: id }),
  // 结束提示在确认时读取实例当前状态；不进入投影，状态变化不触发重投影。省略 objectIds 时取当前路径上的全部对象。
  z.strictObject({ type: z.literal("disposal.warnings"), sessionId: id, objectIds: z.array(id).max(1000).optional() }),
  z.strictObject({ type: z.literal("select"), sessionId: id, nodeId: id.nullable() }),
  // 应用组合入口：将人工命名交给内置命名模块追加领域记录。
  z.strictObject({ type: z.literal("rename"), sessionId: id, title: z.string().max(160).refine(value => value.trim().length > 0) }),
  // 归档：清理会话全部对象后标记归档时间；此后业务读取一律视为不存在。
  z.strictObject({ type: z.literal("archive"), sessionId: id }),
  // 回收站恢复：只清除归档时间，对象重新进入当前集合。
  z.strictObject({ type: z.literal("restore"), sessionId: id }),
  // 资源卡片的行为入口：按对象类型路由到资源控制器，command 由该资源模块校验。
  z.strictObject({ type: z.literal("resource.command"), sessionId: id, objectId: id, command: resourceCallSchema, contentScopeId: uuid.optional() }),
  // 向工作台添加资源；input 由该资源模块校验。
  z.strictObject({ type: z.literal("resource.create"), sessionId: id, kind: id, creation: contractReferenceSchema, input: jsonSchema, position: pointSchema,
    /** 请求身份：准备阶段可凭它取消。 */
    requestId: uuid.optional(), contentScopeId: uuid.optional() }),
  // 取消仍在准备中的创建；已进入事务或不存在的请求不受影响。
  z.strictObject({ type: z.literal("resource.create.cancel"), sessionId: id, requestId: uuid }),
  ...workbenchCommands,
  ...templateCommands,
]);
export type SessionCommand = z.infer<typeof sessionCommandSchema>;
export type SessionMutation = Exclude<SessionCommand, { type: "read" | "watch" | "unwatch" | "disposal.warnings" | `template.${string}` }>;
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
/** 与数据更新使用同一个按序投递通道。 */
export const sessionProgressSchema = z.strictObject({
  /** 运行中执行体的临时输出，按发出对象归属。 */
  live: z.array(liveBlockSchema),
  /** 依赖当前时间线路径的资源占用；不表示资源的业务执行状态。 */
  busyObjectIds: z.array(id),
  /** 资源身份尚未建立的创建准备占用。 */
  timelineBusy: z.boolean(),
});
export type SessionProgress = z.infer<typeof sessionProgressSchema>;
/** 打开会话时交付当前数据，之后直接应用变化。 */
export const sessionDataSchema = z.strictObject({
  sessionId: id, title: z.string(), cursor: id.nullable(),
  nodes: z.array(sessionNodeSchema),
  workbench: workbenchSnapshotSchema, progress: sessionProgressSchema,
});
export type SessionData = z.infer<typeof sessionDataSchema>;
export const sessionReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("template.source"), objects: z.array(templateObjectSummarySchema) }),
  z.strictObject({ kind: z.literal("template.saved"), templateId: uuid }),
  z.strictObject({ kind: z.literal("template.deleted") }),
  z.strictObject({ kind: z.literal("view"), data: sessionDataSchema }),
  z.strictObject({ kind: z.literal("accepted"), sessionId: id }),
  z.strictObject({ kind: z.literal("warnings"), warnings: z.array(z.strictObject({ objectId: id, title: z.string(), warning: uiTextSchema })) }),
]);
export type SessionReply = z.infer<typeof sessionReplySchema>;
const errorCode = z.string().min(1);
export const sessionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), reply: sessionReplySchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: errorCode, message: z.string(), display: uiTextSchema.optional() }) }),
]);
export type SessionResult = z.infer<typeof sessionResultSchema>;
/** 后台按序推送的会话变化；runtime 是受信发送方，接收端不重复校验。 */
export type SessionChanged =
  | { kind: "session.opened"; sessionId: string; data: SessionData }
  | { kind: "session.changed"; sessionId: string; nodes: SessionNode[]; cursor: string | null; title: string;
      objects: WorkbenchSnapshot["objects"]; workbench?: WorkbenchSnapshot; layout?: Pick<WorkbenchSnapshot, "views" | "viewport"> }
  /** live 为相对上一次交付的增量；null 表示流式正文未变化。 */
  | { kind: "session.progress"; sessionId: string; busyObjectIds: string[]; timelineBusy: boolean; live: LivePatch | null };
export interface SessionBridge {
  execute(command: SessionCommand): Promise<SessionResult>;
  onChanged(listener: (event: SessionChanged) => void): () => void;
}
