/** 工作台读取共识：可由后台和前端共同消费，不依赖宿主存储或 Node。 */
import type { Json } from "./json.ts";
import type { ResourceContract } from "./module-contract.ts";
import type { SessionView } from "./records.ts";

export interface ResourceRef { readonly sessionId: string; readonly id: string; readonly kind: string }
/** 已提交创建的身份与当时标题；标题是结果摘要，不参与资源身份校验。 */
export interface ResourceCreationResult extends ResourceRef { readonly title: string }
export interface SessionSummary { readonly id: string; readonly title: string; readonly createdAt: string }
/** 已归档会话摘要；archivedAt 为归档时间，超过冷静期后会话随启动清理删除。 */
export interface ArchivedSessionSummary extends SessionSummary { readonly archivedAt: string }
/**
 * 同一宿主运行实例共享的只读会话目录；每次读取取当前摘要。
 * list 只含活跃会话；archived 列出回收站中的会话。两者都不含的会话 ID 已被删除，插件据此清理自己按会话保存的数据。
 */
export interface SessionDirectory { list(): readonly SessionSummary[]; archived(): readonly ArchivedSessionSummary[] }
/** 来源：null 表示软件本身发出；插件发出的一定带插件身份，资源来源一定属于该插件。记录、事件等共用。 */
export type Source = { readonly plugin: string; readonly resource: ResourceRef | null } | null;
export interface ResourceSnapshot<S extends Json = Json> {
  readonly ref: ResourceRef;
  readonly title: string;
  readonly data: S;
}
/** 固定时间线末端与会话读取上界的只读观察柄，区别于宿主 IPC 的全树及工作台投影。 */
export interface SessionSnapshot extends SessionView {
  readonly position: { readonly nodeId: string | null };
  readonly resources: {
    all(): readonly ResourceSnapshot[];
    get<S extends Json>(contract: ResourceContract<S>, id: string):
      | { status: "known"; resource: ResourceSnapshot<S> }
      | { status: "unknown"; resource: ResourceSnapshot; reason: "invalid_data" }
      | null;
  };
}
