import type { z } from "zod";
import type { Json } from "./json.ts";
import { contractReferenceSchema } from "./presentation.ts";
import type { ResourceRef } from "./workspace.ts";

/** 调用携带关联对象；输入和输出是独立于传输的纯数据契约。 */
export interface CallContract<I extends Json = Json, O extends Json = Json> {
  readonly id: string;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
}
export function defineCall<I extends Json, O extends Json>(id: string, definition: {
  input: z.ZodType<I>; output: z.ZodType<O>;
}): CallContract<I, O> {
  return Object.freeze({ ...contractReferenceSchema.parse({ id }), ...definition });
}
export interface CallOptions { object: ResourceRef; signal?: AbortSignal }
export interface PluginCalls {
  invoke<I extends Json, O extends Json>(contract: CallContract<I, O>, input: NoInfer<I>, options: CallOptions): Promise<O>;
}
