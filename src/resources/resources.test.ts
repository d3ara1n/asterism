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
  writeFileSync(join(root, "a.txt"), "hello"); writeFileSync(join(outside, "secret.txt"), "secret");
  const objects = new ObjectStore(join(base, "objects"));
  const resource: FoldedObject = { id: "d1", kind: "directory", title: "root", data: { path: root } };
  const note: FoldedObject = { id: "n1", kind: "note", title: "Note", data: { contentRef: objects.put("note text") } };
  const { resources, tools } = createModules({ objects });
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
  it("目录读取限制在根内：拒绝 ..、绝对路径与指向外部的符号链接", async () => {
    const { root, outside, resource, scope } = setup();
    symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"));
    const read = (path: string) => invoke(scope(), "resource_call", { resource_id: resource.id, tool: "read", target: { path }, args: {} });
    expect(await read("a.txt")).toMatchObject({ kind: "succeeded", model: { text: "hello" } });
    for (const path of ["../outside/secret.txt", join(outside, "secret.txt"), "link.txt"])
      expect(await read(path)).toMatchObject({ kind: "rejected", error: { code: "outside_resource" } });
  });

  it("resource_call 只作用于已链接资源，参数不合 schema 时指向 inspect 契约", async () => {
    const { scope } = setup();
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "read", target: { path: "a.txt" }, args: {} })).toMatchObject({ kind: "succeeded" });
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "read", args: {} })).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    expect(await invoke(scope([]), "resource_call", { resource_id: "d1", tool: "read", target: { path: "a.txt" }, args: {} })).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
  });

  it("一个 read 定义匹配两类资源；链接任何支持的资源即可激活，list 只匹配目录", async () => {
    const { resource, note, tools, scope } = setup();
    expect(tools.match(resource).map(tool => tool.tool.name)).toEqual(["list", "read"]);
    expect(tools.match(note).map(tool => tool.tool.name)).toEqual(["read"]);
    expect(tools.match({ id: "a", kind: "agent", title: "A", data: {} })).toEqual([]);
    expect(await invoke(scope([note]), "resource_call", { resource_id: note.id, tool: "read", args: {} }))
      .toMatchObject({ kind: "succeeded", model: { text: "note text" } });
    expect(await invoke(scope(), "resource_call", { resource_id: resource.id, tool: "read", target: { path: "a.txt" }, args: {} }))
      .toMatchObject({ kind: "succeeded", model: { text: "hello" } });
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

  it("允许根内以双点开头的文件，环境文件也拒绝越界符号链接", async () => {
    const { root, outside, resource, resources, scope } = setup();
    writeFileSync(join(root, "..notes"), "inside");
    expect(await invoke(scope(), "resource_call", { resource_id: resource.id, tool: "read", target: { path: "..notes" }, args: {} }))
      .toMatchObject({ kind: "succeeded", model: { text: "inside" } });
    symlinkSync(join(outside, "secret.txt"), join(root, "AGENTS.md"));
    expect(await resources.context([resource])).toEqual([]);
  });

  it.each(["read", "write"] as const)("独立的 %s 工具抛错按自身副作用分类", async effect => {
    const { resource, resources } = setup();
    const contract = defineImplementation({
      ...defineData("test.broken", 1, z.null()), resource: Directory,
      tool: defineTool("broken", z.strictObject({})), targetSchema: z.null(),
      description: "Fails.", effect, execution: "parallel",
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
    const capabilities = scope([resource], { tools: ["read"], excludeTools: null });
    const description = capabilities.describe(resource.id);
    expect(description).toEqual([expect.objectContaining({ name: "read" })]);
    expect(tools.match(resource).map(tool => tool.tool.name)).toEqual(["list", "read"]);
    expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id }))
      .toMatchObject({ kind: "succeeded", model: { tools: description } });
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "read", target: { path: "a.txt" }, args: {} }))
      .toMatchObject({ kind: "succeeded" });
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "list", args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
    expect(weftDeclarations().map(action => action.name)).toEqual(["resource_list", "resource_inspect", "resource_call"]);
  });

  it("外部策略可组合，资源与工具定义无需变更", async () => {
    const { resource, resources, tools } = setup();
    const agent = agentToolPolicy({ tools: ["read", "list"], excludeTools: null });
    const capabilities = new AgentCapabilities(resources, tools, [resource], name => agent(name) && name !== "read");
    expect(capabilities.describe(resource.id)).toEqual([expect.objectContaining({ name: "list" })]);
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "read", target: { path: "a.txt" }, args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
  });

  it("禁用所有工具时 Weft 列举与 inspect 仍可用；一级入口名字不授权实际工具", async () => {
    const { resource, scope } = setup();
    for (const tools of [[], ["resource_call"]]) {
      const capabilities = scope([resource], { tools, excludeTools: null });
      expect(await invoke(capabilities, "resource_list", {})).toMatchObject({ kind: "succeeded" });
      expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id })).toMatchObject({ kind: "succeeded", model: { tools: [] } });
      expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "read", target: { path: "a.txt" }, args: {} }))
        .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
    }
  });

  it("请求内固定策略与资源身份，下一次请求才采用变更", async () => {
    const { resource, scope } = setup();
    const policy = { tools: ["read"], excludeTools: null };
    const capabilities = scope([resource], policy);
    policy.tools.length = 0;
    resource.data.path = "/no-longer-linked";
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "read", target: { path: "a.txt" }, args: {} }))
      .toMatchObject({ kind: "succeeded" });
    expect(scope([resource], policy).describe(resource.id)).toEqual([]);
  });

  it("已选定实现但尚未执行就取消，仍保留实现身份", async () => {
    const { scope, resource } = setup();
    const controller = new AbortController();
    controller.abort();
    const results: ToolOutcome[] = [];
    await executeWeftBatch([{ callId: "cancelled", name: "resource_call",
      arguments: { resource_id: resource.id, tool: "read", target: { path: "a.txt" }, args: {} } }],
    scope(), controller.signal, (_call, result) => results.push(result));
    expect(results).toEqual([{
      kind: "cancelled", message: "The operation was not started.", implementation: { id: "weft.directory.read", version: 1 },
    }]);
  });

  it.each(["parallel", "sequential"] as const)("resource_call 按实际工具的 %s 策略调度", async execution => {
    const { resource, resources } = setup();
    const order: string[] = [];
    const contract = defineImplementation({
      ...defineData("test.work", 1, z.string()), resource: Directory,
      tool: defineTool("work", z.strictObject({ id: z.string() })), targetSchema: z.null(),
      description: "Work.", effect: "read", execution,
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
