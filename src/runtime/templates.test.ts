import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { contentRefSchema, defineAction, defineCreation, defineRecord, jsonSchema, pluginNamespace, type ResourceRef } from "@asterism-app/sdk/contracts";
import { definePlugin, implementAction, implementCreation, implementResource, type PluginContext, type ResourceContribution } from "@asterism-app/sdk/runtime";
import { CreateAgent, defaultAgentPreset } from "@asterism-app/builtin-api/contracts";
import { CreateNote } from "../../packages/builtin/src/notes/contract.ts";
import { ApplicationService } from "./service.ts";
import { openDatabase } from "./storage.ts";

const ns = pluginNamespace("test.templates");
const Item = ns.resource("item", z.codec(
  z.strictObject({ id: z.string(), type: z.literal("seed"), title: z.literal("Original seed"), file: contentRefSchema.nullable() }),
  z.strictObject({ seed: z.string(), file: contentRefSchema.nullable() }),
  { decode: value => ({ seed: value.id, file: value.file }),
    encode: value => ({ id: value.seed, type: "seed" as const, title: "Original seed" as const, file: value.file }) },
));
const State = ns.data("state", z.codec(
  z.strictObject({ savedText: z.string(), file: contentRefSchema.nullable() }),
  z.strictObject({ text: z.string(), file: contentRefSchema.nullable() }),
  { decode: value => ({ text: value.savedText, file: value.file }), encode: value => ({ savedText: value.text, file: value.file }) },
));
const View = ns.data("view", State.schema);
const Transient = ns.data("transient", z.object({ sourceObjectId: z.string() }));
const Record = defineRecord(ns.name("work"), { schema: z.string() });
const Generate = defineAction(Item, { id: ns.name("generate"), schema: z.string() });
const Create = defineCreation(Item, { id: ns.name("create"), schema: z.strictObject({
  title: z.string(), seed: z.string(), file: contentRefSchema.nullable().default(null),
}) });
const roots: string[] = [];
const apps = new Set<ApplicationService>();
afterEach(async () => {
  for (const app of apps) await app.close();
  apps.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(root?: string, receive = true, template: ResourceContribution["template"] | null = { current: [State] }) {
  if (!root) { root = mkdtempSync(join(tmpdir(), "asterism-templates-")); roots.push(root); }
  let plugin!: PluginContext;
  const definition = definePlugin({ namespace: ns, setup(context) {
    plugin = context;
    return { resources: [implementResource(Item, View, {
      records: [Record],
      template: template ?? undefined,
      links: { receive },
      creation: implementCreation(Create, { create(input, object) {
        object.commit(writer => { writer.set(State, { text: input.seed, file: input.file }); });
        return { title: input.title, data: { seed: input.seed, file: input.file } };
      } }),
      actions: [implementAction(Generate, { async execute(text, object) {
        const file = await object.content.stage(new TextEncoder().encode(text));
        object.commit(writer => { writer.set(State, { text: "attachment", file }); });
      } })],
      project: (_data, object) => object.get(State)!,
      inspect: async (_data, object) => object.get(State)!,
    })] };
  } });
  const app = new ApplicationService(root, { plugins: [definition] });
  apps.add(app);
  return { root, app, plugin };
}
async function close(app: ApplicationService) { await app.close(); apps.delete(app); }
async function save(app: ApplicationService, sessionId: string, refs: ResourceRef[]) {
  const reply = await app.sessions.execute({ type: "template.save", sessionId, title: "Reusable workbench", objectIds: refs.map(ref => ref.id) });
  if (reply.kind !== "template.saved") throw new Error("Expected a saved template.");
  return reply.templateId;
}
async function start(app: ApplicationService, templateId: string) {
  const reply = await app.sessions.execute({ type: "template.start", templateId });
  if (reply.kind !== "accepted") throw new Error("Expected a new session.");
  return reply.sessionId;
}

// Creation records omit note bodies and agent selections; copying only creation data loses values, while copying sessions includes history.
// Templates use current object values at save time, with independent new identities and links while preserving selected subgraphs and layout.
it("saves declared reusable data and selected relationships; reuse excludes undeclared current data and history", async () => {
  const { app, plugin } = open();
  const sessionId = app.sessions.tree.create("Source");
  const session = plugin.session(sessionId);
  const a = await session.create(Create, { title: "A", seed: "seed", file: null });
  const b = await session.create(Create, { title: "B", seed: "other", file: null });
  const excluded = await session.create(Create, { title: "Excluded", seed: "", file: null });
  const note = await session.create(CreateNote, { title: "Checklist", content: "- [ ] Review" });
  const agent = await session.create(CreateAgent, { title: "Source agent", selection: { agent: defaultAgentPreset, model: null, thinking: null } });
  session.link(a, b); session.link(b, a); session.link(a, excluded); session.link(agent, note);
  plugin.object(sessionId, Item, a.id).commit(writer => {
    writer.set(State, { text: "saved content", file: null });
    writer.set(Transient, { sourceObjectId: b.id });
    writer.append(Record, "Source work history");
  });
  await app.sessions.execute({ type: "view.set", sessionId, objectId: a.id,
    position: { x: -900, y: 1100 }, size: { width: 600, height: 400 }, collapsed: true });
  await app.sessions.execute({ type: "view.set", sessionId, objectId: b.id, hidden: true });
  const templateId = await save(app, sessionId, [a, b, note, agent]);
  plugin.object(sessionId, Item, a.id).commit(writer => { writer.set(State, { text: "later source content", file: null }); });
  const created = await start(app, templateId);
  const again = await start(app, templateId);
  const data = app.sessions.current(created);
  const objects = data.workbench.objects;
  const newA = objects.find(object => object.title === "A")!;
  const newB = objects.find(object => object.title === "B")!;
  const newNote = objects.find(object => object.title === "Checklist")!;
  const newAgent = objects.find(object => object.kind === agent.kind)!;
  expect(data.title).toBe("Reusable workbench");
  expect(objects.slice(0, 3).map(object => object.title)).toEqual(["A", "B", "Checklist"]);
  expect(newAgent.title).not.toBe("Source agent");
  expect(new Set([...objects.map(object => object.id), ...app.sessions.current(again).workbench.objects.map(object => object.id),
    a.id, b.id, note.id, agent.id]).size).toBe(12);
  expect(plugin.object(created, Item, newA.id).get(State)).toEqual({ text: "saved content", file: null });
  expect(plugin.object(created, Item, newA.id).get(Transient)).toBeNull();
  expect(plugin.object(sessionId, Item, a.id).get(Transient)).toEqual({ sourceObjectId: b.id });
  expect(newNote.presentation.data).toEqual({ text: "- [ ] Review" });
  expect(newAgent.presentation.data).toMatchObject({ selection: { agent: defaultAgentPreset, model: null, thinking: null }, executionState: "empty" });
  expect(data.workbench.links).toEqual([
    { receiverId: newA.id, resourceId: newB.id }, { receiverId: newB.id, resourceId: newA.id },
    { receiverId: newAgent.id, resourceId: newNote.id },
  ]);
  expect(data.workbench.views.find(view => view.objectId === newA.id)).toMatchObject({
    position: { x: -900, y: 1100 }, size: { width: 600, height: 400 }, collapsed: true,
  });
  expect(data.workbench.views.find(view => view.objectId === newB.id)?.hidden).toBe(true);
  expect(data.nodes.map(node => node.contract)).toEqual([
    "resource_created", "resource_created", "resource_created", "resource_created",
    "resource_attached", "resource_attached", "resource_attached",
  ]);
  const seed = app.sessions.tree.workbench(created).objects.find(object => object.id === newA.id)!;
  expect(seed.data).toEqual({ id: "seed", type: "seed", title: "Original seed", file: null });
  expect(plugin.session(created).snapshot().resources.get(Item, newA.id)).toMatchObject({
    status: "known", resource: { data: { seed: "seed", file: null } },
  });
  plugin.object(created, Item, newA.id).commit(writer => { writer.set(State, { text: "new work", file: null }); });
  expect(plugin.object(sessionId, Item, a.id).get(State)?.text).toBe("later source content");
  expect(app.execute({ type: "workspace.read" }).templates[0]?.objects.map(object => object.title)).toEqual(["A", "B", "Checklist", undefined]);
});

it("omits generated titles from storage and previews and generates each instance title only when starting", async () => {
  const createTitle = vi.fn<() => string>()
    .mockReturnValueOnce("Cedar").mockReturnValueOnce("Birch")
    .mockReturnValueOnce("Maple").mockReturnValueOnce("Willow");
  const { root, app, plugin } = open(undefined, true, { current: [State], createTitle });
  const sessionId = app.sessions.tree.create("Source");
  const session = plugin.session(sessionId);
  const a = await session.create(Create, { title: "Original A", seed: "a" });
  const b = await session.create(Create, { title: "Original B", seed: "b" });
  const templateId = await save(app, sessionId, [a, b]);
  const db = openDatabase(root);
  try {
    const row = db.prepare("SELECT data_json FROM templates WHERE id = ?").get(templateId) as { data_json: string };
    const saved = JSON.parse(row.data_json);
    for (const object of saved.objects) expect(object).not.toHaveProperty("title");
  } finally { db.close(); }
  expect(app.execute({ type: "workspace.read" }).templates[0]?.objects).toEqual([
    { id: a.id, kind: Item.kind }, { id: b.id, kind: Item.kind },
  ]);
  expect(createTitle).not.toHaveBeenCalled();
  const first = await start(app, templateId);
  const second = await start(app, templateId);
  expect(app.sessions.current(first).workbench.objects.map(object => object.title)).toEqual(["Cedar", "Birch"]);
  expect(app.sessions.current(second).workbench.objects.map(object => object.title)).toEqual(["Maple", "Willow"]);
  expect(createTitle).toHaveBeenCalledTimes(4);
  expect(app.sessions.current(sessionId).workbench.objects.map(object => object.title)).toEqual(["Original A", "Original B"]);
});

it("uses the installed title generator for templates saved with a title", async () => {
  const first = open();
  const sessionId = first.app.sessions.tree.create("Source");
  const item = await first.plugin.session(sessionId).create(Create, { title: "Saved title", seed: "seed" });
  const templateId = await save(first.app, sessionId, [item]);
  await close(first.app);
  const createTitle = vi.fn(() => "Fresh title");
  const second = open(first.root, true, { current: [State], createTitle });
  expect(second.app.execute({ type: "workspace.read" }).templates[0]?.objects).toEqual([{ id: item.id, kind: Item.kind }]);
  expect(createTitle).not.toHaveBeenCalled();
  const created = await start(second.app, templateId);
  expect(second.app.sessions.current(created).workbench.objects[0]?.title).toBe("Fresh title");
});

it("rejects a template with no saved title when its resource withdraws title generation", async () => {
  const first = open(undefined, true, { current: [State], createTitle: () => "Generated" });
  const sessionId = first.app.sessions.tree.create("Source");
  const item = await first.plugin.session(sessionId).create(Create, { title: "Source", seed: "seed" });
  const templateId = await save(first.app, sessionId, [item]);
  await close(first.app);
  const second = open(first.root);
  await expect(start(second.app, templateId)).rejects.toThrow("no saved title or title generator");
  expect(second.app.sessions.tree.list().map(session => session.id)).toEqual([sessionId]);
});

// Templates retain files outside source sessions; record/current-data roots alone would allow startup reclamation to delete content after source-session deletion.
it("templates retain files after source-session deletion and restart and can be independently deleted once new sessions take over content roots", async () => {
  const first = open();
  const sourceId = first.app.sessions.tree.create("Source");
  const source = await first.plugin.session(sourceId).create(Create, { title: "File", seed: "", file: null });
  const object = first.plugin.object(sourceId, Item, source.id);
  await first.plugin.session(sourceId).invoke(Generate, source, "retained bytes");
  const file = object.get(State)!.file!;
  // The same file is also another object's creation data, covering handoff between both persistent root kinds.
  const seed = await first.plugin.session(sourceId).create(Create, { title: "Seed", seed: "", file }, { content: object.content });
  const templateId = await save(first.app, sourceId, [source, seed]);
  await close(first.app);
  const db = openDatabase(first.root);
  try { db.prepare("DELETE FROM sessions WHERE id = ?").run(sourceId); } finally { db.close(); }
  const second = open(first.root);
  const sessionId = await start(second.app, templateId);
  const copied = second.app.sessions.tree.workbench(sessionId).objects;
  await second.app.sessions.execute({ type: "template.delete", templateId });
  second.app.sessions.content.collect();
  for (const resource of copied) {
    const reader = second.plugin.object(sessionId, Item, resource.id);
    expect(new TextDecoder().decode(await reader.content.read(reader.get(State)!.file!))).toBe("retained bytes");
  }
  expect(copied.find(resource => resource.title === "Seed")?.data).toMatchObject({ file });
  await close(second.app);
  const third = open(first.root);
  const reader = third.plugin.object(sessionId, Item, copied[0]!.id);
  expect(new TextDecoder().decode(await reader.content.read(file))).toBe("retained bytes");
  expect(third.app.execute({ type: "workspace.read" }).templates).toEqual([]);
});

// Host rename and template identity replacement must leave plugin fields intact. Null must not become an empty object;
// arrays and scalars must survive the same persistence path without spreading their properties into host metadata.
it.each([
  { shape: "colliding fields", value: { id: "ISSUE-42", type: "bug", title: "Fix login", data: "Business data" } },
  { shape: "null", value: null },
  { shape: "array", value: ["first", { id: "external-child" }] },
  { shape: "scalar", value: "external-document" },
])("preserves $shape across resource history, rename, and template copies", async ({ value }) => {
  const root = mkdtempSync(join(tmpdir(), "asterism-resource-state-")); roots.push(root);
  const Raw = ns.resource("raw", jsonSchema);
  const CreateRaw = defineCreation(Raw, { id: ns.name("create-raw"), schema: jsonSchema });
  const RawView = ns.data("raw-view", jsonSchema);
  let plugin!: PluginContext;
  const app = new ApplicationService(root, { plugins: [definePlugin({ namespace: ns, setup(context) {
    plugin = context;
    return { resources: [implementResource(Raw, RawView, {
      template: { current: [] },
      creation: implementCreation(CreateRaw, { create: data => ({ title: "Card", data }) }),
      project: data => data, inspect: async data => data,
    })] };
  } })] });
  apps.add(app);
  const sessionId = app.sessions.tree.create("Source");
  const session = plugin.session(sessionId);
  const original = await session.create(CreateRaw, value);
  const historical = session.snapshot();
  const creation = app.sessions.tree.nodes(sessionId)[0]!;
  expect(creation.data).toEqual({ id: original.id, type: Raw.kind, title: "Card", data: value });
  expect(app.sessions.tree.resourceRef(original.id)).toEqual({ sessionId, id: original.id, kind: Raw.kind });
  await app.sessions.execute({ type: "object.rename", sessionId, objectId: original.id, title: "Renamed card" });
  expect(historical.resources.get(Raw, original.id)).toMatchObject({
    status: "known", resource: { title: "Card", data: value },
  });
  expect(session.snapshot().resources.get(Raw, original.id)).toMatchObject({
    status: "known", resource: { title: "Renamed card", data: value },
  });
  const copiedId = await start(app, await save(app, sessionId, [original]));
  const [copied] = app.sessions.tree.workbench(copiedId).objects;
  expect(copied!.id).not.toBe(original.id);
  expect(copied).toEqual({ id: copied!.id, kind: Raw.kind, title: "Renamed card", data: value });
  expect(plugin.session(copiedId).snapshot().resources.get(Raw, copied!.id)).toMatchObject({
    status: "known", resource: { ref: { sessionId: copiedId, id: copied!.id, kind: Raw.kind }, title: "Renamed card", data: value },
  });
  expect(app.sessions.tree.nodes(sessionId)[0]).toEqual(creation);
});

// Unsupported resources must be excluded from the picker and rejected at the write boundary, including mixed selections.
it("requires explicit template support before saving", async () => {
  const { app, plugin } = open(undefined, true, null);
  const sessionId = app.sessions.tree.create("Source");
  const session = plugin.session(sessionId);
  const item = await session.create(Create, { title: "External instance", seed: "external-id", file: null });
  const note = await session.create(CreateNote, { title: "Reusable", content: "Content" });
  expect(await app.sessions.execute({ type: "template.source", sessionId })).toEqual({
    kind: "template.source", objects: [{ id: note.id, kind: note.kind, title: note.title }],
  });
  await expect(save(app, sessionId, [note, item])).rejects.toThrow("does not support templates");
  expect(app.execute({ type: "workspace.read" }).templates).toEqual([]);
});

// New policy and schema declarations govern instantiation; saved entries cannot bypass withdrawal or quietly disappear.
it.each(["withdrawn", "removed-data", "invalid-data"] as const)("rejects %s before creating a session", async mode => {
  const first = open();
  const sessionId = first.app.sessions.tree.create("Source");
  const item = await first.plugin.session(sessionId).create(Create, { title: "Source", seed: "seed", file: null });
  const templateId = await save(first.app, sessionId, [item]);
  await close(first.app);
  const template = mode === "withdrawn" ? null : { current: mode === "removed-data" ? [] : [ns.data("state", z.number())] };
  const second = open(first.root, true, template);
  await expect(start(second.app, templateId)).rejects.toThrow(mode === "withdrawn" ? "does not support templates" : "invalid");
  expect(second.app.sessions.tree.list().map(session => session.id)).toEqual([sessionId]);
  expect(second.app.execute({ type: "workspace.read" }).templates.map(item => item.id)).toEqual([templateId]);
});

// Plugin updates may withdraw link reception; link failures after object writes must still roll back the entire template creation.
it("link failures leave no partial sessions and templates remain readable", async () => {
  const first = open();
  const sessionId = first.app.sessions.tree.create("Source");
  const session = first.plugin.session(sessionId);
  const a = await session.create(Create, { title: "A", seed: "", file: null });
  const b = await session.create(Create, { title: "B", seed: "", file: null });
  session.link(a, b);
  const templateId = await save(first.app, sessionId, [a, b]);
  await close(first.app);
  const second = open(first.root, false);
  await expect(start(second.app, templateId)).rejects.toThrow("receiver that supports links");
  expect(second.app.sessions.tree.list().map(session => session.id)).toEqual([sessionId]);
  expect(second.app.execute({ type: "workspace.read" }).templates.map(template => template.id)).toEqual([templateId]);
});

// Save against the current path at processing time; removed objects cannot reappear in templates from history or leftover session_data.
it("rejects saving selected objects that have left the current path", async () => {
  const { app, plugin } = open();
  const sessionId = app.sessions.tree.create("Source");
  const session = plugin.session(sessionId);
  const object = await session.create(Create, { title: "Gone", seed: "old data", file: null });
  session.remove(object);
  await expect(save(app, sessionId, [object])).rejects.toThrow("no longer present");
  expect(app.execute({ type: "workspace.read" }).templates).toEqual([]);
});
