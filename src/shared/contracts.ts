import { z } from "zod";
import { uiTextSchema } from "@atelier/sdk/contracts";
import { translationCatalogSchema, type LanguageBridge } from "./language.ts";
import type { Json } from "@atelier/sdk/contracts";
import { coreChannel } from "./core.ts";
import type { ConfigurationBridge } from "./configuration.ts";
import type { DesktopPlatform } from "./desktop.ts";
import type { AppearanceBridge } from "./theme.ts";
import type { SessionBridge } from "./session.ts";
import type { PluginConfigurationBridge } from "./plugin-configuration.ts";
import type { ContentBridge } from "./content.ts";
import type { EventBridge } from "./plugin-events.ts";

export const protocolVersion = 5;
export const commandChannel = coreChannel("command");
export const statusChannel = coreChannel("runtime-status");
export const pickDirectoryChannel = coreChannel("pick-directory");
const id = z.string().uuid();
/** 应用入口只读取工作区身份和会话摘要，不持有已打开会话的正文。 */
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("workspace.read") }),
  // 插件包管理：只改包列表，重启后生效；路径必须是含 Atelier 清单的包根。
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
  /** 插件包：启动时状态；renderer 为 atelier-plugin:// 下的入口路径。 */
  plugins: z.array(z.strictObject({ index: z.number().int().nonnegative(), id: z.string().nullable(), source: z.string(),
    status: z.enum(["loaded", "disabled", "invalid", "failed", "pending"]), enabled: z.boolean(), error: z.string().nullable(), renderer: z.string().nullable() })),
  /** 包列表与本次启动不同：需要重启生效。 */
  restartRequired: z.boolean(),
  catalogs: z.array(translationCatalogSchema).optional(),
});
export type AppSnapshot = z.infer<typeof snapshotSchema>;
export const errorSchema = z.strictObject({ code: z.string().min(1), message: z.string(), display: uiTextSchema.optional() });
export type AppError = z.infer<typeof errorSchema>;
export const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), snapshot: snapshotSchema }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
]);
export type CommandResult = z.infer<typeof resultSchema>;
export const requestSchema = z.strictObject({ version: z.literal(protocolVersion), id, command: commandSchema });
export const responseSchema = z.strictObject({ version: z.literal(protocolVersion), id, result: resultSchema });
export const runtimeMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), version: z.literal(protocolVersion) }),
  z.strictObject({ kind: z.literal("response"), ...responseSchema.shape }),
  // reason 为启动失败类别，main 按类别选择提示；迁移上线时扩展类别值，不改消息形状。
  z.strictObject({ kind: z.literal("fatal"), message: z.string(), reason: z.enum(["database_version", "unknown"]), directory: z.string().optional() }),
]);
export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;
export interface DesktopBridge {
  events: EventBridge;
  content: ContentBridge;
  language: LanguageBridge;
  session: SessionBridge;
  configuration: ConfigurationBridge;
  appearance: AppearanceBridge;
  pluginConfiguration: PluginConfigurationBridge;
  /** 受控偏好容器：只能读写 preferences 内宿主规定前缀的键。 */
  preferences: { read(): Promise<Record<string, Json>>; write(key: string, value: Json | null): Promise<boolean> };
  readonly platform: DesktopPlatform;
  /** 系统目录选择窗口；取消返回 null。 */
  pickDirectory(): Promise<string | null>;
  /** 拖入文件的本机路径；由 Electron webUtils 解析，renderer 不能伪造 File.path。 */
  pathForFile(file: File): string;
  execute(command: Command): Promise<CommandResult>;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
  /** 对象二进制流：按会话与对象订阅，channel 带插件命名空间。 */
  onObjectStream(sessionId: string, objectId: string, listener: (channel: string, data: Uint8Array) => void): () => void;
}
