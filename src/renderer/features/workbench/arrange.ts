import type { Point } from "../../../shared/workbench";
import type { WorkbenchSnapshot } from "../../../shared/workbench";
import { runLayout } from "./layout";
import type { LayoutStrategy, LayoutObject } from "./layout";

export type { LayoutObject };
export { orbitOrbit, orbitBox, boxBox, orbitGrid, columnColumn } from "./layout";

/** Arrange visible objects using the supplied strategy; preserve the original graph center. */
export async function arrangeObjects(
  objects: readonly LayoutObject[],
  links: WorkbenchSnapshot["links"],
  signal?: AbortSignal,
  strategy?: LayoutStrategy,
): Promise<{ objectId: string; position: Point }[]> {
  if (!objects.length) return [];
  signal?.throwIfAborted();
  const { orbitOrbit: defaultStrategy } = await import("./layout");
  signal?.throwIfAborted();
  const positions = runLayout(objects, links, strategy ?? defaultStrategy);
  return objects.map(o => ({ objectId: o.id, position: positions.get(o.id)! }));
}
