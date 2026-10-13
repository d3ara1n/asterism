import { belongsTo, type ActionContract, type Json, type ResourceCall, type ToolContract } from "@atelier/sdk/contracts";
import { PluginApiError, type PluginDefinition, type PluginContext, type PluginLogger, type PluginTasks,
  type ResourceRef, type SessionObserver, type CommandPreparer, type ModuleContribution } from "@atelier/sdk/runtime";
import type { CredentialVault } from "../configuration/credentials.ts";
import type { ResourceBackend } from "../resources/contract.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import type { SessionDataStore } from "../session/data.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import { ToolRegistry } from "../tools/registry.ts";
import type { SessionNode, LiveBlock } from "../shared/session.ts";
import { RunLifecycle, type RunGroup, type RunningWork } from "./lifecycle.ts";
import { PluginStorage } from "./storage.ts";
import type { HostModels } from "./models.ts";
import type { CatalogHost, SessionHost } from "./host.ts";
import { toRecords, sessionSnapshot } from "./records.ts";
import { createSdkContext, type SdkContext } from "./sdk-context.ts";
import { synchronous } from "./synchronous.ts";
import { adaptResource, adaptTool } from "./sdk-adapters.ts";
import type { ParsedCall } from "./commands.ts";
import type { PluginConfiguration, PluginConfigurationCommand } from "../shared/plugin-configuration.ts";
import type { ObjectStreamPayload } from "../shared/object-stream.ts";
import type { ContentStore, ContentLease } from "../runtime/content-store.ts";

export interface PluginHostServices {
  extensionsDirectory: string;
  data: SessionDataStore;
  content?: ContentStore;
  refOf(objectId: string): ResourceRef | null;
  sessions: SessionHost;
  catalogs?: CatalogHost;
  models: HostModels;
  vault?: CredentialVault | null;
  stream?: (event: ObjectStreamPayload) => void;
  /** 插件配置变更：设置页保存、恢复默认与后台 update 都经此通知。 */
  configurationChanged?: (pluginId: string) => void;
  log?: (pluginId: string, level: "info" | "warn" | "error", message: string, error?: unknown) => void;
}
export interface PluginManifest {
  id: string; version: string; status: "loaded" | "failed"; error?: string; resources: string[];
  implementations: { id: string; tool: string; resource: string; active: boolean; overriddenBy?: string }[];
}
export interface LoadedPlugins {
  configure(command: PluginConfigurationCommand): PluginConfiguration[];
  activity(sessionId: string): { running: string[]; live: LiveBlock[] };
  resources: ResourceRegistry;
  tools: ToolRegistry;
  manifest: readonly PluginManifest[];
  /** 提交后派发观察；队列排空后对涉及的会话各调用一次 publish。 */
  afterCommit(sessionId: string, change: { records: readonly SessionNode[]; cursorChanged: boolean }, publish: (sessionId: string) => void): void;
  prepare(kind: string, command: ResourceCall, context: { sessionId: string; objectId: string; signal: AbortSignal; content?: ContentLease }): Promise<ParsedCall>;
  close(): Promise<void>;
}
interface Collected {
  plugin: PluginDefinition; resources: ResourceBackend[]; tools: ToolImplementation[];
  actions: readonly ActionContract<unknown>[];
  observers: readonly SessionObserver[]; preparers: readonly CommandPreparer[];
  sdk: SdkContext; tasks: TaskHost; storage: PluginStorage; lifecycle: RunLifecycle; preparations: RunGroup; closing: (() => Promise<void>)[];
}

class TaskHost implements PluginTasks {
  private running = new Map<string, RunningWork<void>>();
  constructor(private readonly log: PluginLogger, private readonly group: RunGroup) {}
  start(key: string, run: (signal: AbortSignal) => Promise<void>, options: { timeoutMs?: number; object?: ResourceRef } = {}): boolean {
    if (this.group.closed || this.running.has(key)) return false;
    const work = this.group.start(async signal => {
      // key 在执行前登记，setup 失败可以在业务任务开始前取消它。
      await Promise.resolve();
      try { signal.throwIfAborted(); await run(signal); }
      catch (error) { if (!signal.aborted) this.log.error(`Task ${key} failed.`, error); }
      finally { this.running.delete(key); }
    }, { ...options, timeoutMs: options.timeoutMs ?? 60_000 });
    this.running.set(key, work);
    return true;
  }
  cancel(key: string): void { this.running.get(key)?.cancel(); }
  has(key: string): boolean { return this.running.has(key); }
  activity(sessionId: string): string[] { return this.group.activity(sessionId); }
}
const defaultLog: NonNullable<PluginHostServices["log"]> = (id, level, message, error) =>
  console[level](`[plugin ${id}] ${message}`, ...(error === undefined ? [] : [error]));

/** 初始化按公共依赖排序，贡献覆盖顺序仍取用户列表。 */
function initializationOrder(plugins: readonly PluginDefinition[]) {
  const ordered: PluginDefinition[] = [], failures = new Map<string, string>(), done = new Set<string>();
  for (const plugin of plugins) if (plugins.filter(item => item.namespace.id === plugin.namespace.id).length > 1)
    failures.set(plugin.namespace.id, `Duplicate plugin ID: ${plugin.namespace.id}`);
  const visit = (plugin: PluginDefinition, path: string[]) => {
    const id = plugin.namespace.id;
    if (done.has(id)) return;
    if (path.includes(id)) throw new Error(`Circular plugin dependency: ${[...path, id].join(" -> ")}`);
    try {
      for (const dependency of plugin.dependencies ?? []) {
        const provider = plugins.find(item => item.namespace.id === dependency);
        if (!provider) throw new Error(`Public dependency ${dependency} is unavailable.`);
        visit(provider, [...path, id]);
        if (failures.has(dependency)) throw new Error(`Public dependency ${dependency} could not initialize.`);
      }
    } catch (error) { failures.set(id, error instanceof Error ? error.message : String(error)); }
    done.add(id); ordered.push(plugin);
  };
  for (const plugin of plugins) visit(plugin, []);
  return { ordered, failures };
}

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
  const lifecycles: RunLifecycle[] = [];
  const failedCleanup: Promise<void>[] = [];
  const kinds = new Set<string>(), identities = new Set<string>();
  const toolContracts = new Map<string, ToolContract>();
  const initialization = initializationOrder(plugins);
  for (const plugin of initialization.ordered) {
    const id = plugin.namespace.id;
    let entry: Collected | undefined;
    try {
      if (initialization.failures.has(id)) throw new Error(initialization.failures.get(id)!);
      const unavailable = plugin.dependencies?.find(dependency => !collected.some(item => item.plugin.namespace.id === dependency));
      if (unavailable) throw new Error(`Public dependency ${unavailable} failed to initialize.`);
      if (manifest.some(entry => entry.id === id)) throw new Error(`Duplicate plugin ID: ${id}`);
      const write = services.log ?? defaultLog;
      const log: PluginLogger = { info: message => write(id, "info", message), warn: message => write(id, "warn", message),
        error: (message, error) => write(id, "error", message, error) };
      const storage = new PluginStorage(services.extensionsDirectory, id, services.vault ?? null, log.warn);
      storage.onChanged = () => services.configurationChanged?.(id);
      const lifecycle = new RunLifecycle(sessionId => services.sessions.progressChanged(sessionId)); lifecycles.push(lifecycle);
      const taskHost = new TaskHost(log, lifecycle.group("task"));
      const sdk = createSdkContext({ id, dir: storage.dir, log, config: contract => storage.config(contract),
        secrets: storage.secrets, db: () => storage.db(), tasks: taskHost }, services, lifecycle.group("model"));
      const resources: ResourceBackend[] = [], tools: ToolImplementation[] = [], observers: SessionObserver[] = [], preparers: CommandPreparer[] = [];
      const actions: ActionContract<unknown>[] = [];
      entry = { plugin, resources, tools, actions, observers, preparers, sdk, tasks: taskHost, storage, lifecycle, preparations: lifecycle.group("prepare"), closing: [] };
      const commandIds = new Set<string>();
      for (const module of plugin.modules) {
        let contribution!: ModuleContribution;
        synchronous(() => { contribution = module.setup(sdk.context); return contribution; });
        if (contribution.closing) entry.closing.push(contribution.closing);
        for (const record of contribution.records ?? []) sdk.declare(record);
        for (const resource of contribution.resources ?? []) {
          for (const record of resource.records) sdk.declare(record);
          const calls = [...(resource.creation ? [resource.creation.contract] : []), ...(resource.actions ?? []).map(action => action.contract)];
          actions.push(...(resource.actions ?? []).map(action => action.contract));
          if (new Set(calls.map(call => call.id)).size !== calls.length) throw new Error(`Duplicate command contracts for ${resource.resource.kind}.`);
          for (const call of calls) {
            if (commandIds.has(call.id)) throw new Error(`Duplicate command contract: ${call.id}`);
            commandIds.add(call.id);
            if (!belongsTo(id, call.id) || call.resource.kind !== resource.resource.kind)
              throw new Error(`Invalid command ownership: ${call.id}`);
          }
          resources.push(adaptResource(resource, sdk, services, lifecycle.group("action")));
        }
        tools.push(...(contribution.tools ?? []).map(tool => adaptTool(tool, sdk, services)));
        observers.push(...contribution.observers ?? []); preparers.push(...contribution.preparers ?? []);
      }
      if (new Set(observers.map(observer => observer.id)).size !== observers.length) throw new Error(`Plugin ${id} declares duplicate observers.`);
      validate(entry);
      const ownContracts = new Map(toolContracts);
      for (const tool of tools) {
        const previous = ownContracts.get(tool.tool.id);
        if (previous && previous !== tool.tool) throw new Error(`Conflicting tool declaration: ${tool.tool.id}. Import the same public module.`);
        ownContracts.set(tool.tool.id, tool.tool);
      }
      const ownKinds = resources.map(resource => resource.kind), ownIds = tools.map(tool => tool.reference.id);
      for (const kind of ownKinds) if (kinds.has(kind) || ownKinds.indexOf(kind) !== ownKinds.lastIndexOf(kind)) throw new Error(`Duplicate resource type: ${kind}`);
      for (const key of ownIds) if (identities.has(key) || ownIds.indexOf(key) !== ownIds.lastIndexOf(key)) throw new Error(`Duplicate implementation: ${key}`);
      ownKinds.forEach(kind => kinds.add(kind)); ownIds.forEach(key => identities.add(key));
      tools.forEach(tool => toolContracts.set(tool.tool.id, tool.tool));
      collected.push(entry); manifest.push({ id, version: plugin.version, status: "loaded", resources: ownKinds, implementations: [] });
    } catch (error) {
      if (entry) {
        entry.lifecycle.stop();
        failedCleanup.push(dispose(entry).catch(error => (services.log ?? defaultLog)(id, "error", "Plugin cleanup failed.", error)));
      }
      (services.log ?? defaultLog)(id, "error", "Plugin failed to load and was disabled.", error);
      manifest.push({ id, version: plugin.version, status: "failed", error: error instanceof Error ? error.message : String(error), resources: [], implementations: [] });
    }
  }
  async function dispose(entry: Collected) {
    await entry.lifecycle.close();
    for (const close of [...entry.closing].reverse()) {
      try { await close(); } catch (error) { (services.log ?? defaultLog)(entry.plugin.namespace.id, "error", "Plugin closing callback failed.", error); }
    }
    entry.sdk.disable();
    entry.storage.close();
  }
  const initialized = [...collected], invalidEntries = new Set<Collected>();
  let invalidated = true;
  while (invalidated) {
    invalidated = false;
    const actionContracts = new Map(collected.flatMap(entry => entry.actions.map(action => [action.id, action] as const)));
    for (let i = collected.length - 1; i >= 0; i--) {
      const entry = collected[i]!;
      const invalid = entry.preparers.find(preparer => actionContracts.get(preparer.contract.id) !== preparer.contract);
      const unavailable = entry.plugin.dependencies?.find(id => !collected.some(provider => provider.plugin.namespace.id === id));
      if (!invalid && !unavailable) continue;
      const error = invalid ? `Preparer ${invalid.id} must import the registered action declaration: ${invalid.contract.id}.`
        : `Public dependency ${unavailable} is unavailable.`;
      const record = manifest.find(record => record.id === entry.plugin.namespace.id)!;
      record.status = "failed"; record.error = error; record.resources = [];
      entry.lifecycle.stop();
      invalidEntries.add(entry);
      collected.splice(i, 1); invalidated = true;
    }
  }
  if (invalidEntries.size) failedCleanup.push((async () => {
    await Promise.allSettled([...invalidEntries].map(entry => entry.lifecycle.close()));
    for (const entry of initialized.reverse()) if (invalidEntries.has(entry)) {
      try { await dispose(entry); }
      catch (error) { (services.log ?? defaultLog)(entry.plugin.namespace.id, "error", "Plugin cleanup failed.", error); }
    }
  })());
  const disposalOrder = [...collected].reverse();
  const index = (id: string) => plugins.findIndex(plugin => plugin.namespace.id === id);
  collected.sort((a, b) => index(a.plugin.namespace.id) - index(b.plugin.namespace.id));
  manifest.sort((a, b) => index(a.id) - index(b.id));
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
  type Notification = { sessionId: string; snapshot: ReturnType<typeof sessionSnapshot>; records: ReturnType<typeof toRecords>; cursorChanged: boolean };
  const notifications: Notification[] = [];
  const touched = new Set<string>();
  const observers = collected.flatMap(entry => entry.observers);
  let dispatching = false;
  let closed = false;
  let closing: Promise<void> | undefined;
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
      return { running: [...new Set([...model.flatMap(run => run.running), ...collected.flatMap(entry => [...entry.tasks.activity(sessionId), ...entry.preparations.activity(sessionId)])])],
        live: model.flatMap(run => run.live) };
    },
    resources, tools: new ToolRegistry(active), manifest: Object.freeze(manifest.map(entry => Object.freeze(entry))),
    afterCommit(sessionId, { records: nodes, cursorChanged }, publish) {
      touched.add(sessionId);
      const observed = (nodes.length > 0 && observers.some(observer => observer.committed))
        || (cursorChanged && observers.some(observer => observer.cursorChanged));
      if (observed) {
        // 快照固定在本次提交时刻，后续排队的提交不改写它。
        const all = services.sessions.nodes(sessionId);
        notifications.push({ sessionId, records: toRecords(nodes, all), cursorChanged,
          snapshot: sessionSnapshot(sessionId, services.sessions.title(sessionId), all, services.sessions.path(sessionId)) });
      }
      if (dispatching) return;
      dispatching = true;
      try {
        while (notifications.length) {
          const event = notifications.shift()!;
          for (const entry of collected) for (const observer of entry.observers) {
            const session = entry.sdk.context.session(event.sessionId);
            const run = (name: string, call: () => undefined) => {
              try { synchronous(call); }
              catch (error) { (services.log ?? defaultLog)(entry.plugin.namespace.id, "error", `Observer ${observer.id} ${name} callback failed.`, error); }
            };
            if (event.records.length && observer.committed) run("committed", () => observer.committed!({ records: event.records, snapshot: event.snapshot, session }));
            if (event.cursorChanged && observer.cursorChanged) run("cursorChanged", () => observer.cursorChanged!({ snapshot: event.snapshot, session }));
          }
        }
      } finally {
        dispatching = false;
        const ids = [...touched];
        touched.clear();
        for (const id of ids) publish(id);
      }
    },
    async prepare(kind, command, context) {
      if (closed) throw new PluginApiError("unavailable", "Plugins are closing.");
      const controller = resources.controller(kind), ref = { sessionId: context.sessionId, id: context.objectId, kind };
      if (!controller?.parseCommand) throw new PluginApiError("invalid_argument", "This resource has no actions.");
      let current = controller.parseCommand(command);
      current.content = context.content;
      for (const entry of collected) for (const preparer of entry.preparers) {
        if (preparer.contract.resource.kind !== kind || preparer.contract.id !== current.id) continue;
        const scope = { active: true, provisional: !services.refOf(ref.id), content: context.content };
        let result;
        try { result = await entry.preparations.start(async signal => {
          signal.throwIfAborted();
          const result = await preparer.prepare(current.value, { signal, object: entry.sdk.reader(ref, scope), content: entry.sdk.reader(ref, scope).content });
          signal.throwIfAborted();
          return result;
        }, { object: ref, signal: context.signal, affectsHistory: false }).done; }
        finally { scope.active = false; }
        if (result.action === "reject") throw new PluginApiError("rejected", result.message, result.code);
        if (result.action === "replace") {
          current = { ...controller.parseCommand({ id: current.id, input: result.input }), content: context.content };
        }
      }
      return controller.prepareCommand ? controller.prepareCommand(current, ref, context.signal) : current;
    },
    close() {
      if (closing) return closing;
      closed = true;
      for (const lifecycle of lifecycles) lifecycle.stop();
      closing = (async () => {
        await Promise.allSettled(collected.map(entry => entry.lifecycle.close()));
        await Promise.allSettled(failedCleanup);
        for (const entry of disposalOrder) await dispose(entry);
      })();
      return closing;
    },
  };
}
