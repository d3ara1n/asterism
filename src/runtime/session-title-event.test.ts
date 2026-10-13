import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineRecord, pluginNamespace, SessionTitleChanged, type EventEnvelope } from "@atelier/sdk/contracts";
import { defineModule, definePlugin, type PluginContext } from "@atelier/sdk/runtime";
import { ApplicationService } from "./service.ts";

const ns = pluginNamespace("test.title");
const Named = defineRecord(ns.name("named"), { schema: z.object({ title: z.string() }) });
const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(s => s.close())); roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })); });
function open() {
  let context!: PluginContext;
  const plugin = definePlugin({ namespace: ns, version: "1", modules: [defineModule(p => { context = p; return { records: [Named], observers: [{ id: "title", cursorChanged({ snapshot, session }) {
    const named = snapshot.records.last(Named, { scope: "timeline" });
    if (named?.status === "known") session.title.set(named.data.title);
  } }] }; })] });
  const root = mkdtempSync(join(tmpdir(), "atelier-title-")); roots.push(root);
  const service = new ApplicationService(root, { plugins: [plugin] }); services.push(service);
  const received: EventEnvelope<{ sessionId: string; title: string }>[] = [];
  context.ipc.events.subscribe(SessionTitleChanged, {}, event => { received.push(event); });
  return { service, context, received };
}

// 契约依据：标题事件只表达最外层提交成功后的实际变化，来源为软件本身（docs/plugin-sdk.md 发布时机）。
it("标题实际变化才发布，回滚与相同标题不发布，来源为 null", async () => {
  const { service, context, received } = open();
  const sessionId = service.sessions.tree.create("Untitled");
  const session = context.session(sessionId);
  session.title.set("First");
  session.title.set("First");
  expect(() => session.commit(() => { session.title.set("Rolled back"); throw new Error("rollback"); })).toThrow("rollback");
  session.commit(() => { session.title.set("Middle"); session.title.set("Final"); });
  await vi.waitFor(() => expect(received.map(e => e.data.title)).toEqual(["First", "Final"]));
  expect(received.every(e => e.source === null && e.data.sessionId === sessionId)).toBe(true);
  expect(service.sessions.tree.title(sessionId)).toBe("Final");
});

// 失败机制：只在命名时发布会漏掉回溯引起的标题变化；发布点在宿主落库处，覆盖所有改标题路径。
it("回溯到旧命名位置时发布回退后的实际标题", async () => {
  const { service, context, received } = open();
  const sessionId = service.sessions.tree.create("Untitled");
  const session = context.session(sessionId);
  session.commit(writer => { writer.append(Named, { title: "Old" }); });
  const old = service.sessions.tree.cursor(sessionId);
  session.commit(writer => { writer.append(Named, { title: "New" }); });
  await vi.waitFor(() => expect(received.at(-1)?.data.title).toBe("New"));
  await service.sessions.execute({ type: "select", sessionId, nodeId: old });
  await vi.waitFor(() => expect(received.map(e => e.data.title)).toEqual(["Old", "New", "Old"]));
});
