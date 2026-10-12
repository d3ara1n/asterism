import type { ContentRef } from "./content.ts";
import type { ContentReader } from "./content-runtime.ts";

/** 输入草稿由宿主绑定契约；业务输入只携带 ContentRef。命令成功后宿主关闭草稿，失败保留可重试。 */
export interface RendererContentInput extends ContentReader {
  stage(source: Blob | Uint8Array, options?: { signal?: AbortSignal; progress?(bytes: number, total: number): void }): Promise<ContentRef>;
  close(): Promise<void>;
}
export interface RendererInputOptions { content?: RendererContentInput }
