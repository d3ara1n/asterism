import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import { contractReferenceSchema } from "@atelier/sdk/contracts";

export const toolResourceSchema = z.strictObject({ id: z.string(), kind: z.string(), title: z.string() });
/** 当次请求选中的身份；历史展示不能改用当前资源或当前实现。 */
export const toolInvocationSchema = z.strictObject({
  implementation: contractReferenceSchema.optional(),
  resource: toolResourceSchema.optional(),
  startedAt: z.number().nonnegative().optional(),
  finishedAt: z.number().nonnegative().optional(),
});
export type ToolInvocationInfo = z.infer<typeof toolInvocationSchema>;

const error = z.strictObject({ code: z.string(), message: z.string() });
export const toolCompletionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("succeeded"), data: jsonSchema }),
  z.strictObject({ kind: z.literal("partial"), data: jsonSchema, message: z.string() }),
  z.strictObject({ kind: z.literal("rejected"), data: jsonSchema, error }),
  z.strictObject({ kind: z.literal("failed"), data: jsonSchema, error }),
  z.strictObject({ kind: z.literal("cancelled"), data: jsonSchema, message: z.string() }),
  z.strictObject({ kind: z.literal("unknown"), data: jsonSchema, message: z.string() }),
]);
export const toolRunningResultSchema = z.strictObject({ kind: z.literal("running"), data: jsonSchema });
type WithData<T, D> = T extends unknown ? Omit<T, "data"> & { data: D | null } : never;
export type ToolCompletion<D = Json> = WithData<z.infer<typeof toolCompletionSchema>, D>;
/** 过程态与终结态共用 data 契约，null 表示尚无有效产出。 */
export type ToolResult<D = Json> = { kind: "running"; data: D | null } | ToolCompletion<D>;
const saved = { ...toolInvocationSchema.shape, model: jsonSchema };
export const toolOutcomeSchema = z.discriminatedUnion("kind", [
  toolCompletionSchema.options[0].extend(saved),
  toolCompletionSchema.options[1].extend(saved),
  toolCompletionSchema.options[2].extend(saved),
  toolCompletionSchema.options[3].extend(saved),
  toolCompletionSchema.options[4].extend(saved),
  toolCompletionSchema.options[5].extend(saved),
]);
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;
