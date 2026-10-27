import { describe, expect, it } from "vitest";
import { RawBuffer } from "./raw-buffer.ts";

describe("terminal raw-output ranges", () => {
  // read's nextOffset must continue from the text actually returned; pagination boundaries must not swallow surrogate pairs.
  it("returns an emoji spanning chunks intact at a page boundary and continues the remaining content on the next page", () => {
    const buffer = new RawBuffer();
    buffer.push("A\ud83d");
    buffer.push("\ude00B");
    const first = buffer.read(0, 2);
    expect(first).toEqual({ text: "A😀", offset: 0, nextOffset: 3, truncated: true });
    expect(buffer.read(first.nextOffset, 2)).toEqual({ text: "B", offset: 3, nextOffset: 4, truncated: false });
  });

  // Even a UTF-16 limit=1 must read a complete non-BMP character to avoid stalling pagination.
  it("reads a complete emoji and advances the offset even with a single-unit budget", () => {
    const buffer = new RawBuffer();
    buffer.push("😀B");
    const first = buffer.read(0, 1);
    expect(first).toEqual({ text: "😀", offset: 0, nextOffset: 2, truncated: true });
    expect(buffer.read(first.nextOffset, 1).text).toBe("B");
  });

  // Both explicit offsets and default tail reads may start at a low surrogate; the returned offset must reflect alignment back to the character start.
  it("returns the complete character and its actual start when reading begins inside it", () => {
    const buffer = new RawBuffer();
    buffer.push("A😀");
    expect(buffer.read(2, 1)).toEqual({ text: "😀", offset: 1, nextOffset: 3, truncated: false });
    expect(buffer.read(undefined, 1)).toEqual({ text: "😀", offset: 1, nextOffset: 3, truncated: false });
  });

  // The budget counts characters rather than whole chunks; evicting only whole chunks would retain an extra chunk.
  it("clips the oldest chunk's prefix when the limit is exceeded across chunks, keeping offsets based on cumulative input", () => {
    const buffer = new RawBuffer(8);
    buffer.push("abcdef");
    buffer.push("ghijkl");
    expect(buffer.read(0)).toEqual({ text: "efghijkl", offset: 4, nextOffset: 12, truncated: true });
    expect(buffer.read()).toEqual({ text: "efghijkl", offset: 4, nextOffset: 12, truncated: false });
  });

  // When a single chunk exceeds the entire budget, retain only its tail and release the previous buffer.
  it("a single large chunk also respects the retention limit", () => {
    const buffer = new RawBuffer(4);
    buffer.push("old");
    buffer.push("123456");
    expect(buffer.read(0)).toEqual({ text: "3456", offset: 5, nextOffset: 9, truncated: true });
  });

  // An isolated low surrogate after eviction belongs to an already discarded character; returned text must not start with half an emoji.
  it("discards the remaining half-character when an eviction boundary splits an emoji, preserving cumulative positions", () => {
    const buffer = new RawBuffer(3);
    buffer.push("😀");
    buffer.push("AB");
    expect(buffer.read(0)).toEqual({ text: "AB", offset: 2, nextOffset: 4, truncated: true });
    buffer.push("C");
    expect(buffer.read()).toEqual({ text: "ABC", offset: 2, nextOffset: 5, truncated: false });
  });
});
