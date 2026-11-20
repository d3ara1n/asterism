import type { UiText } from "@asterism-app/sdk/contracts";
import { type PluginDefinition, PluginApiError } from "@asterism-app/sdk/runtime";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { ConfigurationService } from "../configuration/service.ts";
import { applicationStorage } from "../shared/application.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { PackageList, PluginPackageError, readManifest, readPackageMetadata, packageSource, type Distribution, type PackageEntry } from "../plugins/packages.ts";
import { readManagedPluginId } from "../plugins/npm-records.ts";
import { NpmInstallations } from "../plugins/npm-installation.ts";
import { applicationPackages, applicationManuals } from "../plugins/distribution.ts";
import { commandSchema, snapshotSchema, type AppSnapshot, type AppError, type PluginEntry } from "../shared/contracts.ts";
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
import { TelemetryService } from "../telemetry/service.ts";
import type { WorkspaceLookup } from "../telemetry/types.ts";

export class ApplicationError extends Error {
  constructor(readonly code: AppError["code"], message: string, readonly display?: UiText) { super(message); }
}

/** Application composition root and session index; SessionService owns session content, operations, and queries. */

export class ApplicationService {
  readonly configuration: ConfigurationService;
  readonly sessions: SessionService;
  readonly content: ContentTransferService;
  readonly telemetry: TelemetryService;
  private readonly db: DatabaseSync;
  private readonly folders: FolderStore;
  private readonly list: PackageList;
  private readonly started: string;
  private readonly startedEntries: readonly PackageEntry[];
  private readonly npm: NpmInstallations;
  constructor(root: string, private readonly options: { rendererImportMap?: Record<string, string>; packageRoots?: ReadonlyMap<string, string>; skillDirectories?: readonly string[]; catalogs?: TranslationCatalog[]; packages?: readonly PluginCandidate[]; packageEntries?: readonly PackageEntry[]; manualSources?: readonly (ManualSource & { pluginId: string })[]; onConfigurationChanged?: () => void; onSessionChanged?: (event: SessionChanged) => void; onTelemetryChanged?: () => void; adapterFactory?: (settings: ModelSettings) => ModelAdapter; plugins?: readonly PluginDefinition[]; pluginDependencies?: ReadonlyMap<string, readonly string[]>; onPluginConfigurationChanged?: (pluginId: string) => void; preparedStorage?: PreparedPluginStorage; distribution?: Distribution } = {}) {
    this.db = openDatabase(root);
    this.folders = new FolderStore(this.db);
    this.list = applicationPackages(root, options.distribution);
    this.startedEntries = options.packageEntries ?? this.list.read();
    this.started = JSON.stringify(this.startedEntries);
    this.npmRoot = join(root, applicationStorage.pluginPackagesDirectory);
    this.npm = new NpmInstallations({ npmRoot: this.npmRoot, publish: (source, target) => {
      if (!target) this.list.add({ source }, this.npmRoot);
      else {
        const entries = this.list.read();
        const index = entries.findIndex(entry => packageSource(entry) === target.source);
        if (index < 0) throw new Error("The plugin selection was removed. Inspect the package again to add it.");
        this.list.replace(index, { ...entries[index]!, source }, this.npmRoot);
      }
    } });
    let telemetry: TelemetryService | undefined;
    try {
      this.configuration = new ConfigurationService(root, () => {
        this.sessions?.refreshSleep();
        options.onConfigurationChanged?.();
      });
      // Archive cleanup releases references first; session services then explicitly reclaim content.
      collectExpiredSessions(this.db, Date.now(), this.configuration.sessionLifecycle().retentionDays);
      // Telemetry reads the workspace catalog directly so usage history keeps current names for every session, archived ones included.
      const lookup: WorkspaceLookup = {
        folders: () => new Map(this.folders.list().map(folder => [folder.id, { id: folder.id, name: folder.name, color: folder.color }])),
        sessions: () => new Map(this.sessions.tree.usageCatalog().map(session => [session.id, session])),
        session: id => this.sessions.tree.usageCatalog(id)[0] ?? null,
        pluginNames: () => new Map((this.sessions?.packages ?? []).flatMap(item => item.id ? [[item.id, item.metadata.name ?? null] as const] : [])),
        providerNames: () => new Map(this.configuration.modelCatalog().modelProviders.map(provider => [provider.id, provider.name])),
      };
      telemetry = this.telemetry = new TelemetryService(root, lookup, options.onTelemetryChanged);
      this.sessions = new SessionService(this.db, root, this.configuration, {
        onChanged: options.onSessionChanged, adapterFactory: options.adapterFactory, plugins: options.plugins, usageLedger: this.telemetry,
        configurationChanged: options.onPluginConfigurationChanged, preparedStorage: options.preparedStorage,
        pluginDependencies: options.pluginDependencies, packages: options.packages, packageRoots: options.packageRoots, skillDirectories: options.skillDirectories,
        manualSources: packages => [...applicationManuals, ...(options.manualSources ?? []).filter(source => packages.some(item => item.id === source.pluginId && item.status === "loaded"))],
      });
      this.content = new ContentTransferService(this.sessions);
    } catch (error) { telemetry?.close(); this.db.close(); throw error; }
  }
  async close(): Promise<void> {
    const results = await Promise.allSettled([
      this.npm.close(), (async () => this.configuration.close())(), this.sessions.close(), this.content.close(),
    ]);
    const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
    // Keep storage available until session work and renderer transfers have reached terminal outcomes.
    try { this.db.close(); } catch (error) { errors.push(error); }
    try { this.telemetry.close(); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "Application cleanup failed.");
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
      if (command.type === "plugin.npm.preview") {
        let target = null;
        if (command.targetSource) {
          const entry = this.list.read().find(entry => packageSource(entry) === command.targetSource);
          if (!entry || entry.source.kind !== "npm") throw new Error("No such managed npm package.");
          const retainedId = entry.source.installation ? readManagedPluginId(this.npmRoot, entry.source.installation) : null;
          target = { source: command.targetSource, name: entry.source.name, installation: entry.source.installation, version: entry.source.version, id: retainedId ?? readManifest(this.list.root(entry, this.npmRoot)).id };
        }
        this.npm.preview(command.spec, target);
      } else if (command.type === "plugin.npm.install") this.npm.install(command.operationId);
      else if (command.type === "plugin.npm.approve") this.npm.approve(command.operationId, command.packages);
      else if (command.type === "plugin.npm.cancel") this.npm.cancel(command.operationId);
      else if (command.type === "plugin.add") this.list.add({ source: { kind: "path", path: command.path } }, this.npmRoot);
      else if (command.type === "plugin.restore") this.restore(command.source);
      else if (command.type === "plugin.enable") this.list.setEnabled(this.selected(command.source), command.enabled);
      else if (command.type === "plugin.remove") this.list.remove(this.selected(command.source));
      else if (command.type === "folder.create") this.folders.create(command.id, command.name, command.color);
      else if (command.type === "folder.update") this.folders.update(command.id, command.name, command.color);
      else if (command.type === "folder.delete") this.folders.delete(command.id);
      else if (command.type === "session.set-keep-awake") { this.sessions.tree.setKeepAwake(command.sessionId, command.keepAwake); this.sessions.refreshSleep(); }
      else if (command.type === "session.set-completed") this.sessions.tree.setCompleted(command.sessionId, command.completed);
      else if (command.type === "session.move") this.folders.moveSession(command.sessionId, command.folderId);
      else if (command.type === "template.move") this.folders.moveTemplate(command.templateId, command.folderId);
    } catch (error) {
      if (error instanceof PluginPackageError) throw new ApplicationError(error.code === "duplicate" ? "conflict" : "invalid_request", error.message);
      if (command.type.startsWith("plugin.npm.")) throw new ApplicationError("invalid_request", error instanceof Error ? error.message : String(error));
      if (error instanceof SessionError) throw new ApplicationError(error.code, error.message, error.display);
      throw error;
    }
    const workspace = this.db.prepare("SELECT * FROM workspace LIMIT 1").get();
    const membership = this.folders.sessionFolders();
    const sessions = this.sessions.tree.list().map(session => ({ id: session.id, title: session.title, created_at: session.createdAt, completed: session.completed, sleeping: session.sleeping, keepAwake: session.keepAwake, folder_id: membership.get(session.id) ?? null }));
    const archivedSessions = this.sessions.tree.archived().map(session => ({ id: session.id, title: session.title, created_at: session.createdAt, archived_at: session.archivedAt, folder_id: session.folderId }));
    const current = this.list.read();
    const removed = this.startedEntries.filter(entry => !current.some(item => packageSource(item) === packageSource(entry)));
    const entries = [
      ...current.map(entry => ({ entry, selected: true })),
      ...removed.map(entry => ({ entry, selected: false })),
      ...this.list.distribution.packages.filter(entry => ![...current, ...removed].some(item => packageSource(item) === packageSource(entry)))
        .map(entry => ({ entry, selected: false })),
    ];
    // Unselected entries describe packages without adding them to the loading list.
    const plugins = entries.map(({ entry, selected }): PluginEntry => this.pluginEntry(entry, selected))
      // A replaced source (npm update) or a path registration of a bundled identity supersedes the unselected record.
      .filter((plugin, _, all) => plugin.selection || !plugin.id || !all.some(item => item.selection && item.id === plugin.id));
    return snapshotSchema.parse({ workspace, folders: this.folders.list(), sessions, templates: this.sessions.templates.list(), archivedSessions, plugins,
      npmOperation: this.npm.snapshot(), rendererImportMap: this.options.rendererImportMap ?? {},
      rendererPlugins: this.sessions.packages.flatMap(item => item.status === "loaded" && item.id ? [{
        id: item.id, source: item.source, metadata: item.metadata, renderer: item.renderer,
        stylesheet: item.stylesheet, stylesheets: [...item.stylesheets ?? []], dependencies: [...item.rendererDependencies],
      }] : []),
      catalogs: (this.options.catalogs ?? []).filter(catalog => this.sessions.packages.some(item => item.id === catalog.owner && item.status === "loaded")),
      restartRequired: JSON.stringify(current) !== this.started,
      ...(command.type === "workspace.prepare-close" ? { disposalWarnings: this.sessions.disposalWarnings().map(({ title, warning }) => ({ title, warning })) } : {}) });
  }
  /** Current loading-list position of a selected source. */
  private selected(source: string): number {
    const index = this.list.read().findIndex(entry => packageSource(entry) === source);
    if (index < 0) throw new PluginPackageError("invalid_entry", "No such package entry.");
    return index;
  }
  /** A package removed since startup returns with its captured enablement and loading position; otherwise a bundled package is added. */
  private restore(source: string): void {
    const current = this.list.read();
    const captured = this.startedEntries.findIndex(entry => packageSource(entry) === source);
    if (captured >= 0 && !current.some(entry => packageSource(entry) === source)) {
      const entry = this.startedEntries[captured]!;
      const before = new Set(this.startedEntries.slice(0, captured).map(packageSource));
      this.list.add(entry, this.npmRoot, { enabled: entry.enabled, index: current.filter(item => before.has(packageSource(item))).length });
      return;
    }
    const entry = this.list.distribution.packages.find(entry => packageSource(entry) === source);
    if (!entry) throw new PluginPackageError("invalid_entry", "No such package to restore.");
    this.list.add(entry, this.npmRoot);
  }
  /** Selection state comes from the current list; startup state comes from this run's outcome, matched by source and then by plugin ID. */
  private pluginEntry(entry: PackageEntry, selected: boolean): PluginEntry {
    const source = packageSource(entry);
    const captured = this.startedEntries.find(item => packageSource(item) === source);
    const changed = !captured || JSON.stringify(captured) !== JSON.stringify(entry);
    const own = this.sessions.packages.find(item => item.source === source);
    let metadata = own?.metadata ?? {}, id = own?.id ?? null, metadataError = own?.metadataError ?? null;
    if (!own || changed) {
      const root = this.list.root(entry, this.npmRoot);
      try { metadata = readPackageMetadata(root); metadataError = null; }
      catch (error) { metadataError = error instanceof Error ? error.message : String(error); }
      if (!id) {
        try { id = (entry.source.kind === "npm" && entry.source.installation ? readManagedPluginId(this.npmRoot, entry.source.installation) : null) ?? readManifest(root).id; }
        catch { /* Startup diagnostics retain package validation failure reasons. */ }
      }
    }
    const outcome = own ?? (id ? this.sessions.packages.find(item => item.id === id) : undefined);
    const origin = entry.source.kind === "bundled" ? { kind: "bundled" as const }
      : entry.source.kind === "path" ? { kind: "path" as const, path: entry.source.path }
      : { kind: "npm" as const, name: entry.source.name, version: entry.source.version };
    return { source, id, origin, metadata, metadataError,
      selection: selected ? { enabled: entry.enabled } : null,
      startup: outcome ? { source: outcome.source, status: outcome.status, version: outcome.metadata.version ?? null, diagnostic: outcome.diagnostic ?? null } : null,
      pending: selected ? changed : captured !== undefined };
  }
}
