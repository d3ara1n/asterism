import type { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { Json } from "@atelier/sdk/contracts";
import type { PluginNamespace, SessionRecord, SessionView } from "@atelier/sdk/contracts";
import type { BlockCompletion, NewNode, SessionNode } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContextFile, ResourceBackend } from "../resources/contract.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import type { PluginModels, RegistryView } from "./models.ts";
import type { PluginConfig, PluginLogger, PluginSecrets, PluginTasks } from "@atelier/sdk/runtime";
export { PluginApiError, type PluginConfig, type PluginLogger, type PluginSecrets, type PluginTasks } from "@atelier/sdk/runtime";

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
  /** 跨插件调用：按对象类型路由到资源控制器，经 prepare 流水线；返回即完成。 */
  invoke(sessionId: string, objectId: string, command: Json): Promise<void>;
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
  /** 固定在当前时刻的具型记录视图（会话全部记录与当前路径）。 */
  view(): SessionView;
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
  /** 跨插件协作统一走资源命令。 */
  readonly commands: { invoke(sessionId: string, objectId: string, command: Json): Promise<void> };
}
/** 最外层事务成功提交后的不可变批次；回滚不派发。 */
export interface CommitEvent {
  readonly sessionId: string;
  readonly nodes: readonly SessionNode[];
  /** 本批次的公开记录信封。 */
  readonly records: readonly SessionRecord[];
  /** 提交完成时固定的会话视图。 */
  readonly view: SessionView;
  readonly session: PluginSession;
}
/** 提交后观察：只读，不能改写或拒绝已提交记录；异常只记日志。耗时工作交 plugin.tasks。 */
export interface SessionObserver {
  readonly id: string;
  committed(event: CommitEvent): void;
}
/** 命令进入前准备：事务外运行，可接受、替换输入或拒绝整个命令；不作用于已提交事实。 */
export type Preparation = { action: "accept" } | { action: "replace"; command: Json } | { action: "reject"; code: string; message: string };
export interface CommandPreparer {
  readonly id: string;
  /** 目标资源类型；可为其他插件的资源。 */
  readonly kind: string;
  prepare(command: Json, context: { sessionId: string; objectId: string; signal: AbortSignal }): Preparation | Promise<Preparation>;
}
export interface ModuleContribution {
  resources?: ResourceBackend[];
  tools?: ToolImplementation[];
  observers?: SessionObserver[];
  preparers?: CommandPreparer[];
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
