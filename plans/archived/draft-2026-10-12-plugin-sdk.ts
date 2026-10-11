/** 插件 SDK interface 声明原型；仅作设计与类型验证，不是运行时实现。 */
import type { z } from "zod";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Immutable<T> = T extends readonly (infer V)[] ? readonly Immutable<V>[] : T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export interface ContractRef<Id extends string = string> { readonly id: Id; readonly version: number }
/** 旧版本数据逐级升级到当前版本；键为旧版本号。 */
export type Upgrades = Readonly<Record<number, (data: Json) => Json>>;
export interface RecordContract<D extends Json = Json, Id extends string = string> extends ContractRef<Id> {
  readonly schema: z.ZodType<D>;
  readonly upgrades: Upgrades;
  /** 纯契约解码：先按 upgrades 升到当前版本再校验；不查询宿主，也不加载领域实现。 */
  decode(record: SessionRecord): DecodedRecord<D> | null;
}
export interface CommandContract<I extends Json = Json, O extends Json = Json, Id extends string = string> extends ContractRef<Id> {
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
}
export type RecordMap = Readonly<Record<string, RecordContract>>;
export type CommandMap = Readonly<Record<string, CommandContract>>;
export interface ResourceContract<S extends Json = Json, I extends Json = Json, R extends RecordMap = RecordMap, C extends CommandMap = CommandMap, Id extends string = string> extends ContractRef<Id> {
  /** 资源公开数据的契约；与私有状态、卡片投影的契约分开。 */
  readonly dataSchema: z.ZodType<S>;
  readonly createSchema: z.ZodType<I>;
  readonly records: R;
  readonly commands: C;
}
export type RecordData<C extends RecordContract> = z.output<C["schema"]>;
export type ResourceRecord<R extends ResourceContract> = R["records"][keyof R["records"]];
export type ResourceCommand<R extends ResourceContract> = R["commands"][keyof R["commands"]];
export type CommandInput<C extends CommandContract> = z.output<C["input"]>;
export type CommandOutput<C extends CommandContract> = z.output<C["output"]>;

export interface Namespace<Id extends string> {
  readonly id: Id;
  record<const N extends string, D extends Json>(name: N, definition: {
    version: number; schema: z.ZodType<D>; upgrades?: Upgrades;
  }): RecordContract<D, `${Id}/${N}`>;
  command<const N extends string, I extends Json, O extends Json>(name: N, definition: {
    version: number; input: z.ZodType<I>; output: z.ZodType<O>;
  }): CommandContract<I, O, `${Id}/${N}`>;
  resource<const N extends string, S extends Json, I extends Json, const R extends RecordMap, const C extends CommandMap>(name: N, definition: {
    version: number; dataSchema: z.ZodType<S>; createSchema: z.ZodType<I>; records: R; commands: C;
  }): ResourceContract<S, I, R, C, `${Id}/${N}`>;
}
export declare function pluginNamespace<const Id extends string>(id: Id): Namespace<Id>;

export interface ResourceRef { readonly id: string; readonly contract: ContractRef }
export interface RecordRef { readonly id: string; readonly contract: ContractRef }
export interface SessionPosition { readonly nodeId: string | null; readonly sequence: number }
export interface SessionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly parentId: string | null;
  readonly sequence: number;
  readonly createdAt: string;
  readonly contract: ContractRef;
  /** 记录的关联对象，不预设发送者、接收者或执行者。 */
  readonly resource: ResourceRef | null;
  readonly data: Immutable<Json>;
}
export type DecodedRecord<D extends Json> =
  | (Omit<SessionRecord, "data"> & { readonly status: "known"; readonly data: Immutable<D> })
  | (SessionRecord & { readonly status: "unknown"; readonly reason: "unsupported_version" | "invalid_data" });
export interface RecordQuery { readonly scope: "path" | "session"; readonly objectId?: string; readonly after?: string; readonly limit?: number }
export interface SessionRecords {
  /** 最早的匹配记录不可解码时返回 unknown，不跳过它另取下一条。 */
  first<C extends RecordContract>(contract: C, query: RecordQuery): Promise<DecodedRecord<RecordData<C>> | null>;
  query<C extends RecordContract>(contract: C, query: RecordQuery): AsyncIterable<DecodedRecord<RecordData<C>>>;
}
export interface ResourceSnapshot<R extends ResourceContract> {
  readonly ref: ResourceRef;
  readonly contract: R;
  readonly title: string;
  readonly data: Immutable<z.output<R["dataSchema"]>>;
}
export interface SessionResources {
  get<R extends ResourceContract>(contract: R, objectId: string): Promise<ResourceSnapshot<R> | null>;
  list<R extends ResourceContract>(contract: R): AsyncIterable<ResourceSnapshot<R>>;
}
export interface TitleSnapshot { readonly text: string; readonly version: number; readonly source: "provisional" | "automatic" | "user" }
export interface SessionSnapshot {
  readonly id: string;
  readonly position: SessionPosition;
  readonly title: TitleSnapshot;
  readonly records: SessionRecords;
  readonly resources: SessionResources;
}
export interface SessionHandle {
  readonly id: string;
  snapshot(position?: { nodeId: string | null }): Promise<SessionSnapshot>;
  readonly title: {
    propose(text: string, options: { expectedVersion: number; cause: RecordRef }): Promise<"applied" | "superseded" | "conflict">;
  };
}

export interface CommitEvent {
  readonly commitId: string;
  readonly snapshot: SessionSnapshot;
  readonly records: readonly SessionRecord[];
  /** 终态等追加元数据单列，不伪装成新的正文节点。 */
  readonly completions: readonly RecordRef[];
}
export interface EventContract<T, Id extends string = string> extends ContractRef<Id> { readonly payload?: T }
export declare const Session: {
  readonly Created: EventContract<{ snapshot: SessionSnapshot }, "host/session.created">;
  readonly Committed: EventContract<CommitEvent, "host/session.committed">;
  readonly CursorChanged: EventContract<{ snapshot: SessionSnapshot; previous: SessionPosition }, "host/session.cursor-changed">;
  readonly MetadataChanged: EventContract<{ snapshot: SessionSnapshot; field: "title" }, "host/session.metadata-changed">;
  readonly Closing: EventContract<{ sessionId: string; reason: "host_shutdown" | "session_deleted" }, "host/session.closing">;
};

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export interface ModelTarget { role: string; model?: string; thinking?: ThinkingLevel }
export interface ModelSelection { model: string; thinking: ThinkingLevel | null }
export interface Usage { input: number | null; output: number | null; total: number | null; reasoning: number | null; cacheRead: number | null; cacheWrite: number | null }
export type ModelPart =
  | { kind: "text" | "thinking"; text: string; continuation: Json }
  | { kind: "toolcall"; callId: string; name: string; arguments: Json; continuation: Json };
/** 工具结局保留未知状态与续接资料，不压扁为 Json。 */
export type ToolOutcome =
  | { status: "succeeded"; output: Json; continuation?: Json }
  | { status: "failed"; code: string; message: string; output?: Json; continuation?: Json }
  | { status: "unknown"; reason: "interrupted" | "lost"; continuation?: Json };
export type ModelItem =
  | { kind: "input" | "context"; text: string }
  | { kind: "output"; parts: readonly ModelPart[]; scope: string; adapter: string }
  | { kind: "result"; callId: string; name: string; outcome: ToolOutcome };
export interface ToolDeclaration { name: string; description: string; parameters: Json }
export type StreamPart = { id: string; kind: "text" | "thinking" } | { id: string; kind: "toolcall"; callId: string; name: string };
export type ModelEvent =
  | { type: "part.start"; part: StreamPart }
  | { type: "part.delta"; partId: string; delta: string }
  | { type: "part.end"; partId: string; arguments?: Json; continuation?: Json }
  | { type: "finish"; reason: string; usage: Usage | null; responseId?: string; rawFinishReason?: string };
export interface StreamRequest {
  target: ModelTarget; fallback?: ModelSelection; system: string; messages: readonly ModelItem[]; tools?: readonly ToolDeclaration[]; signal: AbortSignal;
}
export interface ToolCall { callId: string; name: string; arguments: Json }
export interface ToolExecutor {
  execute(call: ToolCall, signal: AbortSignal): Promise<ToolOutcome>;
}
export interface RunEnvironment {
  target: ModelTarget; fallback?: ModelSelection; system: string; messages: readonly ModelItem[]; tools?: readonly ToolDeclaration[]; executor?: ToolExecutor;
}
export type ModelRunEvent =
  | { type: "request.started"; requestId: string }
  | { type: "model.event"; requestId: string; event: ModelEvent }
  | { type: "tools.finished"; requestId: string; results: readonly { callId: string; outcome: ToolOutcome }[] };
export type RunOutcome =
  | { status: "completed"; requests: number }
  | { status: "cancelled"; requests: number }
  | { status: "request_limit"; requests: number }
  | { status: "failed"; requests: number; code: string; message: string };
export interface RunRequest {
  signal: AbortSignal; maxRequests?: number;
  environment(): Promise<RunEnvironment>;
  /** 领域方据此落盘事实；抛错即中止循环并以 failed 返回，宿主不代写记录。 */
  onEvent(event: ModelRunEvent): void | Promise<void>;
}
export interface TextRequest {
  target: ModelTarget;
  /** 仅在角色相应字段为空时采用；不是覆盖，不从全局窗口推断。 */
  fallback?: ModelSelection;
  system: string;
  input: string;
  signal: AbortSignal;
}
export interface ModelServices {
  /** 请求与循环不保存资源或会话状态，调用方负责自己的领域投影。 */
  stream(request: StreamRequest): AsyncIterable<ModelEvent>;
  run(request: RunRequest): Promise<RunOutcome>;
  generateText(request: TextRequest): Promise<{ text: string; model: string; usage: Usage | null }>;
}
export interface TaskContext { readonly signal: AbortSignal; readonly session: SessionHandle; readonly models: ModelServices }
export type TaskOutcome<T> =
  | { status: "succeeded"; value: T }
  | { status: "failed"; code: string; message: string }
  | { status: "cancelled" };
export interface TaskHandle<T> { readonly id: string; readonly result: Promise<TaskOutcome<T>>; cancel(): void }
export interface SessionTasks {
  /** 命名空间为当前插件、贡献、会话；第一版 key 只在本次运行期去重。 */
  start<T>(options: { key: string; timeoutMs: number; run(context: TaskContext): Promise<T> }): TaskHandle<T>;
}
export interface ObserveContext { readonly signal: AbortSignal; readonly tasks: SessionTasks; readonly session: SessionHandle }
export interface Contribution { readonly kind: "observer" | "preparer" | "resource" | "tool"; readonly id: string }
export declare function observe<T>(definition: {
  id: string; on: EventContract<T>; run(event: T, context: ObserveContext): void | Promise<void>;
}): Contribution;

export interface CommandServices {
  /** 跨插件协作的唯一入口：宿主按契约身份路由到目标资源实现并校验输入输出；返回即完成。 */
  invoke<C extends CommandContract>(contract: C, target: ResourceRef, input: NoInfer<CommandInput<C>>): Promise<CommandOutput<C>>;
}

export type Preparation<D> =
  | { action: "accept" }
  | { action: "replace"; data: D }
  | { action: "reject"; code: string; message: string };
export interface PrepareContext { readonly signal: AbortSignal; readonly snapshot: SessionSnapshot }
/** 进入前准备只作用于命令输入（意图）；在事务外运行，宿主提交前重验，reject 使整个命令失败。 */
export declare function prepare<C extends CommandContract>(definition: {
  id: string; on: C;
  run(proposal: { target: ResourceRef; input: Immutable<CommandInput<C>> }, context: PrepareContext): Preparation<CommandInput<C>> | Promise<Preparation<CommandInput<C>>>;
}): Contribution;

export interface ResourceWriter<R extends ResourceContract> {
  /** 只能提交绑定资源已声明的记录，宿主填写身份与树位置。 */
  append<C extends ResourceRecord<R>>(contract: C, data: NoInfer<RecordData<C>>): RecordRef;
}
export interface PrivateDataContract<T extends Json> extends ContractRef { readonly schema: z.ZodType<T> }
export interface ObjectData { get<T extends Json>(contract: PrivateDataContract<T>): Immutable<T> | null }
export interface ObjectWriter<R extends ResourceContract> extends ResourceWriter<R> { set<T extends Json>(contract: PrivateDataContract<T>, data: NoInfer<T>): void }
export interface ResourceContext<R extends ResourceContract> {
  readonly object: ResourceRef; readonly session: SessionHandle; readonly data: ObjectData;
  /** 同步事务；实际接口也必须在运行时拒绝 Promise。 */
  commit<F extends (writer: ObjectWriter<R>) => unknown>(work: F & (ReturnType<F> extends PromiseLike<unknown> ? never : unknown)): ReturnType<F>;
}
export interface ResourceImplementation<R extends ResourceContract> {
  readonly commands: {
    readonly [K in keyof R["commands"]]: (input: Immutable<CommandInput<R["commands"][K]>>, context: ResourceContext<R>) => Promise<CommandOutput<R["commands"][K]>>;
  };
}
export declare function implementResource<R extends ResourceContract>(contract: R, implementation: ResourceImplementation<NoInfer<R>>): Contribution;
export interface PluginContext {
  readonly id: string; readonly models: ModelServices; readonly commands: CommandServices;
  readonly log: { info(message: string): void; error(message: string): void };
}
export declare function defineModule(factory: (plugin: PluginContext) => { contributions: readonly Contribution[] }): { readonly factory: typeof factory };
export declare function definePlugin(definition: {
  namespace: Namespace<string>; version: string; api: { major: number; minMinor: number }; modules: readonly ReturnType<typeof defineModule>[];
}): typeof definition;
