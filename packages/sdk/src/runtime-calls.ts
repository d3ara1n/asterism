import type { CallContract, CallScope } from "./calls.ts";
import type { Json } from "./json.ts";
import type { ObjectReader } from "./objects.ts";
import type { Source } from "./workspace.ts";

export type CallContext<S extends CallScope = CallScope> = {
  /** 后台插件调用由宿主绑定来源；桌面用户调用为 null。 */
  readonly source: Source;
  readonly signal: AbortSignal;
} & (S extends "object" ? { readonly object: ObjectReader } : { readonly object?: never });
export interface CallContribution {
  readonly contract: CallContract;
  execute(input: Json, context: CallContext): Promise<Json>;
}
export function implementCall<I extends Json, O extends Json, S extends CallScope>(contract: CallContract<I, O, S>,
  execute: (input: I, context: CallContext<S>) => Promise<O>): CallContribution {
  return { contract, execute: (input, context) => execute(input as I, context as CallContext<S>) };
}
