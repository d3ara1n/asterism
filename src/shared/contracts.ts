import { z } from "zod";
import type { ConfigurationBridge } from "./configuration.ts";
import type { DesktopPlatform } from "./desktop.ts";
import type { AppearanceBridge } from "./theme.ts";
import type { SessionBridge } from "./session.ts";

export const protocolVersion = 4;
export const commandChannel = "weft:command";
export const statusChannel = "weft:runtime-status";
export const pickDirectoryChannel = "weft:pick-directory";
const id = z.string().uuid();
/** 应用入口只读取工作区身份和会话摘要，不持有已打开会话的正文。 */
export const commandSchema = z.strictObject({ type: z.literal("workspace.read") });
export type Command = z.infer<typeof commandSchema>;
export const runtimeStatusSchema = z.enum(["starting", "ready", "unavailable", "stopping"]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
export const snapshotSchema = z.strictObject({
  workspace: z.strictObject({ id, title: z.string() }),
  sessions: z.array(z.strictObject({ id, title: z.string(), created_at: z.string() })),
});
export type AppSnapshot = z.infer<typeof snapshotSchema>;
export const errorSchema = z.strictObject({ code: z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]), message: z.string() });
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
  z.strictObject({ kind: z.literal("fatal"), message: z.string() }),
]);
export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;
export interface DesktopBridge {
  session: SessionBridge;
  configuration: ConfigurationBridge;
  appearance: AppearanceBridge;
  readonly platform: DesktopPlatform;
  /** 系统目录选择窗口；取消返回 null。 */
  pickDirectory(): Promise<string | null>;
  /** 拖入文件的本机路径；由 Electron webUtils 解析，renderer 不能伪造 File.path。 */
  pathForFile(file: File): string;
  execute(command: Command): Promise<CommandResult>;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}
