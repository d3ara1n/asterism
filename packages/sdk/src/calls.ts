import type { z } from "zod";
import type { Json } from "./json.ts";
import { contractReferenceSchema } from "./presentation.ts";
import type { ResourceRef } from "./workspace.ts";

export type CallScope = "plugin" | "object";
/** 作用域由契约声明，调用方不能省略对象来降级对象级操作。 */
export interface CallContract<I extends Json = Json, O extends Json = Json, S extends CallScope = CallScope> {
  readonly id: string;
  readonly scope: S;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
}
export function defineCall<I extends Json, O extends Json, S extends CallScope>(id: string, definition: {
  scope: S; input: z.ZodType<I>; output: z.ZodType<O>;
}): CallContract<I, O, S> {
  if (definition.scope !== "plugin" && definition.scope !== "object") throw new Error("A call must declare plugin or object scope.");
  return Object.freeze({ ...contractReferenceSchema.parse({ id }), ...definition });
}
export type CallOptions<S extends CallScope = CallScope> = { signal?: AbortSignal } &
  (S extends "object" ? { object: ResourceRef } : { object?: never });
export interface PluginCalls {
  invoke<I extends Json, O extends Json, S extends CallScope>(contract: CallContract<I, O, S>, input: NoInfer<I>, options: CallOptions<NoInfer<S>>): Promise<O>;
}
