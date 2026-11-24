import type { ContentRef } from "./content.ts";
import type { ContentReader } from "./content-runtime.ts";

/** The host binds input drafts to contracts; business input carries only ContentRef. The host closes drafts after command success and preserves them for retry after failure. */
export interface RendererContentInput extends ContentReader {
  stage(source: Blob | Uint8Array, options?: { signal?: AbortSignal; progress?(bytes: number, total: number): void }): Promise<ContentRef>;
  /** Release this draft's hold on the reference. Captured submissions and persistent references are unaffected. */
  release(ref: ContentRef): Promise<void>;
  close(): Promise<void>;
}
export interface RendererInputOptions { content?: RendererContentInput }
