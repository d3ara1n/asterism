import type { Json } from "./json.ts";
import type { DataContract } from "./presentation.ts";
import type { RecordContract } from "./records.ts";
import type { ResourceRef, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";
import type { ContentReader, ContentScope } from "./content-runtime.ts";
import type { EventPublisher } from "./events.ts";
import type { CreationContract } from "./commands.ts";

export interface ResourceCreationOptions {
  signal?: AbortSignal;
  /** 输入引用的内容读取资格；省略时使用当前会话内容门面。 */
  content?: ContentReader;
  /** 新资源链接给此接收者，与创建原子提交。 */
  linkTo?: ResourceRef;
  /** 新资源接收的初始资源链接，与创建原子提交。 */
  resources?: readonly ResourceRef[];
}

/** 同步事务中的数据与事件写入；宿主限制 writer 的调用有效期。 */
export interface SessionWriter {
  /** 向提交时的当前时间线末端追加并推进游标；此前取得的只读快照不决定追加位置。 */
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
  create<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, input: NoInfer<I> & Json, options?: ResourceCreationOptions): Promise<ResourceRef>;
  link(receiver: ResourceRef, resource: ResourceRef): void;
  unlink(receiver: ResourceRef, resource: ResourceRef): void;
  /** 移除已收束对象并解除所有链接；保留历史与外部实体。 */
  remove(resource: ResourceRef): void;
  commit(work: (writer: SessionWriter) => undefined): void;
  /** set 直接覆盖会话标题；可在同步 commit 内调用并随其提交或回滚。 */
  readonly title: SessionReader["title"] & { set(text: string): void };
}
/** 工具调用绑定的会话操作：创建后链接给发起者，移除限定于请求开始时的链接集合。 */
export interface ToolSession extends SessionReader {
  create<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, input: NoInfer<I> & Json, options?: { resources?: readonly string[] }): Promise<ResourceRef>;
  remove(resourceId: string): void;
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
  readonly events: EventPublisher;
  /** 暂存仅在宿主执行作用域有效；读取按对象已有归属或本次输入校验。 */
  readonly content: ContentScope;
  readonly session: SessionExecutor;
  commit(work: (writer: ObjectWriter) => undefined): void;
  readonly streams: { publish(channel: string, data: Uint8Array): void };
}
