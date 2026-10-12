import type { ContentRef, ContentRange } from "./content.ts";

/** 单次读取有大小限制；大内容使用 open 的有界字节块。 */
export interface ContentReader {
  read(ref: ContentRef, range?: ContentRange): Promise<Uint8Array>;
  open(ref: ContentRef, range?: ContentRange): AsyncIterable<Uint8Array>;
}
/** 宿主管理的临时工作空间；stage 不修改会话或建立持久引用。 */
export interface ContentScope extends ContentReader {
  stage(source: Uint8Array | AsyncIterable<Uint8Array>): Promise<ContentRef>;
}
