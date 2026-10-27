import { type ModelFilePart, type ModelInputPart, type UiText, fileMediaType, modelInputLimits } from "@asterism/sdk/contracts";
import type { RendererContentInput, ContentReader } from "@asterism/sdk/renderer";
import { mediaMessages } from "../../messages/media.ts";

interface DraftFile { part: ModelFilePart; size: number }
interface DraftState { text: string; files: readonly DraftFile[]; uploading: boolean; locked: boolean; error: UiText | null }

/** Hands attachments to the editor's own upload hold before removing the persistent root; failure closes the new hold and preserves the original content. */
export async function copyDraft(parts: readonly ModelInputPart[], source: ContentReader, content: RendererContentInput) {
  const copied: ModelInputPart[] = [], files: DraftFile[] = [];
  try {
    for (const part of parts) {
      if (part.kind === "text") { copied.push({ ...part }); continue; }
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      for await (const chunk of source.open(part.file)) chunks.push(Uint8Array.from(chunk));
      const blob = new Blob(chunks, { type: part.mediaType });
      const file = { ...part, file: await content.stage(blob) };
      copied.push(file); files.push({ part: file, size: blob.size });
    }
    return { parts: copied, text: parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n"), files, content };
  } catch (error) { await content.close(); throw error; }
}
export type CopiedDraft = Awaited<ReturnType<typeof copyDraft>>;

/** Drafts belong to the interaction module, independently of Composer mounting; content access eligibility travels only with the submission envelope. */
export function createMessageDraft(createContent: () => RendererContentInput) {
  let state: DraftState = { text: "", files: [], uploading: false, locked: false, error: null };
  let content: RendererContentInput | undefined;
  let upload: AbortController | undefined;
  const listeners = new Set<() => void>();
  const change = (value: Partial<DraftState>) => { state = { ...state, ...value }; for (const listener of listeners) listener(); };
  const input = () => content ??= createContent();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setText: (text: string) => { if (!state.locked) change({ text }); },
    lock: (locked: boolean) => change({ locked }),
    content: input,
    parts(trim = true): ModelInputPart[] {
      const text = trim ? state.text.trim() : state.text;
      return [...(text ? [{ kind: "text" as const, text }] : []), ...state.files.map(file => file.part)];
    },
    restore(value: CopiedDraft) {
      void content?.close(); content = value.content;
      change({ text: value.text, files: value.files, error: null });
    },
    async add(files: readonly File[]) {
      if (state.locked || state.uploading || !files.length) return;
      const controller = new AbortController(); upload = controller;
      change({ uploading: true, error: null });
      try {
        for (const file of files) {
          controller.signal.throwIfAborted();
          // Label MIME accurately; the server decides how files are used.
          const mediaType = fileMediaType(file);
          if (state.files.length >= modelInputLimits.files || file.size > modelInputLimits.file
            || state.files.reduce((total, value) => total + value.size, file.size) > modelInputLimits.total) {
            change({ error: mediaMessages.limit }); break;
          }
          const ref = await input().stage(file, { signal: controller.signal });
          controller.signal.throwIfAborted();
          change({ files: [...state.files, { size: file.size, part: { kind: "file", file: ref, mediaType, ...(file.name ? { filename: file.name } : {}) } }] });
        }
      } catch { if (!controller.signal.aborted) change({ error: mediaMessages.failed }); }
      finally { if (upload === controller) { upload = undefined; change({ uploading: false }); } }
    },
    cancelUpload: () => upload?.abort(),
    remove(index: number) {
      if (state.locked || state.uploading) return;
      change({ files: state.files.filter((_, i) => i !== index), error: null });
      if (!state.files.length) { void content?.close(); content = undefined; }
    },
    accepted() {
      void content?.close(); content = undefined;
      change({ text: "", files: [], error: null });
    },
    async close() {
      upload?.abort();
      await content?.close(); content = undefined;
      change({ text: "", files: [], error: null });
    },
  };
}
export type MessageDraft = ReturnType<typeof createMessageDraft>;
