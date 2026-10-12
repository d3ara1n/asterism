import type { ModelFilePart, ModelInputPart, UiText } from "@atelier/sdk/contracts";
import type { RendererContentInput } from "@atelier/sdk/renderer";
import { fileMediaType, modelInputLimits } from "../../../shared/model-media.ts";
import { mediaMessages } from "../../messages/media.ts";

interface DraftFile { part: ModelFilePart; size: number }
interface DraftState { text: string; files: readonly DraftFile[]; uploading: boolean; error: UiText | null }

/** 草稿属于交互模块，独立于 Composer 挂载；内容资格只随提交信封传递。 */
export function createMessageDraft(createContent: () => RendererContentInput) {
  let state: DraftState = { text: "", files: [], uploading: false, error: null };
  let content: RendererContentInput | undefined;
  let upload: AbortController | undefined;
  const listeners = new Set<() => void>();
  const change = (value: Partial<DraftState>) => { state = { ...state, ...value }; for (const listener of listeners) listener(); };
  const input = () => content ??= createContent();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setText: (text: string) => change({ text }),
    content: input,
    parts(): ModelInputPart[] { return [...(state.text.trim() ? [{ kind: "text" as const, text: state.text.trim() }] : []), ...state.files.map(file => file.part)]; },
    async add(files: readonly File[]) {
      if (state.uploading || !files.length) return;
      const controller = new AbortController(); upload = controller;
      change({ uploading: true, error: null });
      try {
        for (const file of files) {
          controller.signal.throwIfAborted();
          // 如实标注 MIME；文件怎么用由服务端决定。
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
      if (state.uploading) return;
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
