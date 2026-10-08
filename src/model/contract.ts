import type { Json, ModelSettings, Part, Usage } from "../shared/conversation.ts";
import type { ModelItem } from "../conversation/projection.ts";
import type { SystemPrompt } from "./system-prompt.ts";

export class ModelFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface ToolDeclaration { name: string; description: string; parameters: Json }
export type ModelEvent =
  | { type: "part.start"; part: Part }
  | { type: "part.delta"; partId: string; delta: string }
  | { type: "part.end"; partId: string; arguments?: Json }
  | { type: "finish"; reason: string; usage: Usage | null; replay: Json; responseId?: string; rawFinishReason?: string };
export interface ModelInput { settings: ModelSettings; system: SystemPrompt; messages: ModelItem[]; tools: ToolDeclaration[] }
export interface PreparedModel {
  stream(signal: AbortSignal): AsyncIterable<ModelEvent>;
}
export interface ModelAdapter {
  readonly version: string;
  prepare(input: ModelInput): PreparedModel;
}
