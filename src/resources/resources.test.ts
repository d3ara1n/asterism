import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createModules } from "../modules/runtime.ts";
import { Directory } from "../modules/filesystem/contract.ts";
import { defineData } from "../shared/presentation.ts";
import { defineImplementation, defineTool } from "../shared/module-contract.ts";
import { implement } from "../tools/contract.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { AgentCapabilities, agentToolPolicy } from "../execution/capabilities.ts";
import { executeWeftBatch, weftDeclarations } from "../execution/weft.ts";
import { ObjectStore } from "../runtime/storage.ts";
import type { Json, ToolOutcome } from "../shared/model.ts";
import type { FoldedObject } from "../session/fold.ts";

const roots: string[] = [];
const signal = new AbortController().signal;
const unrestricted = { tools: null, excludeTools: null };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const base = mkdtempSync(join(tmpdir(), "weft-res-")); roots.push(base);
  const root = join(base, "root");
  const outside = join(base, "outside");
  mkdirSync(root); mkdirSync(outside);
  mkdirSync(join(root, "subdir"));
  writeFileSync(join(root, "a.txt"), "hello"); writeFileSync(join(outside, "secret.txt"), "secret");
  const objects = new ObjectStore(join(base, "objects"));
  const resource: FoldedObject = { id: "d1", kind: "directory", title: "root", data: { path: root } };
  const note: FoldedObject = { id: "n1", kind: "note", title: "Note", data: {} };
  const { resources, tools } = createModules({ objects, state: null as never, sessions: null as never, configuration: null as never });
  const scope = (linked: readonly FoldedObject[] = [resource], policy: Parameters<typeof agentToolPolicy>[0] = unrestricted) =>
    new AgentCapabilities(resources, tools, linked, agentToolPolicy(policy));
  return { root, outside, resource, note, resources, tools, scope };
}
async function invoke(capabilities: AgentCapabilities, name: string, args: Json): Promise<ToolOutcome> {
  const results: ToolOutcome[] = [];
  await executeWeftBatch([{ callId: "call", name, arguments: args }], capabilities, signal, (_call, outcome) => results.push(outcome));
  expect(results).toHaveLength(1);
  return results[0]!;
}

describe("工具与资源的匹配及授权", () => {
  it("目录列举限制在根内：拒绝 ..、绝对路径与指向外部的符号链接", async () => {
    const { root, outside, resource, scope } = setup();
    symlinkSync(outside, join(root, "link"));
    const list = (path: string) => invoke(scope(), "resource_call", { resource_id: resource.id, tool: "list", target: { path }, args: {} });
    expect(await list("subdir")).toMatchObject({ kind: "succeeded", model: { entries: [] } });
    for (const path of ["../outside", "../missing", "link"])
      expect(await list(path)).toMatchObject({ kind: "rejected", error: { code: "outside_resource" } });
    expect(await list(outside)).toMatchObject({ kind: "rejected", error: { code: "absolute_path" } });
  });

  it("resource_call 只作用于已链接资源，参数不合 schema 时指向 inspect 契约", async () => {
    const { scope } = setup();
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", args: {} })).toMatchObject({ kind: "succeeded" });
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: { path: 42 }, args: {} })).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    expect(await invoke(scope([]), "resource_call", { resource_id: "d1", tool: "list", args: {} })).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
  });

  it("字符串化的 target 和 args 同时报出类型错误，按提示修正后即可执行", async () => {
    const { scope } = setup();
    const capabilities = scope();
    const call = (target: Json, args: Json) => invoke(capabilities, "resource_call", { resource_id: "d1", tool: "list", target, args });
    const outcome = await call('{"path":"."}', "{}");
    expect(outcome).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    if (outcome.kind !== "rejected") throw new Error("Expected schema rejection");
    expect(outcome.error.message).toMatch(/target: [^\n]*expected null, received string/);
    expect(outcome.error.message).toMatch(/target: [^\n]*expected object, received string/);
    expect(outcome.error.message).toMatch(/args: [^\n]*expected object, received string/);
    expect(outcome.error.message).toContain("not JSON-encoded strings");
    expect(await call({ path: "." }, {})).toMatchObject({ kind: "succeeded" });
    expect(await call("null", {})).toMatchObject({ kind: "rejected" });
    expect(await call(null, {})).toMatchObject({ kind: "succeeded" });
  });

  it("校验错误保留嵌套字段与多余键，一级入口也返回具体原因", async () => {
    const { scope } = setup();
    const result = await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: { path: 42, extra: true }, args: {} });
    expect(result).toMatchObject({ kind: "rejected", error: { message: expect.stringMatching(/target\.path: [^\n]*expected string, received number/) } });
    expect(result).toMatchObject({ error: { message: expect.stringContaining('Unrecognized key: "extra"') } });
    expect(await invoke(scope(), "resource_inspect", { resource_id: 42 })).toMatchObject({
      kind: "rejected", error: { message: expect.stringMatching(/resource_inspect\.resource_id: [^\n]*expected string, received number/) },
    });
  });

  it("目录错误区分目标缺失、类型、无效路径和符号链接解析失败，并提供下一步", async () => {
    const { root, scope } = setup();
    symlinkSync("loop", join(root, "loop"));
    for (const [tool, path, code, hint] of [
      ["list", "missing", "path_not_found", "Use list"],
      ["list", "a.txt", "not_directory", "correct target.path"],
      ["list", "a.txt/child", "not_directory", "correct target.path"],
      ["list", "loop", "symlink_loop", "repair the link"],
      ["list", "bad\0path", "invalid_path", "NUL"],
    ]) {
      expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: tool!, target: { path: path! }, args: {} }))
        .toMatchObject({ error: { code, message: expect.stringContaining(hint!) } });
    }
    // 修正不存在的目标后，同一能力视图可直接重试。
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: { path: "subdir" }, args: {} }))
      .toMatchObject({ kind: "succeeded" });
    rmSync(root, { recursive: true });
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: null, args: {} }))
      .toMatchObject({ error: { code: "resource_not_found", message: expect.stringContaining("restore or relink") } });
    writeFileSync(root, "not a directory");
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: null, args: {} }))
      .toMatchObject({ error: { code: "resource_not_directory", message: expect.stringContaining("relink") } });
  });

  it("list 只支持目录；笔记与文件复用 read 契约但分别定义定位", async () => {
    const { resource, note, tools, scope } = setup();
    expect(tools.match(resource).some(tool => tool.tool.name === "list")).toBe(true);
    expect(tools.match(note).some(tool => tool.tool.name === "list")).toBe(false);
    const fileRead = tools.match(resource).find(tool => tool.tool.name === "read")!;
    const noteRead = tools.match(note).find(tool => tool.tool.name === "read")!;
    expect(fileRead.tool).toBe(noteRead.tool);
    expect(fileRead.targetSchema.safeParse({ path: "a.txt", offset: 1, limit: 1 }).success).toBe(true);
    expect(noteRead.targetSchema.safeParse(null).success).toBe(true);
    expect(noteRead.targetSchema.safeParse({ offset: 1 }).success).toBe(false);
    expect(await invoke(scope(), "resource_call", { resource_id: resource.id, tool: "read", target: { path: "a.txt" }, args: {} }))
      .toMatchObject({ kind: "succeeded", data: { rows: [{ line: 1, content: "hello" }] } });
    expect(await invoke(scope([note]), "resource_call", { resource_id: note.id, tool: "list", args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
  });

  it("inspect 返回实时状态：目录被删后 exists 为 false；AGENTS.md 每次读取当前内容", async () => {
    const { root, resource, resources, scope } = setup();
    const capabilities = scope();
    expect(await resources.context([resource])).toEqual([]);
    writeFileSync(join(root, "AGENTS.md"), "v1");
    expect((await resources.context([resource]))[0]?.text).toBe("v1");
    writeFileSync(join(root, "AGENTS.md"), "v2");
    expect((await resources.context([resource]))[0]?.text).toBe("v2");
    rmSync(root, { recursive: true });
    expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id })).toMatchObject({ kind: "succeeded", model: { state: { exists: false } } });
  });

  it("允许根内以双点开头的目录，环境文件也拒绝越界符号链接", async () => {
    const { root, outside, resource, resources, scope } = setup();
    mkdirSync(join(root, "..notes"));
    expect(await invoke(scope(), "resource_call", { resource_id: resource.id, tool: "list", target: { path: "..notes" }, args: {} }))
      .toMatchObject({ kind: "succeeded", model: { entries: [] } });
    symlinkSync(join(outside, "secret.txt"), join(root, "AGENTS.md"));
    expect(await resources.context([resource])).toEqual([]);
  });

  it.each(["read", "write"] as const)("独立的 %s 工具抛错按自身副作用分类", async effect => {
    const { resource, resources } = setup();
    const contract = defineImplementation({
      ...defineData("test.broken", 1, z.null().describe("No result.")), resource: Directory,
      tool: defineTool({ name: "broken", description: "Fails.", guidelines: [], argsSchema: z.strictObject({}).describe("No parameters.") }),
      targetSchema: z.null().describe("Select the whole resource."), effect, execution: "parallel",
    });
    const tools = new ToolRegistry([implement(contract, {
      async call() { throw new Error("Synthetic failure"); },
    })]);
    const capabilities = new AgentCapabilities(resources, tools, [resource], () => true);
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "broken", args: {} }))
      .toMatchObject({ kind: effect === "read" ? "failed" : "unknown", implementation: { id: "test.broken", version: 1 } });
  });

  it("外部白名单不改变支持关系；摘要、inspect 和调用使用同一份筛选结果", async () => {
    const { resource, tools, scope } = setup();
    const capabilities = scope([resource], { tools: ["list"], excludeTools: null });
    const description = capabilities.describe(resource.id);
    expect(description).toHaveLength(1);
    expect((description as Json[])[0]).toMatchObject({
      name: "list", description: expect.stringContaining("List the entries"),
      guidelines: expect.arrayContaining([expect.stringContaining("truncation")]),
      args: { description: expect.stringContaining("empty object") },
      target: { description: expect.stringContaining("resource root") },
      result: { description: expect.stringContaining("directory listing"),
        properties: { truncated: { description: expect.stringContaining("incomplete") } } },
    });
    expect(tools.match(resource).some(tool => tool.tool.name === "read")).toBe(true);
    expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id }))
      .toMatchObject({ kind: "succeeded", model: { tools: description } });
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "list", args: {} }))
      .toMatchObject({ kind: "succeeded" });
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "read", args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
    expect(weftDeclarations().map(action => action.name)).toEqual(["resource_list", "resource_inspect", "resource_call"]);
    expect(weftDeclarations().find(action => action.name === "resource_call")?.description)
      .toContain("Follow the selected tool's guidelines");
  });

  it("外部策略可组合，资源与工具定义无需变更", async () => {
    const { resource, resources, tools } = setup();
    const agent = agentToolPolicy({ tools: ["list"], excludeTools: null });
    const capabilities = new AgentCapabilities(resources, tools, [resource], name => agent(name) && name !== "list");
    expect(capabilities.describe(resource.id)).toEqual([]);
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "list", args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
  });

  it("禁用所有工具时 Weft 列举与 inspect 仍可用；一级入口名字不授权实际工具", async () => {
    const { resource, scope } = setup();
    for (const tools of [[], ["resource_call"]]) {
      const capabilities = scope([resource], { tools, excludeTools: null });
      expect(await invoke(capabilities, "resource_list", {})).toMatchObject({ kind: "succeeded" });
      expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id })).toMatchObject({ kind: "succeeded", model: { tools: [] } });
      expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "list", args: {} }))
        .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
    }
  });

  it("请求内固定策略与资源身份，下一次请求才采用变更", async () => {
    const { resource, scope } = setup();
    const policy = { tools: ["list"], excludeTools: null };
    const capabilities = scope([resource], policy);
    policy.tools.length = 0;
    resource.data.path = "/no-longer-linked";
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "list", args: {} }))
      .toMatchObject({ kind: "succeeded" });
    expect(scope([resource], policy).describe(resource.id)).toEqual([]);
  });

  it("已选定实现但尚未执行就取消，仍保留实现身份", async () => {
    const { scope, resource } = setup();
    const controller = new AbortController();
    controller.abort();
    const results: ToolOutcome[] = [];
    await executeWeftBatch([{ callId: "cancelled", name: "resource_call",
      arguments: { resource_id: resource.id, tool: "list", args: {} } }],
    scope(), controller.signal, (_call, result) => results.push(result));
    expect(results).toMatchObject([{
      kind: "cancelled", message: "The operation was not started.", implementation: { id: "weft.directory.list", version: 1 },
      data: null, model: { kind: "cancelled", data: null, message: "The operation was not started." },
    }]);
    expect(results[0]).not.toHaveProperty("startedAt");
  });

  it.each(["parallel", "sequential"] as const)("resource_call 按实际工具的 %s 策略调度", async execution => {
    const { resource, resources } = setup();
    const order: string[] = [];
    const contract = defineImplementation({
      ...defineData("test.work", 1, z.string().describe("The completed work ID.")), resource: Directory,
      tool: defineTool({ name: "work", description: "Work.", guidelines: [], argsSchema: z.strictObject({ id: z.string() }).describe("Identify the work.") }),
      targetSchema: z.null().describe("Select the whole resource."), effect: "read", execution,
    });
    const tools = new ToolRegistry([implement(contract, {
      async call(_state, _target, { id }) {
        order.push(`start:${id}`);
        await Promise.resolve();
        order.push(`end:${id}`);
        return { kind: "succeeded", data: id };
      },
    })]);
    const capabilities = new AgentCapabilities(resources, tools, [resource], () => true);
    const results: ToolOutcome[] = [];
    await executeWeftBatch(["a", "b"].map(id => ({ callId: id, name: "resource_call",
      arguments: { resource_id: resource.id, tool: "work", args: { id } } })), capabilities, signal, (_call, outcome) => results.push(outcome));
    expect(results.map(result => result.kind)).toEqual(["succeeded", "succeeded"]);
    expect(order).toEqual(execution === "parallel" ? ["start:a", "start:b", "end:a", "end:b"] : ["start:a", "end:a", "start:b", "end:b"]);
  });
});
