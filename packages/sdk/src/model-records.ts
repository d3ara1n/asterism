/** 模型执行的共识载荷；RecordContract 的身份由消费插件声明，SDK 不另建历史。 */
import { z } from "zod";
import { jsonSchema } from "./json.ts";
import { toolOutcomeSchema } from "./tool-result.ts";

const id = z.string().min(1).max(160);
export const modelUsageSchema = z.strictObject({
  input: z.number().nonnegative().nullable(), output: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(), reasoning: z.number().nonnegative().nullable(),
  cacheRead: z.number().nonnegative().nullable(), cacheWrite: z.number().nonnegative().nullable(),
});
export const modelSourceSchema = z.strictObject({ model: z.string(), adapter: z.string(), scope: z.string() });
export const modelCompletionSchema = z.strictObject({ usage: modelUsageSchema.nullable(), finishReason: z.string(),
  rawFinishReason: z.string().nullable(), providerResponseId: z.string().nullable() });
const block = { responseId: id, requestParentId: id.nullable(), ordinal: z.number().int().nonnegative(),
  complete: z.boolean(), continuation: jsonSchema, source: modelSourceSchema, completion: modelCompletionSchema.nullable().optional() };
export const modelBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...block, kind: z.literal("thinking"), text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("text"), text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("toolcall"), callId: id, name: id,
    argumentsText: z.string(), arguments: jsonSchema, outcome: toolOutcomeSchema.nullable() })
    .refine(data => data.complete === (data.outcome !== null), "Complete tool calls must have an outcome."),
]);
/** 成型块、迟到终态与诊断可以保存；临时进度不属于历史记录。 */
export const modelRunRecordSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("block"), block: modelBlockSchema }),
  z.strictObject({ type: z.literal("completion"), responseId: id, requestParentId: id.nullable(), source: modelSourceSchema,
    ordinal: z.number().int().nonnegative().nullable(), completion: modelCompletionSchema }),
  z.strictObject({ type: z.literal("diagnostic"), code: z.string(), message: z.string(), level: z.enum(["error", "warning"]) }),
]);
