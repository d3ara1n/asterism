import type { ElkNode } from "elkjs/lib/elk-api";
import type { CardSize, Point, WorkbenchSnapshot } from "../../../shared/workbench";
import { placementGap } from "./layout";

export type LayoutObject = CardSize & { id: string; position: Point };

function center(objects: readonly LayoutObject[]): Point {
  const left = Math.min(...objects.map(object => object.position.x));
  const top = Math.min(...objects.map(object => object.position.y));
  const right = Math.max(...objects.map(object => object.position.x + object.width));
  const bottom = Math.max(...objects.map(object => object.position.y + object.height));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/** 显式整理可见对象；使用完整矩形与真实有向链接，结果保持原图中心。 */
export async function arrangeObjects(
  objects: readonly LayoutObject[], links: WorkbenchSnapshot["links"], signal?: AbortSignal,
): Promise<{ objectId: string; position: Point }[]> {
  if (!objects.length) return [];
  signal?.throwIfAborted();
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  signal?.throwIfAborted();
  const elk = new ELK();
  const ids = new Set(objects.map(object => object.id));
  const graph: ElkNode = {
    id: "workbench",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(placementGap.y),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(placementGap.x),
      "elk.spacing.componentComponent": String(Math.max(placementGap.x, placementGap.y)),
      "elk.separateConnectedComponents": "true",
      "elk.randomSeed": "1",
    },
    children: objects.map(({ id, width, height }) => ({ id, width, height })),
    edges: links.filter(link => ids.has(link.resourceId) && ids.has(link.receiverId))
      .map((link, index) => ({ id: `link-${index}`, sources: [link.resourceId], targets: [link.receiverId] })),
  };
  const result = await elk.layout(graph);
  signal?.throwIfAborted();
  const children = result.children ?? [];
  if (children.length !== objects.length || children.some(node => !Number.isFinite(node.x) || !Number.isFinite(node.y)))
    throw new Error("Layout did not return a position for every object.");
  const byId = new Map(children.map(node => [node.id, node]));
  const arranged = objects.map(object => ({
    ...object, position: { x: byId.get(object.id)!.x!, y: byId.get(object.id)!.y! },
  }));
  // ELK 根容器包含路由空间；工作台只采用节点位置，两侧均按卡片矩形计算中心。
  const before = center(objects), after = center(arranged);
  return arranged.map(object => ({ objectId: object.id,
    position: { x: object.position.x + before.x - after.x, y: object.position.y + before.y - after.y } }));
}
