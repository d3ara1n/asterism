/** 插件与宿主共用的后台接口；存储、事务和授权由宿主实现。 */
import type { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { Json } from "./json.ts";
import type { PluginNamespace } from "./plugin.ts";
import type { ResourceContract, ImplementationContract } from "./module-contract.ts";
import type { DataContract, Presentation } from "./presentation.ts";
import type { RecordContract, SessionRecord } from "./records.ts";
import type { ToolCompletion, ToolInvocationInfo } from "./tool-result.ts";
import type { PluginConfig, PluginLogger, PluginSecrets, PluginTasks } from "./runtime.ts";
import type { ModelServices } from "./models.ts";
import type { ResourceRef, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";
export type { ResourceRef, ResourceSnapshot, SessionSnapshot } from "./workspace.ts";
export interface SessionWriter {
  append<T extends Json>(contract: RecordContract<T>, data: NoInfer<T>): string;
  set<T extends Json>(contract: DataContract<T>, data: NoInfer<T>): void;
}
export type ObjectWriter = SessionWriter;
export interface SessionHandle {
  readonly id: string;
  snapshot(): SessionSnapshot;
  get<T extends Json>(contract: DataContract<T>): T | null;
  /** 将执行位置对齐到可继续的位置；查看快照不改变位置。 */
  resume(): void;
  /** 同步提交当前会话数据与本插件声明的事件。 */
  commit(work: (writer: SessionWriter) => undefined): void;
  readonly title: { get(): string; propose(text: string, options: { expected: string }): boolean };
}
export interface ObjectContext {
  readonly ref: ResourceRef;
  readonly session: SessionHandle;
  /** 调用绑定的资源快照；普通对象入口读取当前路径，创建前为 null。 */
  snapshot(): ResourceSnapshot | null;
  get<T extends Json>(contract: DataContract<T>): T | null;
  commit(work: (writer: ObjectWriter) => undefined): void;
  readonly streams: { publish(channel: string, data: Uint8Array): void };
}
export interface PluginContext {
  readonly id: string;
  readonly dir: string;
  readonly log: PluginLogger;
  config<T extends Json>(schema: z.ZodType<T>, defaults: T): PluginConfig<T>;
  readonly secrets: PluginSecrets;
  db(): DatabaseSync;
  readonly tasks: PluginTasks;
  readonly models: ModelServices;
  readonly catalogs: { get<T extends Json>(contract: DataContract<T>): T | null };
  session(id: string): SessionHandle;
  object(ref: ResourceRef): ObjectContext;
}
export interface SessionCommitted {
  readonly snapshot: SessionSnapshot;
  readonly records: readonly SessionRecord[];
  readonly session: SessionHandle;
}
export interface SessionObserver { readonly id: string; committed(event: SessionCommitted): undefined }
export type Preparation<C extends Json = Json> =
  | { action: "accept" }
  | { action: "replace"; input: C }
  | { action: "reject"; code: string; message: string };
export interface CommandPreparer<C extends Json = Json> {
  readonly id: string;
  readonly resource: ResourceContract;
  readonly schema: z.ZodType<C>;
  prepare(input: C, object: ObjectContext, signal: AbortSignal): Preparation<C> | Promise<Preparation<C>>;
}
export interface ContextFile { readonly file: string; readonly text: string }
export interface ResourceContribution {
  readonly resource: ResourceContract;
  readonly records: readonly RecordContract[];
  readonly links?: { receive: boolean; tools?(object: ObjectContext): { allow?: readonly string[]; exclude?: readonly string[] } };
  readonly creation?: {
    schema: z.ZodType<Json>;
    prepare?(input: Json, signal: AbortSignal): Promise<Json>;
    create(input: Json, object: ObjectContext): { title: string; data: Json };
  };
  readonly actions?: {
    schema: z.ZodType<Json>;
    prepare?(input: Json, object: ObjectContext, signal: AbortSignal): Preparation | Promise<Preparation>;
    execute(input: Json, object: ObjectContext, signal: AbortSignal): Promise<void>;
  };
  project(resource: ResourceSnapshot, object: ObjectContext): Presentation;
  inspect(resource: ResourceSnapshot, object: ObjectContext): Promise<Json>;
  context?(resource: ResourceSnapshot, object: ObjectContext): Promise<ContextFile[]>;
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
  toModel?(data: Json): Json;
}
export interface ToolContribution {
  readonly contract: ImplementationContract<Json, Json, Json, Json>;
  prepare(resource: ResourceSnapshot, object: ObjectContext, target: Json, args: Json): ToolInvocation | PreparedResult;
}
export interface ModuleContribution {
  records?: readonly RecordContract[];
  resources?: readonly ResourceContribution[];
  tools?: readonly ToolContribution[];
  observers?: readonly SessionObserver[];
  preparers?: readonly CommandPreparer[];
  closing?(): Promise<void>;
}
/** 具名模块入口：插件提供贡献，宿主负责装配与调用。 */
export interface PluginModule { setup(plugin: PluginContext): ModuleContribution }
export interface PluginDefinition { namespace: PluginNamespace; version: string; modules: readonly PluginModule[] }
export function defineModule(setup: PluginModule["setup"]): PluginModule {
  if (typeof setup !== "function") throw new Error("A plugin module must declare a setup function.");
  return { setup };
}
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  if (!definition.version.trim()) throw new Error(`Plugin ${definition.namespace.id} must declare a version.`);
  return { ...definition, modules: [...definition.modules] };
}
