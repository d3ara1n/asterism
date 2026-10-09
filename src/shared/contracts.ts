import { z } from "zod";
import type { ConfigurationBridge } from "./configuration.ts";
import type { DesktopPlatform } from "./desktop.ts";
import type { AppearanceBridge } from "./theme.ts";
import type { SessionBridge } from "./session.ts";
import { presentationSchema } from "./presentation.ts";

export const protocolVersion = 3;
export const commandChannel = "weft:command";
export const statusChannel = "weft:runtime-status";
const id = z.string().uuid();
const title = z.string().trim().min(1).max(160);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const pointSchema = z.strictObject({ x: coordinate, y: coordinate });
export const viewportSchema = z.strictObject({ x: coordinate, y: coordinate, zoom: z.number().min(0.1).max(4) });
/** 工作台命令；会话由首次发送创建，不在此处建立。历史位置由会话游标决定。 */
export const commandSchema = z.discriminatedUnion("type", [
  // 不带 session_id 时只返回工作区与会话列表摘要。
  z.strictObject({ type: z.literal("workspace.read"), session_id: id.optional(), at: id.optional() }),
  z.strictObject({ type: z.literal("note.create"), session_id: id, title, content: z.string().min(1).max(100_000), position: pointSchema }),
  z.strictObject({ type: z.literal("directory.add"), session_id: id, path: z.string().min(1).max(4096), position: pointSchema }),
  z.strictObject({ type: z.literal("object.remove"), session_id: id, object_id: id }),
  z.strictObject({ type: z.literal("link.set"), session_id: id, agent_id: id, resource_id: id, linked: z.boolean() }),
  z.strictObject({ type: z.literal("view.set"), session_id: id, object_id: id, position: pointSchema.optional(), hidden: z.boolean().optional(), collapsed: z.boolean().optional() }),
  z.strictObject({ type: z.literal("viewport.set"), session_id: id, viewport: viewportSchema }),
]);

export type Command = z.infer<typeof commandSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Viewport = z.infer<typeof viewportSchema>;
export const runtimeStatusSchema = z.enum(["starting", "ready", "unavailable", "stopping"]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
const objectSchema = z.strictObject({ id, kind: z.string().min(1).max(160), title: z.string(), presentation: presentationSchema });
export type WorkbenchObject = z.infer<typeof objectSchema>;
const viewSchema = z.strictObject({ object_id: id, position: pointSchema, hidden: z.boolean(), collapsed: z.boolean() });
export type ObjectView = z.infer<typeof viewSchema>;
const sessionSummarySchema = z.strictObject({ id, title: z.string(), created_at: z.string() });
export const snapshotSchema = z.strictObject({
  workspace: z.strictObject({ id, title: z.string() }),
  sessions: z.array(sessionSummarySchema),
  session: z.strictObject({
    ...sessionSummarySchema.shape,
    objects: z.array(objectSchema),
    views: z.array(viewSchema),
    viewport: viewportSchema,
    links: z.array(z.strictObject({ agent_id: id, resource_id: id })),
    /** 查看的历史节点；null 为当前游标。工作台按该位置的路径折叠。 */
    at: id.nullable(),
  }).nullable(),
});
export type AppSnapshot = z.infer<typeof snapshotSchema>;
export type WorkbenchSnapshot = NonNullable<AppSnapshot["session"]>;
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
  execute(command: Command): Promise<CommandResult>;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}
