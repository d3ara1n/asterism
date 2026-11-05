import { describe, expect, it } from "vitest";
import { closure, focusAfterClose, follow, layout, moveIsland, openIsland, restoreIslands, type IslandSlot } from "./model";

// Expected values come from the weave contract: when everything fits, distribute by grow without translation; otherwise fall back to min and overflow; during overflow, keep visible islands still and align out-of-bounds islands to the edge.
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
    expect(layout([slot("a", 1200, 1)], 900, 6).overflow).toBe(true);
  });
});

describe("follow", () => {
  const { spans } = layout([slot("a", 400), slot("b", 400), slot("c", 400)], 900, 6);
  it("keeps the viewport still when the focused island is fully visible", () => {
    expect(follow(spans, 1, 900, 0)).toBe(0);
  });
  it("aligns out-of-bounds focus to the edge in the movement direction and near the left edge when returning", () => {
    // c spans 812..1212; align its right edge with the viewport: 1212 - 900
    expect(follow(spans, 2, 900, 0)).toBe(312);
    expect(follow(spans, 0, 900, 312)).toBe(0);
  });
  it("aligns the leading edge of an island wider than the viewport", () => {
    // b spans 406..1606 and cannot fit; its header stays visible instead of its trailing edge.
    const wide = layout([slot("a", 400), slot("b", 1200), slot("c", 400)], 900, 6).spans;
    expect(follow(wide, 1, 900, 0)).toBe(406);
  });
});

describe("ordinary islands", () => {
  const island = (id: string, owner: string | null = null) => ({ id, owner });
  it("locates an existing identity in place and appends a new one at the right end", () => {
    const islands = [island("a"), island("b")];
    expect(openIsland(islands, island("a", "b"))).toEqual({ islands, opened: false });
    expect(openIsland(islands, island("c")).islands.map(item => item.id)).toEqual(["a", "b", "c"]);
  });
  it("closes what an island opened by ownership regardless of position, deepest first", () => {
    // c was swapped left of its owner a; d is unrelated and stays.
    const islands = [island("c", "a"), island("d"), island("a", "root"), island("e", "c")];
    expect(closure(islands, "a")).toEqual(["e", "c", "a"]);
    // The root and fixed islands are not ordinary: closing them removes only what they opened.
    expect(closure(islands, "root")).toEqual(["e", "c", "a"]);
    expect(closure([island("x", "y"), island("y", "x")], "x")).toEqual(["y", "x"]);
  });
  it("swaps only with an ordinary neighbor", () => {
    const islands = [island("a"), island("b"), island("c")];
    expect(moveIsland(islands, "b", -1).map(item => item.id)).toEqual(["b", "a", "c"]);
    expect(moveIsland(islands, "c", 1)).toBe(islands);
    expect(moveIsland(islands, "a", -1)).toBe(islands);
  });
  it("moves focus from a removed island to the nearest survivor, preferring the left", () => {
    const order = ["nav", "root", "a", "b", "c"];
    expect(focusAfterClose(order, ["b"], "b", "root")).toBe("a");
    expect(focusAfterClose(order, ["a", "b"], "c", "root")).toBe("c");
    expect(focusAfterClose(["a", "b"], ["a"], "a", "root")).toBe("b");
    expect(focusAfterClose(["a"], ["a"], "a", "root")).toBe("root");
  });
  it("restores without repeated identities or owners absent from the restored set", () => {
    expect(restoreIslands([island("a", "panel"), island("b", "a"), island("a")])).toEqual([island("a"), island("b", "a")]);
    // The root always exists, so islands it opened keep their owner.
    expect(restoreIslands([island("a", "root"), island("b", "panel")], new Set(["root"]))).toEqual([island("a", "root"), island("b")]);
  });
});
