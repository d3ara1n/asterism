import type { Point } from "../../../../shared/workbench";

/** A sized, weighted item fed to any packer. For a single card, area = width × height.
 *  For a laid-out group, width/height is the bounding box and area is the sum of member areas. */
export type SizedItem = { id: string; width: number; height: number; area: number };

/** Axis-aligned bounding box expressed as half-extents from the origin. */
export type Box = { halfW: number; halfH: number };

/** Translate a set of center-relative positions so the bounding box is origin-centered. */
export function centerPositions(positions: Map<string, Point>, items: readonly SizedItem[]): Map<string, Point> {
  if (!positions.size) return positions;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    const p = positions.get(item.id);
    if (!p) continue;
    minX = Math.min(minX, p.x - item.width / 2);
    minY = Math.min(minY, p.y - item.height / 2);
    maxX = Math.max(maxX, p.x + item.width / 2);
    maxY = Math.max(maxY, p.y + item.height / 2);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const result = new Map<string, Point>();
  for (const [id, p] of positions) result.set(id, { x: p.x - cx, y: p.y - cy });
  return result;
}

/** Bounding box of a positioned item set (all centers offset from their local origin). */
export function boundingBox(positions: Map<string, Point>, items: readonly SizedItem[]): Box {
  if (!positions.size) return { halfW: 0, halfH: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    const p = positions.get(item.id);
    if (!p) continue;
    minX = Math.min(minX, p.x - item.width / 2);
    minY = Math.min(minY, p.y - item.height / 2);
    maxX = Math.max(maxX, p.x + item.width / 2);
    maxY = Math.max(maxY, p.y + item.height / 2);
  }
  return { halfW: (maxX - minX) / 2, halfH: (maxY - minY) / 2 };
}

/** True when two AABB rects (given by center + half-sizes) overlap, including the gap. */
export function overlaps(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  gap: number,
): boolean {
  return Math.abs(ax - bx) < (aw + bw) / 2 + gap
    && Math.abs(ay - by) < (ah + bh) / 2 + gap;
}
