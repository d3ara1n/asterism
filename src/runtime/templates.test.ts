import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { contentRefSchema, defineAction, defineCreation, defineRecord, pluginNamespace, type ResourceRef } from "@asterism/sdk/contracts";
import { definePlugin, implementAction, implementCreation, implementResource, type PluginContext } from "@asterism/sdk/runtime";
import { CreateAgent, defaultAgentPreset } from "@asterism/builtin-api/contracts";
import { CreateNote } from "../../packages/builtin/src/notes/contract.ts";
import { ApplicationService } from "./service.ts";
import { openDatabase } from "./storage.ts";

const ns = pluginNamespace("test.templates");
const Item = ns.resource("item", z.strictObject({ seed: z.string(), file: contentRefSchema.nullable() }));
const State = ns.data("state", z.strictObject({ text: z.string(), file: contentRefSchema.nullable() }));
const View = ns.data("view", State.schema);
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
function open(root?: string, receive = true) {
  if (!root) { root = mkdtempSync(join(tmpdir(), "asterism-templates-")); roots.push(root); }
  let plugin!: PluginContext;
  const definition = definePlugin({ namespace: ns, version: "1", setup(context) {
    plugin = context;
    return { resources: [implementResource(Item, View, {
      records: [Record],
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
it("saves complete object data and selected relationships; reuse creates independent objects without copying history", async () => {
  const { app, plugin } = open();
  const sessionId = app.sessions.tree.create("Source");
  const session = plugin.session(sessionId);
  const a = await session.create(Create, { title: "A", seed: "seed", file: null });
  const b = await session.create(Create, { title: "B", seed: "other", file: null });
  const excluded = await session.create(Create, { title: "Excluded", seed: "", file: null });
  const note = await session.create(CreateNote, { title: "Checklist", content: "- [ ] Review" });
  const agent = await session.create(CreateAgent, { selection: { agent: defaultAgentPreset, model: null, thinking: null } });
  session.link(a, b); session.link(b, a); session.link(a, excluded); session.link(agent, note);
  plugin.object(sessionId, Item, a.id).commit(writer => {
    writer.set(State, { text: "saved content", file: null });
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
  expect(objects.map(object => object.title)).toEqual(["A", "B", "Checklist", agent.title]);
  expect(new Set([...objects.map(object => object.id), ...app.sessions.current(again).workbench.objects.map(object => object.id),
    a.id, b.id, note.id, agent.id]).size).toBe(12);
  expect(plugin.object(created, Item, newA.id).get(State)).toEqual({ text: "saved content", file: null });
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
  expect(seed.data).toEqual({ seed: "seed", file: null, id: newA.id, type: Item.kind, title: "A" });
  plugin.object(created, Item, newA.id).commit(writer => { writer.set(State, { text: "new work", file: null }); });
  expect(plugin.object(sessionId, Item, a.id).get(State)?.text).toBe("later source content");
  expect(app.execute({ type: "workspace.read" }).templates[0]?.objects.map(object => object.title)).toEqual(["A", "B", "Checklist", agent.title]);
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
  expect(copied.find(resource => resource.title === "Seed")?.data.file).toEqual(file);
  await close(second.app);
  const third = open(first.root);
  const reader = third.plugin.object(sessionId, Item, copied[0]!.id);
  expect(new TextDecoder().decode(await reader.content.read(file))).toBe("retained bytes");
  expect(third.app.execute({ type: "workspace.read" }).templates).toEqual([]);
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
