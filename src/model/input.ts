import { modelInputPartsSchema, type ContentRef, type ModelInputPart, type ModelItem, modelInputLimits } from "@asterism/sdk/contracts";
import type { ContentReader } from "@asterism/sdk/runtime";
import { ModelFailure, type ResolvedInputPart, type ResolvedModelItem } from "./contract.ts";

export interface ModelContent {
  reader: ContentReader;
  sizes: ReadonlyMap<string, number>;
  close(): Promise<void>;
}
/** 用户输入、context 与工具结果共用 text | file 部件。 */
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
export function validateInput(messages: readonly ModelItem[], content?: ModelContent): void {
  inputReferences(messages);
  let count = 0, total = 0;
  for (const item of messages) {
    for (const part of itemParts(item) ?? []) {
      if (part.kind === "text") continue;
      const size = content?.sizes.get(part.file["$asterism.content"]);
      if (size === undefined) throw new ModelFailure("content_scope", "The model input requires an authorized content reader.");
      total += size; count++;
      if (size > modelInputLimits.file || total > modelInputLimits.total || count > modelInputLimits.files)
        throw new ModelFailure("content_limit", "The model input exceeds the file count or size limit.");
    }
  }
}
/** 只在模型请求内生成字节部件，不建立另一份持久上下文。 */
export async function resolveInput(messages: readonly ModelItem[], content: ModelContent | undefined,
  signal: AbortSignal): Promise<ResolvedModelItem[]> {
  validateInput(messages, content);
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
