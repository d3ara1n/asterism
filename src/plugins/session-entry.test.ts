import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { contentRefSchema, defineCall, defineCreation, defineRecord, pluginNamespace, SessionTitleAssigned } from "@asterism-app/sdk/contracts";
import { definePlugin, implementCall, implementCreation, implementResource, type PluginContext } from "@asterism-app/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";

const ns = pluginNamespace("test.entry");
const Resource = ns.resource("terminal", z.object({}));
const Create = defineCreation(Resource, { id: ns.name("create"), schema: z.strictObject({}) });
const Saved = defineRecord(ns.name("input"), { schema: z.strictObject({ text: z.string(), file: contentRefSchema.optional() }) });
const Start = defineCall(ns.name("start"), { scope: "plugin", input: z.strictObject({ key: z.string(), text: z.string(), file: contentRefSchema.optional(), fail: z.boolean().optional() }), output: z.string() });
const roots: string[] = [], apps: ApplicationService[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  let plugin!: PluginContext, initialized = 0;
  const root = mkdtempSync(join(tmpdir(), "asterism-entry-")); roots.push(root);
  const app = new ApplicationService(root, { plugins: [definePlugin({ namespace: ns, setup(context) {
    plugin = context;
    return { resources: [implementResource(Resource, ns.data("view", z.null()), { records: [Saved],
      creation: implementCreation(Create, { create: () => ({ title: "Terminal", data: {} }) }), project: () => null, inspect: async () => null })],
      calls: [implementCall(Start, async (input, call) => plugin.createSession(input.key, async preparation => {
        if (input.file) await call.content.read(input.file);
        const resource = await preparation.prepare(Create, {});
        return { title: input.text, initialize(session) {
          const ref = session.create(resource);
          session.object(Resource, ref.id).commit(writer => { writer.append(Saved, { text: input.text, ...(input.file ? { file: input.file } : {}) }); });
          if (input.fail) throw new Error("Initialization failed.");
          initialized++;
        } };
      }, { signal: call.signal, content: call.content }))] };
  } })] });
  apps.push(app);
  return { app, context: () => plugin, initialized: () => initialized };
}
describe("Plugin-owned session entries", () => {
  it("records and restores host titles without loading an Agent paradigm", async () => {
    const f = fixture();
    const id = await f.context().ipc.calls.invoke(Start, { key: "title", text: "Initial work" }, {});
    const session = f.context().session(id);
    session.title.set("Plugin title");
    const assigned = session.snapshot().records.last(SessionTitleAssigned, { scope: "timeline" })!;
    expect(assigned.record.source).toEqual({ plugin: ns.id, resource: null });
    await f.app.sessions.execute({ type: "rename", sessionId: id, title: "User title" });
    expect(session.title.get()).toBe("User title");
    const records = f.app.sessions.tree.nodes(id);
    await f.app.sessions.execute({ type: "select", sessionId: id, nodeId: assigned.record.id });
    expect(session.title.get()).toBe("Plugin title");
    await f.app.sessions.execute({ type: "select", sessionId: id, nodeId: null });
    expect(session.title.get()).toBe("Initial work");
    expect(f.app.sessions.tree.nodes(id)).toEqual(records);
  });
  it("rolls back failed initialization and recovers accepted retry keys without repeating work", async () => {
    const f = fixture();
    await expect(f.context().ipc.calls.invoke(Start, { key: "one", text: "Work", fail: true }, {})).rejects.toThrow("Initialization failed");
    expect(f.app.sessions.tree.list()).toEqual([]);
    const id = await f.context().ipc.calls.invoke(Start, { key: "one", text: "Work" }, {});
    const duplicate = await f.context().ipc.calls.invoke(Start, { key: "one", text: "Changed ignored on retry", fail: true }, {});
    expect(duplicate).toBe(id);
    expect(f.initialized()).toBe(1);
    const snapshot = f.context().session(id).snapshot();
    expect(snapshot.resources.all().map(resource => resource.ref.kind)).toEqual([Resource.kind]);
    expect(snapshot.records.query(Saved, { scope: "timeline" }).map(record => record.status === "known" ? record.data.text : null)).toEqual(["Work"]);
  });

  it("binds desktop attachments to their call and retains them in the initialized record after draft closure", async () => {
    const f = fixture(), store = f.app.sessions.content;
    const draft = f.app.sessions.openContentInput({ kind: "call", contractId: Start.id });
    const upload = await store.begin(draft);
    await store.write(draft, upload, 0, new TextEncoder().encode("Attached evidence"));
    const file = await store.seal(draft, upload);
    const id = await f.app.sessions.calls.invoke(Start.id, { key: "file", text: "Work", file }, { contentScopeId: draft.id }, null) as string;
    await draft.close();
    const resource = f.context().session(id).snapshot().resources.all()[0]!;
    expect(new TextDecoder().decode(await f.context().object(id, Resource, resource.ref.id).content.read(file))).toBe("Attached evidence");
    expect(await f.app.sessions.calls.invoke(Start.id, { key: "file", text: "Work", file }, {}, null)).toBe(id);
    await expect(f.app.sessions.calls.invoke(Start.id, { key: "foreign", text: "Work", file }, {}, null)).rejects.toMatchObject({ code: "foreign_resource" });
  });
});
