import type { FileRef } from "./files.ts";

/** Each consumption resolves the source anew. Passing or storing a reference performs no I/O and retains no bytes. */
export interface FileServices {
  /** Pull bytes from the source resource. Breaking iteration closes the stream; cancellation rejects further pulls. Provider errors propagate to the consumer. */
  open(ref: FileRef, options?: { signal?: AbortSignal }): AsyncIterable<Uint8Array>;
}
