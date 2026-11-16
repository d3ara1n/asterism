import { describe, expect, it } from "vitest";
import type { Folder } from "../../shared/folders";
import { sidebarListRows } from "./sidebar-list";

const folder = (id: string): Folder => ({ id, name: id, color: "blue", createdAt: "2026-06-04" });
const first = { id: "first" };
const second = { id: "second" };

describe("sidebar virtual rows", () => {
  it("flattens open folders into individual session rows and retains empty folders in order", () => {
    const rows = sidebarListRows([first, second], [
      { folder: folder("work"), items: [second, first] },
      { folder: folder("empty"), items: [] },
    ], new Set());
    expect(rows.map(row => row.key)).toEqual([
      "group:work", "session:second", "session:first", "group:empty", "empty:empty",
    ]);
    expect(rows.filter(row => row.kind === "session").map(row => [row.session.id, row.nested])).toEqual([
      ["second", true], ["first", true],
    ]);
  });

  it("omits collapsed children and empty messages without changing group counts", () => {
    const rows = sidebarListRows([first, second], [
      { folder: folder("work"), items: [first, second] },
      { folder: folder("empty"), items: [] },
      { folder: null, items: [first] },
    ], new Set(["work", "empty", "none"]));
    expect(rows.map(row => row.key)).toEqual(["group:work", "group:empty", "group:none"]);
    expect(rows.filter(row => row.kind === "group").map(row => [row.open, row.group.items.length])).toEqual([
      [false, 2], [false, 0], [false, 1],
    ]);
  });

  it("collapses no-folder independently of named folders", () => {
    const rows = sidebarListRows([first, second], [
      { folder: folder("work"), items: [first] },
      { folder: null, items: [second] },
    ], new Set(["none"]));
    expect(rows.map(row => row.key)).toEqual(["group:work", "session:first", "group:none"]);
  });

  it("keeps recent order and session identity across arrangements without applying group collapse", () => {
    const recent = sidebarListRows([second, first], null, new Set(["work"]));
    const grouped = sidebarListRows([second, first], [{ folder: folder("work"), items: [first, second] }], new Set());
    expect(recent.map(row => row.key)).toEqual(["session:second", "session:first"]);
    expect(recent.filter(row => row.kind === "session").map(row => row.nested)).toEqual([false, false]);
    expect(grouped.filter(row => row.kind === "session").map(row => row.key)).toEqual([recent[1].key, recent[0].key]);
  });
});
