import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, chmodSync, statSync } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as runtimeModules from "../../../../src/runtime/builtin.ts";
import { ApplicationService } from "../../../../src/runtime/service.ts";
import { AgentCapabilities } from "../../../../src/execution/capabilities.ts";
import { executeCoreBatch } from "../../../../src/execution/core.ts";
import type { Json, ToolOutcome } from "../../../../src/shared/model.ts";
import { textReadSchema } from "../shared/text-contract.ts";
import { readTextFile, commitTextFile } from "./text-io.ts";
import { writableTarget } from "./paths.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const roots: string[] = [];
const services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "builtin-text-")); roots.push(root);
  const directory = join(root, "directory"), outside = join(root, "outside");
  mkdirSync(directory); mkdirSync(outside);
  const resource = { id: "directory", kind: "atelier.builtin/directory", title: "Directory", data: { path: directory } };
  let modules!: ReturnType<typeof runtimeModules.createModules>;
  const createModules = runtimeModules.createModules;
  const capture = vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
    modules = createModules(...args); return modules;
  });
  const service = new ApplicationService(join(root, "host")); services.push(service);
  capture.mockRestore();
  const sessionId = service.sessions.tree.create("Files");
  for (const object of [resource, { ...resource, id: "other", title: "Other resource" }]) service.sessions.tree.appendToTimeline(sessionId, {
    contract: "resource_created", source: null, recipient: null, model: null,
    data: { ...object.data, id: object.id, type: object.kind, title: object.title },
  });
  const caller = { ref: { sessionId, id: resource.id, kind: resource.kind }, title: resource.title };
  const capabilities = new AgentCapabilities(modules.resources, modules.tools, [resource], () => true, caller);
  const call = async (tool: string, target: Json, args: Json = {}, cap = capabilities, signal = new AbortController().signal, resourceId = resource.id) => {
    const results: ToolOutcome[] = [];
    await executeCoreBatch([{ callId: "call", name: "resource_call", arguments: { resource_id: resourceId, tool, target, args } }], cap, signal, (_call, outcome) => results.push(outcome));
    return results[0];
  };
  return { root, directory, outside, resource, modules, call, caller };
}

// 在真实临时目录和执行边界验证授权、批次失败与原子写入，避免影响用户文件。
describe("目录正文工具", () => {
  it("文件 read 将 target 范围交给正文读取，模型与数据来自同一次读取", async () => {
    const { directory, call } = setup();
    writeFileSync(join(directory, "text.txt"), "a\nb\nc");
    const result = await call("read", { path: "text.txt", offset: 2, limit: 1 });
    expect(result).toMatchObject({ kind: "succeeded", data: { path: "text.txt", fromLine: 2, rows: [{ line: 2, content: "b" }], nextOffset: 3 } });
    expect(result.model.some(part => part.kind === "text" && part.text.includes("b"))).toBe(true);
  });

  it("整批编辑失败不落盘；成功落盘保留权限且不留下暂存文件", async () => {
    const { directory, call } = setup(), file = join(directory, "text.txt");
    writeFileSync(file, "a\nb\nc"); chmodSync(file, 0o755);
    const read = textReadSchema.strip().parse((await call("read", { path: "text.txt" })).data);
    const anchor = (i: number) => ({ line: read.rows[i].line, hash: read.rows[i].hash! });
    expect(await call("edit", { path: "text.txt" }, { edits: [
      { op: "replace", anchor: anchor(0), body: ["A"] }, { op: "replace", anchor: { line: 2, hash: "0000" }, body: ["B"] },
    ] })).toMatchObject({ kind: "rejected", error: { code: "anchor_mismatch" } });
    expect(readFileSync(file, "utf8")).toBe("a\nb\nc");
    expect(await call("edit", { path: "text.txt" }, { edits: [{ op: "replace", anchor: anchor(1), body: ["B"] }] })).toMatchObject({ kind: "succeeded" });
    expect(readFileSync(file, "utf8")).toBe("a\nB\nc");
    expect(statSync(file).mode & 0o777).toBe(0o755);
    expect(readdirSync(directory)).toEqual(["text.txt"]);
  });

  it("write 创建父目录与空文件，覆盖和清空实际文件", async () => {
    const { directory, call } = setup(), file = join(directory, "nested/text.txt");
    expect(await call("write", { path: "nested/text.txt" }, { content: "" })).toMatchObject({ kind: "succeeded", data: { created: true } });
    expect(readFileSync(file, "utf8")).toBe("");
    expect(await call("write", { path: "nested/text.txt" }, { content: "正文" })).toMatchObject({ kind: "succeeded", data: { created: false } });
    expect(readFileSync(file, "utf8")).toBe("正文");
    expect(await call("write", { path: "nested/text.txt" }, { content: "" })).toMatchObject({ kind: "succeeded" });
    expect(readFileSync(file, "utf8")).toBe("");
  });

  it("文件 I/O 拒绝二进制与目录，内部链接写入作用于真实文件", async () => {
    const { directory, call } = setup();
    const file = join(directory, "inside.txt");
    writeFileSync(file, "inside"); symlinkSync(file, join(directory, "alias.txt"));
    expect(await call("write", { path: "alias.txt" }, { content: "updated" })).toMatchObject({ kind: "succeeded" });
    expect(readFileSync(file, "utf8")).toBe("updated");
    writeFileSync(join(directory, "binary"), Buffer.from([0xff, 0x00]));
    for (const tool of ["read", "write"]) expect(await call(tool, { path: "binary" }, tool === "write" ? { content: "x" } : {}))
      .toMatchObject({ kind: "rejected", error: { code: "unsupported_text" } });
    expect(await call("read", { path: "." })).toMatchObject({ kind: "failed", error: { code: "not_file" } });
  });

  it("see 按文件头识别图片并以文件部件交给模型；非图片拒绝，不按扩展名判断", async () => {
    const { directory, call } = setup();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=", "base64");
    writeFileSync(join(directory, "shot.dat"), png);
    writeFileSync(join(directory, "fake.png"), "not an image");
    const seen = await call("see", { path: "shot.dat" });
    expect(seen).toMatchObject({ kind: "succeeded", data: { path: "shot.dat", mediaType: "image/png", size: png.length } });
    expect(seen!.model).toMatchObject([{ kind: "text" }, { kind: "file", mediaType: "image/png", filename: "shot.dat" }]);
    expect(await call("see", { path: "fake.png" })).toMatchObject({ kind: "rejected", error: { code: "unsupported_image" } });
  });


  // 原生正文工具采用后写为准；已有目标和新建目标都通过 rename 提交。
  it("准备后的外部写入可被覆盖，新建同样原子替换目标", async () => {
    const { directory, call } = setup();
    const signal = new AbortController().signal;
    const file = join(directory, "text.txt");
    writeFileSync(file, "initial");
    const selected = await writableTarget(directory, "text.txt");
    const before = await readTextFile(selected.path, signal);
    writeFileSync(file, "external");
    await commitTextFile(selected, before, "ours", signal);
    expect(readFileSync(file, "utf8")).toBe("ours");
    expect(readdirSync(directory)).toEqual(["text.txt"]);
    const actual = await vi.importActual<typeof fs>("node:fs/promises");
    vi.mocked(fs.rename).mockImplementationOnce(async (source, target) => {
      writeFileSync(target, "external");
      await actual.rename(source, target);
    });
    expect(await call("write", { path: "new.txt" }, { content: "ours" })).toMatchObject({
      kind: "succeeded",
    });
    expect(readFileSync(join(directory, "new.txt"), "utf8")).toBe("ours");
    expect(readdirSync(directory).sort()).toEqual(["new.txt", "text.txt"]);
  });

  it("最终替换无法确认时返回 unknown 并清理暂存", async () => {
    const { directory, call } = setup();
    writeFileSync(join(directory, "text.txt"), "initial");
    vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error("I/O failure"), { code: "EIO" }));
    expect(await call("write", { path: "text.txt" }, { content: "ours" })).toMatchObject({ kind: "unknown" });
    expect(readdirSync(directory)).toEqual(["text.txt"]);
  });
});
