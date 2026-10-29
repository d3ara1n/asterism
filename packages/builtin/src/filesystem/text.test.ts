import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, chmodSync, statSync } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as runtimeModules from "../../../../src/plugins/loader.ts";
import { BuiltinApplicationService as ApplicationService } from "../testing.ts";
import { AgentCapabilities } from "../../../../src/execution/capabilities.ts";
import { executeCoreBatch } from "../../../../src/execution/core.ts";
import type { Json, ToolOutcome } from "../../../../src/shared/model.ts";
import { textReadSchema } from "@asterism-app/builtin-api/contracts";
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
  const resource = { id: "directory", kind: "asterism.builtin/directory", title: "Directory", data: { path: directory } };
  let modules!: ReturnType<typeof runtimeModules.loadPlugins>;
  const createModules = runtimeModules.loadPlugins;
  const capture = vi.spyOn(runtimeModules, "loadPlugins").mockImplementation((...args) => {
    modules = createModules(...args); return modules;
  });
  const service = new ApplicationService(join(root, "host")); services.push(service);
  capture.mockRestore();
  const sessionId = service.sessions.tree.create("Files");
  for (const object of [resource, { ...resource, id: "other", title: "Other resource" }]) service.sessions.tree.appendToTimeline(sessionId, {
    contract: "resource_created", source: null, recipient: null, model: null,
    data: { id: object.id, type: object.kind, title: object.title, data: object.data },
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

// Verify authorization, batch failure, and atomic writes in real temporary directories at the execution boundary, avoiding user files.
describe("Directory text tools", () => {
  it("File read passes the target range to text reading, with model content and data coming from the same read", async () => {
    const { directory, call } = setup();
    writeFileSync(join(directory, "text.txt"), "a\nb\nc");
    const result = await call("read", { path: "text.txt", offset: 2, limit: 1 });
    expect(result).toMatchObject({ kind: "succeeded", data: { path: "text.txt", fromLine: 2, rows: [{ line: 2, content: "b" }], nextOffset: 3 } });
    expect(result.model.some(part => part.kind === "text" && part.text.includes("b"))).toBe(true);
  });

  it("Failed edit batches write nothing; successful writes preserve permissions and leave no staging files", async () => {
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

  it("write creates parent directories and empty files, and overwrites or empties actual files", async () => {
    const { directory, call } = setup(), file = join(directory, "nested/text.txt");
    expect(await call("write", { path: "nested/text.txt" }, { content: "" })).toMatchObject({ kind: "succeeded", data: { created: true } });
    expect(readFileSync(file, "utf8")).toBe("");
    expect(await call("write", { path: "nested/text.txt" }, { content: "正文" })).toMatchObject({ kind: "succeeded", data: { created: false } });
    expect(readFileSync(file, "utf8")).toBe("正文");
    expect(await call("write", { path: "nested/text.txt" }, { content: "" })).toMatchObject({ kind: "succeeded" });
    expect(readFileSync(file, "utf8")).toBe("");
  });

  it("File I/O rejects binary data and directories, and writes through internal links affect the real file", async () => {
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

  it("see identifies images by file headers and delivers file parts to the model; nonimages are rejected without relying on extensions", async () => {
    const { directory, call } = setup();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=", "base64");
    writeFileSync(join(directory, "shot.dat"), png);
    writeFileSync(join(directory, "fake.png"), "not an image");
    const seen = await call("see", { path: "shot.dat" });
    expect(seen).toMatchObject({ kind: "succeeded", data: { path: "shot.dat", mediaType: "image/png", size: png.length } });
    expect(seen!.model).toMatchObject([{ kind: "text" }, { kind: "file", mediaType: "image/png", filename: "shot.dat" }]);
    expect(await call("see", { path: "fake.png" })).toMatchObject({ kind: "rejected", error: { code: "unsupported_image" } });
  });


  // Native text tools use later-write-wins semantics: this commit overwrites external writes made after the read.
  it("Overwrites external writes made after preparation", async () => {
    const { directory } = setup();
    const signal = new AbortController().signal;
    const file = join(directory, "text.txt");
    writeFileSync(file, "initial");
    const selected = await writableTarget(directory, "text.txt");
    const before = await readTextFile(selected.path, signal);
    writeFileSync(file, "external");
    await commitTextFile(selected.path, before, "ours", signal);
    expect(readFileSync(file, "utf8")).toBe("ours");
    expect(readdirSync(directory)).toEqual(["text.txt"]);
  });

  // Atomic replacement with rename: failure preserves the target's original content and has a known failure outcome.
  it("Replacement failure preserves the target and cleans up staging", async () => {
    const { directory, call } = setup();
    writeFileSync(join(directory, "text.txt"), "initial");
    vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error("I/O failure"), { code: "EIO" }));
    expect(await call("write", { path: "text.txt" }, { content: "ours" })).toMatchObject({ kind: "failed" });
    expect(readFileSync(join(directory, "text.txt"), "utf8")).toBe("initial");
    expect(readdirSync(directory)).toEqual(["text.txt"]);
  });
});
