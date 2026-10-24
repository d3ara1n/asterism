import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { contentRefSchema, defineAction, defineCreation, defineRecord, pluginNamespace, type ResourceRef } from "@atelier/sdk/contracts";
import { definePlugin, implementAction, implementCreation, implementResource, type PluginContext } from "@atelier/sdk/runtime";
import { CreateAgent, defaultAgentPreset } from "@atelier/builtin-api/contracts";
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
  if (!root) { root = mkdtempSync(join(tmpdir(), "atelier-templates-")); roots.push(root); }
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

// 创建记录不含笔记正文和代理选择；只复制创建 data 会漏数据，只复制会话又会夹带历史。
// 模板应取保存时的对象当前值，所有新身份与链接独立，同时保留所选子图和布局。
it("保存完整对象数据与所选关系，重复使用创建独立对象且不复制历史", async () => {
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

// 模板在源会话之外保留文件；只有记录/当前数据根会导致源会话删除后启动回收误删内容。
it("源会话删除并重启后模板仍保留文件，新会话接管内容根后可独立删除模板", async () => {
  const first = open();
  const sourceId = first.app.sessions.tree.create("Source");
  const source = await first.plugin.session(sourceId).create(Create, { title: "File", seed: "", file: null });
  const object = first.plugin.object(sourceId, Item, source.id);
  await first.plugin.session(sourceId).invoke(Generate, source, "retained bytes");
  const file = object.get(State)!.file!;
  // 同一文件还作为另一对象的创建数据，覆盖两种持久根的交接。
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

// 插件更新可能撤回接收链接资格；链接失败发生在对象已写入之后，整个模板创建仍须回滚。
it("建立链接失败时不留下半个会话，模板仍可读取", async () => {
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

// 保存以处理时的当前路径为准；已移除对象不能从历史或遗留 session_data 中复活到模板。
it("拒绝保存已离开当前路径的所选对象", async () => {
  const { app, plugin } = open();
  const sessionId = app.sessions.tree.create("Source");
  const session = plugin.session(sessionId);
  const object = await session.create(Create, { title: "Gone", seed: "old data", file: null });
  session.remove(object);
  await expect(save(app, sessionId, [object])).rejects.toThrow("no longer present");
  expect(app.execute({ type: "workspace.read" }).templates).toEqual([]);
});
