import { modelInputPartsSchema, type ContentRef, type ModelInputPart, type ModelItem } from "@asterism-app/sdk/contracts";
import type { ContentReader } from "@asterism-app/sdk/runtime";
import { ModelFailure, type ResolvedInputPart, type ResolvedModelItem } from "./contract.ts";

export interface ModelContent {
  reader: ContentReader;
  close(): Promise<void>;
}
/** User input, context, and tool results share text | file parts. */
function itemParts(item: ModelItem): readonly ModelInputPart[] | null {
  return item.kind === "input" || item.kind === "context" ? item.parts : item.kind === "result" ? item.outcome.model : null;
}
export function inputReferences(messages: readonly ModelItem[]): ContentRef[] {
  return messages.flatMap(item => {
    const raw = itemParts(item);
    if (!raw) return [];
    const parsed = modelInputPartsSchema.safeParse(raw);
    if (!parsed.success) throw new ModelFailure("invalid_input", "The model input parts are invalid.");
    return parsed.data.flatMap(part => part.kind === "file" ? [part.file] : []);
  });
}
/** Generate byte parts only within model requests without creating another persistent context. */
export async function resolveInput(messages: readonly ModelItem[], content: ModelContent | undefined,
  signal: AbortSignal): Promise<ResolvedModelItem[]> {
  const result: ResolvedModelItem[] = [];
  const bytes = new Map<string, Uint8Array>();
  for (const item of messages) {
    signal.throwIfAborted();
    if (item.kind === "output") { result.push(item); continue; }
    const parts: ResolvedInputPart[] = [];
    for (const part of itemParts(item)!) {
      signal.throwIfAborted();
      if (part.kind === "text") { parts.push(part); continue; }
      const id = part.file["$asterism.content"];
      let data = bytes.get(id);
      if (!data) {
        try { data = await content!.reader.read(part.file); }
        catch { throw new ModelFailure("content_unavailable", "The model input content could not be read or is damaged."); }
        bytes.set(id, data);
      }
      signal.throwIfAborted();
      parts.push({ kind: part.kind, data, mediaType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}) });
    }
    result.push(item.kind === "result"
      ? { kind: "result", callId: item.callId, name: item.name, error: item.outcome.kind !== "succeeded" && item.outcome.kind !== "partial", parts }
      : { kind: item.kind, parts });
  }
  return result;
}
