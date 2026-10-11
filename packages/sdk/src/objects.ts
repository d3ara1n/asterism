import type { Json } from "./json.ts";
import type { DataContract } from "./presentation.ts";
import type { RecordContract } from "./records.ts";
import type { ResourceRef, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";

/** 同步事务中的数据与事件写入；宿主限制 writer 的调用有效期。 */
export interface SessionWriter {
  append<T extends Json>(contract: RecordContract<T>, data: NoInfer<T>): string;
  set<T extends Json>(contract: DataContract<T>, data: NoInfer<T>): void;
}
export type ObjectWriter = SessionWriter;
export interface SessionReader {
  readonly id: string;
  snapshot(): SessionSnapshot;
  get<T extends Json>(contract: DataContract<T>): T | null;
  readonly title: { get(): string };
}
export interface SessionExecutor extends SessionReader {
  resume(): void;
  commit(work: (writer: SessionWriter) => undefined): void;
  readonly title: SessionReader["title"] & { propose(text: string, options: { expected: string }): boolean };
}
export interface ObjectReader {
  readonly ref: ResourceRef;
  readonly session: SessionReader;
  /** 调用绑定的资源快照；创建事务内尚未建立身份时为 null。 */
  snapshot(): ResourceSnapshot | null;
  /** 当前数据独立于固定快照，不随历史查看或分叉恢复。 */
  get<T extends Json>(contract: DataContract<T>): T | null;
}
export interface ObjectExecutor extends ObjectReader {
  readonly session: SessionExecutor;
  commit(work: (writer: ObjectWriter) => undefined): void;
  readonly streams: { publish(channel: string, data: Uint8Array): void };
}
