import { expect, it } from "vitest";
import { resolve } from "node:path";
import { directoryChanged } from "./watch.ts";

it("invalidates for worktree changes and actual metadata outside the resource", () => {
  const root = resolve("worktree"), metadata = resolve("repository/.git");
  expect(directoryChanged(root, [metadata], [{ path: resolve(root, "src/app.tsx") }])).toBe(true);
  expect(directoryChanged(root, [metadata], [{ path: resolve(metadata, "index") }])).toBe(true);
});

it("invalidates ref-only changes but ignores lock files and object storage", () => {
  const root = resolve("project"), metadata = resolve(root, ".git");
  expect(directoryChanged(root, [metadata], [{ path: resolve(metadata, "refs/heads/main") }])).toBe(true);
  expect(directoryChanged(root, [metadata], [
    { path: resolve(metadata, "index.lock") }, { path: resolve(metadata, "objects/aa/object") },
    { path: resolve(metadata, "logs/HEAD") },
  ])).toBe(false);
});

it("does not confuse a path-prefix sibling with a child, and keeps directory deletion signals", () => {
  const root = resolve("project");
  expect(directoryChanged(root, [], [{ path: resolve("project-other/a.ts") }])).toBe(false);
  expect(directoryChanged(root, [], [{ path: resolve(root, "src") }])).toBe(true);
});
