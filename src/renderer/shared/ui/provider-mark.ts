/** The first user-perceived character of a name, so a monogram never splits a surrogate pair or combining sequence. */
export function markMonogram(name: string): string {
  const first = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name.trim())[Symbol.iterator]().next();
  return first.done ? "?" : first.value.segment.toLocaleUpperCase();
}
