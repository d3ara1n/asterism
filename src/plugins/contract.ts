import type { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { Json } from "@atelier/sdk/contracts";
import type { PluginNamespace } from "@atelier/sdk/contracts";
import type { BlockCompletion, NewNode, SessionNode } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContextFile, ResourceBackend } from "../resources/contract.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import type { PluginModels, RegistryView } from "./models.ts";

/** 插件 API 的稳定错误：code 供插件分支处理，message 用于日志。 */
export class PluginApiError extends Error {
  constructor(readonly code: "invalid_argument" | "foreign_resource" | "foreign_event" | "unavailable", message: string) { super(message); }
}
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
/** 资源状态属于会话数据；只能读写本插件资源类型的对象。 */
export interface PluginResourceState {
  get(objectId: string, key: string): Json | null;
  /** 在创建或提交事务内写入；sessionId 决定随哪个会话保存与删除。 */
  set(sessionId: string, objectId: string, key: string, value: Json): void;
  /** 修改已有状态并返回所属会话，不追加事件。 */
  update(objectId: string, key: string, value: Json): string;
}
export interface PluginSessionWriter {
  append(node: NewNode): string;
  completeBlock(blockId: string, completion: BlockCompletion): void;
  continuation(): SessionNode[];
}
/** 受控的会话外观：只读路径、同步事务提交与通知，不暴露会话树本身。 */
export interface PluginSessions {
  path(sessionId: string): SessionNode[];
  /** 会话全部节点，按提交序；不随游标变化。 */
  nodes(sessionId: string): SessionNode[];
  title(sessionId: string): string;
  /** 比较后更新标题：当前标题不等于 expected 时不写入并返回 false。 */
  proposeTitle(sessionId: string, text: string, expected: string): boolean;
  commit<T>(sessionId: string, work: (writer: PluginSessionWriter) => T): T;
  /** 资源当前内容变化使持久视图失效，不追加事件。 */
  changed(sessionId: string): void;
  progressChanged(sessionId: string): void;
  linked(path: readonly SessionNode[], objectId: string): FoldedObject[];
  capabilities(linked: readonly FoldedObject[], policy: ToolPolicy): AgentCapabilities;
  context(linked: readonly FoldedObject[]): Promise<ContextFile[]>;
}
/** 绑定到一个会话的外观：插件事件类型以短名传入，宿主补全命名空间并经会话事务追加。 */
export interface PluginSession {
  readonly id: string;
  path(): SessionNode[];
  nodes(): SessionNode[];
  readonly title: { get(): string; propose(text: string, options: { expected: string }): boolean };
  linked(objectId: string): FoldedObject[];
  /** 在 commit 回调外调用时自成一个事务；回调内请改用 writer.append。 */
  emit(type: string, data: Json, options?: { agentId?: string | null; model?: string | null }): string;
  /** 同步事务提交成型记录；回调内不可异步等待。 */
  commit<T>(work: (writer: PluginSessionWriter) => T): T;
  changed(): void;
  progressChanged(): void;
  capabilities(linked: readonly FoldedObject[], policy: ToolPolicy): AgentCapabilities;
  context(linked: readonly FoldedObject[]): Promise<ContextFile[]>;
}
/** 绑定到一个对象的资源状态；随所属会话保存、分叉与删除。 */
export interface PluginObjectState {
  readonly objectId: string;
  get(key: string): Json | null;
  set(key: string, value: Json): void;
}
/** 宿主托管配置：schema 校验，文件缺失或不合 schema 时回退默认值。 */
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
/** 插件级 context：宿主按插件身份构造，身份不由插件自报。 */
export interface PluginContext {
  readonly id: string;
  /** `<data>/extensions/<pluginId>/`，插件自由写入；`.atelier/` 由宿主托管。 */
  readonly dir: string;
  readonly log: PluginLogger;
  config<T extends Json>(schema: z.ZodType<T>, defaults: T): PluginConfig<T>;
  readonly secrets: PluginSecrets;
  /** `.atelier/db.sqlite`，与宿主数据库独立；首次访问时打开，宿主退出时关闭。 */
  db(): DatabaseSync;
  readonly state: PluginResourceState;
  /** 绑定会话与对象的调用 context；优先使用，避免手动传递身份。 */
  session(sessionId: string): PluginSession;
  object(sessionId: string, objectId: string): PluginObjectState;
  /** 只读系统目录：角色、模型与代理；不含端点、凭据与兼容参数。 */
  readonly registry: RegistryView;
  /** 按模型目标请求模型：stream 单次请求，run 封装宿主代理循环；均无状态。 */
  readonly models: PluginModels;
  /** 宿主托管的进程内异步任务：同 key 运行中不重复启动，宿主关闭时取消；重启不补做。 */
  readonly tasks: PluginTasks;
}
export interface PluginTasks {
  start(key: string, run: (signal: AbortSignal) => Promise<void>, options?: { timeoutMs?: number }): boolean;
}
/** 最外层事务成功提交后的不可变批次；回滚不派发。 */
export interface CommitEvent {
  readonly sessionId: string;
  readonly nodes: readonly SessionNode[];
  readonly session: PluginSession;
}
/** 提交后观察：只读，不能改写或拒绝已提交记录；异常只记日志。耗时工作交 plugin.tasks。 */
export interface SessionObserver {
  readonly id: string;
  committed(event: CommitEvent): void;
}
export interface ModuleContribution {
  resources?: ResourceBackend[];
  tools?: ToolImplementation[];
  observers?: SessionObserver[];
}
export type PluginModule = (plugin: PluginContext) => ModuleContribution;
export interface PluginDefinition {
  namespace: PluginNamespace;
  version: string;
  modules: readonly PluginModule[];
}
export function defineModule(module: PluginModule): PluginModule { return module; }
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  if (!definition.version.trim()) throw new Error(`Plugin ${definition.namespace.id} must declare a version.`);
  return { ...definition, modules: [...definition.modules] };
}
