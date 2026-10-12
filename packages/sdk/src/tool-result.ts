import { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import { contractReferenceSchema } from "./presentation.ts";
import { modelInputPartsSchema, type ModelInputPart } from "./model-input.ts";

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
/** 模型投影与用户输入共用 text | file 部件；只有成功与部分成功可携带文件。 */
const saved = { ...toolInvocationSchema.shape, model: modelInputPartsSchema };
function extendSaved<I extends 0 | 1 | 2 | 3 | 4 | 5>(index: I) { return toolCompletionSchema.options[index].extend(saved); }
export const toolOutcomeSchema = z.discriminatedUnion("kind",
  toolCompletionSchema.options.map(option => option.extend(saved)) as unknown as [
    ReturnType<typeof extendSaved<0>>, ReturnType<typeof extendSaved<1>>, ReturnType<typeof extendSaved<2>>,
    ReturnType<typeof extendSaved<3>>, ReturnType<typeof extendSaved<4>>, ReturnType<typeof extendSaved<5>>,
  ]).refine(outcome => outcome.kind === "succeeded" || outcome.kind === "partial" || outcome.model.every(part => part.kind === "text"),
  "Only succeeded or partial tool results can carry files.");
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;
/** 工具交给模型的内容：字符串即一个文字部件；文件部件引用执行期暂存或对象已有的不可变内容。 */
export type ToolModelOutput = string | ModelInputPart[];
