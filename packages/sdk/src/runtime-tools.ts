import { defineTool, type ToolContract, type ToolInput } from "./module-contract.ts";
import type { Json } from "./json.ts";
import type { ObjectReader, ToolSession } from "./objects.ts";
import type { CallResult, ToolCaller } from "./runtime-contracts.ts";
import type { ToolModelOutput } from "./tool-result.ts";
import type { z } from "zod";

export interface TopLevelToolContext<D extends Json = Json> {
  readonly object: ObjectReader;
  readonly caller: ToolCaller;
  readonly session: ToolSession;
  readonly callId: string;
  readonly signal: AbortSignal;
  readonly interactive: boolean;
  /** Captured resource-type tool-call restriction, or null when calls are allowed; creation and discovery remain available. */
  resourceToolRestriction(kind: string): string | null;
  publish(data: D): void;
}
/** Top-level tools declare their definition and implementation together, independently of resource support relationships. */
export interface TopLevelTool<A extends ToolInput = ToolInput, D extends Json = Json> extends ToolContract<A> {
  /** Encodes D for progress/history and decodes it for views and model projection. */
  readonly resultSchema: z.ZodType<D>;
  readonly effect: "read" | "write";
  /** Sequential operations share submission order; parallel operations can overlap either lane. */
  readonly execution: "parallel" | "sequential";
  execute(args: A, context: TopLevelToolContext<D>): Promise<CallResult<D>>;
  toModel?(data: D): ToolModelOutput;
}
export function defineTopLevelTool<A extends ToolInput, D extends Json>(definition: TopLevelTool<A, D>): TopLevelTool {
  if (!definition.resultSchema.description?.trim()) throw new Error(`Missing result schema description: ${definition.id}`);
  const tool = defineTool(definition);
  return { ...definition, ...tool,
    execute: (args, context) => definition.execute(args as A, context as TopLevelToolContext<D>),
    ...(definition.toModel ? { toModel: (data: Json) => definition.toModel!(data as D) } : {}),
  } as TopLevelTool;
}
