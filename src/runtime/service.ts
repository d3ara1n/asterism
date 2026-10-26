import type { UiText } from "@asterism/sdk/contracts";
import { type PluginDefinition, PluginApiError } from "@asterism/sdk/runtime";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { ConfigurationService } from "../configuration/service.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { PackageList, PluginPackageError, readManifest, readPackageMetadata, packageRoot } from "../plugins/packages.ts";
import { builtinMetadata } from "@asterism/builtin/runtime";
import { builtin } from "@asterism/builtin-api/contracts";
import { commandSchema, snapshotSchema, type AppSnapshot, type AppError } from "../shared/contracts.ts";
import type { TranslationCatalog } from "../shared/i18n.ts";
import type { ModelSettings } from "../shared/model.ts";
import { pluginConfigurationCommandSchema, type PluginConfiguration } from "../shared/plugin-configuration.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import type { SessionChanged } from "../shared/session.ts";
import { pluginErrorDisplay } from "./plugin-errors.ts";
import type { PreparedPluginStorage } from "../plugins/loader.ts";
import { SessionService } from "./sessions.ts";
import { collectExpiredSessions, openDatabase } from "./storage.ts";
import { ContentTransferService } from "./content-transfer.ts";

export class ApplicationError extends Error {
  constructor(readonly code: AppError["code"], message: string, readonly display?: UiText) { super(message); }
}

/** 应用组合根与会话索引；会话内容、操作和查询由 SessionService 拥有。 */
export interface StartupPackage { source: string; enabled: boolean; id: string | null; status: "loaded" | "disabled" | "invalid" | "failed"; error: string | null; renderer: string | null; stylesheet: string | null; dependencies?: string[]; rendererDependencies?: string[] }

export class ApplicationService {
  readonly configuration: ConfigurationService;
  readonly sessions: SessionService;
  readonly content: ContentTransferService;
  private readonly db: DatabaseSync;
  private readonly packages: StartupPackage[];
  private readonly list: PackageList;
  private readonly started: string;
  constructor(root: string, private readonly options: { catalogs?: TranslationCatalog[]; packages?: StartupPackage[]; protector?: SecretProtector; onConfigurationChanged?: () => void; onSessionChanged?: (event: SessionChanged) => void; adapterFactory?: (settings: ModelSettings) => ModelAdapter; plugins?: readonly PluginDefinition[]; onPluginConfigurationChanged?: (pluginId: string) => void; preparedStorage?: PreparedPluginStorage } = {}) {
    this.db = openDatabase(root);
    this.packages = options.packages ?? [];
    this.list = new PackageList(join(root, "plugins.json"));
    this.started = JSON.stringify(this.list.read());
    this.npmRoot = join(root, "plugins");
    try {
      const unavailable = async (): Promise<string> => { throw new Error("System credential protection is unavailable."); };
      this.configuration = new ConfigurationService(root, options.protector ?? { available: async () => false, encrypt: unavailable, decrypt: unavailable }, options.onConfigurationChanged);
      // 归档清理先释放引用，随后由会话服务显式回收内容。
      collectExpiredSessions(this.db);
      this.sessions = new SessionService(this.db, root, this.configuration, options.onSessionChanged, options.adapterFactory, options.plugins, options.onPluginConfigurationChanged, options.preparedStorage);
      // setup 与贡献登记也可能失败；纯前端消费者同样不能使用失败提供方。
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of this.packages) if (item.status === "loaded") {
          const own = this.sessions.plugins.find(plugin => plugin.id === item.id && plugin.status === "failed");
          const failed = item.dependencies?.find(id =>
            this.sessions.plugins.some(plugin => plugin.id === id && plugin.status === "failed")
            || this.packages.some(provider => provider.id === id && provider.status !== "loaded"));
          if (!own && !failed) continue;
          item.status = "failed"; item.error = own?.error ?? `Public dependency ${failed} is unavailable.`;
          item.renderer = null; changed = true;
        }
      }
      this.content = new ContentTransferService(this.sessions);
    } catch (error) { this.db.close(); throw error; }
  }
  async close(): Promise<void> {
    this.configuration.close();
    await Promise.all([this.sessions.close(), this.content.close()]);
    this.db.close();
  }
  private readonly npmRoot: string;
  configurePlugin(raw: unknown): PluginConfiguration[] {
    const parsed = pluginConfigurationCommandSchema.safeParse(raw);
    if (!parsed.success) throw new ApplicationError("invalid_request", "Invalid plugin configuration command.");
    try { return this.sessions.configurePlugins(parsed.data); }
    catch (error) {
      if (error instanceof PluginApiError) throw new ApplicationError(
        error.reason ?? (error.code === "invalid_argument" ? "invalid_request" : error.code === "not_found" ? "not_found" : "unavailable"), error.message, pluginErrorDisplay(error));
      throw new ApplicationError("unavailable", "Plugin configuration could not be read or saved. Reload and retry.");
    }
  }
  execute(raw: unknown): AppSnapshot {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new ApplicationError("invalid_request", "Invalid application command.");
    const command = parsed.data;
    try {
      if (command.type === "plugin.add") this.list.add({ source: { kind: "path", path: command.path } }, this.npmRoot);
      else if (command.type === "plugin.enable") this.list.setEnabled(command.index, command.enabled);
      else if (command.type === "plugin.remove") this.list.remove(command.index);
    } catch (error) {
      if (error instanceof PluginPackageError) throw new ApplicationError(error.code === "duplicate" ? "conflict" : "invalid_request", error.message);
      throw error;
    }
    const workspace = this.db.prepare("SELECT * FROM workspace LIMIT 1").get();
    const sessions = this.sessions.tree.list().map(session => ({ id: session.id, title: session.title, created_at: session.createdAt }));
    const archivedSessions = this.sessions.tree.archived().map(session => ({ id: session.id, title: session.title, created_at: session.createdAt, archived_at: session.archivedAt }));
    const current = this.list.read();
    // 列表项按来源匹配本次启动结果；新加入或改动的项显示为待重启。
    const plugins: AppSnapshot["plugins"] = current.map((entry, index) => {
      const source = entry.source.kind === "path" ? entry.source.path : `${entry.source.name}@${entry.source.version}`;
      const startup = this.packages.find(item => item.source === source);
      const pending = !startup || startup.enabled !== entry.enabled;
      let metadata = {}, id = startup?.id ?? null, metadataError: string | null = null;
      const root = packageRoot(entry, this.npmRoot);
      try { metadata = readPackageMetadata(root); }
      catch (error) { metadataError = error instanceof Error ? error.message : String(error); }
      if (!id) { try { id = readManifest(root).id; } catch { /* 加载状态保留包校验失败原因。 */ } }
      return { index, source, metadata, enabled: entry.enabled, id, status: pending ? "pending" as const : startup.status,
        error: (pending ? null : startup.error) ?? metadataError, renderer: pending ? null : startup.renderer,
        stylesheet: pending ? null : startup.stylesheet,
        dependencies: startup?.rendererDependencies ?? [] };
    });
    const builtIn = this.sessions.plugins.find(plugin => plugin.id === builtin.id);
    plugins.push({ index: null, source: "@asterism/builtin", id: builtin.id, metadata: builtinMetadata,
      status: builtIn?.status ?? "failed", enabled: true, error: builtIn?.error ?? null, renderer: null, stylesheet: null, dependencies: [] });
    return snapshotSchema.parse({ workspace, sessions, templates: this.sessions.templates.list(), archivedSessions, plugins, catalogs: this.options.catalogs ?? [], restartRequired: JSON.stringify(current) !== this.started,
      ...(command.type === "workspace.prepare-close" ? { disposalWarnings: this.sessions.disposalWarnings() } : {}) });
  }
}
