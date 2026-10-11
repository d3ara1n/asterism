import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, chmodSync, statSync } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPatch } from "diff";
import * as runtimeModules from "../runtime.ts";
import { ApplicationService } from "../../runtime/service.ts";
import { AgentCapabilities } from "../../execution/capabilities.ts";
import { executeCoreBatch } from "../../execution/core.ts";
import type { Json, ToolOutcome } from "../../shared/model.ts";
import { textReadSchema, textChangeSchema } from "../shared/text-contract.ts";
import { readTextFile, commitTextFile } from "./text-io.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, rename: vi.fn(actual.rename), link: vi.fn(actual.link) };
});
const roots: string[] = [];
const services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "core-text-")); roots.push(root);
  const directory = join(root, "directory"), outside = join(root, "outside");
  mkdirSync(directory); mkdirSync(outside);
  const resource = { id: "directory", kind: "atelier.core/directory", title: "Directory", data: { path: directory } };
  let modules!: ReturnType<typeof runtimeModules.createModules>;
  const createModules = runtimeModules.createModules;
  const capture = vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
    modules = createModules(...args); return modules;
  });
  const service = new ApplicationService(join(root, "host")); services.push(service);
  capture.mockRestore();
  const sessionId = service.sessions.tree.create("Files");
  for (const object of [resource, { ...resource, id: "other", title: "Other resource" }]) service.sessions.tree.append(sessionId, {
    kind: "event", agentId: null, model: null, type: "resource_created",
    data: { ...object.data, id: object.id, type: object.kind, title: object.title },
  });
  const capabilities = new AgentCapabilities(modules.resources, modules.tools, [resource], () => true);
  const call = async (tool: string, target: Json, args: Json = {}, cap = capabilities, signal = new AbortController().signal, resourceId = resource.id) => {
    const results: ToolOutcome[] = [];
    await executeCoreBatch([{ callId: "call", name: "resource_call", arguments: { resource_id: resourceId, tool, target, args } }], cap, signal, (_call, outcome) => results.push(outcome));
    return results[0];
  };
  return { root, directory, outside, resource, modules, call };
}

// 在真实临时目录和执行边界验证授权、批次失败、并发与冲突，避免影响用户文件。
describe("目录正文工具", () => {
  it("文件 read 的范围来自 target；默认带锚点，关闭后 data 与 model 都不带哈希", async () => {
    const { directory, call } = setup();
    writeFileSync(join(directory, "text.txt"), "a\nb\nc");
    const result = await call("read", { path: "text.txt", offset: 2, limit: 1 });
    expect(result.kind).toBe("succeeded");
    expect(textReadSchema.strip().parse(result.data)).toMatchObject({ fromLine: 2, rows: [{ line: 2, content: "b", hash: expect.any(String) }], nextOffset: 3 });
    expect(result.model).toContain("2#");
    const unanchored = await call("read", { path: "text.txt" }, { anchored: false });
    expect(textReadSchema.strip().parse(unanchored.data).rows.every(row => row.hash === null)).toBe(true);
    expect(unanchored.model).not.toContain("#");
    expect(await call("read", { path: "text.txt" }, { offset: 2 })).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    expect(await call("read", { path: "text.txt", offset: 9 })).toMatchObject({ kind: "rejected", error: { code: "line_out_of_range" } });
  });

  it("批次任一锚点失败时完全不写；成功结果的锚点能直接用于下次编辑", async () => {
    const { directory, call } = setup();
    const file = join(directory, "text.txt");
    writeFileSync(file, "a\r\nb\nc"); chmodSync(file, 0o755);
    const read = textReadSchema.strip().parse((await call("read", { path: "text.txt" })).data);
    const a = (i: number) => ({ line: read.rows[i].line, hash: read.rows[i].hash! });
    expect(await call("edit", { path: "text.txt" }, { edits: [
      { op: "replace", anchor: a(0), body: ["A"] }, { op: "replace", anchor: { line: 2, hash: "0000" }, body: ["B"] },
    ] })).toMatchObject({ kind: "rejected", error: { code: "anchor_mismatch" } });
    expect(readFileSync(file, "utf8")).toBe("a\r\nb\nc");
    const edited = await call("edit", { path: "text.txt" }, { edits: [{ op: "replace", anchor: a(1), body: ["B"] }] });
    expect(edited.kind).toBe("succeeded");
    const change = textChangeSchema.strip().parse(edited.data);
    expect(applyPatch("a\r\nb\nc", change.diff)).toBe("a\r\nB\nc");
    expect(readFileSync(file, "utf8")).toBe("a\r\nB\nc");
    expect(statSync(file).mode & 0o777).toBe(0o755);
    expect(await call("edit", { path: "text.txt" }, { edits: [{ op: "insert_after", anchor: { line: 2, hash: change.anchors[0].hash! }, body: ["new"] }] })).toMatchObject({ kind: "succeeded" });
    expect(readFileSync(file, "utf8")).toBe("a\r\nB\nnew\r\nc");
    expect(readdirSync(directory)).toEqual(["text.txt"]);
  });

  it("write 能创建父目录和空文件，也能覆盖与清空；所有结果均无锚点", async () => {
    const { directory, call } = setup();
    expect(await call("write", { path: "nested/empty.txt" }, { content: "" })).toMatchObject({ kind: "succeeded", data: { created: true, changed: true, anchors: [] } });
    expect(readFileSync(join(directory, "nested/empty.txt"), "utf8")).toBe("");
    const created = await call("write", { path: "nested/text.txt" }, { content: "正文\r\nlast" });
    expect(created).toMatchObject({ kind: "succeeded", data: { created: true, anchors: [] } });
    const overwritten = await call("write", { path: "nested/text.txt" }, { content: "new\n" });
    expect(overwritten).toMatchObject({ kind: "succeeded", data: { created: false, anchors: [] } });
    expect(applyPatch("正文\r\nlast", textChangeSchema.strip().parse(overwritten.data).diff)).toBe("new\n");
    expect(await call("write", { path: "nested/text.txt" }, { content: "new\n" })).toMatchObject({ kind: "succeeded", data: { changed: false, diff: "", anchors: [] } });
    expect(await call("write", { path: "nested/text.txt" }, { content: "" })).toMatchObject({ kind: "succeeded", data: { changed: true } });
    expect(readFileSync(join(directory, "nested/text.txt"), "utf8")).toBe("");
  });

  it("拒绝绝对路径、穿越、越界链接、断链与二进制；合法内部链接使用同一真实文件", async () => {
    const { directory, outside, call } = setup();
    writeFileSync(join(outside, "secret.txt"), "secret");
    writeFileSync(join(directory, "inside.txt"), "inside");
    symlinkSync(outside, join(directory, "external"), "dir");
    symlinkSync(join(directory, "missing.txt"), join(directory, "broken.txt"));
    symlinkSync(join(directory, "inside.txt"), join(directory, "alias.txt"));
    for (const path of ["../outside/secret.txt", "external/secret.txt", "external/new/created.txt"]) {
      expect(await call("write", { path }, { content: "overwrite" })).toMatchObject({ kind: "rejected", error: { code: "outside_resource" } });
    }
    expect(await call("read", { path: join(outside, "secret.txt") })).toMatchObject({ kind: "rejected", error: { code: "absolute_path" } });
    expect(await call("write", { path: "broken.txt" }, { content: "x" })).toMatchObject({ kind: "failed", error: { code: "path_not_found" } });
    expect(await call("write", { path: "alias.txt" }, { content: "updated" })).toMatchObject({ kind: "succeeded" });
    expect(readFileSync(join(directory, "inside.txt"), "utf8")).toBe("updated");
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
    expect(readdirSync(outside)).toEqual(["secret.txt"]);
    writeFileSync(join(directory, "binary"), Buffer.from([0xff, 0x00]));
    expect(await call("read", { path: "binary" })).toMatchObject({ kind: "rejected", error: { code: "unsupported_text" } });
    expect(await call("write", { path: "binary" }, { content: "x" })).toMatchObject({ kind: "rejected", error: { code: "unsupported_text" } });
    expect(await call("read", { path: "." })).toMatchObject({ kind: "failed", error: { code: "not_file" } });
  });

  it("未链接或只读策略无法写入，工具可见性不会绕过授权", async () => {
    const { directory, resource, modules, call } = setup();
    const unlinked = new AgentCapabilities(modules.resources, modules.tools, [], () => true);
    const readOnly = new AgentCapabilities(modules.resources, modules.tools, [resource], name => name === "read" || name === "list");
    expect(await call("write", { path: "new.txt" }, { content: "x" }, unlinked)).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(await call("write", { path: "new.txt" }, { content: "x" }, readOnly)).toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
    expect(readdirSync(directory)).toEqual([]);
  });

  it("不同资源指向同一文件的修改串行，两个 append 不丢失", async () => {
    const { directory, modules, resource, call } = setup();
    writeFileSync(join(directory, "text.txt"), "base\n");
    const second = new AgentCapabilities(modules.resources, modules.tools, [{ ...resource, id: "other", title: "Other resource" }], () => true);
    const results = await Promise.all([
      call("edit", { path: "text.txt" }, { edits: [{ op: "append", body: ["first"] }] }),
      call("edit", { path: "text.txt" }, { edits: [{ op: "append", body: ["second"] }] }, second, undefined, "other"),
    ]);
    expect(results.map(result => result.kind)).toEqual(["succeeded", "succeeded"]);
    expect(["base\nfirst\nsecond\n", "base\nsecond\nfirst\n"]).toContain(readFileSync(join(directory, "text.txt"), "utf8"));
  });

  it("准备后的外部变化阻止提交；新文件提交不能覆盖外部刚创建的文件", async () => {
    const { directory, call } = setup();
    const signal = new AbortController().signal;
    const file = join(directory, "text.txt");
    writeFileSync(file, "initial");
    const before = await readTextFile(directory, "text.txt", signal);
    writeFileSync(file, "external");
    await expect(commitTextFile(directory, "text.txt", before, "ours", signal)).rejects.toThrow("changed");
    expect(readFileSync(file, "utf8")).toBe("external");
    await expect(commitTextFile(directory, "text.txt", null, "ours", signal)).rejects.toThrow("changed");
    expect(readdirSync(directory)).toEqual(["text.txt"]);
    const actual = await vi.importActual<typeof fs>("node:fs/promises");
    vi.mocked(fs.link).mockImplementationOnce(async (source, target) => {
      writeFileSync(target, "external");
      await actual.link(source, target);
    });
    expect(await call("write", { path: "new.txt" }, { content: "ours" })).toMatchObject({
      kind: "rejected", error: { code: "file_changed" },
    });
    expect(readFileSync(join(directory, "new.txt"), "utf8")).toBe("external");
    expect(readdirSync(directory).sort()).toEqual(["new.txt", "text.txt"]);
  });

  it("取消在提交前停止，最终替换无法确认时返回 unknown 并清理暂存", async () => {
    const { directory, call } = setup();
    const cancelled = new AbortController(); cancelled.abort();
    expect(await call("write", { path: "new.txt" }, { content: "x" }, undefined, cancelled.signal)).toMatchObject({ kind: "cancelled" });
    expect(readdirSync(directory)).toEqual([]);
    writeFileSync(join(directory, "text.txt"), "initial");
    vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error("I/O failure"), { code: "EIO" }));
    expect(await call("write", { path: "text.txt" }, { content: "ours" })).toMatchObject({ kind: "unknown", message: expect.stringContaining("Read the target") });
    expect(readdirSync(directory)).toEqual(["text.txt"]);
  });
});
