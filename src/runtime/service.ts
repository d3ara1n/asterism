import type { UiText } from "@atelier/sdk/contracts";
import type { PluginDefinition } from "@atelier/sdk/runtime";
import { PluginApiError } from "@atelier/sdk/runtime";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { ConfigurationService } from "../configuration/service.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { PackageList, PluginPackageError } from "../plugins/packages.ts";
import { commandSchema, snapshotSchema, type AppSnapshot, type AppError } from "../shared/contracts.ts";
import type { TranslationCatalog } from "../shared/i18n.ts";
import type { ModelSettings } from "../shared/model.ts";
import type { ObjectStreamPayload } from "../shared/object-stream.ts";
import { pluginConfigurationCommandSchema, type PluginConfigurationCommand, type PluginConfiguration } from "../shared/plugin-configuration.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import type { SessionChanged } from "../shared/session.ts";
import { pluginErrorDisplay } from "./plugin-errors.ts";
import { SessionService } from "./sessions.ts";
import { openDatabase } from "./storage.ts";
import { ContentTransferService } from "./content-transfer.ts";

export class ApplicationError extends Error {
  constructor(readonly code: AppError["code"], message: string, readonly display?: UiText) { super(message); }
}

/** 应用组合根与会话索引；会话内容、操作和查询由 SessionService 拥有。 */
export interface StartupPackage { source: string; enabled: boolean; id: string | null; status: "loaded" | "disabled" | "invalid" | "failed"; error: string | null; renderer: string | null }

export class ApplicationService {
  readonly configuration: ConfigurationService;
  readonly sessions: SessionService;
  readonly content: ContentTransferService;
  private readonly db: DatabaseSync;
  private readonly packages: StartupPackage[];
  private readonly list: PackageList;
  private readonly started: string;
  constructor(root: string, private readonly options: { catalogs?: TranslationCatalog[]; packages?: StartupPackage[]; protector?: SecretProtector; onConfigurationChanged?: () => void; onSessionChanged?: (event: SessionChanged) => void; adapterFactory?: (settings: ModelSettings) => ModelAdapter; plugins?: readonly PluginDefinition[]; onStream?: (event: ObjectStreamPayload) => void; onPluginConfigurationChanged?: (pluginId: string) => void } = {}) {
    this.db = openDatabase(root);
    this.packages = options.packages ?? [];
    this.list = new PackageList(join(root, "plugins.json"));
    this.started = JSON.stringify(this.list.read());
    this.npmRoot = join(root, "plugins");
    try {
      const unavailable = async (): Promise<string> => { throw new Error("System credential protection is unavailable."); };
      this.configuration = new ConfigurationService(root, options.protector ?? { available: async () => false, encrypt: unavailable, decrypt: unavailable }, options.onConfigurationChanged);
      this.sessions = new SessionService(this.db, root, this.configuration, options.onSessionChanged, options.adapterFactory, options.plugins, options.onStream, options.onPluginConfigurationChanged);
      this.content = new ContentTransferService(this.sessions);
    } catch (error) { this.db.close(); throw error; }
  }
  async close(): Promise<void> {
    this.configuration.close();
    await Promise.all([this.sessions.close(), this.content.close()]);
    this.db.close();
  }
  private readonly npmRoot: string;
  configurePlugin(raw: PluginConfigurationCommand): PluginConfiguration[] {
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
    const current = this.list.read();
    // 列表项按来源匹配本次启动结果；新加入或改动的项显示为待重启。
    const plugins = current.map((entry, index) => {
      const source = entry.source.kind === "path" ? entry.source.path : `${entry.source.name}@${entry.source.version}`;
      const startup = this.packages.find(item => item.source === source);
      const pending = !startup || startup.enabled !== entry.enabled;
      return { index, source, enabled: entry.enabled, id: startup?.id ?? null, status: pending ? "pending" as const : startup.status,
        error: pending ? null : startup.error, renderer: pending ? null : startup.renderer };
    });
    return snapshotSchema.parse({ workspace, sessions, plugins, catalogs: this.options.catalogs ?? [], restartRequired: JSON.stringify(current) !== this.started });
  }
}
