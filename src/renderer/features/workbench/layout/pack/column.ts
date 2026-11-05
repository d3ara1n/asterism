import type { Point } from "../../../../../shared/workbench";
import type { SizedItem } from "../model";

/**
 * Column packer: all items stacked vertically in a single column, widest-first
 * for visual stability.  Positions are item centers (not top-left corners).
 */
export function columnPack(items: readonly SizedItem[], gap: { x: number; y: number }): Map<string, Point> {
  if (!items.length) return new Map();
  const sorted = [...items].sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  const positions = new Map<string, Point>();
  let y = 0;
  for (const item of sorted) {
    positions.set(item.id, { x: 0, y: y + item.height / 2 });
    y += item.height + gap.y;
  }
  return positions;
}
