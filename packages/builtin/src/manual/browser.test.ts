import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readManualFile, readManualTree } from "./browser.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "manual-browser-"));
  roots.push(root);
  const sources = ["first", "second"].map(name => {
    const directory = join(root, name);
    mkdirSync(directory);
    return { path: `plugins/example.${name}/docs`, directory };
  });
  return { sources, signal: new AbortController().signal };
}

it("keeps source prefixes and empty folders in the tree without following directory symlinks", async () => {
  const { sources, signal } = fixture();
  mkdirSync(join(sources[0].directory, "empty"));
  mkdirSync(join(sources[0].directory, "guides"));
  mkdirSync(join(sources[0].directory, ".git"));
  writeFileSync(join(sources[0].directory, ".git", "config"), "metadata");
  writeFileSync(join(sources[0].directory, ".DS_Store"), "metadata");
  writeFileSync(join(sources[0].directory, "guides", "usage.md"), "Guide");
  symlinkSync(sources[0].directory, join(sources[0].directory, "loop"), "junction");
  expect((await readManualTree(sources, signal)).paths.sort()).toEqual([
    "plugins/example.first/docs/",
    "plugins/example.first/docs/empty/",
    "plugins/example.first/docs/guides/",
    "plugins/example.first/docs/guides/usage.md",
    "plugins/example.first/docs/loop",
    "plugins/example.second/docs/",
  ]);
});

it("opens complete current text from the selected source without model read excerpts or line limits", async () => {
  const { sources, signal } = fixture();
  writeFileSync(join(sources[0].directory, "usage.md"), "First source");
  writeFileSync(join(sources[1].directory, "usage.md"), "Second source");
  expect(await readManualFile(sources, "plugins/example.second/docs/usage.md", signal))
    .toEqual({ kind: "text", text: "Second source" });
  const text = `${"Long line ".repeat(2000)}\n${"Following line\n".repeat(2100)}Final line\n`;
  writeFileSync(join(sources[1].directory, "usage.md"), text);
  expect(await readManualFile(sources, "plugins/example.second/docs/usage.md", signal))
    .toEqual({ kind: "text", text });
});

it("reports an unavailable source instead of presenting an empty tree", async () => {
  const { sources, signal } = fixture();
  rmSync(sources[1].directory, { recursive: true });
  await expect(readManualTree(sources, signal)).rejects.toMatchObject({ code: "ENOENT" });
});
