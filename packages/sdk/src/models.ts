/** Shared model protocol: independent of resource implementations, agent configuration, and host adapters. */
import type { Json } from "./json.ts";
import type { ModelInputPart } from "./model-input.ts";
import type { ContentReader } from "./content-runtime.ts";
import type { ToolOutcome, ToolInvocationInfo, ToolResult } from "./tool-result.ts";
import type { RequestTiming } from "./model-records.ts";
import type { Presentation } from "./presentation.ts";
import type { ErrorDetails } from "./error-details.ts";

/** Standard levels shared across the application; protocol encoding does not change public values. */
export const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = typeof thinkingLevels[number];
export interface ModelTarget { provider: string; model: string; thinking?: ThinkingLevel }
export interface PromptBlock { id: string; text: string; source?: { id: string; plugin: string | null } }
export interface PromptFile { readonly file: string; readonly text: string }
export interface SystemPrompt { blocks: readonly PromptBlock[] }
/** Reasoning text is the plaintext delivered by the protocol, and summary is an independent summary; both can coexist or be empty, and neither fills the other.
 * continuation carries only native data such as signatures/ciphertext; target projection determines whether it can be reused.
 */
export type ModelPart =
  | { kind: "thinking"; text: string; summary: string; continuation: Json }
  | { kind: "text"; text: string; continuation: Json }
  | { kind: "toolcall"; callId: string; name: string; arguments: Json; continuation: Json };
export type ModelItem =
  | { kind: "input" | "context"; parts: readonly ModelInputPart[] }
  // scope/adapter constrain native data; they do not gate public content in cross-model requests.
  | { kind: "output"; parts: ModelPart[]; scope: string; adapter: string }
  | { kind: "result"; callId: string; name: string; outcome: ToolOutcome };
export interface Usage {
  input: number | null; output: number | null; total: number | null;
  reasoning: number | null; cacheRead: number | null; cacheWrite: number | null;
}
export type StreamPart =
  | { id: string; kind: "text" | "thinking" }
  | { id: string; kind: "toolcall"; callId: string; name: string };
export type ModelEvent =
  | { type: "part.start"; part: StreamPart }
  | { type: "part.delta"; partId: string; delta: string; channel?: "summary" }
  | { type: "part.end"; partId: string; arguments?: Json; continuation?: Json }
  | { type: "finish"; reason: string; usage: Usage | null; responseId?: string; rawFinishReason?: string; source?: ModelSource; timing?: RequestTiming; response?: ModelResponse | null };
export type ModelSource = { model: string; adapter: string; scope: string };
export type ModelCompletion = {
  usage: Usage | null; finishReason: string; rawFinishReason: string | null; providerResponseId: string | null;
  timing?: RequestTiming;
  /** Typed data declared and consumed by the domain; the public layer preserves unknown contracts. */
  extensions?: Presentation[];
};
/** Finalized response blocks; these are not session nodes, and the consumer provides timeline identity and persistence. */
export type ModelBlock = {
  responseId: string; requestParentId: string | null; ordinal: number; complete: boolean; continuation: Json; source: ModelSource;
  /** Terminal state is delivered once with the actual response block having the highest ordinal; null for all other blocks. */
  completion?: ModelCompletion | null;
  /** Block generation start and end times (millisecond timestamps); blocks finalized before generation ends have a null end time, and unrecorded times are omitted. See outcome for tool execution times. */
  startedAt?: number; endedAt?: number | null;
} & (
  | { kind: "thinking"; text: string; summary: string }
  | { kind: "text"; text: string }
  | { kind: "toolcall"; callId: string; name: string; argumentsText: string | null; arguments: Json; outcome: ToolOutcome | null }
);
export type ModelLiveBlock = { id: string; responseId: string; ordinal: number } & (
  | { kind: "text"; text: string; endedAt: number | null }
  | { kind: "thinking"; text: string; startedAt: number; endedAt: number | null }
  /** During the input phase, arguments is a display preview parsed tolerantly and cannot be used for execution; other phases contain complete arguments. */
  | { kind: "toolcall"; name: string; argumentsText: string; arguments: Json; state: "input" | "ready" | "executing";
      invocation: ToolInvocationInfo | null; result: Extract<ToolResult, { kind: "running" }> | null }
);
export type ModelRunEvent =
  | { type: "block"; block: ModelBlock }
  | { type: "progress"; blocks: readonly ModelLiveBlock[] }
  | { type: "diagnostic"; origin: "model" | "software"; code: string; message: string; level: "error" | "warning"; details?: ErrorDetails };
/** Deliver execution events synchronously; consumers save finalized records, exceptions stop execution, and no further events are delivered after returning. */
export interface ModelRunObserver { event(event: ModelRunEvent): undefined }
/** Used only for HTTP request identity; does not enter model messages, history, or resource authorization. */
export interface ModelRequestIdentity {
  userAgent?: string;
  /** Stable within a session; may be omitted for a one-off call without a session. */
  sessionId?: string;
}
/** Transient metadata from the actual HTTP response; contains no request credentials or body and is not automatically written to history. */
export interface ModelResponse {
  connection: { id: string };
  endpoint: string;
  model: string;
  status: number;
  receivedAt: number;
  headers: Readonly<Record<string, string>>;
}
export interface ModelToolCall { callId: string; name: string; arguments: Json }
export interface ModelToolObserver {
  prepared?(call: ModelToolCall, info: ToolInvocationInfo): void;
  started?(call: ModelToolCall, info: ToolInvocationInfo): void;
  published?(call: ModelToolCall, data: Json): void;
}
/** Executable tools supplied by the requesting paradigm or a host-bound request environment. */
export interface ModelTools {
  readonly declarations: readonly { name: string; description: string; parameters: Json }[];
  preview?(name: string, args: Json): ToolInvocationInfo;
  execute(calls: readonly ModelToolCall[], signal: AbortSignal,
    settle: (call: ModelToolCall, outcome: ToolOutcome) => void, observer: ModelToolObserver): Promise<void>;
}
export interface ModelRunRequest extends ModelRequestIdentity {
  /** Opaque conversation position returned in output blocks; the caller owns its meaning. */
  requestParentId: string | null;
  target: ModelTarget;
  system: SystemPrompt;
  messages: ModelItem[];
  tools?: ModelTools;
  cache?: { expectHit: boolean };
  /** Synchronously package domain data after final request preparation; delivered with the actual response's completion. */
  completionExtensions?: (context: ModelRequestContext) => readonly Presentation[];
  signal: AbortSignal;
  observer: ModelRunObserver;
}
export type ModelRunResult = {
  responseId: string | null; source: ModelSource | null; completion: ModelCompletion | null; tools: readonly ToolOutcome[];
  /** Metadata from the last HTTP response received during this call; null if none was received, and excluded from response blocks and history. */
  response: ModelResponse | null;
  /** Measured timing for this call; still available for transient feedback when no terminal state was obtained. */
  timing: RequestTiming | null;
} & ({ reason: "completed" } | { reason: "cancelled" } | { reason: "failed"; code: string; details?: ErrorDetails });
/** The final request's input context; an independent copy for domain extension producers to read. */
export interface ModelRequestContext {
  system: SystemPrompt;
  tools: readonly { name: string; description: string; parameters: Json }[];
}
export interface StreamRequest extends ModelRequestIdentity {
  target: ModelTarget;
  system: SystemPrompt;
  messages: ModelItem[];
  /** The output limit for this completion; uses the smaller of this value and the model's configured limit. */
  maxOutputTokens?: number;
  tools?: { name: string; description: string; parameters: Json }[];
  signal: AbortSignal;
}
export interface ModelInputOptions { content?: ContentReader }
export interface ModelServices {
  /** Check explicit request input and target without sending a model request or saving state. */
  validate(request: Pick<StreamRequest, "target" | "system" | "messages" | "signal" | "userAgent" | "sessionId">, options?: ModelInputOptions): Promise<void>;
  stream(request: StreamRequest, options?: ModelInputOptions): AsyncIterable<ModelEvent>;
  /** One request and its tool batch; neither saves history nor drives the next request. */
  run(request: ModelRunRequest, options?: ModelInputOptions): Promise<ModelRunResult>;
  list(): readonly { model: string; provider: string; name: string; contextWindow: number | null; capabilities: { reasoning: boolean; tools: boolean; thinkingLevels: readonly ThinkingLevel[] } }[];
}
