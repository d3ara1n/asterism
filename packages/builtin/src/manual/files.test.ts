import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { listManual, readManual } from "./files.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

// The exposure contract reads source files at handling time and preserves virtual identity across equal filenames.
it("lists mounted sources and reads current file contents without a copied manual tree", async () => {
  const root = mkdtempSync(join(tmpdir(), "manual-sources-")); roots.push(root);
  const sources = ["first", "second"].map(name => {
    const directory = join(root, name);
    mkdirSync(directory);
    writeFileSync(join(directory, "usage.md"), `${name}\n`);
    return { path: `plugins/example.${name}/docs`, directory };
  });
  const signal = new AbortController().signal;
  expect(await listManual(sources, { path: "plugins" }, signal)).toMatchObject({
    kind: "succeeded", data: { entries: [{ name: "example.first", type: "directory" }, { name: "example.second", type: "directory" }] },
  });
  const target = { path: "plugins/example.first/docs/usage.md" };
  expect(await readManual(sources, target, { anchored: false }, signal)).toMatchObject({
    kind: "succeeded", data: { path: target.path, rows: [{ content: "first" }] },
  });
  writeFileSync(join(sources[0].directory, "usage.md"), "Updated in place\n");
  expect(await readManual(sources, target, { anchored: false }, signal)).toMatchObject({
    kind: "succeeded", data: { path: target.path, rows: [{ content: "Updated in place" }] },
  });
  expect(await readManual(sources.slice(1), target, {}, signal)).toMatchObject({
    kind: "failed", error: { code: "path_not_found" },
  });
});
