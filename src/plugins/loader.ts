import { belongsTo, ResourcePresenceChanged, type ActionContract, type ResourceCall, type ResourceSnapshot, type SessionRecord, type SessionSnapshot, type ToolContract } from "@asterism-app/sdk/contracts";
import { PluginApiError, type PluginDefinition, type PluginLogger, type PluginTasks,
  type ResourceRef, type SessionObserver, type CommandPreparer, type ModuleContribution } from "@asterism-app/sdk/runtime";
import type { CredentialVault } from "../configuration/credentials.ts";
import type { ResourceBackend } from "../resources/contract.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import type { SessionDataStore } from "../session/data.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import { ToolRegistry } from "../tools/registry.ts";
import type { SessionNode, LiveBlock } from "../shared/session.ts";
import { RunLifecycle, type RunGroup, type RunningWork } from "./lifecycle.ts";
import { LifetimeScope } from "./lifetime.ts";
import { PluginStorage } from "./storage.ts";
import type { HostModels } from "./models.ts";
import type { CatalogHost, SessionHost } from "./host.ts";
import { toRecord, sessionSnapshot } from "./records.ts";
import { createSdkContext, type SdkContext } from "./sdk-context.ts";
import { synchronous } from "./synchronous.ts";
import { ResourcePresence } from "./presence.ts";
import { adaptResource, adaptTool } from "./sdk-adapters.ts";
import type { ParsedCall } from "./commands.ts";
import type { PluginConfiguration, PluginConfigurationCommand } from "../shared/plugin-configuration.ts";
import { ChannelRegistry } from "./channels.ts";
import type { ContentStore, ContentLease } from "../runtime/content-store.ts";
import { EventBus } from "./events.ts";
import { PluginEventScope } from "./event-scope.ts";
import { CallRegistry } from "./calls.ts";
import { bindTopLevelTools, type RegisteredTopLevelTool } from "./top-level-tools.ts";
import { resolveToolContributions, validateToolContributions, type ToolImplementationStatus } from "./tool-contributions.ts";
import type { ModelProviderExtensions } from "../configuration/provider-extensions.ts";
import type { ModelProviderServices, PluginStorageDeclaration, UsageProviderServices } from "@asterism-app/sdk/runtime";
import type { WebProviderRegistry } from "../configuration/web-providers.ts";

export interface PreparedPluginStorage {
  declarations: ReadonlyMap<string, readonly PluginStorageDeclaration[]>;
  failures: ReadonlyMap<string, string>;
}
export interface PluginHostServices {
  /** Backend provider dependencies derived from public imports, separate from author definitions. */
  pluginDependencies?: ReadonlyMap<string, readonly string[]>;
  events?: EventBus;
  extensionsDirectory: string;
  data: SessionDataStore;
  content?: ContentStore;
  refOf(objectId: string): ResourceRef | null;
  sessions: SessionHost;
  catalogs?: CatalogHost;
  models: HostModels;
  modelProviders?: ModelProviderServices;
  usageProviders?: UsageProviderServices;
  webProviders?: WebProviderRegistry;
  modelProviderExtensions?: ModelProviderExtensions;
  vault?: CredentialVault | null;
  /** Plugin configuration changes: settings saves, default restoration, and backend updates all notify here. */
  configurationChanged?: (pluginId: string) => void;
  /** Plugin storage prepared before windows: format declarations stamp managed configuration and databases; failed plugins skip setup for this startup. */
  preparedStorage?: PreparedPluginStorage;
  log?: (pluginId: string, level: "info" | "warn" | "error", message: string, error?: unknown) => void;
}
export interface PluginManifest {
  id: string; status: "loaded" | "failed"; error?: string; resources: string[];
  implementations: ToolImplementationStatus[];
}
export interface LoadedPlugins {
  calls: CallRegistry;
  channels: ChannelRegistry;
  events: EventBus;
  configure(command: PluginConfigurationCommand): PluginConfiguration[];
  activity(sessionId: string): { busy: string[]; live: LiveBlock[] };
  resources: ResourceRegistry;
  tools: ToolRegistry;
  manifest: readonly PluginManifest[];
  initialize(): void;
  /** End all object lifetimes in a session: cancel bound runs, publish disappearance, and wait for cleanup; called before archival. */
  release(sessionId: string): Promise<void>;
  /** Republish appearance of all objects after session restoration. */
  restore(sessionId: string): void;
  /** Dispatch observations after commit; once the queue drains, publish once for each affected session. */
  afterCommit(sessionId: string, change: { records: readonly SessionNode[]; cursorChanged: boolean }, publish: (sessionId: string) => void): void;
  prepare(kind: string, command: ResourceCall, context: { sessionId: string; objectId: string; signal: AbortSignal; content?: ContentLease }): Promise<ParsedCall>;
  close(): Promise<void>;
}
interface Collected {
  events: PluginEventScope;
  plugin: PluginDefinition; resources: ResourceBackend[]; tools: ToolImplementation[];
  topLevelTools: RegisteredTopLevelTool[];
  actions: readonly ActionContract<unknown>[];
  observers: readonly SessionObserver[]; preparers: readonly CommandPreparer[];
  sdk: SdkContext; tasks: TaskHost; storage: PluginStorage; lifecycle: RunLifecycle; preparations: RunGroup; lifetime: LifetimeScope;
}

class TaskHost implements PluginTasks {
  private running = new Map<string, RunningWork<void>>();
  constructor(private readonly log: PluginLogger, private readonly group: RunGroup) {}
  start(key: string, run: (signal: AbortSignal) => Promise<void>, options: { timeoutMs?: number; object?: ResourceRef } = {}): boolean {
    if (this.group.closed || this.running.has(key)) return false;
    const work = this.group.start(async signal => {
      // Register keys before execution so setup failure can cancel tasks before business work starts.
      await Promise.resolve();
      try { signal.throwIfAborted(); await run(signal); }
      catch (error) { if (!signal.aborted) this.log.error(`Task ${key} failed.`, error); }
      finally { this.running.delete(key); }
    }, options);
    this.running.set(key, work);
    return true;
  }
  cancel(key: string): void { this.running.get(key)?.cancel(); }
  has(key: string): boolean { return this.running.has(key); }
}
const defaultLog: NonNullable<PluginHostServices["log"]> = (id, level, message, error) =>
  console[level](`[plugin ${id}] ${message}`, ...(error === undefined ? [] : [error]));

/** Initialize in public dependency order; contribution override order still follows the user list. */
function initializationOrder(plugins: readonly PluginDefinition[], dependencies: ReadonlyMap<string, readonly string[]>) {
  const ordered: PluginDefinition[] = [], failures = new Map<string, string>(), done = new Set<string>();
  for (const plugin of plugins) if (plugins.filter(item => item.namespace.id === plugin.namespace.id).length > 1)
    failures.set(plugin.namespace.id, `Duplicate plugin ID: ${plugin.namespace.id}`);
  const visit = (plugin: PluginDefinition, path: string[]) => {
    const id = plugin.namespace.id;
    if (done.has(id)) return;
    if (path.includes(id)) throw new Error(`Circular plugin dependency: ${[...path, id].join(" -> ")}`);
    try {
      for (const dependency of dependencies.get(id) ?? []) {
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

/** Collect SDK contributions at startup, resolve overrides in plugin order, and freeze the catalog. */
export function loadPlugins(plugins: readonly PluginDefinition[], services: PluginHostServices): LoadedPlugins {
  const dependencies = services.pluginDependencies ?? new Map<string, readonly string[]>();
  const directory = Object.freeze({ list: () => services.sessions.list(), archived: () => services.sessions.archived() });
  const events = services.events ?? new EventBus();
  events.declarePublic(ResourcePresenceChanged);
  const calls = new CallRegistry(services);
  const channels = new ChannelRegistry(services);
  let topLevelTools: readonly RegisteredTopLevelTool[] = [];
  const manifest: PluginManifest[] = [], collected: Collected[] = [];
  const lifecycles: RunLifecycle[] = [];
  const initialized: Collected[] = [], invalidEntries = new Set<Collected>();
  const kinds = new Set<string>(), identities = new Set<string>();
  const toolContracts = new Map<string, ToolContract>();
  const initialization = initializationOrder(plugins, dependencies);
  for (const plugin of initialization.ordered) {
    const id = plugin.namespace.id;
    let entry: Collected | undefined;
    try {
      if (initialization.failures.has(id)) throw new Error(initialization.failures.get(id)!);
      const storageFailure = services.preparedStorage?.failures.get(id);
      if (storageFailure !== undefined) throw new Error(`Plugin storage could not be prepared: ${storageFailure}`);
      const unavailable = dependencies.get(id)?.find(dependency => !collected.some(item => item.plugin.namespace.id === dependency));
      if (unavailable) throw new Error(`Public dependency ${unavailable} failed to initialize.`);
      if (manifest.some(entry => entry.id === id)) throw new Error(`Duplicate plugin ID: ${id}`);
      const write = services.log ?? defaultLog;
      const log: PluginLogger = { info: message => write(id, "info", message), warn: message => write(id, "warn", message),
        error: (message, error) => write(id, "error", message, error) };
      const storage = new PluginStorage(services.extensionsDirectory, id, services.vault ?? null, log.warn, services.preparedStorage?.declarations.get(id) ?? []);
      storage.onChanged = () => services.configurationChanged?.(id);
      const lifecycle = new RunLifecycle(sessionId => services.sessions.progressChanged(sessionId)); lifecycles.push(lifecycle);
      // Plugin lifetime signals abort alongside run registration; cleanup runs in reverse registration order on plugin release.
      const lifetime = new LifetimeScope((message, error) => log.error(message, error), lifecycle.signal);
      const taskHost = new TaskHost(log, lifecycle.group("task"));
      const eventScope = new PluginEventScope(events, id, lifecycle.group("event"));
      const sdk = createSdkContext({ id, lifetime, dir: storage.dir, log, config: contract => storage.config(contract),
        secrets: storage.secrets, db: () => storage.db(), tasks: taskHost }, services, lifecycle.group("model"), lifecycle.group("action"), directory, eventScope,
        calls.client(id, lifecycle.group("call")), (ref, policy, linked) => bindTopLevelTools(topLevelTools, ref, policy, linked));
      const resources: ResourceBackend[] = [], tools: ToolImplementation[] = [], observers: SessionObserver[] = [], preparers: CommandPreparer[] = [];
      const actions: ActionContract<unknown>[] = [];
      entry = { plugin, resources, tools, topLevelTools: [], actions, observers, preparers, sdk, tasks: taskHost, storage, lifecycle, events: eventScope, preparations: lifecycle.group("prepare"), lifetime };
      initialized.push(entry);
      const commandIds = new Set<string>();
      const pluginTools = entry.topLevelTools;
      // Root entries and feature modules share registration; each module registers cleanup responsibility with plugin.lifetime during setup.
      const register = (contribution: ModuleContribution) => {
        if (contribution.webProviders?.length) {
          if (!services.webProviders) throw new Error("Web provider contributions are unavailable.");
          services.webProviders.declare(id, contribution.webProviders, lifecycle.group("call"));
        }
        if (contribution.usageProviders?.length || contribution.modelProviderPresets?.length) {
          if (!services.modelProviderExtensions) throw new Error("Provider contributions are unavailable.");
          services.modelProviderExtensions.declare(id, contribution.usageProviders ?? [], contribution.modelProviderPresets ?? [],
            lifecycle.group("call"), dependencies.get(id));
        }
        for (const call of contribution.calls ?? []) calls.declare(id, call, sdk, lifecycle.group("call"));
        for (const channel of contribution.channels ?? []) channels.declare(id, channel, sdk);
        for (const tool of contribution.topLevelTools ?? []) {
          pluginTools.push({ tool, sdk, runs: lifecycle.group("tool") });
        }
        for (const contract of contribution.events ?? []) events.declare(id, contract);
        for (const record of contribution.records ?? []) sdk.declare(record);
        for (const resource of contribution.resources ?? []) {
          const current = resource.template?.current ?? [];
          if (current.some(contract => !belongsTo(id, contract.id)))
            throw new Error(`Template data contracts must belong to resource plugin ${id}.`);
          if (new Set(current.map(contract => contract.id)).size !== current.length)
            throw new Error(`Duplicate template data contracts for ${resource.resource.kind}.`);
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
      };
      const setup = plugin.setup;
      const root = setup ? synchronous(() => setup.call(plugin, sdk.context)) : undefined;
      if (root) register(root);
      for (const module of [...root?.modules ?? [], ...plugin.modules ?? []]) {
        register(synchronous(() => module.setup(sdk.context)));
      }
      if (new Set(observers.map(observer => observer.id)).size !== observers.length) throw new Error(`Plugin ${id} declares duplicate observers.`);
      for (const resource of resources) if (!belongsTo(id, resource.kind))
        throw new Error(`Resource type ${resource.kind} is outside plugin namespace ${id}.`);
      validateToolContributions({ id, tools, topLevelTools: entry.topLevelTools });
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
      eventScope.activate();
      collected.push(entry); manifest.push({ id, status: "loaded", resources: ownKinds, implementations: [] });
    } catch (error) {
      if (entry) {
        services.modelProviderExtensions?.removeOwners([id]);
        services.webProviders?.removeOwners([id]);
        calls.removeOwner(id); channels.removeOwner(id);
        entry.events.stop(); events.removeOwner(id);
        entry.lifecycle.stop();
        invalidEntries.add(entry);
      }
      (services.log ?? defaultLog)(id, "error", "Plugin failed to load and was disabled.", error);
      manifest.push({ id, status: "failed", error: error instanceof Error ? error.message : String(error), resources: [], implementations: [] });
    }
  }
  async function dispose(entry: Collected) {
    entry.events.stop();
    await entry.lifecycle.close();
    await entry.lifetime.end();
    entry.sdk.disable();
    entry.storage.close();
  }
  let invalidated = true;
  while (invalidated) {
    invalidated = false;
    const actionContracts = new Map(collected.flatMap(entry => entry.actions.map(action => [action.id, action] as const)));
    for (let i = collected.length - 1; i >= 0; i--) {
      const entry = collected[i]!;
      const invalid = entry.preparers.find(preparer => actionContracts.get(preparer.contract.id) !== preparer.contract);
      const unavailable = dependencies.get(entry.plugin.namespace.id)?.find(id => !collected.some(provider => provider.plugin.namespace.id === id));
      if (!invalid && !unavailable) continue;
      const error = invalid ? `Preparer ${invalid.id} must import the registered action declaration: ${invalid.contract.id}.`
        : `Public dependency ${unavailable} is unavailable.`;
      const record = manifest.find(record => record.id === entry.plugin.namespace.id)!;
      record.status = "failed"; record.error = error; record.resources = [];
      entry.lifecycle.stop();
      calls.removeOwner(entry.plugin.namespace.id); channels.removeOwner(entry.plugin.namespace.id);
      entry.events.stop(); events.removeOwner(entry.plugin.namespace.id);
      invalidEntries.add(entry);
      collected.splice(i, 1); invalidated = true;
    }
  }
  services.modelProviderExtensions?.removeOwners([...invalidEntries].map(entry => entry.plugin.namespace.id));
  services.webProviders?.removeOwners([...invalidEntries].map(entry => entry.plugin.namespace.id));
  // setup and post-validation failures share one reverse cleanup pass so providers cannot bypass failed consumers still cleaning up.
  const failedCleanup = (async () => {
    await Promise.allSettled([...invalidEntries].map(entry => entry.lifecycle.close()));
    for (const entry of [...initialized].reverse()) if (invalidEntries.has(entry)) {
      try { await dispose(entry); }
      catch (error) { (services.log ?? defaultLog)(entry.plugin.namespace.id, "error", "Plugin cleanup failed.", error); }
    }
  })();
  const disposalOrder = [...collected].reverse();
  const index = (id: string) => plugins.findIndex(plugin => plugin.namespace.id === id);
  collected.sort((a, b) => index(a.plugin.namespace.id) - index(b.plugin.namespace.id));
  manifest.sort((a, b) => index(a.id) - index(b.id));
  const resolvedTools = resolveToolContributions(collected.map(entry => ({
    id: entry.plugin.namespace.id, tools: entry.tools, topLevelTools: entry.topLevelTools,
  })));
  topLevelTools = resolvedTools.topLevelTools;
  for (const record of manifest) record.implementations = resolvedTools.implementations.get(record.id) ?? [];
  const resources = new ResourceRegistry(collected.flatMap(entry => entry.resources));
  type Notification = { sessionId: string; snapshot: SessionSnapshot; records: SessionRecord[]; cursorChanged: boolean };
  const notifications: Notification[] = [];
  const touched = new Set<string>();
  const observers = collected.flatMap(entry => entry.observers);
  const presence = new ResourcePresence();
  /** Object lifetimes exist only for resources declaring attach; parent signals come from the owning plugin lifetime. */
  const objectScopes = new Map<string, LifetimeScope>();
  const ending = new Set<Promise<void>>();
  const attach = (resource: ResourceSnapshot) => {
    const owner = collected.find(entry => entry.resources.some(item => item.kind === resource.ref.kind));
    const backend = owner?.resources.find(item => item.kind === resource.ref.kind);
    if (!owner || !backend?.attach) return;
    const log = (message: string, error: unknown) => (services.log ?? defaultLog)(owner.plugin.namespace.id, "error", message, error);
    const scope = new LifetimeScope(log, owner.lifetime.signal);
    objectScopes.set(resource.ref.id, scope);
    try { backend.attach(resource, scope); }
    catch (error) { log(`Resource ${resource.ref.kind} attach failed.`, error); }
  };
  /** End object lifetimes: abort signals and cancel runs bound to these objects, then clean up after finalization. */
  const detach = (refs: readonly ResourceSnapshot["ref"][]): Promise<void> => {
    const ids = new Set(refs.map(ref => ref.id));
    const scopes = refs.flatMap(ref => {
      const scope = objectScopes.get(ref.id);
      objectScopes.delete(ref.id);
      return scope ? [scope] : [];
    });
    for (const scope of scopes) scope.abort();
    const work = (async () => {
      await Promise.allSettled(collected.map(entry => entry.lifecycle.cancel(object => ids.has(object.id))));
      await Promise.allSettled(scopes.map(scope => scope.end()));
    })();
    ending.add(work); void work.finally(() => ending.delete(work));
    return work;
  };
  const publishPresence = (sessionId: string, change: { appeared: readonly ResourceSnapshot[]; disappeared: readonly ResourceSnapshot[] }): Promise<void> => {
    if (!change.appeared.length && !change.disappeared.length) return Promise.resolve();
    // End frontend channels as soon as objects leave the current set, then end object lifetimes to release external instances.
    if (change.disappeared.length) channels.release(sessionId, change.disappeared.map(resource => resource.ref.id));
    events.publish(ResourcePresenceChanged, null, { sessionId,
      appeared: change.appeared.map(resource => resource.ref.id), disappeared: change.disappeared.map(resource => resource.ref.id) });
    const detached = change.disappeared.length ? detach(change.disappeared.map(resource => resource.ref)) : Promise.resolve();
    for (const resource of change.appeared) attach(resource);
    return detached;
  };
  const notifyPresence = (sessionId: string, snapshot: SessionSnapshot) =>
    void publishPresence(sessionId, presence.update(sessionId, snapshot.resources.all()));
  let dispatching = false;
  let closed = false;
  let closing: Promise<void> | undefined;
  return {
    calls, channels,
    events,
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
      const activity = collected.map(entry => entry.lifecycle.activity(sessionId));
      return { busy: [...new Set([...model.flatMap(run => run.running), ...activity.flatMap(run => run.busy)])],
        live: model.flatMap(run => run.live) };
    },
    resources, tools: new ToolRegistry(resolvedTools.tools), manifest: Object.freeze(manifest.map(entry => Object.freeze(entry))),
    initialize() {
      for (const session of services.sessions.list()) notifyPresence(session.id, sessionSnapshot(services.sessions.view(session.id)));
    },
    async release(sessionId) {
      await publishPresence(sessionId, { appeared: [], disappeared: presence.forget(sessionId) });
    },
    restore(sessionId) {
      notifyPresence(sessionId, sessionSnapshot(services.sessions.view(sessionId)));
    },
    afterCommit(sessionId, { records: nodes, cursorChanged }, publish) {
      touched.add(sessionId);
      const observed = (nodes.length > 0 && observers.some(observer => observer.committed))
        // Always compare resource presence on cursor changes; observers and frontend channels both depend on disappearance notifications.
        || cursorChanged;
      if (observed) {
        // Snapshots are fixed at this commit; subsequently queued commits do not rewrite them.
        const sequences = services.sessions.sequences(sessionId, nodes);
        notifications.push({ sessionId, records: nodes.map((node, index) => toRecord(node, sequences[index]!)), cursorChanged,
          snapshot: sessionSnapshot(services.sessions.view(sessionId)) });
      }
      if (dispatching) return;
      dispatching = true;
      try {
        while (notifications.length) {
          const event = notifications.shift()!;
          if (event.cursorChanged) notifyPresence(event.sessionId, event.snapshot);
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
        if (result.action === "reject") throw new PluginApiError("rejected", result.message, result.code, result.display);
        if (result.action === "replace") {
          current = { ...controller.parseCommand({ id: current.id, input: result.input }), content: context.content };
        }
      }
      return controller.prepareCommand ? controller.prepareCommand(current, ref, context.signal) : current;
    },
    close() {
      if (closing) return closing;
      closed = true;
      services.modelProviderExtensions?.removeOwners(collected.map(entry => entry.plugin.namespace.id));
      services.webProviders?.removeOwners(collected.map(entry => entry.plugin.namespace.id));
      for (const entry of collected) entry.events.stop();
      events.close();
      for (const lifecycle of lifecycles) lifecycle.stop();
      channels.close();
      closing = (async () => {
        await Promise.allSettled(collected.map(entry => entry.lifecycle.close()));
        await failedCleanup;
        // Exit and archival share object lifetime cleanup; objects end before their owning plugin lifetimes.
        const scopes = [...objectScopes.values()];
        objectScopes.clear();
        await Promise.allSettled([...scopes.map(scope => scope.end()), ...ending]);
        for (const entry of disposalOrder) await dispose(entry);
      })();
      return closing;
    },
  };
}
