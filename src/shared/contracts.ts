import { z } from "zod";
import { uiTextSchema, pluginMetadataSchema, type Json } from "@asterism-app/sdk/contracts";
import { translationCatalogSchema, type LanguageBridge } from "./language.ts";
import { coreChannel } from "./core.ts";
import type { DesktopPlatform, DesktopWindowBridge } from "./desktop.ts";
import type { AppearanceBridge } from "./theme.ts";
import { templateSummarySchema } from "./templates.ts";
import { startupStageSchema, type StartupBridge } from "./startup.ts";
import type { UpdatesBridge } from "./updates.ts";
import type { RendererFailure } from "./renderer-failure.ts";

export const protocolVersion = 13;
export const statusChannel = coreChannel("runtime-status");
export const pickDirectoryChannel = coreChannel("pick-directory");
export const openLocalFileChannel = coreChannel("open-local-file");
export const openLogsChannel = coreChannel("open-logs");
export const localFilePathSchema = z.string().min(1).refine(value => !value.includes("\0"), "A local file path is required.");
const id = z.string().uuid();
/** Application entries read workspace identity and session summaries only, without holding open-session bodies. */
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("workspace.read") }),
  z.strictObject({ type: z.literal("workspace.prepare-close") }),
  // Plugin package management changes lists only and takes effect after restart; paths must be package roots containing Asterism manifests.
  z.strictObject({ type: z.literal("plugin.add"), path: z.string().min(1).max(4096) }),
  z.strictObject({ type: z.literal("plugin.enable"), index: z.number().int().nonnegative(), enabled: z.boolean() }),
  z.strictObject({ type: z.literal("plugin.remove"), index: z.number().int().nonnegative() }),
]);
export type Command = z.infer<typeof commandSchema>;
export const runtimeStatusSchema = z.enum(["starting", "ready", "unavailable", "stopping"]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
export const snapshotSchema = z.strictObject({
  workspace: z.strictObject({ id, title: z.string() }),
  sessions: z.array(z.strictObject({ id, title: z.string(), created_at: z.string() })),
  templates: z.array(templateSummarySchema),
  /** Trash catalog containing sessions themselves only, used for settings counts and restoration. */
  archivedSessions: z.array(z.strictObject({ id, title: z.string(), created_at: z.string(), archived_at: z.string() })),
  /** Plugin packages at startup; renderer is the entry path under asterism-plugin://. */
  plugins: z.array(z.strictObject({ index: z.number().int().nonnegative(), bundled: z.boolean().default(false), id: z.string().nullable(), source: z.string(),
    status: z.enum(["loaded", "disabled", "invalid", "failed", "pending"]), enabled: z.boolean(), error: z.string().nullable(), renderer: z.string().nullable(),
    stylesheet: z.string().nullable(),
    metadata: pluginMetadataSchema.default({}),
    dependencies: z.array(z.string()).default([]) })),
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
