import { z } from "zod";
import { modelSchema, providerInputSchema, thinkingSchema } from "./configuration.ts";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export const jsonSchema: z.ZodType<Json> = z.json();
const id = z.string().min(1).max(160);
const error = z.strictObject({ code: z.string(), message: z.string() });
export const toolOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("succeeded"), model: jsonSchema, data: jsonSchema }),
  z.strictObject({ kind: z.literal("rejected"), error }),
  z.strictObject({ kind: z.literal("failed"), error }),
  z.strictObject({ kind: z.literal("cancelled"), message: z.string() }),
  z.strictObject({ kind: z.literal("partial"), model: jsonSchema, data: jsonSchema, message: z.string() }),
  z.strictObject({ kind: z.literal("unknown"), message: z.string() }),
]);
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;
export const partSchema = z.discriminatedUnion("kind", [
  z.strictObject({ id, kind: z.enum(["text", "thinking"]), text: z.string(), complete: z.boolean() }),
  z.strictObject({ id, kind: z.literal("tool"), callId: id, name: id, argumentsText: z.string(), arguments: jsonSchema,
    complete: z.boolean(), execution: z.enum(["proposed", "running", "settled"]), outcome: toolOutcomeSchema.nullable() }),
]);
export type Part = z.infer<typeof partSchema>;
export type ToolPart = Extract<Part, { kind: "tool" }>;
export const usageSchema = z.strictObject({
  input: z.number().nonnegative().nullable(), output: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(), reasoning: z.number().nonnegative().nullable(),
  cacheRead: z.number().nonnegative().nullable(), cacheWrite: z.number().nonnegative().nullable(),
});
export type Usage = z.infer<typeof usageSchema>;
export const modelSettingsSchema = z.strictObject({
  provider: providerInputSchema.extend({ id, revision: z.number().int().positive() }),
  model: modelSchema, thinking: thinkingSchema.nullable(),
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export function modelScope(settings: ModelSettings): string {
  return JSON.stringify([settings.provider.id, settings.provider.protocol, settings.provider.baseUrl, settings.model.modelId]);
}
/** 记录用模型表达式 `<providerId>/<modelId>[:<thinking>]`；参数传递仍使用结构化字段。 */
export function modelExpression(settings: Pick<ModelSettings, "thinking"> & { provider: { id: string }; model: { modelId: string } }): string {
  return `${settings.provider.id}/${settings.model.modelId}${settings.thinking ? `:${settings.thinking}` : ""}`;
}
/** 只记录本次请求计算后的结果：实际模型、续接作用域、消费的历史位置与授权版本。 */
export const requestRecordSchema = z.strictObject({
  adapter: z.string(), model: z.string(), scope: z.string(),
  historySeq: z.number().int().nonnegative(), bindingVersion: z.number().int().nonnegative(),
});
const base = { id, parentId: id.nullable(), createdAt: z.string() };
export const nodeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("input"), text: z.string() }),
  z.strictObject({ ...base, kind: z.literal("model"), turnId: id, request: requestRecordSchema,
    state: z.enum(["streaming", "tools", "complete", "failed", "cancelled", "interrupted"]),
    parts: z.array(partSchema), usage: usageSchema.nullable(), finishReason: z.string().nullable(),
    responseId: z.string().nullable(), rawFinishReason: z.string().nullable(),
    replay: jsonSchema, error: error.nullable() }),
  // 首批压缩替代整个父路径；原始节点保留，跳回父路径即不采用此摘要。
  z.strictObject({ ...base, kind: z.literal("compaction"), summary: z.string() }),
  z.strictObject({ ...base, kind: z.literal("extension"), extension: id, version: z.number().int().positive(), data: jsonSchema,
    model: z.enum(["omit", "required"]), user: z.enum(["omit", "required"]) }),
]);
export type ConversationNode = z.infer<typeof nodeSchema>;
export type ModelNode = Extract<ConversationNode, { kind: "model" }>;
export type ExtensionNode = Extract<ConversationNode, { kind: "extension" }>;
export const conversationMutationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("created") }),
  z.strictObject({ type: z.literal("node.appended"), node: nodeSchema }),
  z.strictObject({ type: z.literal("cursor.selected"), nodeId: id.nullable() }),
  z.strictObject({ type: z.literal("part.started"), nodeId: id, part: partSchema }),
  z.strictObject({ type: z.literal("part.delta"), nodeId: id, partId: id, delta: z.string() }),
  z.strictObject({ type: z.literal("part.ended"), nodeId: id, partId: id, arguments: jsonSchema.optional() }),
  z.strictObject({ type: z.literal("response.finished"), nodeId: id, usage: usageSchema.nullable(), finishReason: z.string(), replay: jsonSchema,
    responseId: z.string().nullable().optional(), rawFinishReason: z.string().nullable().optional() }),
  z.strictObject({ type: z.literal("tool.started"), nodeId: id, partId: id }),
  z.strictObject({ type: z.literal("tool.settled"), nodeId: id, partId: id, outcome: toolOutcomeSchema }),
  z.strictObject({ type: z.literal("node.sealed"), nodeId: id, state: z.enum(["complete", "failed", "cancelled", "interrupted"]), error: error.nullable() }),
]);
export type ConversationMutation = z.infer<typeof conversationMutationSchema>;
export const conversationEventSchema = z.strictObject({ version: z.literal(1), agentId: id, mutation: conversationMutationSchema });
export const conversationSelectionSchema = z.strictObject({ agentConfigurationId: id, modelId: id, thinking: thinkingSchema.nullable() });
export type ConversationSelection = z.infer<typeof conversationSelectionSchema>;
export const conversationSnapshotSchema = z.strictObject({
  taskId: id, agentId: id, cursor: id.nullable(), seq: z.number().int().nonnegative(),
  nodes: z.array(nodeSchema), activeTurnId: id.nullable(),
  agentName: z.string(),
  selectionRevision: z.number().int().nonnegative(),
  selection: conversationSelectionSchema.nullable(),
  lastError: error.nullable(),
});
export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>;

export const conversationChannel = "weft:conversation";
export const conversationChangedChannel = "weft:conversation-changed";
export const conversationVersion = 1;
export const conversationCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), submissionId: z.string().uuid(), agentConfigurationId: id, modelId: id, thinking: thinkingSchema.nullable(), text: z.string().trim().min(1).max(100_000) }),
  z.strictObject({ type: z.literal("submit"), submissionId: z.string().uuid(), taskId: id, agentId: id, text: z.string().trim().min(1).max(100_000) }),
  z.strictObject({ type: z.literal("continue"), taskId: id, agentId: id }),
  z.strictObject({ type: z.literal("configure"), taskId: id, agentId: id, selection: conversationSelectionSchema }),
  z.strictObject({ type: z.literal("read"), taskId: id, agentId: id, atSeq: z.number().int().positive().optional() }),
  z.strictObject({ type: z.literal("select"), taskId: id, agentId: id, nodeId: id.nullable() }),
  z.strictObject({ type: z.literal("cancel"), taskId: id, agentId: id }),
]);
export type ConversationCommand = z.infer<typeof conversationCommandSchema>;
export const conversationResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), snapshot: conversationSnapshotSchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]), message: z.string() }) }),
]);
export type ConversationResult = z.infer<typeof conversationResultSchema>;
export const conversationRequestSchema = z.strictObject({ kind: z.literal("conversation.request"), version: z.literal(conversationVersion), id: z.string().uuid(), command: conversationCommandSchema });
export const conversationResponseSchema = z.strictObject({ kind: z.literal("conversation.response"), version: z.literal(conversationVersion), id: z.string().uuid(), result: conversationResultSchema });
export const conversationChangedSchema = z.strictObject({ kind: z.literal("conversation.changed"), taskId: id, agentId: id, seq: z.number().int().nonnegative(), selectionRevision: z.number().int().nonnegative() });
export type ConversationChanged = z.infer<typeof conversationChangedSchema>;
export interface ConversationBridge {
  execute(command: ConversationCommand): Promise<ConversationResult>;
  onChanged(listener: (event: ConversationChanged) => void): () => void;
}
