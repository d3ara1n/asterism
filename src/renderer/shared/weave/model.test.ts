import { describe, expect, it } from "vitest";
import { closeIsland, follow, layout, openIsland, type IslandSlot } from "./model";

// 期望值来自编织约定：放得下按 grow 分配且不平移；放不下退到 min 并溢出；溢出时已可见不动、越界贴边。
const slot = (id: string, min: number, grow = 0, max?: number): IslandSlot => ({ id, width: { min, grow, ...(max ? { max } : {}) } });

describe("layout", () => {
  it("shares the remaining space by grow when all minimums fit", () => {
    const result = layout([slot("a", 300, 1), slot("b", 300, 1)], 1006, 6);
    expect(result.overflow).toBe(false);
    expect(result.spans.map(span => span.width)).toEqual([500, 500]);
  });
  it("gives space capped by max back to the other islands", () => {
    const result = layout([slot("a", 300, 1), slot("b", 300, 1, 400)], 1006, 6);
    expect(result.spans.map(span => Math.round(span.width))).toEqual([600, 400]);
  });
  it("keeps a non-growing island at its minimum without filling the viewport", () => {
    const result = layout([slot("a", 400)], 1000, 6);
    expect(result.overflow).toBe(false);
    expect(result.total).toBe(400);
  });
  it("overflows at minimum widths when the minimums do not fit", () => {
    const result = layout([slot("a", 400, 1), slot("b", 400, 1), slot("c", 400, 1)], 900, 6);
    expect(result.overflow).toBe(true);
    expect(result.spans.map(span => span.width)).toEqual([400, 400, 400]);
  });
  it("overflows when a single minimum is wider than the viewport", () => {
    expect(layout([slot("a", 1200, 1)], 900, 6).overflow).toBe(true);
  });
});

describe("follow", () => {
  const { spans } = layout([slot("a", 400), slot("b", 400), slot("c", 400)], 900, 6);
  it("keeps the viewport still when the focused island is fully visible", () => {
    expect(follow(spans, 1, 900, 0)).toBe(0);
  });
  it("aligns the right edge when focus moves deeper past the viewport", () => {
    // c 位于 812..1212，右缘对齐视口：1212 - 900
    expect(follow(spans, 2, 900, 0)).toBe(312);
  });
  it("aligns the left edge when focus returns past the viewport", () => {
    expect(follow(spans, 0, 900, 312)).toBe(0);
  });
});

describe("open and close", () => {
  const state = { islands: [slot("root", 300), slot("a", 300), slot("b", 300)], focus: "b" };
  it("replaces deeper islands when opening from a shallower one", () => {
    const next = openIsland(state, "root", slot("c", 300));
    expect(next.islands.map(island => island.id)).toEqual(["root", "c"]);
    expect(next.focus).toBe("c");
  });
  it("closes deeper islands and returns focus to the left neighbour, never the root", () => {
    expect(closeIsland(state, "a")).toMatchObject({ islands: [{ id: "root" }], focus: "root" });
    expect(closeIsland(state, "root")).toBe(state);
  });
});
