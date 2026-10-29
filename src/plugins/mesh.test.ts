import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pluginNamespace, type Json, type ResourceRef } from "@asterism-app/sdk/contracts";
import { definePlugin, type PluginContext, type SessionExecutor } from "@asterism-app/sdk/runtime";
import { AgentInputMessage, CreateAgent } from "@asterism-app/builtin-api/contracts";
import { agentServices } from "@asterism-app/builtin-api/runtime";
import { CreateMesh, CreateMeshChannel, MeshList, MeshGetProfile, MeshView, RenameMeshChannel, SelectMeshChannel } from "../../packages/builtin/src/mesh/contract.ts";
import { BuiltinApplicationService as ApplicationService, configureBuiltin } from "../../packages/builtin/src/testing.ts";
import * as runtimeModules from "./loader.ts";
import { AgentCapabilities } from "../execution/capabilities.ts";
import type { ModelAdapter } from "../model/contract.ts";

const roots: string[] = [], apps: ApplicationService[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function open(root = mkdtempSync(join(tmpdir(), "asterism-mesh-"))) {
  if (!roots.includes(root)) roots.push(root);
  let plugin!: PluginContext, modules!: ReturnType<typeof runtimeModules.loadPlugins>;
  const original = runtimeModules.loadPlugins;
  const capture = vi.spyOn(runtimeModules, "loadPlugins").mockImplementation((...args) => {
    modules = original(...args); return modules;
  });
  const adapter: ModelAdapter = { version: "test/1", validate() {}, prepare: () => ({
    async *stream() { yield { type: "finish", reason: "stop", usage: null }; },
  }) };
  const app = new ApplicationService(root, { adapterFactory: () => adapter, plugins: [
    definePlugin({ namespace: pluginNamespace("test.mesh"), setup(context) { plugin = context; return {}; } }),
  ] }); apps.push(app);
  capture.mockRestore();
  const session = (name: string) => plugin.session(app.sessions.tree.create(name));
  const agent = (session: SessionExecutor, title: string, type = "worker") =>
    session.create(CreateAgent, { title, selection: { agent: type, model: null, thinking: null } });
  const mesh = (session: SessionExecutor) => session.create(CreateMesh, {});
  const capabilities = (caller: ResourceRef) => {
    const state = app.sessions.tree.workbench(caller.sessionId);
    const linked = new Set(state.links.filter(link => link.receiverId === caller.id).map(link => link.resourceId));
    return new AgentCapabilities(modules.resources, modules.tools, state.objects.filter(object => linked.has(object.id)), () => true,
      { ref: { sessionId: caller.sessionId, id: caller.id, kind: caller.kind }, title: state.objects.find(object => object.id === caller.id)!.title });
  };
  const view = (ref: ResourceRef) => MeshView.schema.parse(
    app.sessions.current(ref.sessionId).workbench.objects.find(object => object.id === ref.id)!.presentation.data);
  return { root, app, plugin, session, agent, mesh, capabilities, view };
}
async function call(capabilities: AgentCapabilities, mesh: ResourceRef, name: string, target: Json = null, args: Json = {}) {
  const prepared = capabilities.resolve(mesh.id, name, target, args);
  return "execute" in prepared ? prepared.execute(new AbortController().signal) : prepared;
}
const list = async (capabilities: AgentCapabilities, mesh: ResourceRef) =>
  MeshList.schema.parse((await call(capabilities, mesh, "list")).data).agents;
const profile = async (capabilities: AgentCapabilities, mesh: ResourceRef, target: Json = null) =>
  MeshGetProfile.schema.parse((await call(capabilities, mesh, "get_profile", target)).data);

describe("Mesh resource routing", () => {
  it("discovers only exposed Agents across sessions and does not grant the reverse link", async () => {
    const f = open(), left = f.session("Left"), right = f.session("Right");
    const a = await f.agent(left, "Ada"), b = await f.agent(right, "Atlas", "explorer");
    const ma = await f.mesh(left), mb = await f.mesh(right);
    left.link(a, ma); right.link(mb, b);
    expect(await list(f.capabilities(a), ma)).toEqual([{ title: "Atlas", id: 0, type: "explorer", descriptions: [] }]);
    expect(await call(f.capabilities(b), mb, "list")).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(await profile(f.capabilities(a), ma)).toEqual({ title: "Ada", id: null, type: "worker", descriptions: [] });
    expect(f.view(ma).channels).toEqual([{ id: "default", title: "Default", agents: 1 }]);
  });

  it("keeps descriptions local to each Mesh while deduplicating multiple routes and reading current values", async () => {
    const f = open(), s = f.session("Profiles"), a = await f.agent(s, "Atlas");
    const first = await f.mesh(s), second = await f.mesh(s);
    for (const mesh of [first, second]) { s.link(a, mesh); s.link(mesh, a); }
    const captured = f.capabilities(a);
    await call(captured, first, "set_profile", null, { description: "Investigate login" });
    await call(captured, second, "set_profile", null, { description: "Implement messaging" });
    expect(await list(captured, first)).toEqual([
      { title: "Atlas", id: 0, type: "worker", descriptions: ["Investigate login", "Implement messaging"] },
    ]);
    expect((await profile(captured, first)).descriptions).toEqual(["Investigate login"]);
    expect((await profile(captured, second)).descriptions).toEqual(["Implement messaging"]);
    expect(await call(captured, first, "set_profile", { title: "Other" }, { description: "Spoof" }))
      .toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    await s.invoke(CreateMeshChannel, second, { title: "Implementation" });
    expect((await list(f.capabilities(a), first))[0]!.descriptions).toEqual(["Investigate login"]);
    expect((await list(f.capabilities(a), second))[0]!.descriptions).toEqual(["Implement messaging"]);
    expect(f.view(first).channels.map(channel => channel.agents)).toEqual([1, 1]);
  });

  it("keeps omitted IDs bound to zero after that Agent leaves and retains the survivor's ID across restart", async () => {
    const f = open(), s = f.session("Names");
    const caller = await f.agent(s, "Caller"), a = await f.agent(s, "Atlas"), b = await f.agent(s, "Atlas");
    const mesh = await f.mesh(s); s.link(caller, mesh); s.link(mesh, a); s.link(mesh, b);
    expect((await list(f.capabilities(caller), mesh)).map(agent => agent.id)).toEqual([0, 1]);
    s.unlink(mesh, a);
    await expect(profile(f.capabilities(caller), mesh, { title: "Atlas" })).rejects.toThrow("id 0");
    expect(await profile(f.capabilities(caller), mesh, { title: "Atlas", id: 1 })).toMatchObject({ id: 1 });
    await f.app.close(); apps.splice(apps.indexOf(f.app), 1);
    const restored = open(f.root);
    expect((await list(restored.capabilities(caller), mesh)).map(agent => agent.id)).toEqual([1]);
    const session = restored.plugin.session(s.id), next = await restored.agent(session, "Atlas");
    session.link(mesh, next);
    expect((await list(restored.capabilities(caller), mesh)).map(agent => agent.id)).toEqual([1, 2]);
  });

  it("captures the channel and member scope before a switch and exposes the new selection on the next request", async () => {
    const f = open(), s = f.session("Switch"), other = f.session("Other");
    const a = await f.agent(s, "Ada"), b = await f.agent(other, "Atlas"), ma = await f.mesh(s), mb = await f.mesh(other);
    s.link(a, ma); other.link(mb, b);
    const captured = f.capabilities(a);
    await s.invoke(CreateMeshChannel, ma, { title: "New" });
    expect((await list(captured, ma)).map(agent => agent.title)).toEqual(["Atlas"]);
    expect(await list(f.capabilities(a), ma)).toEqual([]);
    await s.invoke(SelectMeshChannel, ma, { channelId: "default" });
    const capturedBeforeDetach = f.capabilities(a);
    other.unlink(mb, b);
    expect((await list(capturedBeforeDetach, ma)).map(agent => agent.title)).toEqual(["Atlas"]);
    expect(await list(f.capabilities(a), ma)).toEqual([]);
    await expect(profile(f.capabilities(a), ma, { title: "Atlas" })).rejects.toThrow("No Agent");
  });

  it("routes send and peek to the selected Agent without granting access to other Agents", async () => {
    const f = open(), s = f.session("Sender"), other = f.session("Recipient");
    const a = await f.agent(s, "Ada"), b = await f.agent(other, "Atlas"), hidden = await f.agent(other, "Hidden");
    const ma = await f.mesh(s), mb = await f.mesh(other); s.link(a, ma); other.link(mb, b);
    await f.app.configuration.execute({ type: "modelProvider.save", id: null, credential: { action: "keep" }, value: {
      id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true, compatibility: [],
    } });
    await f.app.configuration.execute({ type: "model.save", id: null, value: {
      providerId: "test", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { tools: true, reasoning: false, thinkingLevels: [] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
    } });
    await configureBuiltin(f.app, { type: "role.save", id: "default", value: { id: "default", model: "test/test" } });
    const captured = f.capabilities(a);
    expect(await call(captured, ma, "send", { title: "Atlas" }, { message: "Review login" })).toMatchObject({ kind: "succeeded" });
    expect(other.snapshot().records.query(AgentInputMessage, { scope: "timeline" }).map(record => record.status === "known" ? record.data : null)).toContainEqual(
      expect.objectContaining({ parts: [{ kind: "text", text: "Review login" }], sender: expect.objectContaining({ name: "Ada", mesh: { channel: "Default", id: null } }) }));
    const peek = vi.spyOn(agentServices(f.plugin), "peek");
    await call(captured, ma, "peek", { title: "Atlas" }, { question: "What arrived?" });
    expect(peek).toHaveBeenCalledWith({ sessionId: b.sessionId, id: b.id, kind: b.kind }, { question: "What arrived?" }, expect.any(AbortSignal), expect.any(Function));
    await expect(call(captured, ma, "peek", { title: hidden.title }, { question: "Hidden?" })).rejects.toThrow("No Agent");
    expect(peek).toHaveBeenCalledTimes(1);
  });

  it("removes archived members from card counts and resets a name only after every member leaves", async () => {
    const f = open(), left = f.session("Left"), right = f.session("Right");
    const caller = await f.agent(left, "Ada"), b = await f.agent(right, "Atlas"), ma = await f.mesh(left), mb = await f.mesh(right);
    left.link(caller, ma); right.link(mb, b);
    await left.invoke(RenameMeshChannel, ma, { channelId: "default", title: "Research" });
    expect(f.view(mb).channels[0]).toEqual({ id: "default", title: "Research", agents: 1 });
    await f.app.sessions.execute({ type: "archive", sessionId: right.id });
    expect(f.view(ma).channels[0]!.agents).toBe(0);
    const replacement = await f.agent(left, "Atlas"); left.link(ma, replacement);
    expect((await list(f.capabilities(caller), ma))[0]!.id).toBe(0);
    await f.app.sessions.execute({ type: "restore", sessionId: right.id });
    expect((await list(f.capabilities(caller), ma)).map(agent => agent.id).sort()).toEqual([0, 1]);
  });

  it("keeps a reattached Mesh present after the previous attachment finishes its cleanup", async () => {
    const f = open(), s = f.session("History"), a = await f.agent(s, "Atlas");
    const before = s.snapshot().position.nodeId, mesh = await f.mesh(s);
    s.link(a, mesh); s.link(mesh, a);
    const attached = s.snapshot().position.nodeId;
    await f.app.sessions.execute({ type: "select", sessionId: s.id, nodeId: before });
    await f.app.sessions.execute({ type: "select", sessionId: s.id, nodeId: attached });
    expect(await list(f.capabilities(a), mesh)).toEqual([{ title: "Atlas", id: 0, type: "worker", descriptions: [] }]);
    expect(await list(f.capabilities(a), mesh)).toHaveLength(1);
    expect(f.view(mesh).channels[0]!.agents).toBe(1);
  });
});
