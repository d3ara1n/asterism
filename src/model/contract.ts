import type { Json, ModelSettings, Usage } from "../shared/model.ts";
import type { ModelItem } from "../session/projection.ts";
import type { SystemPrompt } from "./system-prompt.ts";

export class ModelFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface ToolDeclaration { name: string; description: string; parameters: Json }
export type StreamPart = { id: string; kind: "text" | "thinking" } | { id: string; kind: "toolcall"; callId: string; name: string };
/** 适配器输出的流事件；增量只在运行时内存累积，块结束时才成为会话树节点。 */
export type ModelEvent =
  | { type: "part.start"; part: StreamPart }
  | { type: "part.delta"; partId: string; delta: string }
  | { type: "part.end"; partId: string; arguments?: Json; continuation?: Json }
  | { type: "finish"; reason: string; usage: Usage | null; responseId?: string; rawFinishReason?: string };
export interface ModelInput { settings: ModelSettings; system: SystemPrompt; messages: ModelItem[]; tools: ToolDeclaration[] }
export interface PreparedModel {
  stream(signal: AbortSignal): AsyncIterable<ModelEvent>;
}
export interface ModelAdapter {
  readonly version: string;
  prepare(input: ModelInput): PreparedModel;
}
