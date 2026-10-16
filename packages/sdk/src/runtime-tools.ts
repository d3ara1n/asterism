import { defineTool, type ToolContract } from "./module-contract.ts";
import type { Json } from "./json.ts";
import type { ObjectReader } from "./objects.ts";
import type { CallResult } from "./runtime-contracts.ts";
import type { ToolModelOutput } from "./tool-result.ts";
import type { z } from "zod";

export interface TopLevelToolContext<D extends Json = Json> {
  readonly object: ObjectReader;
  readonly callId: string;
  readonly signal: AbortSignal;
  publish(data: D): void;
}
/** 顶层工具一次声明定义和实现，不依赖资源支持关系。 */
export interface TopLevelTool<A extends Json = Json, D extends Json = Json> extends ToolContract<A> {
  readonly resultSchema: z.ZodType<D>;
  readonly effect: "read" | "write";
  readonly execution: "parallel" | "sequential";
  execute(args: A, context: TopLevelToolContext<D>): Promise<CallResult<D>>;
  toModel?(data: D): ToolModelOutput;
}
export function defineTopLevelTool<A extends Json, D extends Json>(definition: TopLevelTool<A, D>): TopLevelTool {
  if (!definition.resultSchema.description?.trim()) throw new Error(`Missing result schema description: ${definition.id}`);
  const tool = defineTool(definition);
  return { ...definition, ...tool,
    execute: (args, context) => definition.execute(args as A, context as TopLevelToolContext<D>),
    ...(definition.toModel ? { toModel: (data: Json) => definition.toModel!(data as D) } : {}),
  } as TopLevelTool;
}
