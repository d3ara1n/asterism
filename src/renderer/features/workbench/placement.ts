import type { Point, WorkbenchSnapshot } from "../../../shared/workbench";
import { fallbackCardWidth, fallbackCardHeight, placementGap } from "./layout";

export type ResourcePlacement = { sessionId: string; position: Point };
type PlacementNode = {
  id: string; position: Point; width?: number; height?: number;
  measured?: { width?: number; height?: number };
};

/**
 * 仅为新卡片寻找附近空位，不重排用户已有的位置。
 * 以视口中心为起点，遇到已有卡片时移到它的右侧；使用画布测量后的真实边界。
 */
export function placeObject(session: WorkbenchSnapshot, width: number, height: number, nodes: readonly PlacementNode[]): Point {
  const point = {
    x: (width / 2 - session.viewport.x) / session.viewport.zoom - fallbackCardWidth / 2,
    y: (height / 2 - session.viewport.y) / session.viewport.zoom - fallbackCardHeight / 2,
  };
  const occupied = nodes.map(node => ({
    ...node.position,
    width: node.measured?.width ?? node.width ?? fallbackCardWidth,
    height: node.measured?.height ?? node.height ?? fallbackCardHeight,
  }));
  for (let attempt = 0; attempt <= occupied.length; attempt++) {
    const collisions = occupied.filter(bounds =>
      point.x < bounds.x + bounds.width + placementGap.x
      && point.x + fallbackCardWidth + placementGap.x > bounds.x
      && point.y < bounds.y + bounds.height + placementGap.y
      && point.y + fallbackCardHeight + placementGap.y > bounds.y);
    if (!collisions.length) return point;
    point.x = Math.max(...collisions.map(bounds => bounds.x + bounds.width + placementGap.x));
  }
  return point;
}
