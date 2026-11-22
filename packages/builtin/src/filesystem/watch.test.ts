import { expect, it } from "vitest";
import { resolve } from "node:path";
import { directoryInvalidation } from "./watch.ts";

it("keeps entry changes in their parent listing, including coalesced replacements", () => {
  const root = resolve("project");
  expect(directoryInvalidation(root, null, [{ type: "update", path: resolve(root, "src/app.ts") }]))
    .toEqual({ parents: ["src"], git: true, discover: false });
  expect(directoryInvalidation(root, null, [
    { type: "create", path: resolve(root, "src/new.ts") }, { type: "delete", path: resolve(root, "src/old.ts") },
    { type: "create", path: resolve("project-other/extra.ts") },
  ])).toEqual({ parents: ["src"], git: true, discover: false });
});

it("recognizes linked-worktree metadata before the common directory and leaves listings alone", () => {
  const worktree = resolve("linked"), commonDir = resolve("original/.git"), gitDir = resolve(commonDir, "worktrees/linked");
  const repository = { worktree, gitDir, commonDir, prefix: "src/" };
  const root = resolve(worktree, "src");
  for (const path of [resolve(gitDir, "index"), resolve(commonDir, "refs/heads/main")]) {
    expect(directoryInvalidation(root, repository, [{ type: "update", path }]))
      .toEqual({ parents: [], git: true, discover: false });
  }
  expect(directoryInvalidation(root, repository, [
    { type: "create", path: resolve(gitDir, "index.lock") }, { type: "create", path: resolve(commonDir, "objects/aa/object") },
    { type: "update", path: resolve(gitDir, "logs/HEAD") }, { type: "create", path: resolve(commonDir, "refs/heads/main.lock") },
  ])).toEqual({ parents: [], git: false, discover: false });
});

it("rediscovers on git init, removal or a changed worktree pointer without probing for ordinary index writes", () => {
  const root = resolve("project"), marker = resolve(root, ".git");
  expect(directoryInvalidation(root, null, [{ type: "create", path: marker }]).discover).toBe(true);
  const main = { worktree: root, gitDir: marker, commonDir: marker, prefix: "" };
  expect(directoryInvalidation(root, main, [{ type: "delete", path: marker }]).discover).toBe(true);
  expect(directoryInvalidation(root, main, [{ type: "update", path: resolve(marker, "index") }]).discover).toBe(false);
  const linked = { ...main, gitDir: resolve("repo/.git/worktrees/linked"), commonDir: resolve("repo/.git") };
  expect(directoryInvalidation(root, linked, [{ type: "update", path: marker }]).discover).toBe(true);
});
