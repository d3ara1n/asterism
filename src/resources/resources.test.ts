import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as runtimeModules from "../runtime/builtin.ts";
import { ApplicationService } from "../runtime/service.ts";
import { Directory } from "../../packages/builtin/src/filesystem/contract.ts";
import { defineData, defineImplementation, defineTool } from "@atelier/sdk/contracts";
import { implement } from "../tools/testing.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { AgentCapabilities, agentToolPolicy } from "../execution/capabilities.ts";
import { executeCoreBatch, coreDeclarations } from "../execution/core.ts";
import type { Json, ToolOutcome } from "../shared/model.ts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";

const roots: string[] = [];
const services: ApplicationService[] = [];
const signal = new AbortController().signal;
const unrestricted = { tools: null, excludeTools: null };
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const base = mkdtempSync(join(tmpdir(), "core-res-")); roots.push(base);
  const root = join(base, "root");
  const outside = join(base, "outside");
  mkdirSync(root); mkdirSync(outside);
  mkdirSync(join(root, "subdir"));
  writeFileSync(join(root, "a.txt"), "hello"); writeFileSync(join(outside, "secret.txt"), "secret");
  const resource: FoldedObject = { id: "d1", kind: "atelier.builtin/directory", title: "root", data: { path: root } };
  const note: FoldedObject = { id: "n1", kind: "atelier.builtin/note", title: "Note", data: {} };
  let modules!: ReturnType<typeof runtimeModules.createModules>;
  const createModules = runtimeModules.createModules;
  const capture = vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
    modules = createModules(...args); return modules;
  });
  const service = new ApplicationService(join(base, "host")); services.push(service);
  capture.mockRestore();
  const sessionId = service.sessions.tree.create("Resources");
  for (const object of [resource, note]) service.sessions.tree.appendToTimeline(sessionId, {
    contract: "resource_created", source: null, recipient: null, model: null,
    data: { ...object.data, id: object.id, type: object.kind, title: object.title },
  });
  const { resources, tools } = modules;
  const scope = (linked: readonly FoldedObject[] = [resource], policy: Parameters<typeof agentToolPolicy>[0] = unrestricted) =>
    new AgentCapabilities(resources, tools, linked, agentToolPolicy(policy));
  return { root, outside, resource, note, resources, tools, scope, service, sessionId };
}
/** 成功结果的模型投影是一次序列化的 JSON 文本；断言时解析回结构，非成功结局保留文字。 */
const decode = (text: string): Json => { try { return JSON.parse(text) as Json; } catch { return text; } };
type Decoded = ToolOutcome extends infer O ? O extends ToolOutcome ? Omit<O, "model"> & { model: Json } : never : never;
async function invoke(capabilities: AgentCapabilities, name: string, args: Json): Promise<Decoded> {
  const results: ToolOutcome[] = [];
  await executeCoreBatch([{ callId: "call", name, arguments: args }], capabilities, signal, (_call, outcome) => results.push(outcome));
  expect(results).toHaveLength(1);
  const outcome = results[0]!;
  const text = outcome.model.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
  return { ...outcome, model: decode(text) } as Decoded;
}

describe("工具与资源的匹配及授权", () => {
  it("请求捕获的目录和笔记在期间移除后仍能检查和写入，后续请求撤销访问", async () => {
    const { service, sessionId, resource, scope } = setup();
    await service.sessions.execute({ type: "resource.create", sessionId, kind: "atelier.builtin/note", creation: { id: "atelier.builtin/note.create" },
      input: { title: "Captured note", content: "before" }, position: { x: 0, y: 0 } });
    const note = foldWorkbench(service.sessions.tree.timeline(sessionId)).objects.find(object => object.title === "Captured note")!;
    const captured = scope([resource, note]);
    for (const object of [resource, note]) await service.sessions.execute({ type: "object.remove", sessionId, objectId: object.id });
    expect(await invoke(captured, "resource_inspect", { resource_id: resource.id })).toMatchObject({
      kind: "succeeded", data: { state: { title: "root", exists: true } },
    });
    expect(await invoke(captured, "resource_inspect", { resource_id: note.id })).toMatchObject({
      kind: "succeeded", data: { state: { title: "Captured note", available: true } },
    });
    expect(await invoke(captured, "resource_call", { resource_id: note.id, tool: "write", args: { content: "after" } }))
      .toMatchObject({ kind: "succeeded", data: { changed: true } });
    expect(await invoke(captured, "resource_call", { resource_id: note.id, tool: "read", args: { anchored: false } }))
      .toMatchObject({ kind: "succeeded", data: { rows: [{ content: "after" }] } });
    expect(await invoke(scope([]), "resource_call", { resource_id: note.id, tool: "read", args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
  });

  it("resource_call 只作用于已链接资源，参数不合 schema 时指向 inspect 契约", async () => {
    const { scope } = setup();
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", args: {} })).toMatchObject({ kind: "succeeded" });
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: { path: 42 }, args: {} })).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    expect(await invoke(scope([]), "resource_call", { resource_id: "d1", tool: "list", args: {} })).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: '{"path":"."}', args: "{}" }))
      .toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
  });


  it("校验错误保留字段定位，一级入口和资源实现都拒绝错误参数", async () => {
    const { scope } = setup();
    expect(await invoke(scope(), "resource_call", { resource_id: "d1", tool: "list", target: { path: 42, extra: true }, args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "invalid_arguments", message: expect.stringContaining("target.path") } });
    expect(await invoke(scope(), "resource_inspect", { resource_id: 42 })).toMatchObject({
      kind: "rejected", error: { code: "invalid_arguments", message: expect.stringContaining("resource_id") },
    });
  });

  it("list 拒绝普通文件和非目录父路径，修正目标后同一能力目录可重试", async () => {
    const { scope } = setup(), capabilities = scope();
    for (const path of ["a.txt", "a.txt/child"]) expect(await invoke(capabilities, "resource_call", { resource_id: "d1", tool: "list", target: { path }, args: {} }))
      .toMatchObject({ kind: "failed", error: { code: "not_directory" } });
    expect(await invoke(capabilities, "resource_call", { resource_id: "d1", tool: "list", target: { path: "subdir" }, args: {} })).toMatchObject({ kind: "succeeded" });
  });

  it("list 只匹配目录支持关系，笔记调用返回工具不可用", async () => {
    const { resource, note, tools, scope } = setup();
    expect(tools.match(resource).some(tool => tool.tool.name === "list")).toBe(true);
    expect(tools.match(note).some(tool => tool.tool.name === "list")).toBe(false);
    expect(await invoke(scope([note]), "resource_call", { resource_id: note.id, tool: "list", args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
  });

  it("inspect 使用当前外部状态，目录删除后明确不存在", async () => {
    const { root, resource, scope } = setup(), capabilities = scope();
    expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id })).toMatchObject({
      kind: "succeeded", model: { state: { exists: true } },
    });
    rmSync(root, { recursive: true });
    expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id })).toMatchObject({ kind: "succeeded", model: { state: { exists: false } } });
  });

  it("请求环境每次读取当前 AGENTS.md 正文，不缓存旧内容", async () => {
    const { root, resource, resources } = setup();
    expect(await resources.context([resource])).toEqual([]);
    writeFileSync(join(root, "AGENTS.md"), "v1"); expect((await resources.context([resource]))[0]?.text).toBe("v1");
    writeFileSync(join(root, "AGENTS.md"), "v2"); expect((await resources.context([resource]))[0]?.text).toBe("v2");
  });



  it("外部白名单不改变支持关系；摘要、inspect 和调用使用同一份筛选结果", async () => {
    const { resource, resources, tools, scope } = setup();
    const capabilities = scope([resource], { tools: ["list"], excludeTools: null });
    const description = capabilities.describe(resource.id);
    expect(description).toHaveLength(1);
    expect((description as { name: string }[]).map(tool => tool.name)).toEqual(["list"]);
    expect(tools.match(resource).some(tool => tool.tool.name === "read")).toBe(true);
    expect(await invoke(capabilities, "resource_inspect", { resource_id: resource.id }))
      .toMatchObject({ kind: "succeeded", model: { tools: description } });
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "list", args: {} }))
      .toMatchObject({ kind: "succeeded" });
    expect(await invoke(capabilities, "resource_call", { resource_id: resource.id, tool: "read", args: {} }))
      .toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
    const allowed = agentToolPolicy({ tools: ["list"], excludeTools: null }), excluded = new Set(["list"]);
    const combined = new AgentCapabilities(resources, tools, [resource], name => allowed(name) && !excluded.has(name));
    expect(combined.describe(resource.id)).toEqual([]);
    expect(await invoke(combined, "resource_call", { resource_id: resource.id, tool: "list", args: {} })).toMatchObject({ kind: "rejected", error: { code: "tool_unavailable" } });
  });


  it("禁用所有工具时宿主列举与 inspect 仍可用；一级入口名字不授权实际工具", async () => {
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
    await executeCoreBatch([{ callId: "cancelled", name: "resource_call",
      arguments: { resource_id: resource.id, tool: "list", args: {} } }],
    scope(), controller.signal, (_call, result) => results.push(result));
    expect(results).toMatchObject([{
      kind: "cancelled", implementation: { id: "atelier.builtin/directory.list" }, data: null,
    }]);
    expect(results[0]).not.toHaveProperty("startedAt");
  });

  it.each(["parallel", "sequential"] as const)("resource_call 按实际工具的 %s 策略调度", async execution => {
    const { resource, resources } = setup();
    const order: string[] = [];
    const contract = defineImplementation({
      ...defineData("test.work", z.string().describe("The completed work ID.")), resource: Directory,
      tool: defineTool({ id: "test.tools/work", name: "work", description: "Work.", guidelines: [], argsSchema: z.strictObject({ id: z.string() }).describe("Identify the work.") }),
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
    await executeCoreBatch(["a", "b"].map(id => ({ callId: id, name: "resource_call",
      arguments: { resource_id: resource.id, tool: "work", args: { id } } })), capabilities, signal, (_call, outcome) => results.push(outcome));
    expect(results.map(result => result.kind)).toEqual(["succeeded", "succeeded"]);
    expect(order).toEqual(execution === "parallel" ? ["start:a", "start:b", "end:a", "end:b"] : ["start:a", "end:a", "start:b", "end:b"]);
  });
});
