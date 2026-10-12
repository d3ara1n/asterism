import type { Json, ModelSettings } from "../shared/model.ts";
import type { ModelItem } from "../session/projection.ts";
import type { SystemPrompt, ModelInputPart } from "@atelier/sdk/contracts";
import type { ModelEvent } from "@atelier/sdk/contracts";

export class ModelFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface ToolDeclaration { name: string; description: string; parameters: Json }
export type { ModelEvent, StreamPart } from "@atelier/sdk/contracts";
export type ResolvedInputPart = Extract<ModelInputPart, { kind: "text" }> | { kind: "file"; data: Uint8Array; mediaType: string; filename?: string };
export type ResolvedModelItem = Exclude<ModelItem, { kind: "input" | "context" }> | { kind: "input" | "context"; parts: readonly ResolvedInputPart[] };
export interface ModelInput { settings: ModelSettings; system: SystemPrompt; messages: ResolvedModelItem[]; tools: ToolDeclaration[] }
export type ModelValidationInput = Omit<ModelInput, "messages"> & { messages: readonly (ModelItem | ResolvedModelItem)[] };
export interface PreparedModel {
  stream(signal: AbortSignal): AsyncIterable<ModelEvent>;
}
export interface ModelAdapter {
  readonly version: string;
  validate(input: ModelValidationInput): void;
  prepare(input: ModelInput): PreparedModel;
}
