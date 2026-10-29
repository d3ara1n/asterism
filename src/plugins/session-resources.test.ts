import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCreation, defineAction, defineRecord, pluginNamespace, thinkingLevels, type Json, type ResourceRef } from "@asterism-app/sdk/contracts";
import { definePlugin, defineModule, implementCreation, implementResource, implementPreparer, type PluginContext, type PluginDefinition, type ObjectExecutor, type ToolSession, defineTopLevelTool } from "@asterism-app/sdk/runtime";
import { agentCreations, defineAgentCreation } from "@asterism-app/builtin-api/runtime";
import { CreateAgent, ReadAgentCreations } from "@asterism-app/builtin-api/contracts";
import { CreateNote } from "../../packages/builtin/src/notes/contract.ts";
import { BuiltinApplicationService as ApplicationService, configureBuiltin } from "../../packages/builtin/src/testing.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { placementGap } from "../shared/workbench-layout.ts";

const ns = pluginNamespace("test.resources");
const Item = ns.resource("item", z.strictObject({}));
const State = ns.data("state", z.number());
const View = ns.data("view", z.object({ value: z.number() }));
const Create = defineCreation(Item, { id: ns.name("create"), schema: z.number().transform(value => value + 1) });
const roots: string[] = [], apps: ApplicationService[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(options: { prepare?: (signal: AbortSignal) => Promise<void>; create?: (object: ObjectExecutor) => void; plugins?: PluginDefinition[]; adapter?: ModelAdapter } = {}) {
  let plugin!: PluginContext;
  const definition = definePlugin({ namespace: ns, setup(context) {
    plugin = context;
    return { resources: [implementResource(Item, View, {
      links: { receive: true },
      creation: implementCreation(Create, {
        async prepare(_value, { signal }) { await options.prepare?.(signal); return { action: "accept" }; },
        create(value, object) { object.commit(writer => { writer.set(State, value); }); options.create?.(object); return { title: "Item", data: {} }; },
      }),
      project: (_data, object) => ({ value: object.get(State)! }),
      inspect: async (_data, object) => ({ value: object.get(State)! }),
    })], modules: [defineAgentCreation({ id: ns.name("new"), creation: Create, description: "Create an item.",
      inputSchema: z.strictObject({ initial: z.number(), sources: z.array(z.string()).optional() }),
      toInput: ({ initial }) => initial, toOptions: ({ sources }) => ({ resources: sources }) })] };
  } });
  const root = mkdtempSync(join(tmpdir(), "asterism-session-resources-")); roots.push(root);
  const app = new ApplicationService(root, { plugins: [definition, ...options.plugins ?? []], adapterFactory: options.adapter ? () => options.adapter! : undefined }); apps.push(app);
  const sessionId = app.sessions.tree.create("Resources");
  return { app, sessionId, plugin, session: plugin.session(sessionId) };
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function model(app: ApplicationService) {
  await app.configuration.execute({ type: "modelProvider.save", id: null, credential: { action: "keep" }, value: {
    id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true, compatibility: [],
  } });
  const saved = await app.configuration.execute({ type: "model.save", id: null, value: {
    providerId: "test", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
    capabilities: { tools: true, reasoning: false, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { provider: "test", model: "test" };
}
function adapter(next: () => { name: string; args: Json }[]): ModelAdapter {
  return { version: "test/1", validate() {}, prepare() {
    const calls = next();
    return { async *stream() {
      for (const [index, call] of calls.entries()) {
        yield { type: "part.start" as const, part: { id: `p${index}`, kind: "toolcall" as const, name: call.name, callId: `call${index}` } };
        yield { type: "part.end" as const, partId: `p${index}`, arguments: call.args };
      }
      yield { type: "finish" as const, reason: "tool-calls", usage: null };
    } };
  } };
}
function runner(f: ReturnType<typeof open>, actor: ResourceRef, target: Awaited<ReturnType<typeof model>>) {
  return (allow?: string[]) => f.plugin.models.run({ object: actor, target,
    requestParentId: f.session.snapshot().position.nodeId, system: { blocks: [] }, messages: [], tools: { allow },
    signal: new AbortController().signal, observer: { event() {} },
  });
}

describe("SDK session resource lifetimes", () => {
  // Resource titles belong to historical paths; frontend commands, SDK reads, and forks must observe the same event result while old snapshots remain fixed.
  it("renames append history and restore titles by path while preserving identity, links, and current data", async () => {
    const f = open(), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 4);
    f.session.link(actor, resource);
    const before = f.session.snapshot(), initial = f.app.sessions.current(f.sessionId);
    await f.app.sessions.execute({ type: "object.rename", sessionId: f.sessionId, objectId: resource.id, title: "  Research  " });
    const renamed = f.session.snapshot();
    expect(renamed.resources.all().find(item => item.ref.id === resource.id)?.title).toBe("Research");
    expect(before.resources.all().find(item => item.ref.id === resource.id)?.title).toBe("Item");
    expect(renamed.records.all({ scope: "timeline" }).at(-1)).toMatchObject({
      contract: { id: "resource_renamed" }, data: { id: resource.id, title: "Research" },
    });
    const current = f.app.sessions.current(f.sessionId);
    expect(current.workbench.objects.find(item => item.id === resource.id)).toEqual({
      ...initial.workbench.objects.find(item => item.id === resource.id), title: "Research",
    });
    expect(current.workbench.links).toEqual(initial.workbench.links);
    expect(current.workbench.views).toEqual(initial.workbench.views);
    f.session.rename(resource, "Research");
    expect(f.session.snapshot().position).toEqual(renamed.position);
    await f.app.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: before.position.nodeId });
    expect(f.app.sessions.current(f.sessionId).workbench.objects.find(item => item.id === resource.id)?.title).toBe("Item");
    f.session.rename(resource, "Alternative");
    const branch = f.session.snapshot();
    await f.app.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: renamed.position.nodeId });
    expect(f.session.snapshot().resources.all().find(item => item.ref.id === resource.id)?.title).toBe("Research");
    expect(branch.resources.all().find(item => item.ref.id === resource.id)?.title).toBe("Alternative");
    expect(f.plugin.object(f.sessionId, Item, resource.id).get(State)).toBe(5);
  });

  // The public SDK cannot bypass frontend input constraints or cross-session identity checks; failed writes must leave no history.
  it("renames reject invalid titles, incorrect identities, and removed objects", async () => {
    const f = open(), resource = await f.session.create(Create, 0);
    const head = f.session.snapshot().position;
    expect(() => f.session.rename(resource, " \t ")).toThrow("non-whitespace");
    expect(() => f.session.rename(resource, "x".repeat(161))).toThrow("160");
    expect(() => f.session.rename({ ...resource, sessionId: f.app.sessions.tree.create("Other") }, "New")).toThrow("another session");
    expect(() => f.session.rename({ ...resource, kind: "wrong/type" }, "New")).toThrow("type");
    expect(f.session.snapshot().position).toEqual(head);
    f.session.remove(resource);
    const removed = f.session.snapshot().position;
    expect(() => f.session.rename(resource, "New")).toThrow("not found");
    expect(f.session.snapshot().position).toEqual(removed);
  });

  // The backend previously treated all default cards as 340×200, causing real and new Agents to overlap in their bottom-right areas.
  // Use actual registered built-in resources to verify dimensions through SDK assembly; successive creations avoid complete rectangles and stay near creators.
  it("successive backend creations avoid each type's full default bounds and prefer positions near the creator", async () => {
    const f = open();
    const input = { selection: { agent: "worker", model: null, thinking: null } };
    const actor = await f.session.create(CreateAgent, input);
    await f.app.sessions.execute({ type: "view.set", sessionId: f.sessionId, objectId: actor.id,
      position: { x: 4000, y: 3000 }, collapsed: true });
    const boxes = [{ id: actor.id, position: { x: 4000, y: 3000 }, width: 560, height: 640 }];
    const creations = [
      { create: () => f.session.create(CreateAgent, input, { linkTo: actor }), width: 560, height: 640 },
      { create: () => f.session.create(CreateNote, { title: "Note", content: "" }, { linkTo: actor }), width: 340, height: 320 },
    ];
    for (const entry of creations) {
      const before = f.app.sessions.current(f.sessionId).workbench.views;
      const resource = await entry.create();
      const views = f.app.sessions.current(f.sessionId).workbench.views;
      const position = views.find(view => view.objectId === resource.id)!.position;
      expect(Math.hypot(position.x - 4000, position.y - 3000)).toBeLessThan(1500);
      for (const box of boxes) expect(position.x + entry.width + placementGap.x <= box.position.x
        || box.position.x + box.width + placementGap.x <= position.x
        || position.y + entry.height + placementGap.y <= box.position.y
        || box.position.y + box.height + placementGap.y <= position.y).toBe(true);
      expect(views.filter(view => view.objectId !== resource.id)).toEqual(before);
      boxes.push({ id: resource.id, position, width: entry.width, height: entry.height });
    }
    // User-overridden dimensions still participate in backend placement, and collapsed cards reserve their expanded area too.
    await f.app.sessions.execute({ type: "view.set", sessionId: f.sessionId, objectId: actor.id,
      size: { width: 1200, height: 1000 } });
    const note = await f.session.create(CreateNote, { title: "After resize", content: "" }, { linkTo: actor });
    const position = f.app.sessions.current(f.sessionId).workbench.views.find(view => view.objectId === note.id)!.position;
    expect(position.x + 340 + placementGap.x <= 4000 || position.x >= 5200 + placementGap.x
      || position.y + 320 + placementGap.y <= 3000 || position.y >= 4000 + placementGap.y).toBe(true);
  });

  // Arrangement must save in one transaction; failure during per-card writes would leave a partially arranged canvas.
  it("batch position writes apply atomically while preserving other view fields and task history", async () => {
    const f = open(), a = await f.session.create(Create, 0), b = await f.session.create(Create, 1);
    await f.app.sessions.execute({ type: "view.set", sessionId: f.sessionId, objectId: a.id,
      size: { width: 800, height: 600 }, collapsed: true, hidden: true });
    const before = f.app.sessions.current(f.sessionId);
    const positions = [{ objectId: a.id, position: { x: -500, y: -600 } }, { objectId: b.id, position: { x: 600, y: 700 } }];
    await expect(f.app.sessions.execute({ type: "views.position", sessionId: f.sessionId,
      positions: [...positions, { objectId: "missing", position: { x: 0, y: 0 } }] })).rejects.toThrow("Object does not belong");
    expect(f.app.sessions.current(f.sessionId).workbench.views).toEqual(before.workbench.views);
    expect((await f.app.sessions.execute({ type: "views.position", sessionId: f.sessionId, positions })).kind).toBe("accepted");
    const after = f.app.sessions.current(f.sessionId);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.workbench.views).toEqual(before.workbench.views.map(view => ({
      ...view, position: positions.find(item => item.objectId === view.objectId)!.position,
    })));
  });

  // Resource link contract: third-party resources can receive links with independent authorization in each direction; mismatched fields lose access scope or notification recipients.
  it("generic resource links preserve direction, authorization, and notification recipients across SDK and session commands", async () => {
    let resourceId = "";
    const f = open({ adapter: adapter(() => [{ name: "resource_inspect", args: { resource_id: resourceId } }]) });
    const target = await model(f.app);
    const a = await f.session.create(Create, 0), b = await f.session.create(Create, 1);
    const runA = runner(f, a, target), runB = runner(f, b, target);
    f.session.link(a, b);
    const position = f.session.snapshot().position.nodeId;
    await f.app.sessions.execute({ type: "link.set", sessionId: f.sessionId, receiverId: a.id, resourceId: b.id, linked: true });
    expect(f.session.snapshot().position.nodeId).toBe(position);
    resourceId = b.id;
    expect((await runA()).tools[0]).toMatchObject({ kind: "succeeded", data: { resource_id: b.id } });
    resourceId = a.id;
    expect((await runB()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });

    await f.app.sessions.execute({ type: "link.set", sessionId: f.sessionId, receiverId: b.id, resourceId: a.id, linked: true });
    expect((await runB()).tools[0]).toMatchObject({ kind: "succeeded", data: { resource_id: a.id } });
    f.session.unlink(a, b);
    expect((await runB()).tools[0]).toMatchObject({ kind: "succeeded", data: { resource_id: a.id } });
    resourceId = b.id;
    expect((await runA()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });

    const links = f.session.snapshot().records.all({ scope: "timeline" })
      .filter(record => record.contract.id === "resource_attached" || record.contract.id === "resource_detached");
    expect(links).toMatchObject([
      { contract: { id: "resource_attached" }, data: { id: b.id, receiverId: a.id }, context: { recipient: a.id } },
      { contract: { id: "resource_attached" }, data: { id: a.id, receiverId: b.id }, context: { recipient: b.id } },
      { contract: { id: "resource_detached" }, data: { id: b.id, receiverId: a.id }, context: { recipient: a.id } },
    ]);
  });

  // Shutdown finalization contract: cancellation still permits session listing and final record commits; facilities release only after actual work completion.
  it("managed tasks can enumerate sessions and save final records during close", async () => {
    const owner = pluginNamespace("test.cleanup"), Final = defineRecord(owner.name("final"), { schema: z.null() });
    let context!: PluginContext;
    const f = open({ plugins: [definePlugin({ namespace: owner, setup(plugin) {
      context = plugin; return { records: [Final] };
    } })] });
    const ready = latch();
    let summaries: readonly { id: string }[] = [], records = 0;
    context.tasks.start("cleanup", async signal => {
      const cancelled = new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
      ready.release(); await cancelled;
      summaries = context.sessions.list();
      for (const item of summaries) context.session(item.id).commit(writer => { writer.append(Final, null); });
      records = context.session(f.sessionId).snapshot().records.query(Final, { scope: "timeline" }).length;
    });
    await ready.promise;
    await f.app.close(); apps.splice(apps.indexOf(f.app), 1);
    expect(summaries.map(item => item.id)).toContain(f.sessionId);
    expect(records).toBe(1);
    expect(() => context.sessions.list()).toThrow("closed");
  });

  // Typed creation and ownership contract: providers supply titles even without input titles; same-ID copies cannot bypass declaration identity checks.
  it("cross-plugin creation parses once, returns identity and actual titles without private data, and enumerates session summaries", async () => {
    let consumer!: PluginContext;
    const caller = pluginNamespace("test.caller");
    const f = open({ plugins: [definePlugin({ namespace: caller, setup(plugin) { consumer = plugin; return {}; } })] });
    const other = f.app.sessions.tree.create("Other");
    const ref = await consumer.session(f.sessionId).create(Create, 4);
    expect(ref).toEqual({ sessionId: f.sessionId, kind: Item.kind, id: expect.any(String), title: "Item" });
    expect(f.plugin.object(f.sessionId, Item, ref.id).get(State)).toBe(5);
    expect(() => consumer.object(f.sessionId, Item, ref.id)).toThrow("another plugin");
    await expect(consumer.session(f.sessionId).create({ ...Create }, 4)).rejects.toThrow("registered creation contract");
    expect(consumer.sessions.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: f.sessionId, title: "Resources", createdAt: expect.any(String) }),
      expect.objectContaining({ id: other, title: "Other" }),
    ]));
    expect(f.session.snapshot().resources.all()).toHaveLength(1);
  });

  // Host transaction contract: failed creation or initial links must roll back identity, private data, and events together.
  it("initialization and post-creation links commit atomically without leaving objects or private data on failure", async () => {
    let fail = false;
    const f = open({ create() { if (fail) throw new Error("Creation failed."); } });
    const before = f.app.sessions.current(f.sessionId);
    fail = true;
    await expect(f.session.create(Create, 2)).rejects.toThrow("Creation failed");
    expect(f.app.sessions.current(f.sessionId).nodes).toEqual(before.nodes);
    fail = false;
    const note = await f.session.create(CreateAgent, { selection: { agent: "worker", model: null, thinking: null } });
    const foreign = { ...note, sessionId: f.app.sessions.tree.create("Foreign") };
    const head = f.session.snapshot().position.nodeId;
    await expect(f.session.create(Create, 2, { linkTo: foreign })).rejects.toThrow("another session");
    expect(f.session.snapshot().position.nodeId).toBe(head);
    await expect(f.session.create(Create, 2, { resources: [foreign] })).rejects.toThrow("another session");
    expect(f.session.snapshot().position.nodeId).toBe(head);
    const child = await f.session.create(Create, 3, { linkTo: note });
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([{ receiverId: note.id, resourceId: child.id }]);
    const otherAgent = await f.session.create(CreateAgent, { selection: { agent: "worker", model: null, thinking: null } }, { linkTo: note });
    expect(f.app.sessions.current(f.sessionId).workbench.links.filter(link => link.receiverId === otherAgent.id)).toEqual([]);
  });

  // Host atomic creation contract: if recipients do not support links, created identity, content, and caller links roll back together.
  it("initial resource link failure rolls back creation entirely", async () => {
    const f = open(), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    const before = f.app.sessions.current(f.sessionId);
    await expect(f.session.create(CreateNote, { title: "Rejected note", content: "temporary" },
      { linkTo: actor, resources: [resource] })).rejects.toThrow();
    const after = f.app.sessions.current(f.sessionId);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.workbench).toEqual(before.workbench);
  });

  // Request boundary and synchronous commit contract: creation preparation blocks cursor backtracking and cancellation prevents late creation commits.
  it("asynchronous creation blocks cursor movement, waits for actual preparation completion after cancellation, and leaves no creation events", async () => {
    const started = latch(), end = latch();
    const f = open({ async prepare(signal) { started.release(); await end.promise; expect(signal.aborted).toBe(true); } });
    const controller = new AbortController();
    const creating = f.session.create(Create, 1, { signal: controller.signal });
    const rejected = expect(creating).rejects.toThrow();
    await started.promise;
    await expect(f.app.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: null })).rejects.toThrow("settle");
    controller.abort(); end.release(); await rejected;
    expect(f.session.snapshot().resources.all()).toEqual([]);
  });
});

describe("Agent resource operation entries", () => {
  // Top-level renaming uses request-captured links; new links within the batch do not authorize access, and later requests read new names.
  it("resource_rename reuses request authorization and returns the actual saved title", async () => {
    let mutate: (() => void) | undefined;
    let calls: { name: string; args: Json }[] = [];
    const f = open({ adapter: adapter(() => { mutate?.(); return calls; }) });
    const target = await model(f.app), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    const resourceId = resource.id;
    calls = [{ name: "resource_rename", args: { resource_id: resourceId, title: "  Renamed  " } }];
    const run = runner(f, actor, target);
    mutate = () => f.session.link(actor, resource);
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(f.session.snapshot().resources.all().find(item => item.ref.id === resourceId)?.title).toBe("Item");
    mutate = undefined;
    calls.push({ name: "resource_list", args: {} });
    const result = await run();
    expect(result.tools[0]).toMatchObject({ kind: "succeeded", data: { resource_id: resourceId, title: "Renamed" } });
    expect(result.tools[1]).toMatchObject({ kind: "succeeded", data: { resources: [
      { resource_id: resourceId, type: Item.kind, title: "Item" },
    ] } });
    calls = [{ name: "resource_list", args: {} }];
    expect((await run()).tools[0]).toMatchObject({ kind: "succeeded", data: { resources: [
      { resource_id: resourceId, type: Item.kind, title: "Renamed" },
    ] } });
  });
  // Entries own domain input: resource lists are explicitly declared only on selected entries; generic creation arguments and note input retain their own structures.
  it("agent entries declare resource lists while note entries create through their own schemas", async () => {
    let calls: { name: string; args: Json }[] = [];
    const f = open({ adapter: adapter(() => calls) }), target = await model(f.app), actor = await f.session.create(Create, 0);
    expect(agentCreations.inspect(f.plugin, "asterism.builtin/agent.create").input).toHaveProperty("properties.resources");
    expect(agentCreations.inspect(f.plugin, "asterism.builtin/agent.create").input).toHaveProperty("properties.expose_self.type", "boolean");
    expect(agentCreations.inspect(f.plugin, "asterism.builtin/note.create").input).toMatchObject({
      type: "object", additionalProperties: false, properties: { title: { type: "string" }, content: { type: "string" } },
    });
    expect(agentCreations.inspect(f.plugin, "asterism.builtin/note.create").input).not.toHaveProperty("properties.resources");
    const input = { title: "A note", content: "Note text" }, creation_id = "asterism.builtin/note.create";
    const run = runner(f, actor, target), before = f.session.snapshot().position.nodeId;
    calls = [{ name: "resource_create", args: { creation_id, input, resources: [] } }];
    expect((await run()).tools[0]?.kind).toBe("rejected");
    calls = [{ name: "resource_create", args: { creation_id, input: { ...input, resources: [] } } }];
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", data: { type: CreateNote.resource.kind } });
    expect(f.session.snapshot().position.nodeId).toBe(before);
    calls = [{ name: "resource_create", args: { creation_id, input } }];
    const result = await run();
    expect(result.tools[0]).toMatchObject({ kind: "succeeded", data: { type: CreateNote.resource.kind, title: "A note" } });
    const noteId = (result.tools[0]!.data as { resource_id: string }).resource_id;
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([{ receiverId: actor.id, resourceId: noteId }]);
  });

  // Agent discovery contract: lists return only selection information for enabled configurations; new configuration fields and private prompts never enter model results.
  it("agent_list exposes selection fields while isolating system prompts and execution configuration", async () => {
    const f = open({ adapter: adapter(() => [{ name: "agent_list", args: {} }]) });
    const target = await model(f.app), actor = await f.session.create(Create, 0);
    await configureBuiltin(f.app, { type: "agent.save", id: "worker", value: { id: "worker",
      description: "Public purpose", examples: ["Public example"],
      systemPrompt: "PRIVATE_AGENT_INSTRUCTIONS", maxTurns: 123,
    } });
    await configureBuiltin(f.app, { type: "agent.save", id: "reviewer", value: { id: "reviewer", enabled: false } });
    const result = await runner(f, actor, target)();
    expect(result.tools[0]?.kind).toBe("succeeded");
    const entries = result.tools[0]!.data as { id: string }[];
    expect(entries.find(entry => entry.id === "worker")).toEqual({
      id: "worker", description: "Public purpose",
      examples: ["Public example"],
    });
    expect(entries.some(entry => entry.id === "reviewer")).toBe(false);
    expect(JSON.stringify(result.tools[0]!.model)).not.toContain("PRIVATE_AGENT_INSTRUCTIONS");
  });

  // Explicit initial link and self-authorization contract: omitted/false does not expose self; true adds only the bound initiator and preserves source links.
  it.each([undefined, false, true])("agent creation includes selected resources and self authorization %s and new agents are discoverable on the next request", async exposeSelf => {
    let calls: { name: string; args: Json }[] = [];
    const f = open({ adapter: adapter(() => calls) }), target = await model(f.app);
    const actor = await f.session.create(Create, 0), shared = await f.session.create(Create, 1), other = await f.session.create(Create, 2);
    f.session.link(actor, shared); f.session.link(actor, other);
    calls = [{ name: "resource_create", args: {
      creation_id: "asterism.builtin/agent.create",
      input: { selection: { agent: "worker", model: null, thinking: null }, resources: [shared.id, shared.id],
        ...(exposeSelf === undefined ? {} : { expose_self: exposeSelf }) },
    } }];
    const run = runner(f, actor, target), result = await run();
    expect(result.tools[0]?.kind).toBe("succeeded");
    const child = (result.tools[0]!.data as { resource_id: string }).resource_id;
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([
      { receiverId: actor.id, resourceId: shared.id }, { receiverId: actor.id, resourceId: other.id },
      { receiverId: actor.id, resourceId: child }, { receiverId: child, resourceId: shared.id },
      ...(exposeSelf ? [{ receiverId: child, resourceId: actor.id }] : []),
    ]);
    calls = [{ name: "resource_list", args: {} }];
    expect((await run()).tools[0]?.data).toMatchObject({ resources: expect.arrayContaining([expect.objectContaining({ resource_id: child })]) });
  });

  // Self authorization and initial resources have independent scopes: expose_self supplies only bound identity and cannot add arbitrary unauthorized IDs to resources.
  it("self exposure does not expand initial resource list authorization", async () => {
    let resourceId = "";
    const f = open({ adapter: adapter(() => [{ name: "resource_create", args: {
      creation_id: "asterism.builtin/agent.create",
      input: { selection: { agent: "worker", model: null, thinking: null }, expose_self: true, resources: [resourceId] },
    } }]) });
    const target = await model(f.app), actor = await f.session.create(Create, 0), other = await f.session.create(Create, 1);
    const before = f.app.sessions.current(f.sessionId);
    const run = runner(f, actor, target);
    for (const id of [actor.id, other.id]) {
      resourceId = id;
      expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    }
    const after = f.app.sessions.current(f.sessionId);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.workbench).toEqual(before.workbench);
  });

  // SDK self-authorization and atomic creation contract: third-party entries can choose exposeSelf; targets rejecting links roll back creation and reverse links together.
  it("self-authorized targets without link reception roll back entirely", async () => {
    const extra = pluginNamespace("test.expose");
    const f = open({
      plugins: [definePlugin({ namespace: extra, modules: [
        defineAgentCreation({ id: extra.name("note"), creation: CreateNote, description: "Create an exposed note.",
          inputSchema: CreateNote.schema, toInput: input => input,
          toOptions: () => ({ exposeSelf: true }) }),
      ] })],
      adapter: adapter(() => [{ name: "resource_create", args: {
        creation_id: extra.name("note"), input: { title: "Rejected note", content: "temporary" },
      } }]),
    });
    const target = await model(f.app), actor = await f.session.create(Create, 0);
    const before = f.app.sessions.current(f.sessionId);
    expect((await runner(f, actor, target)()).tools[0]?.kind).toBe("rejected");
    const after = f.app.sessions.current(f.sessionId);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.workbench).toEqual(before.workbench);
  });

  // Fixed request authorization contract: known unauthorized IDs and links added during model requests cannot become this batch's initial authorization.
  it("initial resources are constrained by the link scope at request start", async () => {
    let resourceId = "", mutate: (() => void) | undefined;
    const f = open({ adapter: adapter(() => {
      mutate?.();
      return [{ name: "resource_create", args: { creation_id: "asterism.builtin/agent.create",
        input: { selection: { agent: "worker", model: null, thinking: null }, resources: [resourceId] } } }];
    }) });
    const target = await model(f.app), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    resourceId = resource.id;
    const run = runner(f, actor, target), before = f.session.snapshot().position.nodeId;
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(f.session.snapshot().position.nodeId).toBe(before);
    mutate = () => f.session.link(actor, resource);
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(f.session.snapshot().resources.all()).toHaveLength(2);
    mutate = undefined;
    expect((await run()).tools[0]?.kind).toBe("succeeded");
  });

  // Recheck endpoints at creation commit: resources may disappear during asynchronous preparation, so fixed request authorization still requires real resource identities to create links.
  it("removing initial resources during preparation rejects late creation", async () => {
    let resources: string[] = [], pending = false;
    const started = latch(), end = latch();
    const f = open({
      async prepare() { if (pending) { started.release(); await end.promise; } },
      adapter: adapter(() => [{ name: "resource_create", args: { creation_id: ns.name("new"), input: { initial: 1, sources: resources } } }]),
    });
    const target = await model(f.app), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    f.session.link(actor, resource); resources = [resource.id]; pending = true;
    const work = runner(f, actor, target)();
    await started.promise;
    let head: string | null;
    try { f.session.remove(resource); head = f.session.snapshot().position.nodeId; }
    finally { end.release(); }
    expect((await work).tools[0]?.kind).toBe("rejected");
    expect(f.session.snapshot().position.nodeId).toBe(head);
    expect(f.session.snapshot().resources.all().map(item => item.ref.id)).toEqual([actor.id]);
  });

  // Explicit domain entry contract: without inspect, adapted model input uses the same creation pipeline and results link automatically without inheriting links.
  it("creates known entries directly with parameter conversion and tool policies and supports uniform removal", async () => {
    let calls = [{ name: "resource_create", args: { creation_id: ns.name("new"), input: { initial: 8 } } as Json }];
    const f = open({ adapter: adapter(() => calls) }), target = await model(f.app), actor = await f.session.create(Create, 0);
    const run = runner(f, actor, target);
    const denied = await run([]);
    expect(denied.tools[0]?.kind).toBe("rejected");
    const created = await run();
    expect(created.tools[0]).toMatchObject({ kind: "succeeded", data: { type: Item.kind, title: "Item" } });
    const result = created.tools[0]!.data as { resource_id: string };
    expect(f.plugin.object(f.sessionId, Item, result.resource_id).get(State)).toBe(9);
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([{ receiverId: actor.id, resourceId: result.resource_id }]);
    calls = [{ name: "resource_remove", args: { resource_id: result.resource_id } }];
    expect((await run()).tools[0]?.kind).toBe("succeeded");
    expect(f.session.snapshot().resources.all().map(item => item.ref.id)).toEqual([actor.id]);
    calls = [{ name: "resource_create", args: { creation_id: Create.id, input: 1 } }];
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "not_found" } });
  });

  // Fixed request environment contract: knowing IDs or adding links during requests cannot expand this batch's removal scope.
  it("new links become removable only on the next request and removal does not require creation by the current Agent", async () => {
    let mutate: (() => void) | undefined, targetId = "";
    const f = open({ adapter: adapter(() => { mutate?.(); return [{ name: "resource_remove", args: { resource_id: targetId } }]; }) });
    const target = await model(f.app), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    targetId = resource.id;
    const run = runner(f, actor, target);
    mutate = () => f.session.link(actor, resource);
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    mutate = undefined;
    expect((await run()).tools[0]?.kind).toBe("succeeded");
  });

  // Execution scope contract: saved tool operation handles cannot create or remove resources after call completion.
  it("tool session handles expire after execution", async () => {
    let saved!: ToolSession;
    const tool = defineTopLevelTool({ id: ns.name("save"), name: "save_session", description: "Save context.", guidelines: [],
      argsSchema: z.null().describe("No input."), resultSchema: z.null().describe("No output."), effect: "read", execution: "parallel",
      async execute(_args, context) { saved = context.session; return { kind: "succeeded", data: null }; },
    });
    const f = open({ plugins: [definePlugin({ namespace: pluginNamespace("test.context"), modules: [defineModule(() => ({ topLevelTools: [{ ...tool, id: "test.context/save" }] }))] })],
      adapter: adapter(() => [{ name: "save_session", args: null }]) });
    const target = await model(f.app), actor = await f.session.create(Create, 0);
    await runner(f, actor, target)();
    expect(() => saved.create(Create, 1)).toThrow("scope is closed");
    expect(() => saved.remove(actor.id)).toThrow("scope is closed");
    expect(() => saved.rename(actor.id, "New")).toThrow("scope is closed");
  });

  // Plugin lifetime and public service scope contract: failed contributions disappear immediately without leaking into another host instance.
  it("creation catalogs are isolated by host and public queries include third-party types but exclude failed registrations", async () => {
    const extra = pluginNamespace("test.extra"), missing = defineAction(extra.resource("missing", z.object({})), { id: extra.name("missing"), schema: z.null() });
    const failed = definePlugin({ namespace: extra, modules: [
      defineAgentCreation({ id: extra.name("new"), description: "Invalid contribution.", creation: Create }),
      defineModule(() => ({ preparers: [implementPreparer(missing, { id: "missing", prepare: () => ({ action: "accept" }) })] })),
    ] });
    const first = open({ plugins: [failed] }), second = open();
    expect(first.app.sessions.plugins.find(plugin => plugin.id === extra.id)?.status).toBe("failed");
    expect(agentCreations.list(first.plugin).some(item => item.id === extra.name("new"))).toBe(false);
    expect(agentCreations.list(first.plugin)).toEqual(agentCreations.list(second.plugin));
    expect(() => agentCreations.inspect(first.plugin, ns.name("new"))).not.toThrow();
    expect(agentCreations.inspect(first.plugin, ns.name("new")).input).toMatchObject({ type: "object", properties: { initial: { type: "number" } } });
    // Public presentation queries use real catalogs; resource types remain available when entry IDs differ from creation contract IDs.
    const directory = await first.app.sessions.calls.invoke(ReadAgentCreations.id, {}, {}, null);
    expect(directory).toEqual(agentCreations.list(first.plugin).map(({ id, resourceKind }) => ({ id, resourceKind })));
    expect(directory).toContainEqual({ id: ns.name("new"), resourceKind: Item.kind });
    expect(await first.plugin.ipc.calls.invoke(ReadAgentCreations, {}, {})).toEqual(directory);
  });
});

// Lifetime contract: archival, restoration, and exit share object scopes; archived sessions are absent from plugin catalogs and session reads.
describe("Object lifetimes and session archival", () => {
  it("archival ends object scopes and removes them from plugin catalogs, restoration reattaches, and exit ends them again", async () => {
    const probe = pluginNamespace("test.lifetime");
    const Probe = probe.resource("probe", z.strictObject({}));
    const CreateProbe = defineCreation(Probe, { id: probe.name("create"), schema: z.null() });
    const events: string[] = [];
    let context!: PluginContext, signal: AbortSignal | undefined;
    const lifetime = definePlugin({ namespace: probe, setup(plugin) {
      context = plugin;
      return { resources: [implementResource(Probe, probe.data("view", z.null()), {
        creation: implementCreation(CreateProbe, { create: () => ({ title: "Probe", data: {} }) }),
        project: () => null, inspect: async () => null,
        attach(_data, object, scope) {
          events.push(`attach:${object.ref.id}`); signal = scope.signal;
          scope.defer(() => { events.push(`end:${object.ref.id}`); });
        },
      })] };
    } });
    const { app, sessionId } = open({ plugins: [lifetime] });
    const { id } = await context.session(sessionId).create(CreateProbe, null);
    expect(events).toEqual([`attach:${id}`]);

    await app.sessions.execute({ type: "archive", sessionId });
    expect(events).toEqual([`attach:${id}`, `end:${id}`]);
    expect(signal?.aborted).toBe(true);
    expect(context.sessions.list().map(item => item.id)).not.toContain(sessionId);
    expect(context.sessions.archived().map(item => item.id)).toEqual([sessionId]);
    expect(() => context.session(sessionId).snapshot()).toThrow();

    await app.sessions.execute({ type: "restore", sessionId });
    expect(events).toEqual([`attach:${id}`, `end:${id}`, `attach:${id}`]);
    expect(context.sessions.archived()).toEqual([]);

    await app.close(); apps.splice(apps.indexOf(app), 1);
    expect(events.at(-1)).toBe(`end:${id}`);
  });
});
