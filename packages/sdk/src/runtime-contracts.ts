/** 插件与宿主共用的后台接口；存储、事务和授权由宿主实现。 */
import type { UiText } from "./i18n.ts";
import type { CardAppearance } from "./card.ts";
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
import type { ResourceSnapshot, SessionSnapshot, SessionDirectory } from "./workspace.ts";
import type { ActionContract, CreationContract } from "./commands.ts";
import type { ObjectReader, ObjectExecutor, SessionExecutor } from "./objects.ts";
import type { ContentReader, ContentScope } from "./content-runtime.ts";
import type { PluginCalls } from "./calls.ts";
import type { CallContribution } from "./runtime-calls.ts";
import type { ChannelContribution } from "./runtime-channels.ts";
import type { TopLevelTool } from "./runtime-tools.ts";
import type { ModelProviderServices, UsageProviderServices, UsageProvider, UsageServices } from "./runtime-providers.ts";
import type { WebServices, WebProviderServices, WebProviderDefinition } from "./runtime-web.ts";
import type { ModelProviderPresetContribution } from "./provider-usage.ts";
export type * from "./objects.ts";
export type { ResourceRef, ResourceCreationResult, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";

/**
 * 生命周期作用域：结束时先中止 signal，再按登记逆序等待全部清理完成。
 * 宿主维护应用、会话、对象三层作用域，父作用域结束前先结束子作用域；退出、归档与对象移除共用同一清理路径。
 */
export interface Lifetime {
  readonly signal: AbortSignal;
  /** 登记清理；作用域已结束时抛出 unavailable。清理失败只记录日志，不阻止其余清理。 */
  defer(cleanup: () => void | Promise<void>): void;
}
export interface PluginContext {
  readonly id: string;
  /** 插件级生命周期：与宿主运行实例同寿；插件共享服务（连接池、订阅、公共登记）挂在这里。 */
  readonly lifetime: Lifetime;
  readonly sessions: SessionDirectory;
  readonly dir: string;
  readonly log: PluginLogger;
  readonly ipc: { readonly events: PluginEvents; readonly calls: PluginCalls };
  config<T extends Json>(contract: ConfigContract<T>): PluginConfig<T>;
  readonly secrets: PluginSecrets;
  db(): DatabaseSync;
  readonly tasks: PluginTasks;
  readonly models: ModelServices;
  readonly modelProviders: ModelProviderServices;
  readonly usageProviders: UsageProviderServices;
  readonly usages: UsageServices;
  readonly webProviders: WebProviderServices;
  readonly web: WebServices;
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
  /** 后台放置使用的几何声明，与 ResourceDescription 和 cardRenderer 共用。 */
  readonly card?: CardAppearance;
  readonly records: readonly RecordContract[];
  /** 声明本资源可作为链接接收者，并提供接收端工具策略；与 Agent 领域类型无关。 */
  readonly links?: { receive: boolean; tools?(object: ObjectReader): { allow?: readonly string[]; exclude?: readonly string[] } };
  readonly creation?: CreationContribution;
  readonly actions?: readonly ActionContribution[];
  project(resource: ResourceSnapshot, object: ObjectReader): Presentation;
  inspect(resource: ResourceSnapshot, object: ObjectReader): Promise<Json>;
  context?(resource: ResourceSnapshot, object: ObjectReader): Promise<ContextFile[]>;
  /** 结束当前实例前呈现给用户的说明；不阻止后台移除或等待外部清理。 */
  disposalWarning?(resource: ResourceSnapshot, object: ObjectReader): UiText | null;
  /**
   * 对象进入当前集合时同步调用（启动、创建、恢复、回溯使其重新出现）；lifetime 在对象离开当前集合、
   * 所属会话归档或应用退出时结束。对象独占的外部实例在此登记清理。
   */
  attach?(resource: ResourceSnapshot, object: ObjectReader, lifetime: Lifetime): void;
}
type OptionalData<T, D> = T extends unknown ? Omit<T, "data"> & { data?: D | null } : never;
export type CallResult<D extends Json = Json> =
  | { kind: "succeeded"; data: D }
  | { kind: "partial"; data: D; message: string }
  | OptionalData<Exclude<ToolCompletion, { kind: "succeeded" | "partial" }>, D>;
export type PreparedResult = CallResult & ToolInvocationInfo;
/** 请求边界捕获的工具调用者身份；不携带资源私有状态或操作权限。 */
export type ToolCaller = Readonly<Pick<ResourceSnapshot, "ref" | "title">>;
export interface ToolInvocation extends ToolInvocationInfo {
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  execute(signal: AbortSignal, publish?: (data: Json) => void): Promise<CallResult>;
  toModel?(data: Json): ToolModelOutput;
}
export interface ToolContribution {
  readonly contract: ImplementationContract<Json, Json, Json, Json>;
  prepare(resource: ResourceSnapshot, object: ObjectExecutor, target: Json, args: Json, caller: ToolCaller): ToolInvocation | PreparedResult;
}
export interface ModuleContribution {
  webProviders?: readonly WebProviderDefinition[];
  usageProviders?: readonly UsageProvider[];
  modelProviderPresets?: readonly ModelProviderPresetContribution[];
  calls?: readonly CallContribution[];
  /** 对象级双工通道；契约归本插件，按对象类型所属插件路由。 */
  channels?: readonly ChannelContribution[];
  topLevelTools?: readonly TopLevelTool[];
  events?: readonly EventContract[];
  records?: readonly RecordContract[];
  resources?: readonly ResourceContribution[];
  tools?: readonly ToolContribution[];
  observers?: readonly SessionObserver[];
  preparers?: readonly CommandPreparer[];
}
/** 具名模块入口：插件提供贡献，宿主负责装配与调用。 */
export interface PluginModule { setup(plugin: PluginContext): ModuleContribution }
/** 插件共享服务与功能模块的组合；共享服务先建立、在模块之后释放。 */
export interface PluginContribution extends ModuleContribution {
  modules?: readonly PluginModule[];
}
/**
 * 插件持久文件的格式声明；路径相对于 extensions/<pluginId>，迁移键 n 表示 n → n+1。
 * 版本由写入方盖章：JSON 为 `{ version, data }` 信封，SQLite 为 `PRAGMA user_version`。
 */
export type PluginStorageDeclaration = {
  kind: "json"; path: string; version: number;
  migrations: Readonly<Record<number, (data: unknown) => Json>>;
} | {
  kind: "sqlite"; path: string; version: number;
  migrations: Readonly<Record<number, (db: DatabaseSync) => void>>;
};
/** 存储入口（manifest `asterism.storage`）的默认导出；宿主在插件运行时之前单独导入。 */
export function defineStorage(declarations: readonly PluginStorageDeclaration[]): readonly PluginStorageDeclaration[] {
  for (const item of declarations) if (!Number.isSafeInteger(item.version) || item.version < 1)
    throw new Error(`Storage ${item.path} must declare a positive integer version.`);
  return Object.freeze([...declarations]);
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
