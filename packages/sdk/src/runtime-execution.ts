import type { ContentReader, RetainedContentScope } from "./content-runtime.ts";
import type { ModelRunRequest, ModelRunResult, ModelRunObserver, PromptFile, SystemPrompt } from "./models.ts";
import type { ResourceRef } from "./workspace.ts";

export interface ResourceModelRequest extends Omit<ModelRunRequest, "tools" | "system" | "sessionId"> {
  /** Resource whose current links and tool caller identity supply this request's access. */
  access: ResourceRef;
  system: SystemPrompt | ((files: readonly PromptFile[]) => SystemPrompt);
  tools?: { allow?: readonly string[]; exclude?: readonly string[] };
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
  /** Capture the owner's current environment, execute one request and tool batch, then release request holds. */
  run(request: ResourceModelRequest, options?: ExecutionContentOptions): Promise<ModelRunResult>;
  /** Optional workbench output sink; the caller decides which execution events to send to it. */
  withProgress<T>(resource: ResourceRef, work: (observer: ModelRunObserver) => Promise<T>): Promise<T>;
}
