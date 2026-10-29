import type { ContentRef, ContentRange } from "./content.ts";
import type { Json } from "./json.ts";

/** Individual reads have a size limit; large content uses bounded byte chunks through open. */
export interface ContentReader {
  read(ref: ContentRef, range?: ContentRange): Promise<Uint8Array>;
  open(ref: ContentRef, range?: ContentRange): AsyncIterable<Uint8Array>;
}
/** Temporary workspace managed by the host; stage neither modifies the session nor establishes persistent references. */
export interface ContentScope extends ContentReader {
  stage(source: Uint8Array | AsyncIterable<Uint8Array>): Promise<ContentRef>;
}

export interface RetainedContentScope extends ContentScope {
  retain(value: Json, source: ContentReader): void;
}
export interface ContentServices {
  /** Temporary conversation/operation content ownership; nested requests can retain their results here. */
  withScope<T>(work: (content: RetainedContentScope) => Promise<T>): Promise<T>;
}
