import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { directoryRoot, withinDirectory, writableTarget } from "./paths.ts";

const roots: string[] = [];
afterEach(() => { for (const base of roots.splice(0)) rmSync(base, { recursive: true, force: true }); });
function setup() {
  const base = mkdtempSync(join(tmpdir(), "directory-paths-")); roots.push(base);
  const inputRoot = join(base, "root"), outside = join(base, "outside");
  mkdirSync(inputRoot); mkdirSync(outside);
  const root = realpathSync(inputRoot);
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(outside, join(root, "external"));
  symlinkSync(join(outside, "secret.txt"), join(root, "AGENTS.md"));
  return { base, root, outside };
}
const failure = (code: string) => ({ outcome: { error: { code } } });

// Expectations follow directory authorization scope: resolve real paths and confine reads and writes to the resource root; absence and broken links are distinct.
describe("Directory path boundaries", () => {
  it("Reads and writes reject traversal, absolute paths, and out-of-bounds symlinks, including write targets that do not yet exist", async () => {
    const { root, outside } = setup();
    for (const resolve of [withinDirectory, writableTarget]) {
      for (const path of ["../outside/secret.txt", "../missing", "external/secret.txt", "AGENTS.md"]) {
        await expect(resolve(root, path)).rejects.toMatchObject(failure("outside_resource"));
      }
      await expect(resolve(root, join(outside, "secret.txt"))).rejects.toMatchObject(failure("absolute_path"));
    }
    await expect(writableTarget(root, "external/new/created.txt")).rejects.toMatchObject(failure("outside_resource"));
  });

  it("Valid internal links resolve to the same real file; ordinary directories starting with two dots are valid, and new files can be resolved", async () => {
    const { root } = setup();
    mkdirSync(join(root, "..notes"));
    writeFileSync(join(root, "inside.txt"), "inside");
    symlinkSync(join(root, "inside.txt"), join(root, "alias.txt"));
    expect(await withinDirectory(root, "..notes")).toBe(join(root, "..notes"));
    expect(await withinDirectory(root, "alias.txt")).toBe(join(root, "inside.txt"));
    expect(await writableTarget(root, "alias.txt")).toMatchObject({ path: join(root, "inside.txt") });
    expect(await writableTarget(root, "nested/new.txt")).toMatchObject({ path: join(root, "nested/new.txt") });
  });

  it("Broken links cannot be new write targets; invalid characters, link loops, and nondirectory parent paths have distinct reason codes", async () => {
    const { root } = setup();
    symlinkSync(join(root, "missing.txt"), join(root, "broken.txt"));
    symlinkSync("loop", join(root, "loop"));
    writeFileSync(join(root, "file.txt"), "file");
    await expect(writableTarget(root, "broken.txt")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(withinDirectory(root, "loop")).rejects.toMatchObject(failure("symlink_loop"));
    await expect(withinDirectory(root, "bad\0path")).rejects.toMatchObject(failure("invalid_path"));
    await expect(writableTarget(root, "file.txt/child")).rejects.toMatchObject(failure("not_directory"));
    await expect(withinDirectory(root, "missing")).rejects.toMatchObject(failure("path_not_found"));
  });

  it("Distinguishes a missing root directory from a root path that has become a file", async () => {
    const { base } = setup(), missing = join(base, "missing"), file = join(base, "file");
    writeFileSync(file, "file");
    await expect(directoryRoot(missing)).rejects.toMatchObject(failure("resource_not_found"));
    await expect(directoryRoot(file)).rejects.toMatchObject(failure("resource_not_directory"));
  });

});
