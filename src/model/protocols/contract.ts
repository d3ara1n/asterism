import type { ModelProtocolId } from "@asterism-app/sdk/contracts";
import type { wrapLanguageModel } from "ai";
import type { ProtocolTarget } from "../compatibility.ts";
import type { ModelEvent, ModelValidationInput } from "../contract.ts";
import { jsonSchema, type Json, type Usage } from "../../shared/model.ts";
import type { LanguageModelV4 } from "../request-encoding.ts";

export type ProviderOptions = Record<string, Record<string, Json>>;
export type ProviderPart = Awaited<ReturnType<ReturnType<typeof wrapLanguageModel>["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never;
export type ReplayPart = { kind: "thinking"; summary: string; continuation: Json } | { kind: "text" | "toolcall"; continuation: Json };
export type ProtocolRequest =
  | { purpose: "probe" }
  /** `reasoning` is the resolved standard level sent as the SDK reasoning option, when the model reasons and a level is set. */
  | { purpose: "execution"; system?: string; reasoning?: string };

/** Shared connection state for creating one SDK model; transport already carries identity, credentials, and redirect policy. */
export interface ModelConnection { baseURL: string; apiKey: string; fetch: typeof fetch }

/** Per-request decoder for protocol events that AI SDK does not expose as standard stream parts. */
export interface RawDecoder { (raw: Record<string, unknown>): Iterable<ModelEvent> }
/** Per-request meter for protocol-specific output timing and early usage. */
export interface ProtocolMeter {
  observe(part: ProviderPart, usage: Usage | null, thinking: (delta: string) => void): Usage | null;
}

/**
 * Host-owned implementation of one model wire protocol. The common model layer owns request lifecycle,
 * history projection, tool-call pairing, cancellation, and metering; protocols own encoding, decoding,
 * and the shape of their native continuation data.
 */
export interface ModelProtocol {
  readonly id: ModelProtocolId;
  /** Identifies the native continuation encoding produced by this protocol; native data is reused only with an equal format. */
  readonly continuationFormat: string;
  /** Whether AI SDK reasoning-* stream parts carry this protocol's thinking blocks. */
  readonly sdkReasoning: boolean;
  /** Where tool-result files are carried: inside the result, or in a following user message. */
  toolResultFiles(target: ProtocolTarget): "content" | "user-message";
  createModel(target: ProtocolTarget, connection: ModelConnection): LanguageModelV4;
  callOptions(target: ProtocolTarget, request: ProtocolRequest): { system?: string; providerOptions: ProviderOptions };
  validate?(input: ModelValidationInput): void;
  /** Extract allowlisted native values from SDK provider metadata into this protocol's flat continuation record. */
  capture(metadata: unknown): Record<string, Json>;
  /** Re-read stored continuation through the same allowlist. */
  restore(value: Json): Record<string, Json>;
  /** Convert restored continuation into SDK provider options for one replayed part. */
  replay(part: ReplayPart, continuation: Record<string, Json>): ProviderOptions;
  /** Whether a thinking part has input this protocol can encode. */
  replaysThinking(part: { text: string; summary: string }, continuation: Record<string, Json>): boolean;
  decoder?(): RawDecoder;
  /** Protocol-specific terminal failure events beyond the shared `error` event shape. */
  failureEvent?(raw: Record<string, unknown>): boolean;
  meter?(): ProtocolMeter;
  discoveryHeaders(auth: "api_key" | "none", apiKey: string): Headers;
}

function json(value: unknown): Json { return jsonSchema.parse(JSON.parse(JSON.stringify(value))); }
/** Retain only allowlisted native values, not complete SDK metadata or HTTP data. */
export function pickNative(source: unknown, keys: readonly string[]): Record<string, Json> {
  const picked: Record<string, Json> = {};
  if (!source || typeof source !== "object" || Array.isArray(source)) return picked;
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) picked[key] = json(value);
  }
  return picked;
}
export function namespaced(metadata: unknown, namespace: string): unknown {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[namespace] : undefined;
}
export function bearerHeaders(auth: "api_key" | "none", apiKey: string): Headers {
  const headers = new Headers({ accept: "application/json" });
  if (auth === "api_key") headers.set("authorization", `Bearer ${apiKey}`);
  return headers;
}
