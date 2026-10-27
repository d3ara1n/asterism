import type { ContentRef } from "./content.ts";
import type { ContentReader } from "./content-runtime.ts";

/** The host binds input drafts to contracts; business input carries only ContentRef. The host closes drafts after command success and preserves them for retry after failure. */
export interface RendererContentInput extends ContentReader {
  stage(source: Blob | Uint8Array, options?: { signal?: AbortSignal; progress?(bytes: number, total: number): void }): Promise<ContentRef>;
  close(): Promise<void>;
}
export interface RendererInputOptions { content?: RendererContentInput }
