/** SDK runtime entry point: generic service interfaces available to backend plugins; excludes host internal types and domain knowledge. */
import type { Json } from "./json.ts";
import type { UiText } from "./i18n.ts";
import type { ResourceRef } from "./workspace.ts";
export * from "./runtime-contracts.ts";
export * from "./runtime-resources.ts";
export * from "./runtime-calls.ts";
export * from "./runtime-channels.ts";
export * from "./runtime-tools.ts";
export type * from "./runtime-model-providers.ts";
export * from "./runtime-usage.ts";
export * from "./runtime-web.ts";
export * from "./runtime-agent-catalog.ts";
export * from "./runtime-sessions.ts";
export type * from "./content-runtime.ts";
export type * from "./models.ts";
export type * from "./runtime-execution.ts";
export { validationMessage, jsonArgumentHint } from "./tool-validation.ts";

/** Stable plugin API error: code supports plugin branching, and message is used for logs. */
export class PluginApiError extends Error {
  constructor(readonly code: "invalid_argument" | "foreign_resource" | "foreign_event" | "unavailable" | "rejected" | "conflict" | "not_found", message: string,
    /** Business reason codes for preparation rejection or model input preflight checks. */
    readonly reason?: string, readonly display?: UiText) { super(message); }
}
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
/** Backend handle for host-managed configuration: get reads the current value each time; update uses the latest complete configuration; subscribe receives changes from settings pages or other modules. */
export interface PluginConfig<T extends Json> {
  get(): T;
  update(next: (current: T) => T): void;
  subscribe(listener: (value: T) => void): () => void;
}
/** Namespaced credentials: plaintext exists only in the system-protected vault, while plugin directories store only references. */
export interface PluginSecrets {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
/** Host-managed asynchronous tasks: object removal and shutdown cancel owned work and await completion; tasks are not resumed after restart. */
export interface PluginTasks {
  /** Object-bound tasks protect the timeline by default; external runtime work can opt out while retaining lifetime ownership. */
  start(key: string, run: (signal: AbortSignal) => Promise<void>, options?: { timeoutMs?: number; object?: ResourceRef; affectsHistory?: boolean }): boolean;
  cancel(key: string): void;
  has(key: string): boolean;
}

export type * from "./runtime-application.ts";

export * from "./runtime-shell.ts";
export * from "./runtime-terminal.ts";
export type * from "./runtime-mcp.ts";
