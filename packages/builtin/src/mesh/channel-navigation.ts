/** Radio navigation addresses the full collection, including currently unmounted virtual rows. */
export function channelNavigationIndex(count: number, current: number, key: string): number | null {
  if (!count || current < 0) return null;
  if (key === "Home" || key === "PageUp") return 0;
  if (key === "End" || key === "PageDown") return count - 1;
  if (key === "ArrowDown" || key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowUp" || key === "ArrowLeft") return (current + count - 1) % count;
  return null;
}
