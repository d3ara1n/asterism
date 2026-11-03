import { expect, it } from "vitest";
import { diffPaths, filterPaths, loadedPaths } from "./tree-model.ts";

it("lists only loaded directories, parents before descendants", () => {
  const children = new Map([
    ["", [{ name: "src", directory: true }, { name: "lib", directory: true }, { name: "README.md", directory: false }]],
    ["src/", [{ name: "main.ts", directory: false }]],
  ]);
  // lib/ is known but unloaded, so it contributes no descendants.
  expect(loadedPaths(children)).toEqual(["src/", "src/main.ts", "lib/", "README.md"]);
});

it("keeps ancestors of matches and every descendant of a matching directory", () => {
  const paths = ["docs/", "docs/guide.md", "src/", "src/app/", "src/app/main.ts", "src/util.ts"];
  expect(filterPaths(paths, "MAIN")).toEqual(["src/", "src/app/", "src/app/main.ts"]);
  expect(filterPaths(paths, "docs")).toEqual(["docs/", "docs/guide.md"]);
});

it("does not let the directory suffix match a slash query", () => {
  expect(filterPaths(["a/", "b.txt"], "/")).toEqual([]);
});

it("removes a vanished directory with one recursive operation and adds new paths parent-first", () => {
  const previous = ["old/", "old/a.ts", "old/deep/", "old/deep/b.ts", "keep.ts"];
  const next = ["keep.ts", "new/", "new/c.ts"];
  expect(diffPaths(previous, next)).toEqual([
    { type: "remove", path: "old/", recursive: true },
    { type: "add", path: "new/" },
    { type: "add", path: "new/c.ts" },
  ]);
});

it("does not treat a sibling sharing a name prefix as part of a removed subtree", () => {
  expect(diffPaths(["src/", "src/a.ts", "src-gen.ts"], [])).toEqual([
    { type: "remove", path: "src/", recursive: true },
    { type: "remove", path: "src-gen.ts", recursive: false },
  ]);
});
