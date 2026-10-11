import type { Json, ModelSettings } from "../shared/model.ts";
import type { ModelItem } from "../session/projection.ts";
import type { SystemPrompt } from "./system-prompt.ts";
import type { ModelEvent } from "@atelier/sdk/contracts";

export class ModelFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface ToolDeclaration { name: string; description: string; parameters: Json }
export type { ModelEvent, StreamPart } from "@atelier/sdk/contracts";
export interface ModelInput { settings: ModelSettings; system: SystemPrompt; messages: ModelItem[]; tools: ToolDeclaration[] }
export interface PreparedModel {
  stream(signal: AbortSignal): AsyncIterable<ModelEvent>;
}
export interface ModelAdapter {
  readonly version: string;
  prepare(input: ModelInput): PreparedModel;
}
