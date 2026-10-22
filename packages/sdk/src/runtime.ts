/** SDK runtime 入口：后台插件可用的通用服务接口；不含宿主内部类型与领域知识。 */
import type { Json } from "./json.ts";
import type { UiText } from "./i18n.ts";
import type { ResourceRef } from "./workspace.ts";
export * from "./runtime-contracts.ts";
export * from "./runtime-resources.ts";
export * from "./runtime-calls.ts";
export * from "./runtime-channels.ts";
export * from "./runtime-tools.ts";
export * from "./runtime-providers.ts";
export type * from "./content-runtime.ts";
export type * from "./models.ts";
export { validationMessage, jsonArgumentHint } from "./tool-validation.ts";

/** 插件 API 的稳定错误：code 供插件分支处理，message 用于日志。 */
export class PluginApiError extends Error {
  constructor(readonly code: "invalid_argument" | "foreign_resource" | "foreign_event" | "unavailable" | "rejected" | "conflict" | "not_found", message: string,
    /** 准备拒绝或模型输入预检的业务原因码。 */
    readonly reason?: string, readonly display?: UiText) { super(message); }
}
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
/** 宿主托管配置的后台句柄：get 每次取当前值；update 基于最新完整配置；subscribe 接收设置页或其他模块的变更。 */
export interface PluginConfig<T extends Json> {
  get(): T;
  update(next: (current: T) => T): void;
  subscribe(listener: (value: T) => void): () => void;
}
/** 命名空间凭据：明文只在系统保护的 vault 中，插件目录只存引用。 */
export interface PluginSecrets {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
/** 宿主托管的进程内异步任务：同 key 运行中不重复启动，宿主关闭时取消；缺省无超时，重启不补做。 */
export interface PluginTasks {
  start(key: string, run: (signal: AbortSignal) => Promise<void>, options?: { timeoutMs?: number; object?: ResourceRef }): boolean;
  cancel(key: string): void;
  has(key: string): boolean;
}
