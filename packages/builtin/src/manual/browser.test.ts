import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readManualFile, readManualChildren } from "./browser.ts";

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

it("lists virtual prefixes and one physical level without metadata or following directory symlinks", async () => {
  const { sources, signal } = fixture();
  mkdirSync(join(sources[0].directory, "empty"));
  mkdirSync(join(sources[0].directory, "guides"));
  mkdirSync(join(sources[0].directory, ".git"));
  writeFileSync(join(sources[0].directory, ".git", "config"), "metadata");
  writeFileSync(join(sources[0].directory, ".DS_Store"), "metadata");
  writeFileSync(join(sources[0].directory, "guides", "usage.md"), "Guide");
  symlinkSync(sources[0].directory, join(sources[0].directory, "loop"), "junction");
  expect(await readManualChildren(sources, ".", signal)).toEqual({ entries: [{ name: "plugins", directory: true }] });
  expect(await readManualChildren(sources, "plugins", signal)).toEqual({ entries: [
    { name: "example.first", directory: true }, { name: "example.second", directory: true },
  ] });
  const docs = await readManualChildren(sources, "plugins/example.first/docs", signal);
  expect(docs.entries.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
    { name: "empty", directory: true }, { name: "guides", directory: true }, { name: "loop", directory: false },
  ]);
  expect(await readManualChildren(sources, "plugins/example.first/docs/guides", signal))
    .toEqual({ entries: [{ name: "usage.md", directory: false }] });
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
  await expect(readManualChildren(sources, "plugins/example.second/docs", signal))
    .rejects.toMatchObject({ outcome: { error: { code: "resource_not_found" } } });
});
