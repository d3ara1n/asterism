import type { CredentialVault } from "../configuration/credentials.ts";
import { PluginStorage } from "./storage.ts";
import type { PluginModels, RegistryView } from "./models.ts";
import { belongsTo } from "../shared/plugin.ts";
import { contractKey } from "../shared/presentation.ts";
import type { ResourceBackend } from "../resources/contract.ts";
import type { ResourceStateStore } from "../resources/state.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import { ToolRegistry } from "../tools/registry.ts";
import type { ToolContract } from "../shared/module-contract.ts";
import { PluginApiError, type PluginContext, type PluginDefinition, type PluginLogger, type PluginSession, type PluginSessions } from "./contract.ts";

export interface PluginHostServices {
  extensionsDirectory: string;
  state: ResourceStateStore;
  /** 由对象 ID 查对象类型，用于约束资源状态的归属。 */
  kindOf(objectId: string): string | null;
  sessions: PluginSessions;
  registry: RegistryView;
  models: PluginModels;
  /** 插件凭据复用宿主 vault；缺失时 secrets 返回 unavailable。 */
  vault?: CredentialVault | null;
  log?: (pluginId: string, level: "info" | "warn" | "error", message: string, error?: unknown) => void;
}
export interface PluginManifest {
  id: string;
  version: string;
  status: "loaded" | "failed";
  error?: string;
  resources: string[];
  implementations: { id: string; version: number; tool: string; resource: string; active: boolean; overriddenBy?: string }[];
}
export interface LoadedPlugins {
  resources: ResourceRegistry;
  tools: ToolRegistry;
  manifest: readonly PluginManifest[];
  /** 关闭插件托管数据库。 */
  close(): void;
}
interface Collected { plugin: PluginDefinition; resources: ResourceBackend[]; tools: ToolImplementation[] }

const defaultLog: NonNullable<PluginHostServices["log"]> = (pluginId, level, message, error) =>
  console[level](`[plugin ${pluginId}] ${message}`, ...(error === undefined ? [] : [error]));

function context(plugin: PluginDefinition, services: PluginHostServices, storage: PluginStorage): PluginContext {
  const id = plugin.namespace.id;
  const write = services.log ?? defaultLog;
  const log: PluginLogger = {
    info: message => write(id, "info", message),
    warn: message => write(id, "warn", message),
    error: (message, error) => write(id, "error", message, error),
  };
  const own = (objectId: string) => {
    const kind = services.kindOf(objectId);
    // 创建事务内对象尚未落入事件，此时 kind 为 null，按调用方所属插件放行。
    if (kind !== null && !belongsTo(id, kind)) throw new PluginApiError("foreign_resource", `Object ${objectId} belongs to another plugin.`);
  };
  const state: PluginContext["state"] = {
    get: (objectId, key) => { own(objectId); return services.state.get(objectId, key); },
    set: (sessionId, objectId, key, value) => { own(objectId); services.state.set(sessionId, objectId, key, value); },
    update: (objectId, key, value) => { own(objectId); return services.state.update(objectId, key, value); },
  };
  const session = (sessionId: string): PluginSession => ({
    id: sessionId,
    path: () => services.sessions.path(sessionId),
    linked: (objectId: string) => services.sessions.linked(services.sessions.path(sessionId), objectId),
    emit: (type, data, options = {}) => {
      const qualified = plugin.namespace.name(type);
      if (!belongsTo(id, qualified)) throw new PluginApiError("foreign_event", `Event ${type} is outside plugin namespace ${id}.`);
      return services.sessions.commit(sessionId, writer => writer.append({ kind: "event", type: qualified, data,
        agentId: options.agentId ?? null, model: options.model ?? null }));
    },
    commit: work => services.sessions.commit(sessionId, work),
    changed: () => services.sessions.changed(sessionId),
    progressChanged: () => services.sessions.progressChanged(sessionId),
    capabilities: (linked, policy) => services.sessions.capabilities(linked, policy),
    context: linked => services.sessions.context(linked),
  });
  return {
    id, dir: storage.dir, log, config: (schema, defaults) => storage.config(schema, defaults), secrets: storage.secrets, db: () => storage.db(), state, registry: services.registry, models: services.models,
    session,
    object: (sessionId, objectId) => ({
      objectId,
      get: key => state.get(objectId, key),
      set: (key, value) => state.set(sessionId, objectId, key, value),
    }),
  };
}
/** 同一插件内的贡献必须自洽：资源与实现在本命名空间内，同名工具只能是同一契约对象。 */
function validate(collected: Collected): void {
  const id = collected.plugin.namespace.id;
  for (const resource of collected.resources) {
    if (!belongsTo(id, resource.kind)) throw new Error(`Resource type ${resource.kind} is outside plugin namespace ${id}.`);
  }
  const contracts = new Map<string, ToolContract>();
  for (const tool of collected.tools) {
    if (!belongsTo(id, tool.reference.id)) throw new Error(`Implementation ${tool.reference.id} is outside plugin namespace ${id}.`);
    const existing = contracts.get(tool.tool.name);
    if (existing && existing !== tool.tool) throw new Error(`Plugin ${id} defines conflicting contracts for tool ${tool.tool.name}.`);
    contracts.set(tool.tool.name, tool.tool);
  }
}

/**
 * 两阶段装配：先按插件顺序收集全部贡献（失败只禁用该插件），再解析工具契约覆盖并冻结注册表。
 * 结果只取决于插件顺序，与插件内部注册顺序无关。
 */
export function loadPlugins(plugins: readonly PluginDefinition[], services: PluginHostServices): LoadedPlugins {
  const manifest: PluginManifest[] = [];
  const collected: Collected[] = [];
  const storages: PluginStorage[] = [];
  const kinds = new Set<string>();
  const identities = new Set<string>();
  for (const plugin of plugins) {
    const id = plugin.namespace.id;
    try {
      if (manifest.some(entry => entry.id === id)) throw new Error(`Duplicate plugin ID: ${id}`);
      const storage = new PluginStorage(services.extensionsDirectory, id, services.vault ?? null,
        (message, error) => (services.log ?? defaultLog)(id, "warn", message, error));
      storages.push(storage);
      const plugged = context(plugin, services, storage);
      const entry: Collected = { plugin, resources: [], tools: [] };
      for (const module of plugin.modules) {
        const contribution = module(plugged);
        entry.resources.push(...contribution.resources ?? []);
        entry.tools.push(...contribution.tools ?? []);
      }
      validate(entry);
      const ownKinds = entry.resources.map(resource => resource.kind);
      const ownIdentities = entry.tools.map(tool => contractKey(tool.reference));
      for (const kind of ownKinds) if (kinds.has(kind) || ownKinds.indexOf(kind) !== ownKinds.lastIndexOf(kind)) throw new Error(`Duplicate resource type: ${kind}`);
      for (const key of ownIdentities) if (identities.has(key) || ownIdentities.indexOf(key) !== ownIdentities.lastIndexOf(key)) throw new Error(`Duplicate implementation: ${key}`);
      ownKinds.forEach(kind => kinds.add(kind)); ownIdentities.forEach(key => identities.add(key));
      collected.push(entry);
      manifest.push({ id, version: plugin.version, status: "loaded", resources: ownKinds, implementations: [] });
    } catch (error) {
      (services.log ?? defaultLog)(id, "error", "Plugin failed to load and was disabled.", error);
      manifest.push({ id, version: plugin.version, status: "failed", error: error instanceof Error ? error.message : String(error), resources: [], implementations: [] });
    }
  }
  // 同名契约取装配顺序中最后定义者；绑定其他契约对象的实现下线。
  const effective = new Map<string, { contract: ToolContract; plugin: string }>();
  for (const entry of collected) for (const tool of entry.tools) effective.set(tool.tool.name, { contract: tool.tool, plugin: entry.plugin.namespace.id });
  const active: ToolImplementation[] = [];
  for (const entry of collected) {
    const record = manifest.find(item => item.id === entry.plugin.namespace.id)!;
    for (const tool of entry.tools) {
      const winner = effective.get(tool.tool.name)!;
      const live = winner.contract === tool.tool;
      if (live) active.push(tool);
      record.implementations.push({ ...tool.reference, tool: tool.tool.name, resource: tool.resourceKind, active: live,
        ...(live ? {} : { overriddenBy: winner.plugin }) });
    }
  }
  return {
    resources: new ResourceRegistry(collected.flatMap(entry => entry.resources)),
    tools: new ToolRegistry(active),
    manifest: Object.freeze(manifest.map(entry => Object.freeze(entry))),
    close: () => { for (const storage of storages) storage.close(); },
  };
}
