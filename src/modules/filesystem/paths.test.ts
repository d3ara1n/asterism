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

// 预期来自目录授权范围：解析真实路径，读写都限于资源根；不存在与断链不混同。
describe("目录路径边界", () => {
  it("读写拒绝穿越、绝对路径和越界符号链接，尚不存在的写入目标同样受限", async () => {
    const { root, outside } = setup();
    for (const resolve of [withinDirectory, writableTarget]) {
      for (const path of ["../outside/secret.txt", "../missing", "external/secret.txt", "AGENTS.md"]) {
        await expect(resolve(root, path)).rejects.toMatchObject(failure("outside_resource"));
      }
      await expect(resolve(root, join(outside, "secret.txt"))).rejects.toMatchObject(failure("absolute_path"));
    }
    await expect(writableTarget(root, "external/new/created.txt")).rejects.toMatchObject(failure("outside_resource"));
  });

  it("合法内部链接指向同一真实文件，双点开头的普通目录合法，新文件可解析", async () => {
    const { root } = setup();
    mkdirSync(join(root, "..notes"));
    writeFileSync(join(root, "inside.txt"), "inside");
    symlinkSync(join(root, "inside.txt"), join(root, "alias.txt"));
    expect(await withinDirectory(root, "..notes")).toBe(join(root, "..notes"));
    expect(await withinDirectory(root, "alias.txt")).toBe(join(root, "inside.txt"));
    expect(await writableTarget(root, "alias.txt")).toMatchObject({ path: join(root, "inside.txt") });
    expect(await writableTarget(root, "nested/new.txt")).toMatchObject({ path: join(root, "nested/new.txt") });
  });

  it("断链不能作为新写入目标；无效字符、链接循环与非目录父路径有不同原因码", async () => {
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

  it("根目录缺失和根路径变成文件可区分", async () => {
    const { base } = setup(), missing = join(base, "missing"), file = join(base, "file");
    writeFileSync(file, "file");
    await expect(directoryRoot(missing)).rejects.toMatchObject(failure("resource_not_found"));
    await expect(directoryRoot(file)).rejects.toMatchObject(failure("resource_not_directory"));
  });

});
