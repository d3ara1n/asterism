import { defineTool, type StructuredToolContract, type FreeformToolContract, type ToolInput } from "./module-contract.ts";
import type { Json } from "./json.ts";
import type { ObjectReader, ToolSession } from "./objects.ts";
import type { CallResult, ToolCaller } from "./runtime-contracts.ts";
import type { ToolModelOutput } from "./tool-result.ts";
import type { UsageSubject } from "./usage-subjects.ts";
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
  /**
   * Declare a subject this call used, such as the skill it read. The host records declarations with this call when it settles,
   * attributed to the declaring plugin and the calling request; declarations after the call settles are ignored. Invalid subjects are logged and omitted.
   */
  recordUsage(subject: UsageSubject): void;
}
/** Top-level tools declare their definition and implementation together, independently of resource support relationships. */
interface TopLevelExecution<D extends Json> {
  /** Encodes D for progress/history and decodes it for views and model projection. */
  readonly resultSchema: z.ZodType<D>;
  readonly effect: "read" | "write";
  /** Sequential operations share submission order; parallel operations can overlap either lane. */
  readonly execution: "parallel" | "sequential";
  toModel?(data: D): ToolModelOutput;
}
export interface StructuredTopLevelTool<A extends ToolInput, D extends Json> extends StructuredToolContract<A>, TopLevelExecution<D> {
  execute(args: A, context: TopLevelToolContext<D>): Promise<CallResult<D>>;
}
export interface FreeformTopLevelTool<D extends Json> extends FreeformToolContract, TopLevelExecution<D> {
  execute(input: string, context: TopLevelToolContext<D>): Promise<CallResult<D>>;
}
export type TopLevelTool<A extends ToolInput = ToolInput, D extends Json = Json> = StructuredTopLevelTool<A, D> | FreeformTopLevelTool<D>;
export function defineTopLevelTool<A extends ToolInput, D extends Json>(definition: StructuredTopLevelTool<A, D>): StructuredTopLevelTool<ToolInput, Json>;
export function defineTopLevelTool<D extends Json>(definition: FreeformTopLevelTool<D>): FreeformTopLevelTool<Json>;
export function defineTopLevelTool(definition: TopLevelTool): TopLevelTool {
  if (!definition.resultSchema.description?.trim()) throw new Error(`Missing result schema description: ${definition.id}`);
  if (definition.kind === "freeform") return { ...definition, ...defineTool(definition),
    execute: (input: string, context: TopLevelToolContext) => definition.execute(input, context),
    ...(definition.toModel ? { toModel: data => definition.toModel!(data) } : {}),
  };
  return { ...definition, ...defineTool(definition),
    execute: (args, context) => definition.execute(args, context),
    ...(definition.toModel ? { toModel: data => definition.toModel!(data) } : {}),
  };
}
