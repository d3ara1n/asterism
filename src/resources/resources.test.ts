import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { directoryType, readContextFiles } from "./index.ts";
import { globalTools } from "./global.ts";
import type { FoldedObject } from "../session/fold.ts";

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function dir(): { root: string; outside: string; resource: FoldedObject } {
  const base = mkdtempSync(join(tmpdir(), "weft-res-")); roots.push(base);
  const root = join(base, "root"); const outside = join(base, "outside");
  mkdirSync(root); mkdirSync(outside);
  writeFileSync(join(root, "a.txt"), "hello"); writeFileSync(join(outside, "secret.txt"), "secret");
  return { root, outside, resource: { id: "d1", kind: "directory", title: "root", data: { path: root } } };
}
const signal = new AbortController().signal;

describe("资源工具", () => {
  it("目录读取限制在根内：拒绝 ..、绝对路径与指向外部的符号链接", async () => {
    const { root, outside, resource } = dir();
    symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"));
    const read = directoryType.tools.find(t => t.name === "read")!;
    expect(await read.execute(resource, { path: "a.txt" }, signal)).toMatchObject({ kind: "succeeded", model: { text: "hello" } });
    for (const path of ["../outside/secret.txt", join(outside, "secret.txt"), "link.txt"])
      expect(await read.execute(resource, { path }, signal)).toMatchObject({ kind: "rejected", error: { code: "outside_resource" } });
  });

  it("resource_call 只作用于已链接资源，参数不合 schema 时返回 schema 供自我修正", async () => {
    const { resource } = dir();
    let linked: FoldedObject[] = [resource];
    const tools = globalTools([directoryType], () => linked);
    const call = tools.find(t => t.name === "resource_call")!;
    expect(await call.execute({ resource_id: "d1", tool: "read", args: { path: "a.txt" } }, signal)).toMatchObject({ kind: "succeeded" });
    expect(await call.execute({ resource_id: "d1", tool: "read", args: {} }, signal)).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    linked = [];
    expect(await call.execute({ resource_id: "d1", tool: "read", args: { path: "a.txt" } }, signal)).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
  });

  it("inspect 返回实时状态：目录被删后 exists 为 false；AGENTS.md 每次读取当前内容", async () => {
    const { root, resource } = dir();
    const inspect = globalTools([directoryType], () => [resource]).find(t => t.name === "resource_inspect")!;
    expect(await readContextFiles([resource])).toEqual([]);
    writeFileSync(join(root, "AGENTS.md"), "v1");
    expect((await readContextFiles([resource]))[0]?.text).toBe("v1");
    writeFileSync(join(root, "AGENTS.md"), "v2");
    expect((await readContextFiles([resource]))[0]?.text).toBe("v2");
    rmSync(root, { recursive: true });
    expect(await inspect.execute({ resource_id: "d1" }, signal)).toMatchObject({ kind: "succeeded", model: { state: { exists: false } } });
  });
});
