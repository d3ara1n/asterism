import { describe, expect, it } from "vitest";
import { folderColors, type Folder } from "../../../shared/folders";
import { groupByFolder, nextFolderColor } from "./grouping";

const folder = (id: string, name: string, createdAt: string, color: Folder["color"] = "blue"): Folder =>
  ({ id, name, color, createdAt });
const item = (id: string, folderId: string | null) => ({ id, folderId });
const ids = (groups: ReturnType<typeof groupByFolder<{ id: string; folderId: string | null }>>) =>
  groups.map(group => [group.folder?.id ?? null, group.items.map(entry => entry.id)]);

describe("folder grouping", () => {
  it("orders folders by numeric-aware name, breaks equal names by creation, and keeps item order within each group", () => {
    const folders = [folder("f10", "Task 10", "2026-01-01"), folder("f2", "task 2", "2026-01-03"),
      folder("dupLate", "Notes", "2026-01-05"), folder("dupEarly", "Notes", "2026-01-02")];
    const items = [item("s1", "f10"), item("s2", "f2"), item("s3", "f10"), item("s4", "dupLate")];
    expect(ids(groupByFolder(folders, items, entry => entry.folderId, "en"))).toEqual([
      ["dupEarly", []], ["dupLate", ["s4"]], ["f2", ["s2"]], ["f10", ["s1", "s3"]],
    ]);
  });

  it("puts unassigned and dangling memberships in a trailing no-folder group, omitted when empty", () => {
    const folders = [folder("a", "Alpha", "2026-01-01")];
    expect(ids(groupByFolder(folders, [item("s1", null), item("s2", "a"), item("s3", "gone")], entry => entry.folderId, "en")))
      .toEqual([["a", ["s2"]], [null, ["s1", "s3"]]]);
    expect(ids(groupByFolder(folders, [item("s2", "a")], entry => entry.folderId, "en"))).toEqual([["a", ["s2"]]]);
  });

  it("assigns the least-used palette color, earliest in palette order on ties", () => {
    expect(nextFolderColor([])).toBe("red");
    expect(nextFolderColor([folder("a", "A", "1", "red"), folder("b", "B", "2", "orange")])).toBe("amber");
    const everyColorOnce = folderColors.map((color, i) => folder(String(i), color, String(i), color));
    expect(nextFolderColor([...everyColorOnce, folder("x", "X", "9", "red")])).toBe("orange");
  });
});
