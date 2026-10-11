/** 已归档的声明原型；实际契约以 packages/sdk/src 为准，不参与当前类型检查。 */
import type { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type {
  Json, PluginNamespace, DataContract, RecordContract,
  SessionRecord, SessionView, ResourceContract,
  ImplementationContract, Presentation, ToolCompletion, ToolOutcome, ToolInvocationInfo,
} from "@atelier/sdk/contracts";
import type { PluginConfig, PluginLogger, PluginSecrets, PluginTasks } from "@atelier/sdk/runtime";

export interface ResourceRef { readonly sessionId: string; readonly id: string; readonly kind: string }
export interface ResourceSnapshot<S extends Json = Json> {
  readonly ref: ResourceRef;
  readonly title: string;
  readonly data: S;
}
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
export interface SessionHandle {
  readonly id: string;
  snapshot(): SessionSnapshot;
  /** 只追加本插件的会话事件，不创建对象或修改对象状态。 */
  commit(work: (writer: SessionWriter) => undefined): void;
  readonly title: { get(): string; propose(text: string, options: { expected: string }): boolean };
}
export interface SessionWriter {
  append<T extends Json>(contract: RecordContract<T>, value: NoInfer<T>): string;
}
export interface ObjectWriter extends SessionWriter {
  set<T extends Json>(contract: DataContract<T>, value: NoInfer<T>): void;
}
export interface ObjectContext {
  readonly ref: ResourceRef;
  readonly session: SessionHandle;
  get<T extends Json>(contract: DataContract<T>): T | null;
  /** 同步回调；宿主检查实际返回值、对象有效性与 writer 生命周期。 */
  commit(work: (writer: ObjectWriter) => undefined): void;
  readonly streams: { publish(channel: string, data: Uint8Array): void };
}
export interface SessionCommitted {
  readonly snapshot: SessionSnapshot;
  readonly records: readonly SessionRecord[];
  readonly updated: readonly SessionRecord[];
  readonly session: SessionHandle;
}
export interface SessionObserver {
  readonly id: string;
  committed(event: SessionCommitted): undefined;
}
export type Preparation<C> =
  | { action: "accept" }
  | { action: "replace"; input: C }
  | { action: "reject"; code: string; message: string };
export interface CommandPreparer {
  readonly id: string;
  readonly resource: ResourceContract;
  readonly schema: z.ZodType<Json>;
  prepare(input: Json, object: ObjectContext, signal: AbortSignal):
    Preparation<Json> | Promise<Preparation<Json>>;
}

/** 宿主消费 SDK 的擦除接口；内部 FoldedObject 等只存在于 adapter。 */
export interface ResourceContribution {
  readonly resource: ResourceContract;
  readonly records: readonly RecordContract[];
  readonly acceptsLinks?: boolean;
  readonly creation?: {
    schema: z.ZodType<Json>;
    prepare?(input: Json, signal: AbortSignal): Promise<Json>;
    create(input: Json, object: ObjectContext): { title: string; data: Json };
  };
  readonly actions?: {
    schema: z.ZodType<Json>;
    prepare?(input: Json, object: ObjectContext, signal: AbortSignal):
      Preparation<Json> | Promise<Preparation<Json>>;
    execute(input: Json, object: ObjectContext, signal: AbortSignal): Promise<void>;
  };
  project(resource: ResourceSnapshot, object: ObjectContext): Presentation;
  inspect(resource: ResourceSnapshot, object: ObjectContext): Promise<Json>;
  context?(resource: ResourceSnapshot, object: ObjectContext): Promise<ContextFile[]>;
}
export interface ContextFile { readonly file: string; readonly text: string }
export declare function implementResource<S extends Json, V extends Json, I extends Json = Json, C extends Json = Json>(
  resource: ResourceContract<S>, view: DataContract<V>, definition: {
    records?: readonly RecordContract[];
    acceptsLinks?: boolean;
    creation?: {
      schema: z.ZodType<I>;
      prepare?(input: NoInfer<I>, signal: AbortSignal): Promise<NoInfer<I>>;
      create(input: NoInfer<I>, object: ObjectContext): { title: string; data: NoInfer<S> };
    };
    actions?: {
      schema: z.ZodType<C>;
      prepare?(input: NoInfer<C>, object: ObjectContext, signal: AbortSignal):
        Preparation<NoInfer<C>> | Promise<Preparation<NoInfer<C>>>;
      execute(input: NoInfer<C>, object: ObjectContext, signal: AbortSignal): Promise<void>;
    };
    project(data: NoInfer<S>, object: ObjectContext): NoInfer<V>;
    inspect(data: NoInfer<S>, object: ObjectContext): Promise<Json>;
    context?(data: NoInfer<S>, object: ObjectContext): Promise<ContextFile[]>;
  },
): ResourceContribution;

type OptionalData<T, D> = T extends unknown ? Omit<T, "data"> & { data?: D | null } : never;
export type CallResult<D extends Json> =
  | { kind: "succeeded"; data: D }
  | { kind: "partial"; data: D; message: string }
  | OptionalData<Exclude<ToolCompletion, { kind: "succeeded" | "partial" }>, D>;
export interface ToolInvocation {
  readonly info: ToolInvocationInfo;
  readonly effect: "read" | "write";
  readonly execution: "parallel" | "sequential";
  execute(signal: AbortSignal, publish: (value: Json) => void): Promise<CallResult<Json>>;
  toModel?(value: Json): Json;
}
export interface ToolContribution {
  readonly contract: ImplementationContract<Json, Json, Json, Json>;
  prepare(resource: ResourceSnapshot, object: ObjectContext, target: Json, args: Json):
    ToolInvocation | (CallResult<Json> & ToolInvocationInfo);
}
export declare function implementTool<S extends Json, T extends Json, A extends Json, D extends Json>(
  contract: ImplementationContract<S, T, A, D>, definition: {
    call(data: S, target: T, args: A, context: {
      readonly object: ObjectContext; readonly signal: AbortSignal; publish(value: NoInfer<D>): void;
    }): Promise<CallResult<NoInfer<D>>>;
    toModel?(value: D): Json;
  },
): ToolContribution;

/** 模型分支采用 SDK 的单次调用契约。 */
export type { ModelRunRequest, ModelRunResult, ModelRunEvent } from "@atelier/sdk/contracts";
export type { ModelServices } from "@atelier/sdk/contracts";
import type { ModelServices } from "@atelier/sdk/contracts";
export interface PluginContext {
  readonly id: string;
  readonly dir: string;
  readonly log: PluginLogger;
  config<T extends Json>(schema: z.ZodType<T>, defaults: T): PluginConfig<T>;
  readonly secrets: PluginSecrets;
  db(): DatabaseSync;
  readonly tasks: PluginTasks;
  readonly models: ModelServices;
  session(id: string): SessionHandle;
  object(ref: ResourceRef): ObjectContext;
}
export interface ModuleContribution {
  records?: readonly RecordContract[];
  resources?: readonly ResourceContribution[];
  tools?: readonly ToolContribution[];
  observers?: readonly SessionObserver[];
  preparers?: readonly CommandPreparer[];
  closing?(): Promise<void>;
}
export type PluginModule = (plugin: PluginContext) => ModuleContribution;
export interface PluginDefinition { namespace: PluginNamespace; version: string; modules: readonly PluginModule[] }
export declare function defineModule(factory: PluginModule): PluginModule;
export declare function definePlugin(definition: PluginDefinition): PluginDefinition;
