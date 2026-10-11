import { belongsTo, contractKey, type Json, type ToolContract } from "@atelier/sdk/contracts";
import { PluginApiError, type PluginDefinition, type PluginContext, type PluginLogger, type PluginTasks,
  type ResourceRef, type SessionObserver, type CommandPreparer } from "@atelier/sdk/runtime";
import type { CredentialVault } from "../configuration/credentials.ts";
import type { ResourceBackend } from "../resources/contract.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import type { SessionDataStore } from "../session/data.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import { ToolRegistry } from "../tools/registry.ts";
import type { SessionNode, LiveBlock } from "../shared/session.ts";
import { PluginStorage } from "./storage.ts";
import type { HostModels } from "./models.ts";
import type { CatalogHost, SessionHost } from "./host.ts";
import { toRecords, sessionSnapshot } from "./records.ts";
import { createSdkContext, type SdkContext } from "./sdk-context.ts";
import { synchronous } from "./synchronous.ts";
import { adaptResource, adaptTool } from "./sdk-adapters.ts";
import type { PluginConfiguration, PluginConfigurationCommand } from "../shared/plugin-configuration.ts";
import type { ObjectStreamPayload } from "../shared/object-stream.ts";

export interface PluginHostServices {
  extensionsDirectory: string;
  data: SessionDataStore;
  refOf(objectId: string): ResourceRef | null;
  sessions: SessionHost;
  catalogs?: CatalogHost;
  models: HostModels;
  vault?: CredentialVault | null;
  stream?: (event: ObjectStreamPayload) => void;
  log?: (pluginId: string, level: "info" | "warn" | "error", message: string, error?: unknown) => void;
}
export interface PluginManifest {
  id: string; version: string; status: "loaded" | "failed"; error?: string; resources: string[];
  implementations: { id: string; version: number; tool: string; resource: string; active: boolean; overriddenBy?: string }[];
}
export interface LoadedPlugins {
  configure(command: PluginConfigurationCommand): PluginConfiguration[];
  activity(sessionId: string): { running: string[]; live: LiveBlock[] };
  resources: ResourceRegistry;
  tools: ToolRegistry;
  manifest: readonly PluginManifest[];
  committed(sessionId: string, nodes: readonly SessionNode[]): void;
  prepare(kind: string, command: Json, context: { sessionId: string; objectId: string; signal: AbortSignal }): Promise<Json>;
  close(): Promise<void>;
}
interface Collected {
  plugin: PluginDefinition; resources: ResourceBackend[]; tools: ToolImplementation[];
  observers: readonly SessionObserver[]; preparers: readonly CommandPreparer[];
  sdk: SdkContext; tasks: TaskHost; storage: PluginStorage; closing: (() => Promise<void>)[];
}

class TaskHost implements PluginTasks {
  private running = new Map<string, { controller: AbortController; done: Promise<void>; object?: ResourceRef }>();
  private closed = false;
  constructor(private readonly log: PluginLogger, private readonly changed: (sessionId: string) => void) {}
  start(key: string, run: (signal: AbortSignal) => Promise<void>, options: { timeoutMs?: number; object?: ResourceRef } = {}): boolean {
    if (this.closed || this.running.has(key)) return false;
    const controller = new AbortController();
    const object = options.object ? Object.freeze({ ...options.object }) : undefined;
    const timer = setTimeout(() => controller.abort(new Error("Task timed out.")), options.timeoutMs ?? 60_000);
    const done = Promise.resolve().then(() => run(controller.signal))
      .catch(error => { if (!controller.signal.aborted) this.log.error(`Task ${key} failed.`, error); })
      .finally(() => { clearTimeout(timer); this.running.delete(key); if (object) this.changed(object.sessionId); });
    this.running.set(key, { controller, done, object });
    if (object) this.changed(object.sessionId);
    return true;
  }
  cancel(key: string): void { this.running.get(key)?.controller.abort(); }
  has(key: string): boolean { return this.running.has(key); }
  activity(sessionId: string): string[] {
    return [...this.running.values()].flatMap(run => run.object?.sessionId === sessionId ? [run.object.id] : []);
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const task of this.running.values()) task.controller.abort();
    await Promise.allSettled([...this.running.values()].map(task => task.done));
  }
}
const defaultLog: NonNullable<PluginHostServices["log"]> = (id, level, message, error) =>
  console[level](`[plugin ${id}] ${message}`, ...(error === undefined ? [] : [error]));

function validate(entry: Collected): void {
  const id = entry.plugin.namespace.id;
  for (const resource of entry.resources) if (!belongsTo(id, resource.kind))
    throw new Error(`Resource type ${resource.kind} is outside plugin namespace ${id}.`);
  const contracts = new Map<string, ToolContract>();
  for (const tool of entry.tools) {
    if (!belongsTo(id, tool.reference.id)) throw new Error(`Implementation ${tool.reference.id} is outside plugin namespace ${id}.`);
    const previous = contracts.get(tool.tool.name);
    if (previous && previous !== tool.tool) throw new Error(`Plugin ${id} defines conflicting contracts for tool ${tool.tool.name}.`);
    contracts.set(tool.tool.name, tool.tool);
  }
}

/** 启动时收集 SDK 贡献，按插件顺序解析覆盖并冻结目录。 */
export function loadPlugins(plugins: readonly PluginDefinition[], services: PluginHostServices): LoadedPlugins {
  const manifest: PluginManifest[] = [], collected: Collected[] = [];
  const storages: PluginStorage[] = [], tasks: TaskHost[] = [], contexts: SdkContext[] = [];
  const kinds = new Set<string>(), identities = new Set<string>();
  for (const plugin of plugins) {
    const id = plugin.namespace.id;
    try {
      if (manifest.some(entry => entry.id === id)) throw new Error(`Duplicate plugin ID: ${id}`);
      const write = services.log ?? defaultLog;
      const log: PluginLogger = { info: message => write(id, "info", message), warn: message => write(id, "warn", message),
        error: (message, error) => write(id, "error", message, error) };
      const storage = new PluginStorage(services.extensionsDirectory, id, services.vault ?? null, log.warn);
      storages.push(storage);
      const taskHost = new TaskHost(log, sessionId => services.sessions.progressChanged(sessionId)); tasks.push(taskHost);
      const sdk = createSdkContext({ id, dir: storage.dir, log, config: (schema, defaults) => storage.config(schema, defaults),
        secrets: storage.secrets, db: () => storage.db(), tasks: taskHost }, services);
      contexts.push(sdk);
      const resources: ResourceBackend[] = [], tools: ToolImplementation[] = [], observers: SessionObserver[] = [], preparers: CommandPreparer[] = [];
      const entry: Collected = { plugin, resources, tools, observers, preparers, sdk, tasks: taskHost, storage, closing: [] };
      for (const module of plugin.modules) {
        const contribution = module.setup(sdk.context);
        for (const record of contribution.records ?? []) sdk.declare(record);
        for (const resource of contribution.resources ?? []) {
          for (const record of resource.records) sdk.declare(record);
          resources.push(adaptResource(resource, sdk, services));
        }
        tools.push(...(contribution.tools ?? []).map(tool => adaptTool(tool, sdk, services)));
        observers.push(...contribution.observers ?? []); preparers.push(...contribution.preparers ?? []);
        if (contribution.closing) entry.closing.push(contribution.closing);
      }
      if (new Set(observers.map(observer => observer.id)).size !== observers.length) throw new Error(`Plugin ${id} declares duplicate observers.`);
      validate(entry);
      const ownKinds = resources.map(resource => resource.kind), ownIds = tools.map(tool => contractKey(tool.reference));
      for (const kind of ownKinds) if (kinds.has(kind) || ownKinds.indexOf(kind) !== ownKinds.lastIndexOf(kind)) throw new Error(`Duplicate resource type: ${kind}`);
      for (const key of ownIds) if (identities.has(key) || ownIds.indexOf(key) !== ownIds.lastIndexOf(key)) throw new Error(`Duplicate implementation: ${key}`);
      ownKinds.forEach(kind => kinds.add(kind)); ownIds.forEach(key => identities.add(key));
      collected.push(entry); manifest.push({ id, version: plugin.version, status: "loaded", resources: ownKinds, implementations: [] });
    } catch (error) {
      (services.log ?? defaultLog)(id, "error", "Plugin failed to load and was disabled.", error);
      manifest.push({ id, version: plugin.version, status: "failed", error: error instanceof Error ? error.message : String(error), resources: [], implementations: [] });
    }
  }
  for (const sdk of contexts) if (!collected.some(entry => entry.sdk === sdk)) sdk.disable();
  for (const task of tasks) if (!collected.some(entry => entry.tasks === task)) void task.close();
  const effective = new Map<string, { contract: ToolContract; plugin: string }>();
  for (const entry of collected) for (const tool of entry.tools) effective.set(tool.tool.name, { contract: tool.tool, plugin: entry.plugin.namespace.id });
  const active: ToolImplementation[] = [];
  for (const entry of collected) {
    const record = manifest.find(item => item.id === entry.plugin.namespace.id)!;
    for (const tool of entry.tools) {
      const winner = effective.get(tool.tool.name)!, enabled = winner.contract === tool.tool;
      if (enabled) active.push(tool);
      record.implementations.push({ ...tool.reference, tool: tool.tool.name, resource: tool.resourceKind, active: enabled,
        ...(enabled ? {} : { overriddenBy: winner.plugin }) });
    }
  }
  const resources = new ResourceRegistry(collected.flatMap(entry => entry.resources));
  type Notification = { sessionId: string; snapshot: ReturnType<typeof sessionSnapshot>; records: ReturnType<typeof toRecords> };
  const notifications: Notification[] = [];
  let dispatching = false;
  let closed = false;
  return {
    configure(command) {
      if (closed) throw new PluginApiError("unavailable", "Plugins are closing.");
      if (command.type !== "read") {
        const entry = collected.find(entry => entry.plugin.namespace.id === command.id);
        if (!entry) throw new PluginApiError("not_found", "The plugin is not loaded.");
        if (command.type === "save") entry.storage.saveConfiguration(command.value);
        else entry.storage.resetConfiguration();
      }
      return collected.flatMap(entry => {
        const settings = entry.storage.configuration(entry.plugin.namespace.id);
        return settings ? [settings] : [];
      });
    },
    activity(sessionId) {
      const model = collected.map(entry => entry.sdk.activity(sessionId));
      return { running: [...new Set([...model.flatMap(run => run.running), ...collected.flatMap(entry => entry.tasks.activity(sessionId))])],
        live: model.flatMap(run => run.live) };
    },
    resources, tools: new ToolRegistry(active), manifest: Object.freeze(manifest.map(entry => Object.freeze(entry))),
    committed(sessionId, nodes) {
      if (!nodes.length) return;
      const all = services.sessions.nodes(sessionId);
      notifications.push({ sessionId, records: toRecords(nodes, all),
        snapshot: sessionSnapshot(sessionId, services.sessions.title(sessionId), all, services.sessions.path(sessionId)) });
      if (dispatching) return;
      dispatching = true;
      try {
        while (notifications.length) {
          const event = notifications.shift()!;
          for (const entry of collected) for (const observer of entry.observers) {
            try { synchronous(() => observer.committed({ records: event.records, snapshot: event.snapshot, session: entry.sdk.context.session(event.sessionId) })); }
            catch (error) { (services.log ?? defaultLog)(entry.plugin.namespace.id, "error", `Observer ${observer.id} failed.`, error); }
          }
        }
      } finally { dispatching = false; }
    },
    async prepare(kind, command, context) {
      const controller = resources.controller(kind), ref = { sessionId: context.sessionId, id: context.objectId, kind };
      let current = controller?.validateCommand ? controller.validateCommand(command) : command;
      for (const entry of collected) for (const preparer of entry.preparers) {
        if (preparer.resource.kind !== kind) continue;
        const scope = { active: true, provisional: !services.refOf(ref.id) };
        let result;
        try { result = await preparer.prepare(preparer.schema.parse(current), entry.sdk.object(ref, scope), context.signal); }
        finally { scope.active = false; }
        if (result.action === "reject") throw new PluginApiError("rejected", result.message, result.code);
        if (result.action === "replace") {
          current = controller?.validateCommand ? controller.validateCommand(result.input) : result.input;
        }
      }
      return controller?.prepareCommand ? controller.prepareCommand(current, ref, context.signal) : current;
    },
    async close() {
      closed = true;
      await Promise.allSettled([...contexts.map(sdk => sdk.close()), ...tasks.map(task => task.close())]);
      for (const entry of collected) for (const close of entry.closing) {
        try { await close(); } catch (error) { (services.log ?? defaultLog)(entry.plugin.namespace.id, "error", "Plugin closing callback failed.", error); }
      }
      for (const sdk of contexts) sdk.disable();
      for (const storage of storages) storage.close();
    },
  };
}
