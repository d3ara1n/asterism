import { z } from "zod";
import type { Json, JsonObject } from "./json.ts";
import { contractReferenceSchema, type ContractReference, type DataContract } from "./presentation.ts";

export interface ResourceContract<S extends Json = Json> {
  kind: string;
  /** Decodes saved state; creation callbacks return S for encoding before persistence. State is arbitrary JSON, stored separately from host identity and title. */
  stateSchema: z.ZodType<S>;
}
/** Tool inputs are structured parameter objects or null; object members may contain any JSON value. */
export type ToolInput = JsonObject | null;
/** The transport supplies JSON values; this schema constrains only their root shape. */
export const toolInputSchema = z.looseObject({}).nullable() as z.ZodType<ToolInput>;

interface ToolMetadata extends ContractReference {
  name: string;
  description: string;
  guidelines: readonly string[];
  /** Execution requires an endpoint that can receive user interaction. Output rendering alone does not require it. */
  requiresInteraction?: boolean;
  /**
   * Each validated invocation requests user attention once when execution starts, independently of interaction endpoint requirements.
   * The host raises an attention notification for the caller and exposes a transient live-call highlight. Viewing consumes the reminder;
   * the notice does not change execution state or track unresolved business work.
   */
  requiresNotice?: boolean;
}
export interface StructuredToolContract<A extends ToolInput = ToolInput> extends ToolMetadata {
  kind?: "structured";
  /** Structured parameters; a tool determines its fields and whether null is accepted. */
  argsSchema: z.ZodType<A>;
}
export interface FreeformToolContract extends ToolMetadata {
  kind: "freeform";
  argsSchema?: never;
}
export type ToolContract<A extends ToolInput = ToolInput> = StructuredToolContract<A> | FreeformToolContract;

interface ImplementationMetadata<S extends Json, O extends Json> extends DataContract<O> {
  resource: ResourceContract<S>;
  effect: "read" | "write";
  /** Sequential operations share submission order; parallel operations can overlap either lane. */
  execution: "parallel" | "sequential";
}
/** Implementations of structured tools add a target schema; freeform implementations receive the original text. */
export interface StructuredImplementationContract<S extends Json, T extends ToolInput, A extends ToolInput, O extends Json> extends ImplementationMetadata<S, O> {
  tool: StructuredToolContract<A>;
  /** Structured selection within the resource; each implementation determines whether null is accepted. */
  targetSchema: z.ZodType<T>;
}
export interface FreeformImplementationContract<S extends Json, O extends Json> extends ImplementationMetadata<S, O> {
  tool: FreeformToolContract;
  targetSchema?: never;
}
export type ImplementationContract<S extends Json, T extends ToolInput, A extends ToolInput, O extends Json> =
  StructuredImplementationContract<S, T, A, O> | FreeformImplementationContract<S, O>;
export function defineResource<S extends Json>(kind: string, stateSchema: z.ZodType<S>): ResourceContract<S> {
  return { kind, stateSchema };
}
/** Tool args/target/result are projected as JSON Schema for the model; representability is validated at declaration time to avoid failures only when invoked. */
function requireDescription(schema: z.ZodType, subject: string): void {
  if (!schema.description?.trim()) throw new Error(`Missing schema description: ${subject}`);
  try { z.toJSONSchema(schema); } catch (error) { throw new Error(`Schema is not representable as JSON Schema: ${subject}`, { cause: error }); }
}
export function defineTool<A extends ToolInput>(definition: StructuredToolContract<A>): StructuredToolContract<A>;
export function defineTool(definition: FreeformToolContract): FreeformToolContract;
export function defineTool(definition: ToolContract): ToolContract;
export function defineTool(definition: ToolContract): ToolContract {
  if (!definition.name.trim() || !definition.description.trim()) throw new Error("Tool name and description must not be empty.");
  if (definition.guidelines.some(guideline => !guideline.trim())) throw new Error(`Empty tool guideline: ${definition.name}`);
  if (definition.kind === "freeform") {
    if (/\s/.test(definition.name)) throw new Error(`Freeform tool names must be a single token: ${definition.name}`);
    if ("argsSchema" in definition) throw new Error(`Freeform tools do not declare an args schema: ${definition.name}`);
  } else requireDescription(definition.argsSchema, `${definition.name}.args`);
  return { ...definition, ...contractReferenceSchema.parse({ id: definition.id }), guidelines: [...definition.guidelines] };
}
export function defineImplementation<S extends Json, T extends ToolInput, A extends ToolInput, O extends Json>(
  definition: StructuredImplementationContract<S, T, A, O>,
): StructuredImplementationContract<S, T, A, O>;
export function defineImplementation<S extends Json, O extends Json>(
  definition: FreeformImplementationContract<S, O>,
): FreeformImplementationContract<S, O>;
export function defineImplementation<S extends Json, T extends ToolInput, A extends ToolInput, O extends Json>(
  definition: ImplementationContract<S, T, A, O>,
): ImplementationContract<S, T, A, O>;
export function defineImplementation(definition: ImplementationContract<Json, ToolInput, ToolInput, Json>) {
  if (definition.tool.kind === "freeform") {
    if ("targetSchema" in definition) throw new Error(`Freeform tools do not declare a target schema: ${definition.id}`);
  } else requireDescription(definition.targetSchema!, `${definition.id}.target`);
  requireDescription(definition.schema, `${definition.id}.result`);
  return definition;
}
