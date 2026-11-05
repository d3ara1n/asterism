import type { z } from "zod";
import { modelInputLimits, type FileRef, type MessagingMessage, type ModelInputPart, type ResourceRef } from "@asterism-app/sdk/contracts";
import { MessagingError, type ContentScope, type MessagingHandle } from "@asterism-app/sdk/runtime";
import type { AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { imageMediaType } from "../filesystem/image-io.ts";
import { inputPartsToModel } from "../shared/file-parts.ts";
import { chatFileLocatorSchema, type ChatFilePart, type ChatMessage, type chatBindingSchema } from "./contract.ts";

type Binding = z.infer<typeof chatBindingSchema>;

export const chatFileRef = (source: ResourceRef, messageId: string, fileId: string): FileRef =>
  ({ source: { sessionId: source.sessionId, id: source.id, kind: source.kind }, locator: { messageId, fileId } });

/** Address every platform attachment through the Chat; no content is read. */
export function chatMessage(source: ResourceRef, { parts, quote, ...message }: MessagingMessage): ChatMessage {
  const address = (parts: MessagingMessage["parts"]) => parts.map(part => part.kind === "text" ? part
    : { ...part, ref: chatFileRef(source, message.id, part.id) });
  return { ...message, parts: address(parts), ...(quote ? { quote: { parts: address(quote.parts) } } : {}) };
}

/** Delimit quoted content so its text and files remain distinct from the reply's own body. */
export function chatMessageParts(message: ChatMessage): ChatMessage["parts"] {
  return [...message.parts, ...(message.quote ? [
    { kind: "text" as const, text: `Quoted content${message.replyTo ? ` (${message.replyTo})` : ""}:` },
    ...message.quote.parts,
    { kind: "text" as const, text: "End quoted content." },
  ] : [])];
}

/** Chat file provider: the locator selects an attachment within the bound conversation. */
export async function* openChatFile(handle: MessagingHandle, binding: Binding, locator: unknown, signal: AbortSignal): AsyncIterable<Uint8Array> {
  const { messageId, fileId } = chatFileLocatorSchema.parse(locator);
  const { connectionId: _connectionId, ...address } = binding;
  yield* handle.openFile({ ...address, messageId, fileId }, { signal });
}

/** Stage at most limit bytes and accept only a recognized image format, identified from its content. */
export async function captureImage(content: ContentScope, source: AsyncIterable<Uint8Array>, limit: number, signal: AbortSignal) {
  let size = 0, headerSize = 0;
  const header = new Uint8Array(16);
  async function* bounded() {
    for await (const chunk of source) {
      signal.throwIfAborted();
      size += chunk.length;
      if (size > limit) throw new MessagingError("invalid_input", "The image exceeds the model input file size limit.");
      const count = Math.min(header.length - headerSize, chunk.length);
      header.set(chunk.subarray(0, count), headerSize); headerSize += count;
      yield chunk;
    }
  }
  const file = await content.stage(bounded());
  const mediaType = imageMediaType(header.subarray(0, headerSize));
  if (!mediaType) throw new MessagingError("unsupported", "The attachment is not a supported image format (PNG, JPEG, GIF, or WebP).");
  return { file, mediaType, size };
}

const reference = (part: ChatFilePart): Extract<AgentInputPart, { kind: "file-reference" }> => ({
  kind: "file-reference", ref: part.ref, mediaType: part.mediaType,
  ...(part.filename ? { filename: part.filename } : {}), ...(part.size === undefined ? {} : { size: part.size }),
});

/**
 * Agent input for received message parts: images within the input limits become captured model files that keep their
 * reference; other attachments stay references. A failed capture keeps the reference and states the failure as text.
 */
export async function messageInputParts(messageParts: readonly ChatMessage["parts"][number][], open: (part: ChatFilePart) => AsyncIterable<Uint8Array>,
  content: ContentScope, signal: AbortSignal): Promise<AgentInputPart[]> {
  const parts: AgentInputPart[] = [];
  let count = 0, total = 0;
  for (const part of messageParts) {
    if (part.kind === "text") { parts.push(part); continue; }
    const remaining = Math.min(modelInputLimits.file, modelInputLimits.total - total);
    if (!part.mediaType.startsWith("image/")) { parts.push(reference(part)); continue; }
    if (count >= modelInputLimits.files || remaining <= 0 || (part.size !== undefined && part.size > remaining)) {
      parts.push(reference(part), { kind: "text", text: `Image '${part.filename ?? part.id}' was not attached: it exceeds this input's file size or count limit.` });
      continue;
    }
    try {
      const captured = await captureImage(content, open(part), remaining, signal);
      count++; total += captured.size;
      parts.push({ kind: "file", ...captured, ref: part.ref, ...(part.filename ? { filename: part.filename } : {}) });
    } catch (error) {
      signal.throwIfAborted();
      parts.push(reference(part), { kind: "text", text: `Image '${part.filename ?? part.id}' could not be attached: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return parts;
}

const messageHeader = (message: ChatMessage) =>
  `Message ${message.id} · ${message.sender.name} (${message.sender.role}) · ${message.sentAt}${message.replyTo ? ` · reply to ${message.replyTo}` : ""}${message.groupId ? ` · group ${message.groupId}` : ""}`;
/** Read and send results present attachments as references; `see` supplies image content on request. */
export function chatMessagesToModel(messages: readonly ChatMessage[]): ModelInputPart[] {
  return messages.flatMap(message => [{ kind: "text" as const, text: messageHeader(message) },
    ...inputPartsToModel(chatMessageParts(message).map(part => part.kind === "text" ? part : reference(part)))]);
}
