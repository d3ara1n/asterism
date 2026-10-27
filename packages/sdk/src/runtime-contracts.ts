/** Backend interfaces shared by plugins and the host; the host implements storage, transactions, and authorization. */
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
 * Lifecycle scope: on termination, abort signal first, then await all cleanup in reverse registration order.
 * The host maintains application, session, and object scopes; child scopes end before their parent. Exit, archival, and object removal share the same cleanup path.
 */
export interface Lifetime {
  readonly signal: AbortSignal;
  /** Register cleanup; throws unavailable if the scope has ended. Cleanup failures are only logged and do not block remaining cleanup. */
  defer(cleanup: () => void | Promise<void>): void;
}
export interface PluginContext {
  readonly id: string;
  /** Plugin-level lifecycle: lasts as long as the host runtime instance; shared plugin services such as connection pools, subscriptions, and public registrations belong here. */
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
  /** Obtain an object handle using a named resource contract; the host validates plugin ownership of the contract, object existence, and matching type, and stamps records accordingly. */
  object<S extends Json>(sessionId: string, contract: ResourceContract<S>, id: string): ObjectExecutor;
}
export interface SessionCommitted {
  readonly snapshot: SessionSnapshot;
  readonly records: readonly SessionRecord[];
  readonly session: SessionExecutor;
}
/** Fixed snapshot after the execution cursor changes; ordinary appends and explicit cursor selection use the same shape, while panel candidate selection does not trigger it. */
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
/** Preparation context: the resource's own preparation can read and write content in this scope, while external preparers can only read; neither modifies session data. */
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
  /** Geometry declarations for backend placement, shared with ResourceDescription and cardRenderer. */
  readonly card?: CardAppearance;
  readonly records: readonly RecordContract[];
  /** Opt into templates that copy encoded resource state and only these current-data contracts, preserving their values under new host identities. */
  readonly template?: {
    readonly current: readonly DataContract[];
    /** Omit the source title when saving; generate a title for each template instance, overriding any previously saved title. */
    createTitle?(): string;
  };
  /** Declare that this resource can receive links and provide the recipient's tool policy; independent of Agent domain types. */
  readonly links?: { receive: boolean; tools?(object: ObjectReader): { allow?: readonly string[]; exclude?: readonly string[] } };
  readonly creation?: CreationContribution;
  readonly actions?: readonly ActionContribution[];
  project(resource: ResourceSnapshot, object: ObjectReader): Presentation;
  inspect(resource: ResourceSnapshot, object: ObjectReader): Promise<Json>;
  context?(resource: ResourceSnapshot, object: ObjectReader): Promise<ContextFile[]>;
  /** Explanation presented to users before ending the current instance; does not block backend removal or wait for external cleanup. */
  disposalWarning?(resource: ResourceSnapshot, object: ObjectReader): UiText | null;
  /**
   * Called synchronously when an object enters the current set through startup, creation, restoration, or rewinding that makes it reappear; lifetime ends when the object leaves the current set,
   * its session is archived, or the application exits. Register cleanup here for external instances owned exclusively by the object.
   */
  attach?(resource: ResourceSnapshot, object: ObjectReader, lifetime: Lifetime): void;
}
type OptionalData<T, D> = T extends unknown ? Omit<T, "data"> & { data?: D | null } : never;
export type CallResult<D extends Json = Json> =
  | { kind: "succeeded"; data: D }
  | { kind: "partial"; data: D; message: string }
  | OptionalData<Exclude<ToolCompletion, { kind: "succeeded" | "partial" }>, D>;
export type PreparedResult = CallResult & ToolInvocationInfo;
/** Tool caller identity captured at the request boundary; carries neither private resource state nor operation permissions. */
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
  /** Object-level duplex channel; the contract belongs to this plugin, and routing follows the plugin owning the object type. */
  channels?: readonly ChannelContribution[];
  topLevelTools?: readonly TopLevelTool[];
  events?: readonly EventContract[];
  records?: readonly RecordContract[];
  resources?: readonly ResourceContribution[];
  tools?: readonly ToolContribution[];
  observers?: readonly SessionObserver[];
  preparers?: readonly CommandPreparer[];
}
/** Named module entry point: plugins provide contributions, and the host handles assembly and invocation. */
export interface PluginModule { setup(plugin: PluginContext): ModuleContribution }
/** Composition of shared plugin services and feature modules; shared services are established first and released after the modules. */
export interface PluginContribution extends ModuleContribution {
  modules?: readonly PluginModule[];
}
/**
 * Format declarations for persistent plugin files; paths are relative to extensions/<pluginId>, and migration key n means n → n+1.
 * Versions are stamped by the writer: JSON uses a `{ version, data }` envelope, and SQLite uses `PRAGMA user_version`.
 */
export type PluginStorageDeclaration = {
  kind: "json"; path: string; version: number;
  migrations: Readonly<Record<number, (data: unknown) => Json>>;
} | {
  kind: "sqlite"; path: string; version: number;
  migrations: Readonly<Record<number, (db: DatabaseSync) => void>>;
};
/** Default export of the storage entry point (manifest `asterism.storage`); the host imports it separately before the plugin runtime. */
export function defineStorage(declarations: readonly PluginStorageDeclaration[]): readonly PluginStorageDeclaration[] {
  for (const item of declarations) if (!Number.isSafeInteger(item.version) || item.version < 1)
    throw new Error(`Storage ${item.path} must declare a positive integer version.`);
  return Object.freeze([...declarations]);
}
export interface PluginDefinition {
  namespace: PluginNamespace; modules?: readonly PluginModule[];
  setup?(plugin: PluginContext): PluginContribution;
}
export function defineModule(setup: PluginModule["setup"]): PluginModule {
  if (typeof setup !== "function") throw new Error("A plugin module must declare a setup function.");
  return { setup };
}
export function definePlugin(definition: PluginDefinition): PluginDefinition & { modules: readonly PluginModule[] } {
  return { ...definition, modules: [...definition.modules ?? []] };
}
