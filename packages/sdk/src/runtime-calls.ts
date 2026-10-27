import type { CallContract, CallScope } from "./calls.ts";
import type { z } from "zod";
import type { Json } from "./json.ts";
import type { ObjectReader } from "./objects.ts";
import type { Source } from "./workspace.ts";

export type CallContext<S extends CallScope = CallScope> = {
  /** The host binds the source for backend plugin calls; null for desktop user calls. */
  readonly source: Source;
  readonly signal: AbortSignal;
} & (S extends "object" ? { readonly object: ObjectReader } : { readonly object?: never });
export interface CallContribution {
  readonly contract: CallContract;
  execute(input: Json, context: CallContext): Promise<Json>;
}
/** Implementations receive parsed input and return JSON accepted by the output schema before caller-side decoding. */
export function implementCall<Input extends z.ZodType<Json>, Output extends z.ZodType<Json>, S extends CallScope>(contract: CallContract<Input, Output, S>,
  execute: (input: NoInfer<z.output<Input>>, context: CallContext<NoInfer<S>>) => Promise<NoInfer<z.input<Output>> & Json>): CallContribution {
  return { contract, execute: (input, context) => execute(input as z.output<Input>, context as CallContext<S>) };
}
