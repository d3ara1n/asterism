import { z } from "zod";
import { presentationSchema } from "./presentation.ts";

const id = z.string().min(1).max(160);
const sessionId = z.string().uuid();
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const pointSchema = z.strictObject({ x: coordinate, y: coordinate });
export const viewportSchema = z.strictObject({ x: coordinate, y: coordinate, zoom: z.number().min(0.1).max(4) });
export type Point = z.infer<typeof pointSchema>;
export type Viewport = z.infer<typeof viewportSchema>;

/** 资源变更与布局属于指定会话；命令不携带用户的查看位置。 */
export const workbenchCommands = [
  z.strictObject({ type: z.literal("object.remove"), sessionId, objectId: id }),
  z.strictObject({ type: z.literal("link.set"), sessionId, agentId: id, resourceId: id, linked: z.boolean() }),
  z.strictObject({ type: z.literal("view.set"), sessionId, objectId: id, position: pointSchema.optional(), hidden: z.boolean().optional(), collapsed: z.boolean().optional() }),
  z.strictObject({ type: z.literal("viewport.set"), sessionId, viewport: viewportSchema }),
] as const;
export const workbenchCommandSchema = z.discriminatedUnion("type", workbenchCommands);
export type WorkbenchCommand = z.infer<typeof workbenchCommandSchema>;
export function isLayoutCommand(command: { type: string }): boolean {
  return command.type === "view.set" || command.type === "viewport.set";
}
const objectSchema = z.strictObject({ id, kind: z.string().min(1).max(160), title: z.string(), presentation: presentationSchema });
export type WorkbenchObject = z.infer<typeof objectSchema>;
const viewSchema = z.strictObject({ objectId: id, position: pointSchema, hidden: z.boolean(), collapsed: z.boolean() });
export type ObjectView = z.infer<typeof viewSchema>;
export const workbenchSnapshotSchema = z.strictObject({
  id: sessionId, title: z.string(), objects: z.array(objectSchema), views: z.array(viewSchema), viewport: viewportSchema,
  links: z.array(z.strictObject({ agentId: id, resourceId: id })),
});
export type WorkbenchSnapshot = z.infer<typeof workbenchSnapshotSchema>;
