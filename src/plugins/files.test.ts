import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCreation, defineEvent, fileRefSchema, pluginNamespace, type FileRef } from "@asterism-app/sdk/contracts";
import { definePlugin, implementCreation, implementResource, type PluginContext } from "@asterism-app/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";

const ns = pluginNamespace("test.files");
const Source = ns.resource("source", z.object({ prefix: z.string() }));
const Create = defineCreation(Source, { id: ns.name("create"), schema: Source.stateSchema });
const View = ns.data("view", Source.stateSchema);
const Current = ns.data("current", z.string());
const Offered = defineEvent(ns.name("offered"), { schema: fileRefSchema, source: "plugin", semantics: { kind: "occurrence" } });
const roots: string[] = [], apps: ApplicationService[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "asterism-file-refs-")); roots.push(root);
  let provider!: PluginContext, consumer!: PluginContext;
  let opened = 0, closed = 0;
  let finish!: () => void;
  const ended = new Promise<void>(resolve => { finish = resolve; });
  const app = new ApplicationService(root, { plugins: [
    definePlugin({ namespace: ns, setup(plugin) {
      provider = plugin;
      return { events: [Offered], resources: [implementResource(Source, View, {
        creation: implementCreation(Create, { create: data => ({ title: "Source", data }) }),
        project: data => data, inspect: async data => data,
        async *openFile(data, locator, { object, signal }) {
          opened++;
          try {
            signal.throwIfAborted();
            yield new TextEncoder().encode(data.prefix);
            signal.throwIfAborted();
            if (locator === "failure") throw new Error("Source read failed.");
            yield new TextEncoder().encode(object.get(Current) ?? String(locator));
          } finally { closed++; finish(); }
        },
      })] };
    } }),
    definePlugin({ namespace: pluginNamespace("test.file-consumer"), setup(plugin) { consumer = plugin; return {}; } }),
  ] }); apps.push(app);
  const sessionId = app.sessions.tree.create("Source session");
  const create = async () => {
    const { sessionId: sourceSession, id, kind } = await provider.session(sessionId).create(Create, { prefix: "source:" });
    return { sessionId: sourceSession, id, kind };
  };
  return { app, provider, consumer, sessionId, create, ended, counts: () => ({ opened, closed }) };
}
async function collect(stream: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

describe("Resource file references", () => {
  it("passes addresses through events and stored data across sessions without registering or reading them", async () => {
    const f = fixture(), source = await f.create();
    const ref: FileRef = { source: { sessionId: source.sessionId, id: source.id, kind: source.kind }, locator: "original" };
    let deliver!: (ref: FileRef) => void;
    const delivered = new Promise<FileRef>(resolve => { deliver = resolve; });
    const subscription = f.consumer.ipc.events.subscribe(Offered, {}, event => { deliver(event.data); });
    await subscription.ready;
    f.provider.ipc.events.publish(Offered, ref);
    const received = await delivered;
    subscription.close();
    const saved = pluginNamespace("test.file-consumer").data("saved", fileRefSchema);
    const destination = f.consumer.session(f.app.sessions.tree.create("Consumer session"));
    destination.commit(writer => { writer.set(saved, received); });
    const restored = destination.get(saved)!;
    expect(restored).toEqual(ref);
    expect(f.counts()).toEqual({ opened: 0, closed: 0 });

    const stream = f.consumer.files.open(restored);
    expect(f.counts().opened).toBe(0);
    f.provider.object(f.sessionId, Source, source.id).commit(writer => { writer.set(Current, "current"); });
    expect(await collect(stream)).toBe("source:current");
    f.provider.object(f.sessionId, Source, source.id).commit(writer => { writer.set(Current, "updated"); });
    expect(await collect(f.consumer.files.open(restored))).toBe("source:updated");
    expect(f.counts()).toEqual({ opened: 2, closed: 2 });
  });

  it("accepts constructed locators and closes a partially consumed stream", async () => {
    const f = fixture(), source = await f.create();
    const ref = { source, locator: "never-listed" };
    expect(await collect(f.consumer.files.open(ref))).toBe("source:never-listed");
    for await (const chunk of f.consumer.files.open(ref)) {
      expect(new TextDecoder().decode(chunk)).toBe("source:");
      break;
    }
    expect(f.counts()).toEqual({ opened: 2, closed: 2 });
  });

  it("reports missing sources separately from provider read failures and releases failed streams", async () => {
    const f = fixture(), source = await f.create();
    await expect(collect(f.consumer.files.open({ source: { ...source, id: "missing" }, locator: "a" })))
      .rejects.toMatchObject({ code: "not_found", reason: "file_source_not_found" });
    await expect(collect(f.consumer.files.open({ source: { ...source, sessionId: "wrong" }, locator: "a" })))
      .rejects.toMatchObject({ code: "not_found", reason: "file_source_not_found" });
    await expect(collect(f.consumer.files.open({ source, locator: "failure" }))).rejects.toThrow("Source read failed.");
    expect(f.counts()).toEqual({ opened: 1, closed: 1 });
  });

  it("cancels a paused consumption and closes the provider iterator", async () => {
    const f = fixture(), source = await f.create(), controller = new AbortController();
    const iterator = f.consumer.files.open({ source, locator: "a" }, { signal: controller.signal })[Symbol.asyncIterator]();
    expect(await iterator.next()).toMatchObject({ done: false });
    controller.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
    await iterator.return!();
    expect(f.counts()).toEqual({ opened: 1, closed: 1 });
  });

  it("reports provider removal during consumption instead of presenting partial bytes as a complete file", async () => {
    const f = fixture(), source = await f.create();
    const iterator = f.consumer.files.open({ source, locator: "tail" })[Symbol.asyncIterator]();
    expect(await iterator.next()).toMatchObject({ done: false });
    await f.app.sessions.execute({ type: "object.remove", sessionId: source.sessionId, objectId: source.id });
    await f.ended;
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
    await iterator.return!();
    expect(f.counts()).toEqual({ opened: 1, closed: 1 });
  });
});
