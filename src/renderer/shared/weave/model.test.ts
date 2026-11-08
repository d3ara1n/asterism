import { describe, expect, it } from "vitest";
import { bindIsland, closure, focusAfterClose, follow, layout, moveIsland, openIsland, restoreIslands, type IslandSlot } from "./model";

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
  const island = (id: string, owner: string | null = null, key = id) => ({ id, owner, key });
  it("locates an existing content key in place and appends a new one at the right end", () => {
    const islands = [island("a"), island("b")];
    expect(openIsland(islands, island("another-instance", "b", "a"))).toEqual({ islands, island: islands[0], opened: false });
    expect(openIsland(islands, island("c")).islands.map(item => item.id)).toEqual(["a", "b", "c"]);
  });
  it("turns a creation into a located editor while releasing the creation key and retaining its children", () => {
    const editor = { ...island("editor-instance", "root", "create"), size: 640 };
    const child = { ...island("child-instance", "editor-instance", "child"), size: 320 };
    const original = [child, editor]; // The user moved the child before its owner.
    const result = bindIsland(original, "editor-instance", "server:foo");
    if (!result.ok) throw new Error("Expected binding to succeed.");
    const located = openIsland(result.islands, { ...island("unused", "another-owner", "server:foo"), size: 480 });
    expect(located.opened).toBe(false);
    expect(located.island).toEqual({ id: "editor-instance", key: "server:foo", owner: "root", size: 640 });
    expect(located.islands.map(item => item.id)).toEqual(["child-instance", "editor-instance"]);
    expect(closure(located.islands, "editor-instance")).toEqual(["child-instance", "editor-instance"]);
    const created = openIsland(located.islands, { ...island("next-draft", "root", "create"), size: 480 });
    expect(created.islands.map(item => item.id)).toEqual(["child-instance", "editor-instance", "next-draft"]);
    expect(editor.key).toBe("create");
  });
  it("rejects an occupied binding without replacing either editor and distinguishes an absent instance", () => {
    const islands = [island("draft", "root", "create"), island("saved", "root", "server:foo")];
    expect(bindIsland(islands, "draft", "server:foo")).toEqual({ ok: false, reason: "occupied" });
    expect(openIsland(islands, island("unused", null, "create")).island.id).toBe("draft");
    expect(openIsland(islands, island("unused", null, "server:foo")).island.id).toBe("saved");
    expect(bindIsland(islands, "absent", "server:bar")).toEqual({ ok: false, reason: "missing" });
    expect(bindIsland(islands, "saved", "server:foo")).toEqual({ ok: true, islands });
  });
  it("closes what an island opened by ownership regardless of position, deepest first", () => {
    // c was swapped left of its owner a; d is unrelated and stays.
    const islands = [island("c", "a"), island("d"), island("a", "root"), island("e", "c")];
    expect(closure(islands, "a")).toEqual(["e", "c", "a"]);
    // The root is not ordinary: closing its descendants removes only what it opened.
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
    const order = ["root", "a", "b", "c"];
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
  it("coalesces restored content with a currently open instance and remaps its restored children", () => {
    const current = [island("live-parent", "root", "server:foo")];
    const result = restoreIslands([
      island("old-parent", "root", "server:foo"),
      island("child", "old-parent", "child"),
      island("other", "missing", "server:bar"),
      island("duplicate-child", "root", "child"),
    ], new Set(["root"]), current);
    expect(result).toEqual([
      island("child", "live-parent", "child"), island("other", null, "server:bar"), current[0],
    ]);
    expect(closure(result, "live-parent")).toEqual(["child", "live-parent"]);
  });
});
