import type { Point } from "../../../../../shared/workbench";
import type { SizedItem } from "../model";
import { overlaps } from "../model";

/**
 * Box packer: items placed area-descending into the tightest available slot.
 * Uses a shelf algorithm — tracks free shelf y-positions and places each item
 * at the leftmost x on the lowest shelf that fits, opening a new shelf when needed.
 * The result is a compact, left-to-right, top-to-bottom rectangle.
 * Origin is top-left corner (0, 0); caller recenters if needed.
 */
export function boxPack(items: readonly SizedItem[], gap: { x: number; y: number }): Map<string, Point> {
  if (!items.length) return new Map();

  const sorted = [...items].sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  const gx = gap.x, gy = gap.y;

  // Estimate canvas width from the square root of total area (generous).
  const totalArea = sorted.reduce((s, i) => s + (i.width + gx) * (i.height + gy), 0);
  const canvasW = Math.max(...sorted.map(i => i.width), Math.sqrt(totalArea) * 1.2);

  const placed: Array<{ item: SizedItem; pos: Point }> = [];
  // Shelves: each shelf is a { y, usedW, h } record.
  const shelves: Array<{ y: number; usedW: number; h: number }> = [{ y: 0, usedW: 0, h: 0 }];

  for (const item of sorted) {
    let bestShelf = -1, bestX = 0, bestY = 0;

    for (let si = 0; si < shelves.length; si++) {
      const shelf = shelves[si]!;
      const x = shelf.usedW + (shelf.usedW > 0 ? gx : 0);
      const y = shelf.y;
      if (x + item.width > canvasW) continue;  // doesn't fit horizontally

      // Check against all already-placed items.
      let clear = true;
      for (const { item: other, pos } of placed) {
        if (overlaps(
          x + item.width / 2, y + item.height / 2, item.width, item.height,
          pos.x + other.width / 2, pos.y + other.height / 2, other.width, other.height,
          Math.min(gx, gy),
        )) { clear = false; break; }
      }
      if (!clear) continue;

      // Prefer lower y; among equal y prefer leftmost x.
      if (bestShelf === -1 || y < bestY || (y === bestY && x < bestX)) {
        bestShelf = si; bestX = x; bestY = y;
      }
    }

    if (bestShelf === -1) {
      // Open a new shelf below all existing content.
      const newY = shelves.reduce((m, s) => Math.max(m, s.y + s.h), 0) + gy;
      shelves.push({ y: newY, usedW: 0, h: 0 });
      bestShelf = shelves.length - 1;
      bestX = 0; bestY = newY;
    }

    const shelf = shelves[bestShelf]!;
    placed.push({ item, pos: { x: bestX, y: bestY } });
    shelf.usedW = bestX + item.width;
    shelf.h = Math.max(shelf.h, item.height + gy);
  }

  return new Map(placed.map(({ item, pos }) => [item.id, pos]));
}
