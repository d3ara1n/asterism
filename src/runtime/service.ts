import type { UiText } from "@asterism-app/sdk/contracts";
import { type PluginDefinition, PluginApiError } from "@asterism-app/sdk/runtime";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { ConfigurationService } from "../configuration/service.ts";
import { applicationStorage } from "../shared/application.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { PackageList, PluginPackageError, readManifest, readPackageMetadata, packageRoot, packageSource, type PackageEntry } from "../plugins/packages.ts";
import { applicationPackages, applicationManuals, bundledPackages } from "../plugins/distribution.ts";
import { commandSchema, snapshotSchema, type AppSnapshot, type AppError } from "../shared/contracts.ts";
import type { TranslationCatalog } from "../shared/i18n.ts";
import type { ModelSettings } from "../shared/model.ts";
import { pluginConfigurationCommandSchema, type PluginConfiguration } from "../shared/plugin-configuration.ts";
import type { SessionChanged } from "../shared/session.ts";
import { pluginErrorDisplay } from "./plugin-errors.ts";
import type { PreparedPluginStorage } from "../plugins/loader.ts";
import { SessionService } from "./sessions.ts";
import { FolderStore } from "../session/folders.ts";
import { SessionError } from "../shared/session-timeline.ts";
import { collectExpiredSessions, openDatabase } from "./storage.ts";
import { ContentTransferService } from "./content-transfer.ts";
import type { ManualSource } from "@asterism-app/sdk/runtime";
import type { PluginCandidate } from "../shared/plugin-startup.ts";

export class ApplicationError extends Error {
  constructor(readonly code: AppError["code"], message: string, readonly display?: UiText) { super(message); }
}

/** Application composition root and session index; SessionService owns session content, operations, and queries. */

export class ApplicationService {
  readonly configuration: ConfigurationService;
  readonly sessions: SessionService;
  readonly content: ContentTransferService;
  private readonly db: DatabaseSync;
  private readonly folders: FolderStore;
  private readonly list: PackageList;
  private readonly started: string;
  constructor(root: string, private readonly options: { packageRoots?: ReadonlyMap<string, string>; skillDirectories?: readonly string[]; catalogs?: TranslationCatalog[]; packages?: readonly PluginCandidate[]; packageEntries?: readonly PackageEntry[]; manualSources?: readonly (ManualSource & { pluginId: string })[]; onConfigurationChanged?: () => void; onSessionChanged?: (event: SessionChanged) => void; adapterFactory?: (settings: ModelSettings) => ModelAdapter; plugins?: readonly PluginDefinition[]; pluginDependencies?: ReadonlyMap<string, readonly string[]>; onPluginConfigurationChanged?: (pluginId: string) => void; preparedStorage?: PreparedPluginStorage } = {}) {
    this.db = openDatabase(root);
    this.folders = new FolderStore(this.db);
    this.list = applicationPackages(root);
    this.started = JSON.stringify(options.packageEntries ?? this.list.read());
    this.npmRoot = join(root, applicationStorage.pluginPackagesDirectory);
    try {
      this.configuration = new ConfigurationService(root, options.onConfigurationChanged);
      // Archive cleanup releases references first; session services then explicitly reclaim content.
      collectExpiredSessions(this.db);
      this.sessions = new SessionService(this.db, root, this.configuration, {
        onChanged: options.onSessionChanged, adapterFactory: options.adapterFactory, plugins: options.plugins,
        configurationChanged: options.onPluginConfigurationChanged, preparedStorage: options.preparedStorage,
        pluginDependencies: options.pluginDependencies, packages: options.packages, packageRoots: options.packageRoots, skillDirectories: options.skillDirectories,
        manualSources: packages => [...applicationManuals, ...(options.manualSources ?? []).filter(source => packages.some(item => item.id === source.pluginId && item.status === "loaded"))],
      });
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
      else if (command.type === "plugin.add-bundled") {
        const entry = bundledPackages.find(entry => packageSource(entry) === command.source);
        if (!entry) throw new PluginPackageError("invalid_entry", "No such bundled package.");
        this.list.add(entry, this.npmRoot);
      } else if (command.type === "plugin.enable") this.list.setEnabled(command.index, command.enabled);
      else if (command.type === "plugin.remove") this.list.remove(command.index);
      else if (command.type === "folder.create") this.folders.create(command.id, command.name, command.color);
      else if (command.type === "folder.update") this.folders.update(command.id, command.name, command.color);
      else if (command.type === "folder.delete") this.folders.delete(command.id);
      else if (command.type === "session.set-completed") this.sessions.tree.setCompleted(command.sessionId, command.completed);
      else if (command.type === "session.move") this.folders.moveSession(command.sessionId, command.folderId);
      else if (command.type === "template.move") this.folders.moveTemplate(command.templateId, command.folderId);
    } catch (error) {
      if (error instanceof PluginPackageError) throw new ApplicationError(error.code === "duplicate" ? "conflict" : "invalid_request", error.message);
      if (error instanceof SessionError) throw new ApplicationError(error.code, error.message, error.display);
      throw error;
    }
    const workspace = this.db.prepare("SELECT * FROM workspace LIMIT 1").get();
    const membership = this.folders.sessionFolders();
    const sessions = this.sessions.tree.list().map(session => ({ id: session.id, title: session.title, created_at: session.createdAt, completed: session.completed, folder_id: membership.get(session.id) ?? null }));
    const archivedSessions = this.sessions.tree.archived().map(session => ({ id: session.id, title: session.title, created_at: session.createdAt, archived_at: session.archivedAt }));
    const current = this.list.read();
    const entries = [
      ...current.map((entry, index) => ({ entry, index })),
      ...bundledPackages.filter(entry => !current.some(item => packageSource(item) === packageSource(entry)))
        .map(entry => ({ entry, index: null })),
    ];
    // Available distribution entries describe packages without adding them to the loading list.
    const plugins: AppSnapshot["plugins"] = entries.map(({ entry, index }): AppSnapshot["plugins"][number] => {
      const source = packageSource(entry);
      const startup = this.sessions.packages.find(item => item.source === source);
      const pending = !startup || startup.enabled !== entry.enabled;
      let metadata = startup?.metadata ?? {}, id = startup?.id ?? null, metadataError = startup?.metadataError ?? null;
      const root = packageRoot(entry, this.npmRoot);
      if (pending || index === null) {
        try { metadata = readPackageMetadata(root); metadataError = null; }
        catch (error) { metadataError = error instanceof Error ? error.message : String(error); }
      }
      if (!id) { try { id = readManifest(root).id; } catch { /* Loading state retains package validation failure reasons. */ } }
      if (index === null) return { index, source, bundled: true, metadata, enabled: false, id, status: "available",
        error: metadataError, diagnostic: null, renderer: null, stylesheet: null, dependencies: [] };
      return { index, source, bundled: entry.source.kind === "bundled", metadata, enabled: entry.enabled, id, status: pending ? "pending" as const : startup.status,
        error: (pending ? null : startup.diagnostic?.message) ?? metadataError, diagnostic: pending ? null : startup.diagnostic ?? null, renderer: pending ? null : startup.renderer,
        stylesheet: pending ? null : startup.stylesheet,
        dependencies: [...startup?.rendererDependencies ?? []] };
    }).filter((plugin, _, all) => plugin.index !== null || !plugin.id || !all.some(item => item.index !== null && item.id === plugin.id));
    return snapshotSchema.parse({ workspace, folders: this.folders.list(), sessions, templates: this.sessions.templates.list(), archivedSessions, plugins,
      catalogs: (this.options.catalogs ?? []).filter(catalog => this.sessions.packages.some(item => item.id === catalog.owner && item.status === "loaded")),
      restartRequired: JSON.stringify(current) !== this.started,
      ...(command.type === "workspace.prepare-close" ? { disposalWarnings: this.sessions.disposalWarnings() } : {}) });
  }
}
