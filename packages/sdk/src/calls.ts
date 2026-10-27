import type { z } from "zod";
import type { Json } from "./json.ts";
import { contractReferenceSchema } from "./presentation.ts";
import type { ResourceRef } from "./workspace.ts";

export type CallScope = "plugin" | "object";
/** Scope is declared by the contract; callers cannot downgrade an object-level operation by omitting the object. */
export interface CallContract<Input extends z.ZodType<Json> = z.ZodType<Json>, Output extends z.ZodType<Json> = z.ZodType<Json>, S extends CallScope = CallScope> {
  readonly id: string;
  readonly scope: S;
  readonly input: Input;
  readonly output: Output;
}
export function defineCall<Input extends z.ZodType<Json>, Output extends z.ZodType<Json>, S extends CallScope>(id: string, definition: {
  scope: S; input: Input; output: Output;
}): CallContract<Input, Output, S> {
  if (definition.scope !== "plugin" && definition.scope !== "object") throw new Error("A call must declare plugin or object scope.");
  return Object.freeze({ ...contractReferenceSchema.parse({ id }), ...definition });
}
export type CallOptions<S extends CallScope = CallScope> = { signal?: AbortSignal } &
  (S extends "object" ? { object: ResourceRef } : { object?: never });
export interface PluginCalls {
  /** Submit JSON matching the input schema's input; receive the output schema's parsed result. */
  invoke<Input extends z.ZodType<Json>, Output extends z.ZodType<Json>, S extends CallScope>(
    contract: CallContract<Input, Output, S>, input: NoInfer<z.input<Input>> & Json, options: CallOptions<NoInfer<S>>,
  ): Promise<z.output<Output>>;
}
