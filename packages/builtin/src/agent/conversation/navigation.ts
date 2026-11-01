export interface ReadingPosition {
  /** Index into the chapter starts; 0 when the reading line is above the first input. */
  chapter: number;
  /** Position between this chapter's navigation target and the next one's, from 0 to 1. */
  progress: number;
  /** The chapter's input has scrolled above the reading line. */
  past: boolean;
}

/**
 * Locates the reader by input chapters. `starts` are ascending content offsets of input items, `offset` is the scroll position,
 * `end` is the last reachable scroll position, and `inset` places the reading line below the viewport top where navigation lands inputs.
 * The final scroll position always belongs to the last chapter, even when its input is below the reading line.
 */
export function readingPosition(starts: readonly number[], offset: number, end: number, inset: number): ReadingPosition {
  const line = offset + inset;
  const atEnd = offset >= end - 1;
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle]! <= line) low = middle + 1;
    else high = middle;
  }
  const chapter = atEnd ? starts.length - 1 : Math.max(0, low - 1);
  const start = starts[chapter]! - inset;
  const next = starts[chapter + 1];
  const finish = next === undefined ? end : next - inset;
  const progress = atEnd ? 1 : finish <= start ? (offset >= finish ? 1 : 0) : Math.max(0, Math.min(1, (offset - start) / (finish - start)));
  return { chapter, progress, past: starts[chapter]! < line };
}
