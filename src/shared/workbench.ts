import { z } from "zod";
import { presentationSchema } from "@atelier/sdk/contracts";

const id = z.string().min(1).max(160);
const sessionId = z.string().uuid();
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const pointSchema = z.strictObject({ x: coordinate, y: coordinate });
export const maximumCardDimension = 100_000;
export const cardSizeSchema = z.strictObject({
  width: z.number().finite().min(1).max(maximumCardDimension),
  height: z.number().finite().min(1).max(maximumCardDimension),
});
/** 存储允许远距离对象的全图概览；交互下限由画布按可见对象范围收紧。 */
export const minimumViewportZoom = 0.00001;
export const maximumViewportZoom = 4;
export const viewportSchema = z.strictObject({ x: coordinate, y: coordinate, zoom: z.number().min(minimumViewportZoom).max(maximumViewportZoom) });
export type Point = z.infer<typeof pointSchema>;
export type CardSize = z.infer<typeof cardSizeSchema>;
export type Viewport = z.infer<typeof viewportSchema>;

/** 资源变更与布局属于指定会话；操作始终针对执行游标。 */
export const workbenchCommands = [
  z.strictObject({ type: z.literal("object.remove"), sessionId, objectId: id }),
  z.strictObject({ type: z.literal("link.set"), sessionId, agentId: id, resourceId: id, linked: z.boolean() }),
  z.strictObject({ type: z.literal("view.set"), sessionId, objectId: id, position: pointSchema.optional(),
    hidden: z.boolean().optional(), collapsed: z.boolean().optional(), size: cardSizeSchema.nullable().optional() }),
  z.strictObject({ type: z.literal("viewport.set"), sessionId, viewport: viewportSchema }),
] as const;
export const workbenchCommandSchema = z.discriminatedUnion("type", workbenchCommands);
export type WorkbenchCommand = z.infer<typeof workbenchCommandSchema>;
export function isLayoutCommand(command: { type: string }): boolean {
  return command.type === "view.set" || command.type === "viewport.set";
}
const objectSchema = z.strictObject({ id, kind: z.string().min(1).max(160), title: z.string(), presentation: presentationSchema });
export type WorkbenchObject = z.infer<typeof objectSchema>;
const viewSchema = z.strictObject({ objectId: id, position: pointSchema, hidden: z.boolean(),
  collapsed: z.boolean(), size: cardSizeSchema.nullable().default(null) });
export type ObjectView = z.infer<typeof viewSchema>;
export const workbenchSnapshotSchema = z.strictObject({
  id: sessionId, title: z.string(), objects: z.array(objectSchema), views: z.array(viewSchema), viewport: viewportSchema,
  links: z.array(z.strictObject({ agentId: id, resourceId: id })),
});
export type WorkbenchSnapshot = z.infer<typeof workbenchSnapshotSchema>;
