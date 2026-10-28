import { z } from "zod";
import { presentationSchema, resourceTitleSchema } from "@asterism-app/sdk/contracts";

const id = z.string().min(1).max(160);
const sessionId = z.string().uuid();
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const pointSchema = z.strictObject({ x: coordinate, y: coordinate });
export const maximumCardDimension = 100_000;
export const cardSizeSchema = z.strictObject({
  width: z.number().finite().min(1).max(maximumCardDimension),
  height: z.number().finite().min(1).max(maximumCardDimension),
});
/** Storage permits full-map overviews of distant objects; canvases tighten interaction minima based on visible object bounds. */
export const minimumViewportZoom = 0.00001;
export const maximumViewportZoom = 4;
export const viewportSchema = z.strictObject({ x: coordinate, y: coordinate, zoom: z.number().min(minimumViewportZoom).max(maximumViewportZoom) });
export type Point = z.infer<typeof pointSchema>;
export type CardSize = z.infer<typeof cardSizeSchema>;
export type Viewport = z.infer<typeof viewportSchema>;
/** Fixed focus island width in pixels; null shares the screen with the main view. Fixed widths may exceed the window, which scrolls the screen strip. */
export const minimumFocusWidth = 480;
export const focusWidthSchema = z.number().finite().min(minimumFocusWidth).max(maximumCardDimension);

/** Resource changes and layout belong to specified sessions; operations always target execution cursors. */
export const workbenchCommands = [
  z.strictObject({ type: z.literal("object.remove"), sessionId, objectId: id }),
  z.strictObject({ type: z.literal("object.rename"), sessionId, objectId: id, title: resourceTitleSchema }),
  z.strictObject({ type: z.literal("link.set"), sessionId, receiverId: id, resourceId: id, linked: z.boolean() }),
  z.strictObject({ type: z.literal("view.set"), sessionId, objectId: id, position: pointSchema.optional(),
    hidden: z.boolean().optional(), collapsed: z.boolean().optional(), size: cardSizeSchema.nullable().optional() }),
  z.strictObject({ type: z.literal("views.position"), sessionId,
    positions: z.array(z.strictObject({ objectId: id, position: pointSchema })) }),
  z.strictObject({ type: z.literal("viewport.set"), sessionId, viewport: viewportSchema }),
  /** Omitted fields keep their saved values; a null objectId ends focus while keeping the width, and a null width restores the shared default. */
  z.strictObject({ type: z.literal("focus.set"), sessionId, objectId: id.nullable().optional(), width: focusWidthSchema.nullable().optional() }),
] as const;
export const workbenchCommandSchema = z.discriminatedUnion("type", workbenchCommands);
export type WorkbenchCommand = z.infer<typeof workbenchCommandSchema>;
export function isLayoutCommand(command: { type: string }): boolean {
  return command.type === "view.set" || command.type === "views.position" || command.type === "viewport.set" || command.type === "focus.set";
}
const objectSchema = z.strictObject({
  id, kind: z.string().min(1).max(160), title: z.string(), presentation: presentationSchema,
  /** Current link capability projected from the registered backend implementation. */
  receivesLinks: z.boolean(),
});
export type WorkbenchObject = z.infer<typeof objectSchema>;
const viewSchema = z.strictObject({ objectId: id, position: pointSchema, hidden: z.boolean(),
  collapsed: z.boolean(), size: cardSizeSchema.nullable().default(null) });
export type ObjectView = z.infer<typeof viewSchema>;
/** Session focus: the object shown in the focus island, or null, and the island's fixed width, or null for the shared default. */
const focusSchema = z.strictObject({ objectId: id.nullable(), width: focusWidthSchema.nullable() });
export type WorkbenchLayout = Pick<WorkbenchSnapshot, "views" | "viewport" | "focus">;
export const workbenchSnapshotSchema = z.strictObject({
  id: sessionId, title: z.string(), objects: z.array(objectSchema), views: z.array(viewSchema), viewport: viewportSchema, focus: focusSchema,
  /** Both directed-link endpoints are resources: resourceId points to receiverId, which receives access eligibility. */
  links: z.array(z.strictObject({ receiverId: id, resourceId: id })),
});
export type WorkbenchSnapshot = z.infer<typeof workbenchSnapshotSchema>;
