import { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import { contractReferenceSchema } from "./presentation.ts";
import { modelInputPartsSchema, type ModelInputPart } from "./model-input.ts";

export const toolResourceSchema = z.strictObject({ id: z.string(), kind: z.string(), title: z.string() });
/** Identity selected for this request; history display must not substitute the current resource or current implementation. */
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
/** Progress and terminal states share the data contract; null means no valid output yet. */
export type ToolResult<D = Json> = { kind: "running"; data: D | null } | ToolCompletion<D>;
/** Model projection and user input share text | file parts; only success and partial success may carry files. */
const saved = { ...toolInvocationSchema.shape, model: modelInputPartsSchema };
function extendSaved<I extends 0 | 1 | 2 | 3 | 4 | 5>(index: I) { return toolCompletionSchema.options[index].extend(saved); }
export const toolOutcomeSchema = z.discriminatedUnion("kind",
  toolCompletionSchema.options.map(option => option.extend(saved)) as unknown as [
    ReturnType<typeof extendSaved<0>>, ReturnType<typeof extendSaved<1>>, ReturnType<typeof extendSaved<2>>,
    ReturnType<typeof extendSaved<3>>, ReturnType<typeof extendSaved<4>>, ReturnType<typeof extendSaved<5>>,
  ]).refine(outcome => outcome.kind === "succeeded" || outcome.kind === "partial" || outcome.model.every(part => part.kind === "text"),
  "Only succeeded or partial tool results can carry files.");
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;
/** Content passed from a tool to the model: a string becomes one text part; file parts reference immutable content staged during execution or already owned by the object. */
export type ToolModelOutput = string | ModelInputPart[];
/** Projection used when a tool declares no toModel: strings are text, other decoded values are JSON text. */
export function defaultToolModel(data: Json): string {
  return typeof data === "string" ? data : JSON.stringify(data);
}
