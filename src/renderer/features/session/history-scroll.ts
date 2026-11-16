/** Nearest reveal compares item and viewport edges in the same scroll-coordinate space. */
export function nearestHistoryAlignment(itemTop: number, itemHeight: number, scrollTop: number, viewportHeight: number): "start" | "end" | null {
  if (itemTop < scrollTop) return "start";
  if (itemTop + itemHeight > scrollTop + viewportHeight) return "end";
  return null;
}
