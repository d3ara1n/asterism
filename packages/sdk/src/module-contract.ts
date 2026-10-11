import type { z } from "zod";
import type { Json } from "./json.ts";
import { contractReferenceSchema, type ContractReference, type DataContract } from "./presentation.ts";

export interface ResourceContract<S extends Json = Json> {
  kind: string;
  stateSchema: z.ZodType<S>;
}
export interface ToolContract<A extends Json = Json> extends ContractReference {
  name: string;
  description: string;
  guidelines: readonly string[];
  argsSchema: z.ZodType<A>;
}
/** 工具定义固定选择说明、使用指导与 args；实现只补充 target/result 和执行信息。 */
export interface ImplementationContract<S extends Json, T extends Json, A extends Json, O extends Json> extends DataContract<O> {
  resource: ResourceContract<S>;
  tool: ToolContract<A>;
  targetSchema: z.ZodType<T>;
  effect: "read" | "write";
  execution: "parallel" | "sequential";
}
export function defineResource<S extends Json>(kind: string, stateSchema: z.ZodType<S>): ResourceContract<S> {
  return { kind, stateSchema };
}
function requireDescription(schema: z.ZodType, subject: string): void {
  if (!schema.description?.trim()) throw new Error(`Missing schema description: ${subject}`);
}
export function defineTool<A extends Json>(definition: ToolContract<A>): ToolContract<A> {
  if (!definition.name.trim() || !definition.description.trim()) throw new Error("Tool name and description must not be empty.");
  if (definition.guidelines.some(guideline => !guideline.trim())) throw new Error(`Empty tool guideline: ${definition.name}`);
  requireDescription(definition.argsSchema, `${definition.name}.args`);
  return { ...definition, ...contractReferenceSchema.parse({ id: definition.id }), guidelines: [...definition.guidelines] };
}
export function defineImplementation<S extends Json, T extends Json, A extends Json, O extends Json>(
  definition: ImplementationContract<S, T, A, O>,
): ImplementationContract<S, T, A, O> {
  requireDescription(definition.targetSchema, `${definition.id}.target`);
  requireDescription(definition.schema, `${definition.id}.result`);
  return definition;
}
