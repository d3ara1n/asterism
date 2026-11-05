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
/** Fixed island width in pixels chosen through the island menu; fixed widths may exceed the window, which scrolls the screen strip. */
export const minimumIslandWidth = 240;
const islandSizeSchema = z.number().finite().min(minimumIslandWidth).max(maximumCardDimension);
const islandId = z.string().min(1).max(4096);
/** Restorable island content: an object's own view, or a location opened through its resource. */
export const islandViewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("object"), objectId: id }),
  z.strictObject({ kind: z.literal("resource"), resourceId: id, location: z.string().max(4096) }),
]);
export type IslandView = z.infer<typeof islandViewSchema>;
/** One ordinary island, left to right: owner is the island that opened it, or the root identity; size null keeps the declared width. */
export const sessionIslandSchema = z.strictObject({ id: islandId, owner: islandId.nullable(), size: islandSizeSchema.nullable(), view: islandViewSchema });
export type SessionIsland = z.infer<typeof sessionIslandSchema>;
export const sessionIslandsSchema = z.array(sessionIslandSchema).max(256);

/**
 * Islands whose content still exists: drop islands naming objects outside live, then islands owned by dropped ones, transitively.
 * Owners that are not persisted islands (the root) do not invalidate an island.
 */
export function liveIslands(islands: readonly SessionIsland[], live: ReadonlySet<string>): SessionIsland[] {
  const target = (view: IslandView) => view.kind === "object" ? view.objectId : view.resourceId;
  let kept = islands.filter(island => live.has(target(island.view)));
  const dropped = new Set(islands.filter(island => !kept.includes(island)).map(island => island.id));
  for (let changed = dropped.size > 0; changed;) {
    const next = kept.filter(island => island.owner === null || !dropped.has(island.owner));
    changed = next.length !== kept.length;
    for (const island of kept) if (!next.includes(island)) dropped.add(island.id);
    kept = next;
  }
  return kept;
}

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
  /** Replaces the session's restorable island arrangement. */
  z.strictObject({ type: z.literal("islands.set"), sessionId, islands: sessionIslandsSchema }),
] as const;
export const workbenchCommandSchema = z.discriminatedUnion("type", workbenchCommands);
export type WorkbenchCommand = z.infer<typeof workbenchCommandSchema>;
export function isLayoutCommand(command: { type: string }): boolean {
  return command.type === "view.set" || command.type === "views.position" || command.type === "viewport.set" || command.type === "islands.set";
}
const objectSchema = z.strictObject({
  id, kind: z.string().min(1).max(160), title: z.string(), presentation: presentationSchema,
  /** Current link capability projected from the registered backend implementation. */
  receivesLinks: z.boolean(),
  /** Removed from current history; the previous instance is finishing captured work or cleanup. */
  retiring: z.boolean().optional(),
});
export type WorkbenchObject = z.infer<typeof objectSchema>;
const viewSchema = z.strictObject({ objectId: id, position: pointSchema, hidden: z.boolean(),
  collapsed: z.boolean(), size: cardSizeSchema.nullable().default(null) });
export type ObjectView = z.infer<typeof viewSchema>;
export type WorkbenchLayout = Pick<WorkbenchSnapshot, "views" | "viewport" | "islands">;
export const workbenchSnapshotSchema = z.strictObject({
  id: sessionId, title: z.string(), objects: z.array(objectSchema), views: z.array(viewSchema), viewport: viewportSchema,
  /** Restorable ordinary islands whose content is present in the current projection. */
  islands: sessionIslandsSchema,
  /** Both directed-link endpoints are resources: resourceId points to receiverId, which receives access eligibility. */
  links: z.array(z.strictObject({ receiverId: id, resourceId: id })),
  /** Disconnected relationships still held by requests; display only, never a grant of access. */
  pendingLinks: z.array(z.strictObject({ receiverId: id, resourceId: id, holds: z.number().int().positive() })).optional(),
});
export type WorkbenchSnapshot = z.infer<typeof workbenchSnapshotSchema>;
