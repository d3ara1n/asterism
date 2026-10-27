import { runtime } from "../../runtime";
import type { ContentRange, ContentRef } from "@asterism/sdk/contracts";
import type { ContentReader, RendererContentInput, RendererReceipt } from "@asterism/sdk/renderer";
import { contentChunkSize, contentReadLimit, type ContentCommand, type ContentReply } from "../../../shared/content";

type Target = Extract<ContentCommand, { type: "input.open" }>["target"];
type Source = Extract<ContentCommand, { type: "read.open" }>["source"];
const inputs = new WeakMap<RendererContentInput, { target: Target; scope(): Promise<string | undefined> }>();
async function execute<K extends ContentReply["kind"]>(command: ContentCommand, kind: K): Promise<Extract<ContentReply, { kind: K }>> {
  const result = await runtime.content.execute(command);
  if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  if (result.reply.kind !== kind) throw new Error("Unexpected content response.");
  return result.reply as Extract<ContentReply, { kind: K }>;
}

/** Close the read when a consumer exits for-await early; the chunking protocol is not exposed to plugin components. */
export function contentReader(source: () => Source | Promise<Source>, request = execute): ContentReader {
  const open = async function* (ref: ContentRef, range?: ContentRange): AsyncIterable<Uint8Array> {
    const { readerId } = await request({ type: "read.open", source: await source(), ref, range }, "reader");
    try {
      while (true) {
        const part = await request({ type: "read.next", readerId }, "bytes");
        if (part.done) return;
        yield part.data;
      }
    } finally { await request({ type: "read.close", readerId }, "done").catch(() => {}); }
  };
  return { open, async read(ref, range) {
    const parts: Uint8Array[] = []; let size = 0;
    for await (const part of open(ref, range)) {
      size += part.length;
      if (size > contentReadLimit) throw new Error("Use a content stream or bounded range for large content.");
      parts.push(part);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return bytes;
  } };
}

/** Open drafts lazily; plain text creation performs no content IPC. */
export function contentInput(target: Target): RendererContentInput {
  const bound = { ...target };
  let scope: Promise<string> | undefined, closed = false;
  const checkOpen = () => { if (closed) throw new DOMException("The content input is closed.", "AbortError"); };
  const request: typeof execute = (command, kind) => execute(command, kind).catch(error => {
    checkOpen(); throw error;
  });
  const get = () => {
    checkOpen();
    return scope ??= request({ type: "input.open", target: bound }, "input").then(reply => reply.scopeId);
  };
  const content: RendererContentInput = {
    ...contentReader(async () => ({ scopeId: await get() }), request),
    async stage(source, options = {}) {
      options.signal?.throwIfAborted();
      const scopeId = await get();
      checkOpen();
      const { uploadId } = await request({ type: "upload.begin", scopeId }, "upload");
      const total = source instanceof Uint8Array ? source.byteLength : source.size;
      try {
        for (let offset = 0; offset < total; offset += contentChunkSize) {
          options.signal?.throwIfAborted();
          checkOpen();
          const data = source instanceof Uint8Array ? source.slice(offset, offset + contentChunkSize)
            : new Uint8Array(await source.slice(offset, offset + contentChunkSize).arrayBuffer());
          await request({ type: "upload.write", scopeId, uploadId, offset, data }, "done");
          options.progress?.(Math.min(offset + data.length, total), total);
        }
        options.signal?.throwIfAborted();
        return (await request({ type: "upload.seal", scopeId, uploadId }, "content")).ref;
      } catch (error) {
        await execute({ type: "upload.abort", scopeId, uploadId }, "done").catch(() => {}); throw error;
      }
    },
    async close() {
      if (closed) return; closed = true;
      if (scope) { const scopeId = await scope.catch(() => undefined); if (scopeId) await execute({ type: "input.close", scopeId }, "done").catch(() => {}); }
    },
  };
  inputs.set(content, { target: bound, scope: async () => { checkOpen(); return scope; } });
  return content;
}
export async function contentScopeId(content: RendererContentInput | undefined, target: Target): Promise<string | undefined> {
  if (!content) return undefined;
  const input = inputs.get(content);
  if (!input || input.target.contractId !== target.contractId || input.target.resourceKind !== target.resourceKind
    || input.target.sessionId !== target.sessionId || input.target.objectId !== target.objectId)
    throw new Error("The content input belongs to another command.");
  return input.scope();
}
export async function contentCommand(content: RendererContentInput | undefined, target: Target,
  run: (scopeId: string | undefined) => Promise<RendererReceipt>): Promise<RendererReceipt> {
  try {
    const receipt = await run(await contentScopeId(content, target));
    // Success consumes the draft; failure retains it so the same upload can be retried.
    if (receipt.ok) await content?.close();
    return receipt;
  } catch (error) { return { ok: false, error: { code: "unavailable", message: error instanceof Error ? error.message : "Content input is unavailable." } }; }
}
