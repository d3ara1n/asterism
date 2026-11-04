import type { Json, ModelSettings } from "../shared/model.ts";
import type { ModelItem, SystemPrompt, ModelInputPart, ModelRequestIdentity, ModelResponse, ModelEvent, RequestTiming, ErrorDetails, Usage } from "@asterism-app/sdk/contracts";

export class ModelFailure extends Error {
  timing?: RequestTiming;
  response?: ModelResponse | null;
  usage?: Usage | null;
  providerResponseId?: string;
  constructor(readonly code: string, message: string, public details?: ErrorDetails,
    readonly origin: "model" | "software" = "software", readonly retryable = false) { super(message); }
}
export interface ToolDeclaration { name: string; description: string; parameters: Json }
export type { ModelEvent, StreamPart } from "@asterism-app/sdk/contracts";
export type ResolvedInputPart = Extract<ModelInputPart, { kind: "text" }> | { kind: "file"; data: Uint8Array; mediaType: string; filename?: string };
/** Tool results retain only success/failure and parts needed by the model; UI data and execution metadata stay outside requests. */
export type ResolvedModelItem = Extract<ModelItem, { kind: "output" }>
  | { kind: "input" | "context"; parts: readonly ResolvedInputPart[] }
  | { kind: "result"; callId: string; name: string; error: boolean; parts: readonly ResolvedInputPart[] };
export interface ModelInput extends ModelRequestIdentity { settings: ModelSettings; system: SystemPrompt; messages: ResolvedModelItem[]; tools: ToolDeclaration[]; maxOutputTokens?: number }
export type ModelValidationInput = Omit<ModelInput, "messages"> & { messages: readonly (ModelItem | ResolvedModelItem)[] };
export interface PreparedModel {
  stream(signal: AbortSignal): AsyncIterable<ModelEvent>;
}
export interface ModelAdapter {
  /** Native continuation format this adapter produces for the target; recorded as the output's `adapter` origin. */
  format(settings: ModelSettings): string;
  validate(input: ModelValidationInput): void;
  prepare(input: ModelInput): PreparedModel;
}
