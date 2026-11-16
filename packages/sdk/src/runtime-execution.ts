import type { ContentReader, RetainedContentScope } from "./content-runtime.ts";
import type { ModelRunRequest, ModelRunResult, ModelRunObserver, PromptFile, SystemPrompt } from "./models.ts";
import type { ResourceRef } from "./workspace.ts";

export interface ResourceModelRequest extends Omit<ModelRunRequest, "tools" | "system" | "sessionId"> {
  /** Resource whose current links and tool caller identity supply this request's access. */
  access: ResourceRef;
  /** Paradigm-defined Agent role name, passed to tool implementations as caller identity. */
  agent?: string;
  system: SystemPrompt | ((files: readonly PromptFile[]) => SystemPrompt);
  tools?: { allow?: readonly string[]; exclude?: readonly string[] };
  /** Resource type policy for calls; inspection retains information and adds a restriction notice. */
  resources?: { allow?: readonly string[]; exclude?: readonly string[] };
  /** Whether this execution has a user interaction endpoint. */
  interactive: boolean;
}
export interface ExecutionContentOptions {
  /** Input content from an independently owned conversation; omission uses the access owner's current history. */
  content?: ContentReader;
  /** Retain tool outputs for subsequent requests in a temporary conversation. */
  output?: RetainedContentScope;
}
export interface ExecutionServices {
  /**
   * Register visible activity for this owned resource until work settles, including waits and cleanup.
   * Work receives a lifetime-bound signal; resource removal and plugin shutdown cancel and await it.
   * Each call owns an independent scope. Progress accepts a fraction in [0, 1], or null to clear it.
   * Viewing notifications does not consume activity. Registration neither changes timeline occupancy nor emits result notifications.
   */
  withActivity<T>(resource: ResourceRef, work: (context: { signal: AbortSignal; progress(value: number | null): void }) => Promise<T>,
    options?: { signal?: AbortSignal }): Promise<T>;
  /** Capture the owner's environment and hold resources through one request and tool batch. Callers own any timeline busy scope. */
  run(request: ResourceModelRequest, options?: ExecutionContentOptions): Promise<ModelRunResult>;
  /** Optional workbench output sink; the caller decides which execution events to send to it. */
  withProgress<T>(resource: ResourceRef, work: (observer: ModelRunObserver) => Promise<T>): Promise<T>;
}
