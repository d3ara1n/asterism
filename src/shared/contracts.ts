import { z } from "zod";
import type { ConfigurationBridge } from "./configuration.ts";
import type { DesktopPlatform } from "./desktop.ts";

export const protocolVersion = 1;
export const commandChannel = "weft:command";
export const statusChannel = "weft:runtime-status";
const id = z.string().uuid();
const title = z.string().trim().min(1).max(160);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const pointSchema = z.strictObject({ x: coordinate, y: coordinate });
export const viewportSchema = z.strictObject({ x: coordinate, y: coordinate, zoom: z.number().min(0.1).max(4) });
export const commandSchema = z.discriminatedUnion("type", [
  // 不带 task_id 时仅返回工作区与会话列表摘要，不选择或读取任何任务。
  z.strictObject({ type: z.literal("workspace.read"), task_id: id.optional(), at_seq: z.number().int().positive().optional() }),
  z.strictObject({ type: z.literal("task.create"), title }),
  z.strictObject({ type: z.literal("agent.create"), task_id: id, title, position: pointSchema }),
  z.strictObject({ type: z.literal("note.create"), task_id: id, title, content: z.string().min(1).max(100_000), position: pointSchema }),
  z.strictObject({ type: z.literal("binding.set"), task_id: id, agent_id: id, resource_id: id, attached: z.boolean() }),
  z.strictObject({ type: z.literal("view.set"), task_id: id, object_id: id, position: pointSchema.optional(), hidden: z.boolean().optional(), collapsed: z.boolean().optional() }),
  z.strictObject({ type: z.literal("viewport.set"), task_id: id, viewport: viewportSchema }),
]);

export type Command = z.infer<typeof commandSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Viewport = z.infer<typeof viewportSchema>;
export const runtimeStatusSchema = z.enum(["starting", "ready", "unavailable", "stopping"]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
const objectSchema = z.strictObject({
  id, kind: z.enum(["agent", "note"]), title: z.string(),
  content: z.string().nullable(), content_available: z.boolean(),
});
export type WorkbenchObject = z.infer<typeof objectSchema>;
const viewSchema = z.strictObject({
  object_id: id, position: pointSchema, hidden: z.boolean(), collapsed: z.boolean(),
});
export type ObjectView = z.infer<typeof viewSchema>;
const taskSchema = z.strictObject({ id, branch_id: id, title: z.string(), created_at: z.string() });
export const snapshotSchema = z.strictObject({
  workspace: z.strictObject({ id, title: z.string() }),
  tasks: z.array(taskSchema),
  execution: z.strictObject({ available: z.literal(false), reason: z.literal("execution_not_connected") }),
  task: z.strictObject({
    ...taskSchema.shape,
    head_seq: z.number().int(),
    at_seq: z.number().int(),
    historical: z.boolean(),
    objects: z.array(objectSchema),
    views: z.array(viewSchema),
    viewport: viewportSchema,
    bindings: z.array(z.strictObject({ agent_id: id, resource_id: id, pending: z.enum(["attach", "detach"]).nullable() })),
    history: z.array(z.strictObject({ seq: z.number().int(), event_id: id, type: z.string(), recorded_at: z.string(), label: z.string() })),
  }).nullable(),
});
export type AppSnapshot = z.infer<typeof snapshotSchema>;
export type TaskSnapshot = NonNullable<AppSnapshot["task"]>;
export const errorSchema = z.strictObject({
  code: z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]),
  message: z.string(),
});
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
  configuration: ConfigurationBridge;
  readonly platform: DesktopPlatform;
  execute(command: Command): Promise<CommandResult>;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}
