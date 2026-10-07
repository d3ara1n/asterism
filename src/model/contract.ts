import type { Json, ModelSettings, Part, Usage } from "../shared/conversation.ts";
import type { ModelItem } from "../conversation/projection.ts";

export class ModelFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface ToolDeclaration { name: string; description: string; parameters: Json }
export type ModelEvent =
  | { type: "part.start"; part: Part }
  | { type: "part.delta"; partId: string; delta: string }
  | { type: "part.end"; partId: string; arguments?: Json }
  | { type: "finish"; reason: string; usage: Usage | null; replay: Json; responseId?: string; rawFinishReason?: string };
export interface ModelInput { settings: ModelSettings; system: string; messages: ModelItem[]; tools: ToolDeclaration[] }
export interface PreparedModel {
  /** 可序列化、无凭据的实际 SDK 输入；版本由 adapter 标识。 */
  input: Json;
  stream(signal: AbortSignal): AsyncIterable<ModelEvent>;
}
export interface ModelAdapter {
  readonly version: string;
  prepare(input: ModelInput): PreparedModel;
}
