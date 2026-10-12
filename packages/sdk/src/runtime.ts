/** SDK runtime 入口：后台插件可用的通用服务接口；不含宿主内部类型与领域知识。 */
import type { Json } from "./json.ts";
import type { UiText } from "./i18n.ts";
import type { ResourceRef } from "./workspace.ts";
export * from "./runtime-contracts.ts";
export * from "./runtime-resources.ts";
export type * from "./content-runtime.ts";
export type * from "./models.ts";
export { validationMessage, jsonArgumentHint } from "./tool-validation.ts";

/** 插件 API 的稳定错误：code 供插件分支处理，message 用于日志。 */
export class PluginApiError extends Error {
  constructor(readonly code: "invalid_argument" | "foreign_resource" | "foreign_event" | "unavailable" | "rejected" | "conflict" | "not_found", message: string,
    /** rejected 时为准备者给出的业务原因码。 */
    readonly reason?: string, readonly display?: UiText) { super(message); }
}
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
/** 宿主托管配置：在模块 setup 声明，设置页按同一 schema 编辑；get 读取当前值。 */
export interface PluginConfig<T extends Json> {
  get(): T;
  set(value: T): void;
}
/** 命名空间凭据：明文只在系统保护的 vault 中，插件目录只存引用。 */
export interface PluginSecrets {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
/** 按对象的二进制流：高频数据（画面、音频）推送到该对象的视图；不进入会话记录，无订阅者时丢弃。 */
export interface PluginStreams {
  publish(sessionId: string, objectId: string, channel: string, data: Uint8Array): void;
}
/** 宿主托管的进程内异步任务：同 key 运行中不重复启动，宿主关闭时取消；重启不补做。 */
export interface PluginTasks {
  start(key: string, run: (signal: AbortSignal) => Promise<void>, options?: { timeoutMs?: number; object?: ResourceRef }): boolean;
  cancel(key: string): void;
  has(key: string): boolean;
}
