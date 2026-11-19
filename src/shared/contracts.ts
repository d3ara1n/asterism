import { z } from "zod";
import { uiTextSchema, pluginMetadataSchema, type Json } from "@asterism-app/sdk/contracts";
import { translationCatalogSchema, type LanguageBridge } from "./language.ts";
import { coreChannel } from "./core.ts";
import type { DesktopPlatform, DesktopWindowBridge } from "./desktop.ts";
import type { AppearanceBridge } from "./theme.ts";
import { templateSummarySchema } from "./templates.ts";
import { folderCommands, folderIdSchema, folderSchema } from "./folders.ts";
import { startupStageSchema, type StartupBridge } from "./startup.ts";
import type { UpdatesBridge } from "./updates.ts";
import type { CrashReportsBridge } from "./crash-reports.ts";
import type { NetworkBridge } from "./network.ts";
import type { RendererFailure } from "./renderer-failure.ts";
import { pluginDiagnosticSchema } from "./plugin-startup.ts";

/** One host-owned npm operation. Long-running work is polled through workspace.read. */
export const npmPreviewSchema = z.strictObject({ name: z.string(), version: z.string(), description: z.string().nullable(), integrity: z.string().nullable() });
export const npmOperationSchema = z.strictObject({
  id: z.string().uuid(), spec: z.string(), targetSource: z.string().nullable(),
  phase: z.enum(["inspecting", "preview", "installing", "awaiting-approval", "cancelling", "succeeded", "failed", "cancelled"]),
  preview: npmPreviewSchema.nullable(), output: z.string(), blockedBuilds: z.array(z.string()), error: z.string().nullable(),
});
export type NpmPreview = z.infer<typeof npmPreviewSchema>;
export type NpmOperation = z.infer<typeof npmOperationSchema>;

/** Where a package's files come from; path packages expose their user-owned directory. */
export const pluginOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("bundled") }),
  z.strictObject({ kind: z.literal("path"), path: z.string() }),
  z.strictObject({ kind: z.literal("npm"), name: z.string(), version: z.string() }),
]);
/**
 * One plugin management entry. selection is the next-start loading list state (null when not selected);
 * startup is this run's outcome for the same package, or for the same plugin ID under a replaced source such as an npm update.
 * Unselected entries are bundled packages that can be added back, or removed packages still running until restart.
 */
export const pluginEntrySchema = z.strictObject({
  /** Stable source identity used by management commands and npm update targets. */
  source: z.string(),
  id: z.string().nullable(),
  origin: pluginOriginSchema,
  metadata: pluginMetadataSchema,
  metadataError: z.string().nullable(),
  selection: z.strictObject({ enabled: z.boolean() }).nullable(),
  startup: z.strictObject({ source: z.string(), status: z.enum(["loaded", "disabled", "invalid", "failed"]), version: z.string().nullable(),
    diagnostic: pluginDiagnosticSchema.nullable() }).nullable(),
  /** The next startup differs from this run for this entry. */
  pending: z.boolean(),
});
export type PluginEntry = z.infer<typeof pluginEntrySchema>;

export const protocolVersion = 18;
export const systemResumeMessage = "system.resume";
export const statusChannel = coreChannel("runtime-status");
export const pickDirectoryChannel = coreChannel("pick-directory");
export const openLocalFileChannel = coreChannel("open-local-file");
export const showLocalFileChannel = coreChannel("show-local-file");
export const openLogsChannel = coreChannel("open-logs");
export const localFilePathSchema = z.string().min(1).refine(value => !value.includes("\0"), "A local file path is required.");
export const showLocalFileSchema = z.strictObject({ path: localFilePathSchema, directory: z.boolean() });
const id = z.string().uuid();
/** Application entries read workspace identity and session summaries only, without holding open-session bodies. */
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("workspace.read") }),
  z.strictObject({ type: z.literal("workspace.prepare-close") }),
  // Plugin package management changes lists only and takes effect after restart; paths must be package roots containing Asterism manifests.
  z.strictObject({ type: z.literal("plugin.add"), path: z.string().min(1).max(4096) }),
  // Restore a bundled package or a package removed since this startup, by source identity.
  z.strictObject({ type: z.literal("plugin.restore"), source: z.string().min(1) }),
  z.strictObject({ type: z.literal("plugin.enable"), source: z.string().min(1), enabled: z.boolean() }),
  z.strictObject({ type: z.literal("plugin.remove"), source: z.string().min(1) }),
  z.strictObject({ type: z.literal("plugin.npm.preview"), spec: z.string().trim().min(1).max(512), targetSource: z.string().min(1).optional() }),
  z.strictObject({ type: z.literal("plugin.npm.install"), operationId: id }),
  z.strictObject({ type: z.literal("plugin.npm.approve"), operationId: id, packages: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("plugin.npm.cancel"), operationId: id }),
  // Folder catalog and membership changes return the refreshed snapshot so navigation regroups at once.
  ...folderCommands,
  z.strictObject({ type: z.literal("session.set-keep-awake"), sessionId: id, keepAwake: z.boolean() }),
  z.strictObject({ type: z.literal("session.set-completed"), sessionId: id, completed: z.boolean() }),
]);
export type Command = z.infer<typeof commandSchema>;
export const runtimeStatusSchema = z.enum(["starting", "ready", "unavailable", "stopping"]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
export const snapshotSchema = z.strictObject({
  workspace: z.strictObject({ id, title: z.string() }),
  folders: z.array(folderSchema),
  sessions: z.array(z.strictObject({ id, title: z.string(), created_at: z.string(), folder_id: folderIdSchema, completed: z.boolean(), sleeping: z.boolean(), keepAwake: z.boolean() })),
  templates: z.array(templateSummarySchema),
  /** Trash catalog containing sessions themselves only, used for settings counts and restoration. */
  archivedSessions: z.array(z.strictObject({ id, title: z.string(), created_at: z.string(), archived_at: z.string(), folder_id: folderIdSchema })),
  /** Selected packages in loading order, then removed packages still running, then bundled packages not selected. */
  plugins: z.array(pluginEntrySchema),
  npmOperation: npmOperationSchema.nullable().optional(),
  /** Captured loaded composition for every renderer in this runtime, independent of next-start management edits. */
  rendererPlugins: z.array(z.strictObject({ id: z.string(), source: z.string(), metadata: pluginMetadataSchema,
    renderer: z.string().nullable(), stylesheet: z.string().nullable(), stylesheets: z.array(z.string()).optional(), dependencies: z.array(z.string()) })),
  rendererImportMap: z.record(z.string(), z.string()).optional(),
  /** Package lists differing from this startup require restart to take effect. */
  restartRequired: z.boolean(),
  catalogs: z.array(translationCatalogSchema).optional(),
  disposalWarnings: z.array(z.strictObject({ title: z.string(), warning: uiTextSchema })).optional(),
});
export type AppSnapshot = z.infer<typeof snapshotSchema>;
export const errorSchema = z.strictObject({ code: z.string().min(1), message: z.string(), display: uiTextSchema.optional() });
export type AppError = z.infer<typeof errorSchema>;
export const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), snapshot: snapshotSchema }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
]);
export type CommandResult = z.infer<typeof resultSchema>;
export const requestSchema = z.strictObject({ version: z.literal(protocolVersion), id, command: z.unknown() });
export const responseSchema = z.strictObject({ version: z.literal(protocolVersion), id, result: resultSchema });
export const runtimeMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("startup"), stage: startupStageSchema, detail: z.string().optional() }),
  z.strictObject({ kind: z.literal("ready"), version: z.literal(protocolVersion) }),
  z.strictObject({ kind: z.literal("response"), ...responseSchema.shape }),
  // reason identifies startup failure categories and main selects prompts accordingly; extend categories when migration lands without changing message shapes.
  z.strictObject({ kind: z.literal("fatal"), message: z.string(), reason: z.enum(["database_version", "unknown"]), directory: z.string().optional() }),
]);
export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;
/** Main-process capabilities: windows, appearance, language, preferences, and system dialogs. Task-process capabilities use direct ports handed off by connectRuntime. */
export interface DesktopBridge {
  startup: StartupBridge;
  updates: UpdatesBridge;
  crashReports: CrashReportsBridge;
  network: NetworkBridge;
  language: LanguageBridge;
  appearance: AppearanceBridge;
  /** Controlled preference container: only keys with host-defined prefixes within preferences can be read or written. */
  preferences: { read(): Promise<Record<string, Json>>; write(key: string, value: Json | null): Promise<boolean> };
  window: DesktopWindowBridge;
  readonly platform: DesktopPlatform;
  /** System directory picker; starts at an existing absolute directory or the user's home. Returns null on cancellation. */
  pickDirectory(initialPath?: string): Promise<string | null>;
  /** Open user-clicked local files with system-associated apps; return error text on failure. */
  openLocalFile(path: string): Promise<string>;
  showLocalFile(path: string, directory: boolean): Promise<string>;
  saveFile(command: import("./file-save.ts").FileSaveCommand): Promise<import("./file-save.ts").FileSaveReply>;
  /** Open the application log directory in the system file manager; return error text on failure. */
  openLogs(): Promise<string>;
  /** Persist fatal interface diagnostics in the application log. */
  reportFailure(failure: RendererFailure): void;
  /** Local paths for dropped files, resolved by Electron webUtils; renderers cannot fabricate File.path. */
  pathForFile(file: File): string;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
  /**
   * Request a direct task-process connection, accepted once per page. Deliver ports through window messages (connectionPortMessage),
   * without a port when the task process is unavailable.
   */
  connectRuntime(): void;
}
