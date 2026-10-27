import type { CardSize, Point } from "./workbench.ts";
import { fallbackCardWidth, fallbackCardHeight, placementGap } from "./workbench-layout.ts";

type PlacementNode = {
  id: string; position: Point; width?: number; height?: number;
  measured?: { width?: number; height?: number };
};

/**
 * Keep existing cards fixed and find the nearest free position to the specified center for new cards only.
 * Convert collisions into forbidden rectangles for the new card's top-left corner; nearest feasible points lie at center projections or rectangle boundary intersections.
 */
export function placeObject(center: Point, size: CardSize, nodes: readonly PlacementNode[]): Point {
  const origin = { x: center.x - size.width / 2, y: center.y - size.height / 2 };
  const occupied = nodes.map(node => ({
    left: node.position.x - size.width - placementGap.x,
    right: node.position.x + (node.measured?.width ?? node.width ?? fallbackCardWidth) + placementGap.x,
    top: node.position.y - size.height - placementGap.y,
    bottom: node.position.y + (node.measured?.height ?? node.height ?? fallbackCardHeight) + placementGap.y,
  }));
  const xs = [...new Set([origin.x, ...occupied.flatMap(box => [box.left, box.right])])]
    .sort((a, b) => Math.abs(a - origin.x) - Math.abs(b - origin.x) || a - b);
  const ys = [...new Set([origin.y, ...occupied.flatMap(box => [box.top, box.bottom])])]
    .sort((a, b) => Math.abs(a - origin.y) - Math.abs(b - origin.y) || a - b);
  let best = origin, distance = Infinity;
  for (const x of xs) {
    const dx = (x - origin.x) ** 2;
    if (dx > distance) break;
    for (const y of ys) {
      const candidateDistance = dx + (y - origin.y) ** 2;
      if (candidateDistance >= distance) break;
      if (occupied.some(box => x > box.left && x < box.right && y > box.top && y < box.bottom)) continue;
      best = { x, y }; distance = candidateDistance;
      // Later points in the same column are farther from the center.
      break;
    }
  }
  return best;
}
