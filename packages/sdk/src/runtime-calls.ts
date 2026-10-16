import type { CallContract } from "./calls.ts";
import type { Json } from "./json.ts";
import type { ObjectReader } from "./objects.ts";
import type { Source } from "./workspace.ts";

export interface CallContext {
  readonly object: ObjectReader;
  /** 后台插件调用由宿主绑定来源；桌面用户调用为 null。 */
  readonly source: Source;
  readonly signal: AbortSignal;
}
export interface CallContribution {
  readonly contract: CallContract;
  execute(input: Json, context: CallContext): Promise<Json>;
}
export function implementCall<I extends Json, O extends Json>(contract: CallContract<I, O>,
  execute: (input: I, context: CallContext) => Promise<O>): CallContribution {
  return { contract, execute: (input, context) => execute(input as I, context) };
}
