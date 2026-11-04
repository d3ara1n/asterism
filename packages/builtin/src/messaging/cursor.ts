import { MessagingError } from "@asterism-app/sdk/runtime";

export interface SequenceShift { sequence: number; total: number }
/** Shift an old position by the number of inserted observations preceding it. */
export function translateSequence(sequence: number, shifts: readonly SequenceShift[], includeBoundary = true): number {
  let low = 0, high = shifts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2), value = shifts[middle]!.sequence;
    if (value < sequence || includeBoundary && value === sequence) low = middle + 1;
    else high = middle;
  }
  return sequence + (shifts[low - 1]?.total ?? 0);
}
export function encodeObservedCursor(scope: string, sequence: number): string {
  return Buffer.from(JSON.stringify([scope, sequence])).toString("base64url");
}
export function decodeObservedCursor(cursor: string | undefined, scope: string, latest: number,
  translate?: (source: string, sequence: number) => number | undefined): number | null {
  if (cursor === undefined) return null;
  let value: unknown;
  try { value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); }
  catch { /* Invalid opaque cursors are reported at the provider boundary. */ }
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isSafeInteger(value[1]) && value[1] >= 0) {
    const sequence = value[0] === scope ? value[1] as number : translate?.(value[0], value[1]);
    if (sequence !== undefined && Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= latest) return sequence;
  }
  throw new MessagingError("invalid_cursor", "The cursor does not belong to this query or its stored history.");
}
