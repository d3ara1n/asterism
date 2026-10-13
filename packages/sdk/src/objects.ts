import type { Json } from "./json.ts";
import type { DataContract } from "./presentation.ts";
import type { RecordContract } from "./records.ts";
import type { ResourceRef, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";
import type { ContentReader, ContentScope } from "./content-runtime.ts";

/** 同步事务中的数据与事件写入；宿主限制 writer 的调用有效期。 */
export interface SessionWriter {
  /** 所有追加记录均进入历史路径并推进游标。 */
  append<T extends Json>(contract: RecordContract<T>, data: NoInfer<T>): string;
  set<T extends Json>(contract: DataContract<T>, data: NoInfer<T>): void;
}
export type ObjectWriter = SessionWriter;
export interface SessionReader {
  readonly id: string;
  readonly content: ContentReader;
  snapshot(): SessionSnapshot;
  get<T extends Json>(contract: DataContract<T>): T | null;
  readonly title: { get(): string };
}
export interface SessionExecutor extends SessionReader {
  commit(work: (writer: SessionWriter) => undefined): void;
  /** set 直接覆盖会话标题；可在同步 commit 内调用并随其提交或回滚。 */
  readonly title: SessionReader["title"] & { set(text: string): void };
}
export interface ObjectReader {
  readonly ref: ResourceRef;
  readonly content: ContentReader;
  readonly session: SessionReader;
  /** 调用绑定的资源快照；创建事务内尚未建立身份时为 null。 */
  snapshot(): ResourceSnapshot | null;
  /** 当前数据独立于固定快照，不随游标回溯或分叉恢复。 */
  get<T extends Json>(contract: DataContract<T>): T | null;
}
export interface ObjectExecutor extends ObjectReader {
  /** 暂存仅在宿主执行作用域有效；读取按对象已有归属或本次输入校验。 */
  readonly content: ContentScope;
  readonly session: SessionExecutor;
  commit(work: (writer: ObjectWriter) => undefined): void;
  readonly streams: { publish(channel: string, data: Uint8Array): void };
}
