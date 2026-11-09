import { expect, it } from "vitest";
import { buildChanges, sameChanges } from "./changes-model.ts";
import type { ChangeEntry } from "./changes-model.ts";
import { diffPaths } from "./tree-model.ts";

it("deduplicates shared parents and lists directory-first contiguous subtrees before files", () => {
  const changes: readonly ChangeEntry[] = [
    { path: "z.txt", status: "modified" },
    { path: "src/z.ts", status: "modified" },
    { path: "src/utils/z.ts", status: "added" },
    { path: "docs/guide.md", status: "modified" },
    { path: "src/utils/a.ts", status: "renamed" },
    { path: "src/a.ts", status: "modified" },
    { path: "a.txt", status: "added" },
  ];
  const model = buildChanges(changes);
  expect(model.paths).toEqual([
    "docs/", "docs/guide.md",
    "src/", "src/utils/", "src/utils/a.ts", "src/utils/z.ts", "src/a.ts", "src/z.ts",
    "a.txt", "z.txt",
  ]);
  expect([...model.entries]).toEqual(changes.map(entry => [entry.path, entry]));
  expect(model.paths).not.toContain("src/unchanged.ts");
  expect(buildChanges([...changes].reverse()).paths).toEqual(model.paths);
});

it("keeps deleted changes without consulting the filesystem", () => {
  const deleted: ChangeEntry = { path: "removed/deep/gone.ts", status: "deleted" };
  const model = buildChanges([deleted]);
  expect(model.paths).toEqual(["removed/", "removed/deep/", "removed/deep/gone.ts"]);
  expect(model.entries.get("removed/deep/gone.ts")).toEqual(deleted);
});

it("represents a Git directory summary as a terminal leaf retaining its original path", () => {
  const summary: ChangeEntry = { path: "node_modules/", status: "untracked" };
  const model = buildChanges([summary]);
  expect(model.paths).toEqual(["node_modules"]);
  expect([...model.entries]).toEqual([["node_modules", summary]]);
});

it("infers only summary ancestors and keeps prefix siblings outside their subtrees", () => {
  const model = buildChanges([
    { path: "a/b/", status: "untracked" },
    { path: "a/b-sibling.txt", status: "added" },
    { path: "a-copy/file.ts", status: "modified" },
    { path: "a/beta/file.ts", status: "deleted" },
    { path: "a.txt", status: "modified" },
  ]);
  expect(model.paths).toEqual([
    "a/", "a/beta/", "a/beta/file.ts", "a/b", "a/b-sibling.txt",
    "a-copy/", "a-copy/file.ts", "a.txt",
  ]);
  expect([...model.entries.keys()]).toEqual(["a/b", "a/b-sibling.txt", "a-copy/file.ts", "a/beta/file.ts", "a.txt"]);
  expect(model.entries.get("a/b")?.path).toBe("a/b/");
  // diffPaths relies on contiguous subtrees to skip descendants of a recursive removal.
  expect(diffPaths(model.paths, [])).toEqual([
    { type: "remove", path: "a/", recursive: true },
    { type: "remove", path: "a-copy/", recursive: true },
    { type: "remove", path: "a.txt", recursive: false },
  ]);
});

it("preserves spaces, backslashes, and other filename characters using only Git separators", () => {
  const changes: readonly ChangeEntry[] = [
    { path: "space dir/file name.ts", status: "modified" },
    { path: "literal\\name.ts", status: "added" },
    { path: "space dir/back\\slash.txt", status: "renamed" },
    { path: "space dir/line\nwith\ttab.txt", status: "untracked" },
    { path: " leading and trailing ", status: "deleted" },
  ];
  const model = buildChanges(changes);
  expect(model.paths).toEqual([
    "space dir/", "space dir/back\\slash.txt", "space dir/file name.ts", "space dir/line\nwith\ttab.txt",
    " leading and trailing ", "literal\\name.ts",
  ]);
  expect([...model.entries]).toEqual(changes.map(entry => [entry.path, entry]));
});

it("ignores snapshot order but detects a status change on any path", () => {
  const before: readonly ChangeEntry[] = [
    { path: "src/a.ts", status: "added" },
    { path: "src/b.ts", status: "deleted" },
    { path: "scratch/", status: "untracked" },
  ];
  expect(sameChanges(before, [
    { path: "scratch/", status: "untracked" },
    { path: "src/b.ts", status: "deleted" },
    { path: "src/a.ts", status: "added" },
  ])).toBe(true);
  expect(sameChanges(before, [before[0]!, { path: "src/b.ts", status: "modified" }, before[2]!])).toBe(false);
});

it("detects replaced paths, original summary suffix changes, additions, and removals", () => {
  const before: readonly ChangeEntry[] = [{ path: "scratch/", status: "untracked" }];
  expect(sameChanges(before, [{ path: "other/", status: "untracked" }])).toBe(false);
  expect(sameChanges(before, [{ path: "scratch", status: "untracked" }])).toBe(false);
  expect(sameChanges(before, [])).toBe(false);
  expect(sameChanges([], before)).toBe(false);
  expect(sameChanges([], [])).toBe(true);
  expect(buildChanges([])).toEqual({ paths: [], entries: new Map() });
});
