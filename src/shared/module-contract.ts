import type { z } from "zod";
import type { Json } from "./json.ts";
import type { DataContract } from "./presentation.ts";

export interface ResourceContract<S extends Json = Json> {
  kind: string;
  stateSchema: z.ZodType<S>;
}
export interface ToolContract<A extends Json = Json> {
  name: string;
  argsSchema: z.ZodType<A>;
}
/** args 属于工具定义；target 和 result 属于后端对该工具的实现。 */
export interface ImplementationContract<S extends Json, T extends Json, A extends Json, O extends Json> extends DataContract<O> {
  resource: ResourceContract<S>;
  tool: ToolContract<A>;
  targetSchema: z.ZodType<T>;
  description: string;
  effect: "read" | "write";
  execution: "parallel" | "sequential";
}
export function defineResource<S extends Json>(kind: string, stateSchema: z.ZodType<S>): ResourceContract<S> {
  return { kind, stateSchema };
}
export function defineTool<A extends Json>(name: string, argsSchema: z.ZodType<A>): ToolContract<A> {
  return { name, argsSchema };
}
export function defineImplementation<S extends Json, T extends Json, A extends Json, O extends Json>(
  definition: ImplementationContract<S, T, A, O>,
): ImplementationContract<S, T, A, O> {
  return definition;
}
