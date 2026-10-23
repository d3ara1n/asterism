/** 模型执行的共识载荷；RecordContract 的身份由消费插件声明，SDK 不另建历史。 */
import { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import { toolOutcomeSchema } from "./tool-result.ts";
import { presentationSchema, type DataContract } from "./presentation.ts";
import type { ModelCompletion } from "./models.ts";

const id = z.string().min(1).max(160);
export const modelUsageSchema = z.strictObject({
  input: z.number().nonnegative().nullable(), output: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(), reasoning: z.number().nonnegative().nullable(),
  cacheRead: z.number().nonnegative().nullable(), cacheWrite: z.number().nonnegative().nullable(),
});
/** 日期时间用于定位；毫秒偏移来自同一单调时钟，不由日期时间相减。 */
export const requestTimingSchema = z.strictObject({
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  firstOutputMs: z.number().nonnegative().nullable(),
  firstTextMs: z.number().nonnegative().nullable(),
  firstReasoningMs: z.number().nonnegative().nullable(),
  lastOutputMs: z.number().nonnegative().nullable(),
  outputChunks: z.number().int().nonnegative(),
  outcome: z.enum(["completed", "failed", "cancelled"]),
});
export type RequestTiming = z.infer<typeof requestTimingSchema>;

export const modelSourceSchema = z.strictObject({ model: z.string(), adapter: z.string(), scope: z.string() });
export const modelCompletionSchema = z.strictObject({ usage: modelUsageSchema.nullable(), finishReason: z.string(),
  rawFinishReason: z.string().nullable(), providerResponseId: z.string().nullable(), timing: requestTimingSchema.optional(),
  extensions: z.array(presentationSchema).optional() });
/** 仅解码调用方认识的领域扩展；未知或无法解码的扩展不影响公共终态。 */
export function completionData<T extends Json>(completion: ModelCompletion | null | undefined, contract: DataContract<T>): T | null {
  const extension = completion?.extensions?.find(value => value.contract.id === contract.id);
  if (!extension) return null;
  const result = contract.schema.safeParse(structuredClone(extension.data));
  return result.success ? result.data : null;
}
const block = { responseId: id, requestParentId: id.nullable(), ordinal: z.number().int().nonnegative(),
  complete: z.boolean(), continuation: jsonSchema, source: modelSourceSchema, completion: modelCompletionSchema.nullable().optional(),
  /** 块的生成起止（毫秒时间戳）；未结束即收束的块结束时间为 null，未记录时缺省。工具执行时间见 outcome。 */
  startedAt: z.number().nonnegative().optional(), endedAt: z.number().nonnegative().nullable().optional() };
export const modelBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...block, kind: z.literal("thinking"), text: z.string(), summary: z.string() }),
  z.strictObject({ ...block, kind: z.literal("text"), text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("toolcall"), callId: id, name: id,
    /** 模型原文；只在没有解析参数（调用未完成）时保留，已解析时以 arguments 为准。 */
    argumentsText: z.string().nullable(), arguments: jsonSchema, outcome: toolOutcomeSchema.nullable() })
    .refine(data => data.complete === (data.outcome !== null), "Complete tool calls must have an outcome."),
]);
/** 终态内含于成型块；执行通知只携带反馈，不承载响应身份或计量。 */
export const modelRunRecordSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("block"), block: modelBlockSchema }),
  z.strictObject({ type: z.literal("diagnostic"), code: z.string(), message: z.string(), level: z.enum(["error", "warning"]) }),
]);
