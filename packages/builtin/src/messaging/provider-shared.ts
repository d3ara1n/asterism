import { MessagingError, type PluginContext } from "@asterism-app/sdk/runtime";
import { fileMediaType, type FileReferencePart, type MessagingConversation, type MessagingEvent, type MessagingMessage, type MessagingFileQuery, type MessagingFilePart, type SendMessage } from "@asterism-app/sdk/contracts";
import { ObservedMessages } from "./observed-store.ts";

export interface ObservedMessage { conversation: MessagingConversation; message: MessagingMessage; aliases?: readonly string[] }
/** Apply one provider's SDK error mapping while preserving operation cancellation. */
export const providerCall = (mapError: (error: unknown) => unknown) => async <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
  signal.throwIfAborted();
  try { return await work(); }
  catch (error) { signal.throwIfAborted(); throw mapError(error); }
};

/** Platforms with one caption field combine text parts and send the referenced attachments in their original order. */
export function outgoingMessage({ parts, ...address }: SendMessage) {
  return { ...address, text: parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n"),
    files: parts.flatMap(part => part.kind === "file-reference" ? [part] : []) };
}
/** Verify that an attachment belongs to the addressed observed message; returns both for platform lookups. */
export function observedFile(store: ObservedMessages, query: MessagingFileQuery): { message: MessagingMessage; file: MessagingFilePart } {
  const message = store.message(query.conversationId, query.messageId);
  const file = message && [...message.parts, ...(message.quote?.parts ?? [])]
    .find((part): part is MessagingFilePart => part.kind === "file" && part.id === query.fileId);
  if (!message || !file || (query.threadId && message.threadId !== query.threadId && message.id !== query.threadId))
    throw new MessagingError("invalid_input", "The attachment does not belong to this conversation and message.");
  return { message, file };
}
export async function* downloadFile(url: string, signal: AbortSignal, headers?: Record<string, string>): AsyncIterable<Uint8Array> {
  const response = await fetch(url, { signal, headers });
  if (!response.ok || !response.body) throw new MessagingError(response.status >= 500 ? "request_failed" : "unavailable", `Attachment download failed (HTTP ${response.status}).`);
  const reader = response.body.getReader();
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) return; yield chunk.value; }
  } finally { await reader.cancel(); reader.releaseLock(); }
}
export function messageObserver(store: ObservedMessages, publish: (event: MessagingEvent) => void) {
  return ({ conversation, message, aliases }: ObservedMessage, notify = true) => {
    for (const alias of aliases ?? []) store.alias(conversation.conversationId, alias, message.id);
    const value = message.replyTo ? { ...message, replyTo: store.resolveId(conversation.conversationId, message.replyTo) } : message;
    const result = store.observe(conversation, value);
    if (result.discovered) publish({ kind: "conversation.discovered", conversation });
    if (notify && result.inserted) publish({ kind: "messages.received", conversation, messages: [value] });
    return value;
  };
}

/** Resolve every file before any message is sent. File references remain owned by their original resource. */
export async function messagingFiles(plugin: Pick<PluginContext, "files">, files: readonly FileReferencePart[], signal: AbortSignal) {
  return Promise.all(files.map(async file => {
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of plugin.files.open(file.ref, { signal })) {
        size += chunk.byteLength;
        chunks.push(chunk);
      }
      signal.throwIfAborted();
      return { name: file.filename ?? "file", mediaType: fileMediaType({ name: file.filename ?? "", type: file.mediaType ?? "" }), bytes: Buffer.concat(chunks, size) };
    } catch (error) {
      signal.throwIfAborted();
      throw new MessagingError("invalid_input", `File '${file.filename ?? "file"}' could not be read: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }));
}

/** SDK requests use a per-operation signal without changing the shared client's credentials. */
export const scopedFetch = (signal: AbortSignal): typeof fetch => (input, init) => {
  const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return fetch(input, { ...init, signal: upstream ? AbortSignal.any([signal, upstream]) : signal });
};

/** End receiving on cancellation or SDK failure, then stop the transport before the host retries it. */
export async function receiveConnection(signal: AbortSignal, configure: (scope: {
  signal: AbortSignal; fail(error: unknown): void;
}) => { start(): Promise<unknown>; stop?(): void | Promise<void> }): Promise<void> {
  signal.throwIfAborted();
  const controller = new AbortController();
  let fail!: (error: unknown) => void;
  const ended = new Promise<void>((_resolve, reject) => { fail = reject; });
  const abort = () => fail(signal.reason);
  const transport = configure({ signal: controller.signal, fail });
  signal.addEventListener("abort", abort, { once: true });
  const starting = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return transport.start(); }).catch(fail);
  try { await ended; }
  finally {
    signal.removeEventListener("abort", abort);
    controller.abort();
    await transport.stop?.();
    await starting;
  }
}
