/** Fits a prefix of whole items, reserving the trailing ellipsis only when needed. */
export function fitSummaryItems(widths: readonly number[], available: number, gap: number, ellipsis: number): number {
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  if (total <= available) return widths.length;
  let used = 0, visible = 0;
  for (const width of widths) {
    const next = used + (visible ? gap : 0) + width;
    if (next + gap + ellipsis > available) break;
    used = next;
    visible++;
  }
  return visible;
}
