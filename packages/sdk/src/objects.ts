import type { Json } from "./json.ts";
import type { DataContract } from "./presentation.ts";
import type { RecordContract } from "./records.ts";
import type { ResourceRef, ResourceCreationResult, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";
import type { ContentReader, ContentScope } from "./content-runtime.ts";
import type { EventPublisher } from "./events.ts";
import type { ActionContract, CreationContract } from "./commands.ts";

export interface ResourceCreationOptions {
  signal?: AbortSignal;
  /** 输入引用的内容读取资格；省略时使用当前会话内容门面。 */
  content?: ContentReader;
  /** 新资源链接给此接收者，与创建原子提交。 */
  linkTo?: ResourceRef;
  /** 新资源接收的初始资源链接，与创建原子提交。 */
  resources?: readonly ResourceRef[];
}
export interface ResourceActionOptions {
  signal?: AbortSignal;
  /** 本次动作输入的合法内容来源；省略时使用调用者绑定的会话／对象内容门面。 */
  content?: ContentReader;
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
/** 会话层面的通用执行门面；资源操作使用显式引用，调用者视角由具体调用入口绑定。 */
export interface SessionExecutor extends SessionReader {
  create<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, input: NoInfer<I> & Json, options?: ResourceCreationOptions): Promise<ResourceCreationResult>;
  /** 调用资源公开动作；返回表示动作处理完成，独立托管工作由资源自身管理。 */
  invoke<I, O extends Json>(contract: ActionContract<I, O>, target: ResourceRef, input: NoInfer<I> & Json, options?: ResourceActionOptions): Promise<void>;
  /** 将资源链接给接收者；两端均为资源，接收者由资源类型声明支持链接。 */
  link(receiver: ResourceRef, resource: ResourceRef): void;
  /** 解除指定方向的链接；反向链接独立保留。 */
  unlink(receiver: ResourceRef, resource: ResourceRef): void;
  /** 移除已收束对象并解除所有链接；保留历史与外部实体。 */
  remove(resource: ResourceRef): void;
  commit(work: (writer: SessionWriter) => undefined): void;
  /** set 直接覆盖会话标题；可在同步 commit 内调用并随其提交或回滚。 */
  readonly title: SessionReader["title"] & { set(text: string): void };
}
/**
 * 同一会话在工具调用发起者与本次请求视角下的操作门面。
 * 宿主绑定发起资源、请求开始时的有效链接范围和工具执行作用域，统一处理身份与执行校验。
 * 操作从发起资源出发：创建后链接给发起者，移除目标从本请求有效链接范围内解析。
 * 新增操作沿用此视角，明确隐式绑定的端点、可操作资源范围及执行作用域。
 * 完整契约见 docs/plugin-sdk.md「会话目录与资源操作」。
 */
export interface ToolSession extends SessionReader {
  create<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, input: NoInfer<I> & Json, options?: {
    resources?: readonly string[];
    /** 将绑定的发起者链接给新资源，与创建原子提交；省略为 false。 */
    exposeSelf?: boolean;
  }): Promise<ResourceCreationResult>;
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
  /** 标记依赖当前时间线路径的异步工作；嵌套占用分别释放，取消后等待工作真实结束。 */
  withBusy<T>(work: (signal: AbortSignal) => Promise<T>, options?: { signal?: AbortSignal }): Promise<T>;
  /** 内存中的展示数据变化后通知宿主重新查询投影；不追加历史或保存资源数据。 */
  invalidate(): void;
}
