import type { Point } from "../../../../../shared/workbench";
import type { SizedItem } from "../model";

/**
 * Grid packer: items placed into a grid with a column count derived from the
 * item count (ceil sqrt).  Items are area-sorted descending so the largest
 * item count (ceil sqrt).  Items are area-sorted descending so the largest
 * land in the top-left.  Positions are item centers (not top-left corners).
 */
export function gridPack(items: readonly SizedItem[], gap: { x: number; y: number }): Map<string, Point> {
  if (!items.length) return new Map();
  const sorted = [...items].sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  const cols = Math.ceil(Math.sqrt(sorted.length));
  const positions = new Map<string, Point>();

  // Column width = max width in that column.
  const colWidths = new Array(cols).fill(0);
  for (let i = 0; i < sorted.length; i++) {
    const col = i % cols;
    colWidths[col] = Math.max(colWidths[col], sorted[i]!.width);
  }
  // Prefix sums for x offsets.
  const colX = new Array(cols).fill(0);
  for (let c = 1; c < cols; c++) colX[c] = colX[c - 1] + colWidths[c - 1] + gap.x;

  // Row heights tracked dynamically.
  const rowHeights: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const row = Math.floor(i / cols);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, sorted[i]!.height);
  }
  const rowY = new Array(rowHeights.length).fill(0);
  for (let r = 1; r < rowHeights.length; r++) rowY[r] = rowY[r - 1] + rowHeights[r - 1] + gap.y;

  for (let i = 0; i < sorted.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    positions.set(sorted[i]!.id, { x: colX[col]! + sorted[i]!.width / 2, y: rowY[row]! + sorted[i]!.height / 2 });
  }
  return positions;
}
