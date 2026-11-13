import { type ContentRef, type UiText, fileMediaType } from "@asterism-app/sdk/contracts";
import type { AgentInputPart } from "@asterism-app/builtin-api/contracts";
import type { RendererContentInput, ContentReader } from "@asterism-app/sdk/renderer";
import { mediaMessages } from "../../messages/media.ts";

export const composerTextLimit = 100_000;

interface CopiedFile { part: Exclude<AgentInputPart, { kind: "text" }>; size: number }
/** `id` is local to this editor and stable while the file stays attached; it identifies the file to views without depending on list position. */
interface DraftFile extends CopiedFile { id: number }
/** A file accepted into the current addition but not yet in the editor's hold; it keeps its `id` when it becomes a `DraftFile`. */
export interface PendingFile { id: number; name: string; mediaType: string; size: number }
/** `batch` changes whenever the file list is replaced as a whole (restore, send, close), as opposed to single additions and removals. */
interface DraftState {
  text: string; files: readonly DraftFile[]; uploads: readonly PendingFile[]; batch: number;
  uploading: boolean; locked: boolean; error: UiText | null;
}
/** The running addition: cancellation stops later files, and `staging` is the one file currently being handed to the hold. */
interface Upload { cancelled: boolean; staging: { id: number; controller: AbortController } | null }

/** Hands attachments to the editor's own upload hold before removing the persistent root; failure closes the new hold and preserves the original content. */
export async function copyDraft(parts: readonly AgentInputPart[], source: ContentReader, content: RendererContentInput) {
  const copied: AgentInputPart[] = [], files: CopiedFile[] = [];
  try {
    for (const part of parts) {
      if (part.kind === "text") { copied.push({ ...part }); continue; }
      if (part.kind === "file-reference") {
        const reference = structuredClone(part);
        copied.push(reference); files.push({ part: reference, size: 0 }); continue;
      }
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
  let state: DraftState = { text: "", files: [], uploads: [], batch: 0, uploading: false, locked: false, error: null };
  let nextFileId = 0;
  const attach = (file: CopiedFile): DraftFile => ({ ...file, id: nextFileId++ });
  let content: RendererContentInput | undefined;
  let upload: Upload | undefined;
  const listeners = new Set<() => void>();
  const change = (value: Partial<DraftState>) => { state = { ...state, ...value }; for (const listener of listeners) listener(); };
  const input = () => content ??= createContent();
  const cancelUpload = () => {
    if (!upload) return;
    upload.cancelled = true; upload.staging?.controller.abort();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setText: (text: string) => { if (!state.locked) change({ text }); },
    lock: (locked: boolean) => { if (state.locked !== locked) change({ locked }); },
    content: input,
    parts(trim = true): AgentInputPart[] {
      const text = trim ? state.text.trim() : state.text;
      return [...(text ? [{ kind: "text" as const, text }] : []), ...state.files.map(file => file.part)];
    },
    restore(value: CopiedDraft) {
      void content?.close(); content = value.content;
      change({ text: value.text, files: value.files.map(attach), batch: state.batch + 1, error: null });
    },
    async add(files: readonly File[]) {
      if (state.locked || state.uploading || !files.length) return;
      const pending = files.map(file => ({
        file, entry: { id: nextFileId++, name: file.name, mediaType: fileMediaType(file), size: file.size },
      }));
      const current: Upload = { cancelled: false, staging: null }; upload = current;
      change({ uploading: true, uploads: pending.map(item => item.entry), error: null });
      try {
        for (const { entry, file } of pending) {
          if (current.cancelled) break;
          if (!state.uploads.some(item => item.id === entry.id)) continue;
          const controller = new AbortController(); current.staging = { id: entry.id, controller };
          let ref: ContentRef;
          try { ref = await input().stage(file, { signal: controller.signal }); }
          catch (error) { if (controller.signal.aborted) continue; throw error; }
          finally { current.staging = null; }
          // A file removed or cancelled while staging does not enter the editor, even if staging finished anyway.
          if (controller.signal.aborted) continue;
          change({
            files: [...state.files, { id: entry.id, size: entry.size, part: { kind: "file", file: ref, mediaType: entry.mediaType, ...(entry.name ? { filename: entry.name } : {}) } }],
            uploads: state.uploads.filter(item => item.id !== entry.id),
          });
        }
      } catch { if (!current.cancelled) change({ error: mediaMessages.failed }); }
      finally { if (upload === current) { upload = undefined; change({ uploading: false, uploads: [] }); } }
    },
    cancelUpload,
    /** Withdraws one pending file: a queued file is skipped and the file being staged is aborted; the rest of the addition continues. */
    removeUpload(id: number) {
      if (state.locked) return;
      if (upload?.staging?.id === id) upload.staging.controller.abort();
      change({ uploads: state.uploads.filter(item => item.id !== id) });
    },
    remove(index: number) {
      if (state.locked || state.uploading) return;
      change({ files: state.files.filter((_, i) => i !== index), error: null });
      if (!state.files.length) { void content?.close(); content = undefined; }
    },
    accepted(text = "") {
      void content?.close(); content = undefined;
      change({ text, files: [], batch: state.batch + 1, error: null });
    },
    async close() {
      cancelUpload();
      await content?.close(); content = undefined;
      change({ text: "", files: [], uploads: [], batch: state.batch + 1, error: null });
    },
  };
}
export type MessageDraft = ReturnType<typeof createMessageDraft>;
