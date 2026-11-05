import type { Point } from "../../../../../shared/workbench";
import type { SizedItem } from "../model";
import { overlaps } from "../model";

/**
 * Orbit packer: the largest item (by area) sits at the origin; all others
 * are placed in concentric rings in area-descending order.  Each candidate
 * position is tested on a ring of radius R starting at angle 0 (east) and
 * stepping clockwise; R grows until a clear slot is found.
 *
 * This is a deterministic greedy search — no relaxation, no randomness.
 */
export function orbitPack(items: readonly SizedItem[], gap: { x: number; y: number }): Map<string, Point> {
  if (!items.length) return new Map();

  // Sort: area descending, then id ascending for determinism.
  const sorted = [...items].sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  const g = Math.max(gap.x, gap.y);

  const placed = new Map<string, Point>();
  const center = sorted[0]!;
  placed.set(center.id, { x: 0, y: 0 });

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    const pos = findSlot(item, [...sorted.slice(0, i).map(s => ({ item: s, pos: placed.get(s.id)! }))], g);
    placed.set(item.id, pos);
  }
  return placed;
}

function findSlot(
  item: SizedItem,
  placed: Array<{ item: SizedItem; pos: Point }>,
  gap: number,
): Point {
  // Minimum radius from origin: half the diagonal of the item plus gap.
  const minR = Math.hypot(item.width, item.height) / 2 + gap;

  // Try rings at increasing radii.
  for (let ring = 0; ring < 64; ring++) {
    const R = minR + ring * (Math.max(item.width, item.height) / 2 + gap);
    // Angular step: arc length ≈ item perimeter / 4, so we get good coverage.
    const arcStep = Math.max(item.width, item.height) / 2 + gap;
    const angleStep = arcStep / R;  // radians
    const steps = Math.max(8, Math.ceil((2 * Math.PI) / angleStep));

    for (let s = 0; s < steps; s++) {
      const theta = (s / steps) * 2 * Math.PI;
      const cx = R * Math.cos(theta);
      const cy = R * Math.sin(theta);

      let clear = true;
      for (const { item: other, pos } of placed) {
        if (overlaps(cx, cy, item.width, item.height, pos.x, pos.y, other.width, other.height, gap)) {
          clear = false;
          break;
        }
      }
      if (clear) return { x: cx, y: cy };
    }
  }
  // Fallback: stack below everything.
  const bottom = placed.reduce((m, { item: o, pos }) => Math.max(m, pos.y + o.height / 2), 0);
  return { x: 0, y: bottom + gap + item.height / 2 };
}
