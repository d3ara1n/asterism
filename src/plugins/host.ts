import type { ActionContract, CreationContract, Presentation, Source, DataContract, Json, ResourceRef, ResourceCreationResult, SessionDirectory } from "@asterism-app/sdk/contracts";
import type { CallContribution, ContentReader, ContextFile, ManualSource, ModelProviderServices, ProviderUsage, ResourceActionOptions, ResourceCreationOptions, ToolCaller, SessionPreparation, PreparedCreation, UsageProviderServices } from "@asterism-app/sdk/runtime";
import type { NewNode, SessionNode } from "../shared/session.ts";
import type { FoldedObject, FoldedState } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import type { NodeView } from "../session/view.ts";
import type { McpApplication } from "../mcp/application.ts";
import type { ShellServices } from "@asterism-app/sdk/runtime";
import type { AgentCatalogService } from "./agent-catalog.ts";
import type { WebProviderRegistry } from "../configuration/web-providers.ts";
import type { ModelProviderExtensions } from "../configuration/provider-extensions.ts";

/** Application-wide services composed once by the host and shared by every plugin context. */
export interface SharedServices {
  mcp: McpApplication;
  shell: ShellServices;
  usage: ProviderUsage;
  agentCatalog: AgentCatalogService;
  modelProviders: ModelProviderServices;
  usageProviders: UsageProviderServices;
  webProviders: WebProviderRegistry;
  extensions: ModelProviderExtensions;
  manualSources(): readonly ManualSource[];
  packageRoots: ReadonlyMap<string, string>;
  /** Host-owned calls served through the plugin call transport. */
  calls: readonly CallContribution[];
}

/** Host-internal storage and execution interfaces; plugins receive SDK facades only. */
export interface SessionHostWriter {
  append(node: NewNode): string;
  complete(id: string, finish: (record: SessionNode) => Json): void;
  nodes(): SessionNode[];
}
export interface SessionHost {
  list: SessionDirectory["list"];
  archived: SessionDirectory["archived"];
  initialize(owner: string, key: string, prepare: (context: SessionPreparation) => Promise<{
    title: string;
    initialize(sessionId: string, create: (prepared: PreparedCreation) => ResourceCreationResult, content: ContentLease): undefined;
  }>, options: { signal: AbortSignal; content?: ContentReader }): Promise<string>;
  create(sessionId: string, contract: CreationContract<unknown>, input: Json, options: ResourceCreationOptions & { owner: string; check(): void }): Promise<ResourceCreationResult>;
  invoke(sessionId: string, contract: ActionContract<unknown>, target: ResourceRef, input: Json, options: ResourceActionOptions & { owner: string; check(): void }): Promise<void>;
  link(sessionId: string, receiver: ResourceRef, resource: ResourceRef, linked: boolean): void;
  remove(sessionId: string, resource: ResourceRef): void;
  rename(sessionId: string, resource: ResourceRef, title: string): string;
  view(sessionId: string): NodeView;
  sequences(sessionId: string, nodes: readonly SessionNode[]): number[];
  timeline(sessionId: string): SessionNode[];
  workbench(sessionId: string): FoldedState;
  title(sessionId: string): string;
  setTitle(sessionId: string, text: string, source: Source, detail?: Presentation): void;
  commit<T>(sessionId: string, work: (writer: SessionHostWriter) => T, objectId?: string): T;
  /** No in-flight activity in the session except objectId; used to check finalization before explicit cursor selection. */
  idle(sessionId: string, objectId?: string): boolean;
  progressChanged(sessionId: string): void;
  retirementChanged(sessionId: string): void;
  viewChanged(sessionId: string, objectId: string): void;
  linked(sessionId: string, objectId: string): FoldedObject[];
  capabilities(linked: readonly FoldedObject[], policy: ToolPolicy, caller?: ToolCaller, interactive?: boolean): AgentCapabilities;
  context(linked: readonly FoldedObject[]): Promise<ContextFile[]>;
}
export interface ObjectScope {
  active: boolean;
  content?: ContentLease;
  provisional?: boolean;
  /** Host-authorized tool execution; captured object data can be committed only during the call. */
  execution?: boolean;
  before?: () => void;
  input?: ContentReader;
}
