import { describe, expect, it } from "vitest";
import { readingPosition } from "./navigation";

const inset = 40;

describe("Conversation reading position", () => {
  it("Switches chapters when an input reaches the reading line, not the viewport top", () => {
    const starts = [0, 1000, 3000];
    expect(readingPosition(starts, 959, 9000, inset).chapter).toBe(0);
    expect(readingPosition(starts, 960, 9000, inset).chapter).toBe(1);
    expect(readingPosition(starts, 2959, 9000, inset).chapter).toBe(1);
    expect(readingPosition(starts, 2960, 9000, inset).chapter).toBe(2);
  });

  it("Treats an input landed by navigation as visible and any further scroll as past", () => {
    const starts = [0, 1000];
    expect(readingPosition(starts, 960, 9000, inset).past).toBe(false);
    expect(readingPosition(starts, 961, 9000, inset).past).toBe(true);
  });

  it("Keeps content above the first input in the first chapter without marking it past", () => {
    expect(readingPosition([500, 1500], 0, 9000, inset)).toEqual({ chapter: 0, progress: 0, past: false });
  });

  it("Measures progress between consecutive navigation targets", () => {
    const starts = [0, 1000, 3000];
    expect(readingPosition(starts, 960, 9000, inset).progress).toBe(0);
    expect(readingPosition(starts, 1460, 9000, inset).progress).toBe(0.25);
    expect(readingPosition(starts, 4960, 6960, inset).progress).toBe(0.5);
  });

  it("Assigns the final scroll position to the last chapter even when its input is below the reading line", () => {
    expect(readingPosition([0, 1000, 1200], 900, 900, inset)).toEqual({ chapter: 2, progress: 1, past: false });
  });

  it("Lets progress recede when the chapter grows without moving the reader", () => {
    expect(readingPosition([0], 460, 960, inset).progress).toBe(0.5);
    expect(readingPosition([0], 460, 1960, inset).progress).toBe(0.25);
  });
});
