/** 插件与宿主共用的后台接口；存储、事务和授权由宿主实现。 */
import type { z } from "zod";
import type { UiText } from "./i18n.ts";
import type { ConfigContract } from "./config.ts";
import type { DatabaseSync } from "node:sqlite";
import type { Json } from "./json.ts";
import type { PluginNamespace } from "./plugin.ts";
import type { ResourceContract, ImplementationContract } from "./module-contract.ts";
import type { DataContract, Presentation } from "./presentation.ts";
import type { RecordContract, SessionRecord } from "./records.ts";
import type { EventContract, PluginEvents } from "./events.ts";
import type { ToolCompletion, ToolInvocationInfo, ToolModelOutput } from "./tool-result.ts";
import type { PluginConfig, PluginLogger, PluginSecrets, PluginTasks } from "./runtime.ts";
import type { ModelServices } from "./models.ts";
import type { ResourceRef, ResourceSnapshot, SessionSnapshot, SessionDirectory } from "./workspace.ts";
import type { ActionContract, CreationContract } from "./commands.ts";
import type { ObjectReader, ObjectExecutor, SessionExecutor } from "./objects.ts";
import type { ContentReader, ContentScope } from "./content-runtime.ts";
import type { PluginCalls } from "./calls.ts";
import type { CallContribution } from "./runtime-calls.ts";
import type { TopLevelTool } from "./runtime-tools.ts";
import type { ProviderServices, UsageServices, UsageProvider } from "./runtime-providers.ts";
import type { ProviderPresetContribution } from "./provider-usage.ts";
export type * from "./objects.ts";
export type { ResourceRef, ResourceCreationResult, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";

export interface PluginContext {
  readonly id: string;
  /** 装配失败或关闭时取消；用于释放插件自己的公共服务登记。 */
  readonly signal: AbortSignal;
  readonly sessions: SessionDirectory;
  readonly dir: string;
  readonly log: PluginLogger;
  readonly ipc: { readonly events: PluginEvents; readonly calls: PluginCalls };
  config<T extends Json>(contract: ConfigContract<T>): PluginConfig<T>;
  readonly secrets: PluginSecrets;
  db(): DatabaseSync;
  readonly tasks: PluginTasks;
  readonly models: ModelServices;
  readonly providers: ProviderServices;
  readonly usages: UsageServices;
  readonly catalogs: { get<T extends Json>(contract: DataContract<T>): T | null };
  session(id: string): SessionExecutor;
  /** 以具名资源契约取得对象操作柄；宿主校验契约属于本插件、对象存在且类型一致，写入记录以此打戳。 */
  object<S extends Json>(sessionId: string, contract: ResourceContract<S>, id: string): ObjectExecutor;
}
export interface SessionCommitted {
  readonly snapshot: SessionSnapshot;
  readonly records: readonly SessionRecord[];
  readonly session: SessionExecutor;
}
/** 执行游标变化后的固定快照；正常追加与显式游标选择使用同一形状，面板候选选择不触发。 */
export interface SessionCursorChanged {
  readonly snapshot: SessionSnapshot;
  readonly session: SessionExecutor;
}
export interface SessionObserver {
  readonly id: string;
  committed?(event: SessionCommitted): undefined;
  cursorChanged?(event: SessionCursorChanged): undefined;
}
export type Preparation<C extends Json = Json> =
  | { action: "accept" }
  | { action: "replace"; input: C }
  | { action: "reject"; code: string; message: string; display?: UiText };
/** 准备上下文：资源自身准备可读写本次作用域内容，外部准备者只读；均不修改会话数据。 */
export interface CreationPreparation { readonly signal: AbortSignal; readonly content: ContentScope }
export interface ActionPreparation extends CreationPreparation { readonly object: ObjectReader }
export interface ExternalPreparation { readonly signal: AbortSignal; readonly object: ObjectReader; readonly content: ContentReader }
export interface CommandPreparer<O extends Json = Json, I = unknown> {
  readonly id: string;
  readonly contract: ActionContract<I, O>;
  prepare(input: O, context: ExternalPreparation): Preparation<I & Json> | Promise<Preparation<I & Json>>;
}
export interface ContextFile { readonly file: string; readonly text: string }
export interface CreationContribution {
  readonly contract: CreationContract<unknown>;
  prepare?(input: Json, context: CreationPreparation): Preparation | Promise<Preparation>;
  create(input: Json, object: ObjectExecutor): { title: string; data: Json };
}
export interface ActionContribution {
  readonly contract: ActionContract<unknown>;
  prepare?(input: Json, context: ActionPreparation): Preparation | Promise<Preparation>;
  execute(input: Json, object: ObjectExecutor, signal: AbortSignal): Promise<void>;
}
export interface ResourceContribution {
  readonly resource: ResourceContract;
  readonly records: readonly RecordContract[];
  readonly links?: { receive: boolean; tools?(object: ObjectReader): { allow?: readonly string[]; exclude?: readonly string[] } };
  readonly creation?: CreationContribution;
  readonly actions?: readonly ActionContribution[];
  project(resource: ResourceSnapshot, object: ObjectReader): Presentation;
  inspect(resource: ResourceSnapshot, object: ObjectReader): Promise<Json>;
  context?(resource: ResourceSnapshot, object: ObjectReader): Promise<ContextFile[]>;
}
type OptionalData<T, D> = T extends unknown ? Omit<T, "data"> & { data?: D | null } : never;
export type CallResult<D extends Json = Json> =
  | { kind: "succeeded"; data: D }
  | { kind: "partial"; data: D; message: string }
  | OptionalData<Exclude<ToolCompletion, { kind: "succeeded" | "partial" }>, D>;
export type PreparedResult = CallResult & ToolInvocationInfo;
export interface ToolInvocation extends ToolInvocationInfo {
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  execute(signal: AbortSignal, publish?: (data: Json) => void): Promise<CallResult>;
  toModel?(data: Json): ToolModelOutput;
}
export interface ToolContribution {
  readonly contract: ImplementationContract<Json, Json, Json, Json>;
  prepare(resource: ResourceSnapshot, object: ObjectExecutor, target: Json, args: Json): ToolInvocation | PreparedResult;
}
export interface ModuleContribution {
  usageProviders?: readonly UsageProvider[];
  providerPresets?: readonly ProviderPresetContribution[];
  calls?: readonly CallContribution[];
  topLevelTools?: readonly TopLevelTool[];
  events?: readonly EventContract[];
  records?: readonly RecordContract[];
  resources?: readonly ResourceContribution[];
  tools?: readonly ToolContribution[];
  observers?: readonly SessionObserver[];
  preparers?: readonly CommandPreparer[];
  closing?(): Promise<void>;
}
/** 具名模块入口：插件提供贡献，宿主负责装配与调用。 */
export interface PluginModule { setup(plugin: PluginContext): ModuleContribution }
/** 插件共享服务与功能模块的组合；共享服务先建立、在模块之后释放。 */
export interface PluginContribution extends ModuleContribution {
  modules?: readonly PluginModule[];
}
export interface PluginDefinition {
  namespace: PluginNamespace; version: string; modules?: readonly PluginModule[];
  setup?(plugin: PluginContext): PluginContribution;
  /** 包加载器从公共模块导入关系填充；提供方先 setup，消费者先清理。 */
  dependencies?: readonly string[];
}
export function defineModule(setup: PluginModule["setup"]): PluginModule {
  if (typeof setup !== "function") throw new Error("A plugin module must declare a setup function.");
  return { setup };
}
export function definePlugin(definition: PluginDefinition): PluginDefinition & { modules: readonly PluginModule[] } {
  if (!definition.version.trim()) throw new Error(`Plugin ${definition.namespace.id} must declare a version.`);
  return { ...definition, modules: [...definition.modules ?? []] };
}
