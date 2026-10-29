import { thinkingLevels } from "@asterism-app/sdk/contracts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { contentRefSchema, defineCall, defineAction, defineCreation, defineRecord, pluginNamespace, resourceCall, type ContentRef } from "@asterism-app/sdk/contracts";
import { implementCall, defineModule, definePlugin, defineTopLevelTool, implementAction, implementCreation, implementPreparer, implementResource, type ObjectExecutor, type ContentScope, type PluginContext, type TopLevelTool } from "@asterism-app/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { contentLimits } from "../runtime/content-store.ts";
import { serveContent } from "../runtime/dispatch.ts";
import { randomUUID } from "node:crypto";
import type { ModelAdapter, ModelInput } from "../model/contract.ts";
import type { StreamRequest } from "@asterism-app/sdk/contracts";
import { modelInputLimits } from "@asterism-app/sdk/contracts";
import { applicationStorage } from "../shared/application.ts";

const ns = pluginNamespace("test.content");
const Document = ns.resource("document", z.object({ original: contentRefSchema.optional() }));
const Current = ns.data("current", z.object({ file: contentRefSchema.nullable() }));
const View = ns.data("view", z.object({ file: contentRefSchema.nullable() }));
const Saved = defineRecord(ns.name("saved"), { schema: z.object({ file: contentRefSchema }) });
const Create = defineCreation(Document, { id: ns.name("create"), schema: z.object({ file: contentRefSchema, history: z.boolean().default(false), fail: z.boolean().default(false) }) });
const Replace = defineAction(Document, { id: ns.name("replace"), schema: z.object({ file: contentRefSchema.nullable(), history: z.boolean().default(false), fail: z.boolean().default(false) }) });
const Generate = defineAction(Document, { id: ns.name("generate"), schema: z.string() });
const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(options: { prepare?: (content: ContentScope, signal: AbortSignal) => Promise<void>; prepareAction?: (content: ContentScope, signal: AbortSignal) => Promise<void>; onCreate?: (object: ObjectExecutor) => void; extra?: ReturnType<typeof definePlugin>[]; adapter?: ModelAdapter; topLevelTools?: TopLevelTool[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "asterism-content-")); roots.push(root);
  let context!: PluginContext;
  const plugin = definePlugin({ namespace: ns, modules: [defineModule(value => {
    context = value;
    return { topLevelTools: options.topLevelTools, resources: [implementResource(Document, View, {
      records: [Saved],
      creation: implementCreation(Create, {
        async prepare(input, { signal, content }) { await content.read(input.file); await options.prepare?.(content, signal); return { action: "accept" }; },
        create(input, object) {
          object.commit(writer => { writer.set(Current, { file: input.file }); });
          options.onCreate?.(object);
          if (input.fail) throw new Error("Creation rejected after content write.");
          return { title: "Document", data: input.history ? { original: input.file } : {} };
        },
      }),
      actions: [implementAction(Replace, {
        async prepare(_input, { content, signal }) { await options.prepareAction?.(content, signal); return { action: "accept" }; },
        async execute(input, object) {
          object.commit(writer => {
            writer.set(Current, { file: input.file });
            if (input.history && input.file) writer.append(Saved, { file: input.file });
            if (input.fail) throw new Error("Replacement rejected.");
          });
        },
      }), implementAction(Generate, {
        async execute(text, object) {
          const file = await object.content.stage(new TextEncoder().encode(text));
          object.commit(writer => { writer.set(Current, { file }); });
        },
      })],
      project: (_data, object) => object.get(Current) ?? { file: null },
      inspect: async (_data, object) => object.get(Current),
    })] };
  })] });
  const service = new ApplicationService(root, { plugins: [plugin, ...options.extra ?? []], adapterFactory: options.adapter ? () => options.adapter! : undefined }); services.push(service);
  const sessionId = service.sessions.tree.create("Content");
  const store = service.sessions.content;
  const input = () => service.sessions.openContentInput({ kind: "resource", contractId: Create.id, resourceKind: Document.kind, sessionId });
  const create = async (file: ContentRef, scopeId?: string, rest: { history?: boolean; fail?: boolean } = {}) => {
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Document.kind, creation: { id: Create.id }, input: { file, ...rest }, contentScopeId: scopeId, position: { x: 0, y: 0 } });
    return service.sessions.current(sessionId).workbench.objects.at(-1)!.id;
  };
  const object = (id: string) => context.object(sessionId, Document, id);
  const replace = (id: string, value: z.input<typeof Replace.schema>, scopeId?: string) => service.sessions.execute({ type: "resource.command", sessionId, objectId: id,
    command: resourceCall(Replace, value), contentScopeId: scopeId });
  return { root, service, sessionId, store, input, create, object, replace, context };
}
const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

// Expectations follow content ownership, synchronous commit, and history contracts; verify the complete public SDK call path.
describe("Host immutable content", () => {
  it("keeps concurrent handoffs for one object readable until each handoff closes", async () => {
    const f = fixture(), input = f.input();
    const original = await f.store.writer({ scope: input }).stage(bytes("original"));
    const id = await f.create(original, input.id);
    const first = f.store.handover(f.sessionId, id), second = f.store.handover(f.sessionId, id);
    try {
      const a = await f.store.writer({ scope: first }).stage(bytes("first result"));
      const b = await f.store.writer({ scope: second }).stage(bytes("second result"));
      const content = f.object(id).content;
      expect(text(await content.read(a))).toBe("first result");
      expect(text(await content.read(b))).toBe("second result");
      await first.close();
      expect(text(await content.read(b))).toBe("second result");
    } finally { await Promise.all([first.close(), second.close()]); }
  });

  // Cross-plugin actions capture valid caller content before the first wait; handoff can complete after the original root is lost.
  it("backend cross-plugin actions require valid content origins and independently retain input until commit", async () => {
    const ns = pluginNamespace("test.action-source");
    const Source = ns.resource("source", z.object({}));
    const SourceFile = ns.data("file", z.object({ file: contentRefSchema.nullable() }));
    const CreateSource = defineCreation(Source, { id: ns.name("create"), schema: contentRefSchema });
    let caller!: PluginContext, release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const f = fixture({
      async prepareAction() { started(); await gate; },
      extra: [definePlugin({ namespace: ns, setup(plugin) {
        caller = plugin;
        return { resources: [implementResource(Source, SourceFile, {
          creation: implementCreation(CreateSource, { create(file, object) {
            object.commit(writer => { writer.set(SourceFile, { file }); }); return { title: "Source", data: {} };
          } }),
          project: (_data, object) => object.get(SourceFile)!,
          inspect: async () => ({}),
        })] };
      } })],
    });
    const initial = f.input();
    const initialFile = await f.store.writer({ scope: initial }).stage(bytes("target"));
    const targetId = await f.create(initialFile, initial.id);
    await initial.close();
    const input = f.service.sessions.openContentInput({ kind: "resource", sessionId: f.sessionId, resourceKind: Source.kind, contractId: CreateSource.id });
    const file = await f.store.writer({ scope: input }).stage(bytes("shared input"));
    await f.service.sessions.execute({ type: "resource.create", sessionId: f.sessionId, kind: Source.kind,
      creation: { id: CreateSource.id }, input: file, contentScopeId: input.id, position: { x: 0, y: 0 } });
    await input.close();
    const sourceId = f.service.sessions.current(f.sessionId).workbench.objects.find(item => item.kind === Source.kind)!.id;
    const source = caller.object(f.sessionId, Source, sourceId), session = caller.session(f.sessionId);
    const target = f.object(targetId).ref;
    await expect(session.invoke(Replace, target, { file })).rejects.toMatchObject({ code: "foreign_resource" });
    await expect(session.invoke(Replace, target, { file }, { content: f.object(targetId).content })).rejects.toMatchObject({ code: "foreign_resource" });
    await expect(session.invoke(Replace, target, { file }, { content: { read: async () => bytes("fake"), async *open() {} } }))
      .rejects.toMatchObject({ code: "foreign_resource" });
    const invoked = session.invoke(Replace, target, { file }, { content: source.content });
    try {
      await entered;
      source.commit(writer => { writer.set(SourceFile, { file: null }); });
      f.store.collect();
      release(); await invoked;
      expect(f.object(targetId).get(Current)).toEqual({ file });
      expect(text(await f.object(targetId).content.read(file))).toBe("shared input");
    } finally { release(); await invoked; }
  });

  // SDK creation explicitly hands off valid content eligibility; knowing references alone cannot expose another object's private content.
  it("backend creation can hand off content from this plugin's objects and rejects missing read eligibility", async () => {
    const f = fixture(), draft = f.input();
    const file = await f.store.writer({ scope: draft }).stage(bytes("shared creation input"));
    const id = await f.create(file, draft.id);
    await draft.close();
    await expect(f.context.session(f.sessionId).create(Create, { file })).rejects.toThrow("does not belong");
    const copy = await f.context.session(f.sessionId).create(Create, { file }, { content: f.object(id).content });
    expect(f.object(copy.id).get(Current)).toEqual({ file });
    expect(text(await f.object(copy.id).content.read(file))).toBe("shared creation input");
  });

  // Associated read-only objects cannot bypass private get using known ContentRefs; object, session, and in-flight handoff roots need separate protection.
  it("external calls read only associated objects' public historical content, not private current data or handoff holds", async () => {
    const foreign = pluginNamespace("test.foreign");
    const Read = defineCall(foreign.name("read"), { scope: "object",
      input: z.strictObject({ ref: contentRefSchema, session: z.boolean() }), output: z.string(),
    });
    const plugin = definePlugin({ namespace: foreign, modules: [defineModule(() => ({
      calls: [implementCall(Read, async (input, { object }) =>
        text(await (input.session ? object.session.content : object.content).read(input.ref)))],
    }))] });
    const SessionFile = ns.data("session-file", contentRefSchema);
    const f = fixture({ extra: [plugin], onCreate: object => object.session.commit(writer => { writer.set(SessionFile, object.get(Current)!.file!); }) }), draft = f.input();
    const file = await f.store.writer({ scope: draft }).stage(bytes("private"));
    const id = await f.create(file, draft.id);
    const lease = f.store.scope();
    const handover = f.store.handover(f.sessionId, id);
    try {
      const object = { id, sessionId: f.sessionId, kind: Document.kind };
      const read = (ref: ContentRef, session = false) => f.service.sessions.calls.invoke(Read.id, { ref, session }, { object }, null);
      await expect(read(file)).rejects.toMatchObject({ code: "foreign_resource" });
      await expect(read(file, true)).rejects.toMatchObject({ code: "foreign_resource" });
      const temporary = await f.store.writer({ scope: lease }).stage(bytes("handover"));
      handover.add(temporary["$asterism.content"]);
      await expect(read(temporary)).rejects.toMatchObject({ code: "foreign_resource" });
      await f.replace(id, { file, history: true });
      expect(await read(file)).toBe("private");
      expect(text(await f.object(id).content.read(file))).toBe("private");
    } finally { await Promise.all([draft.close(), handover.close(), lease.close()]); }
  });

  it("binary imports persist through preparation, synchronous creation, and current-data reads and reopen with absent plugins", async () => {
    const f = fixture(), draft = f.input();
    const source = new Uint8Array([99, 0, 255, 128, 42]);
    const ref = await f.store.writer({ scope: draft }).stage(source.subarray(1, 4));
    const id = await f.create(ref, draft.id);
    await draft.close();
    expect(await f.object(id).content.read(ref)).toEqual(new Uint8Array([0, 255, 128]));
    await f.service.close(); services.splice(services.indexOf(f.service), 1);
    const reopened = new ApplicationService(f.root); services.push(reopened);
    const reader = await reopened.content.execute({ type: "read.open", source: { sessionId: f.sessionId, objectId: id }, ref });
    expect(reader.kind).toBe("reader");
    if (reader.kind !== "reader") throw new Error("Expected reader.");
    expect(await reopened.content.execute({ type: "read.next", readerId: reader.readerId })).toMatchObject({ kind: "bytes", data: new Uint8Array([0, 255, 128]) });
    await reopened.content.execute({ type: "read.close", readerId: reader.readerId });
  });
  it("failure rolls back all references, keeps drafts retryable, and reclaims orphans after draft cancellation", async () => {
    const f = fixture(), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("retry"));
    await expect(f.create(ref, draft.id, { fail: true })).rejects.toThrow();
    expect(f.service.sessions.current(f.sessionId).workbench.objects).toHaveLength(0);
    expect(text(await f.store.reader({ scope: draft }).read(ref))).toBe("retry");
    const id = await f.create(ref, draft.id); await draft.close();
    expect(text(await f.object(id).content.read(ref))).toBe("retry");
    const abandoned = f.input(), orphan = await f.store.writer({ scope: abandoned }).stage(bytes("orphan"));
    await abandoned.close(); f.store.collect();
    expect(() => f.store.reader({ sessionId: f.sessionId, objectId: id }).read(orphan)).toThrow();
  });
  // Desktop content contract: reads are authorized only by the execution cursor; old branches retain bytes, but known references grant no access.
  it("desktop reads rebuild eligibility with the cursor and reject side-branch records and removed objects", async () => {
    const f = fixture(), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("saved"));
    const id = await f.create(ref, draft.id);
    await draft.close();
    const created = f.service.sessions.tree.cursor(f.sessionId);
    await f.replace(id, { file: ref, history: true });
    const saved = f.service.sessions.tree.cursor(f.sessionId);
    await f.replace(id, { file: null });
    const read = () => f.service.content.execute({ type: "read.open", source: { sessionId: f.sessionId, objectId: id }, ref });
    await f.service.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: created });
    await expect(read()).rejects.toThrow();
    await f.service.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: saved });
    const reader = await read();
    expect(reader.kind).toBe("reader");
    if (reader.kind !== "reader") throw new Error("Expected reader.");
    await f.service.content.execute({ type: "read.close", readerId: reader.readerId });
    await f.service.sessions.execute({ type: "object.remove", sessionId: f.sessionId, objectId: id });
    await expect(read()).rejects.toMatchObject({ code: "foreign_resource" });
  });
  it("independent roots for historical events and creation originals survive current-value replacement", async () => {
    const f = fixture(), draft = f.input();
    const original = await f.store.writer({ scope: draft }).stage(bytes("original"));
    const id = await f.create(original, draft.id, { history: true }); await draft.close();
    await f.service.sessions.execute({ type: "resource.command", sessionId: f.sessionId, objectId: id, command: resourceCall(Generate, "generated") });
    const generated = f.object(id).get(Current)!.file!;
    expect(text(await f.object(id).content.read(generated))).toBe("generated");
    await f.replace(id, { file: generated, history: true });
    await f.replace(id, { file: null }); f.store.collect();
    expect(text(await f.object(id).content.read(original))).toBe("original");
    expect(text(await f.object(id).content.read(generated))).toBe("generated");
    await f.service.sessions.execute({ type: "object.remove", sessionId: f.sessionId, objectId: id }); f.store.collect();
    expect(text(await f.object(id).content.read(original))).toBe("original");
  });
  it("objects in the same session cannot read or claim each other's content through known references", async () => {
    const f = fixture(), first = f.input(), second = f.input();
    const a = await f.store.writer({ scope: first }).stage(bytes("A"));
    const b = await f.store.writer({ scope: second }).stage(bytes("B"));
    const aid = await f.create(a, first.id), bid = await f.create(b, second.id);
    await Promise.all([first.close(), second.close()]);
    expect(() => f.object(bid).content.read(a)).toThrow();
    await expect(f.replace(bid, { file: a })).rejects.toThrow();
    expect(f.object(bid).get(Current)!.file).toEqual(b);
    expect(text(await f.object(aid).content.read(a))).toBe("A");
  });
  it("action inputs bind to real objects; drafts can close after use while new content remains persisted", async () => {
    const f = fixture(), draft = f.input();
    const old = await f.store.writer({ scope: draft }).stage(bytes("old"));
    const id = await f.create(old, draft.id); await draft.close();
    const action = f.service.sessions.openContentInput({ kind: "resource", sessionId: f.sessionId, objectId: id, resourceKind: Document.kind, contractId: Replace.id });
    const file = await f.store.writer({ scope: action }).stage(bytes("new"));
    await expect(f.create(file, action.id)).rejects.toThrow();
    await f.replace(id, { file }, action.id); await action.close(); f.store.collect();
    expect(text(await f.object(id).content.read(file))).toBe("new");
    expect(() => f.object(id).content.read(old)).toThrow();
  });
  it("retention follows encoded JSON and decoding a reference cannot recreate its ownership", async () => {
    const f = fixture(), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("stripped"));
    const id = await f.create(ref, draft.id); await draft.close();
    const Encoded = ns.data("encoded", z.codec(z.object({ saved: contentRefSchema.nullable() }), z.object({ file: contentRefSchema.nullable() }), {
      decode: value => ({ file: value.saved }), encode: value => ({ saved: value.file }),
    }));
    const Stripped = ns.data("stripped", z.codec(z.object({}), z.object({ file: contentRefSchema }), {
      decode: () => ({ file: ref }), encode: () => ({}),
    }));
    const Raw = ns.data("raw", z.json());
    f.object(id).commit(writer => { writer.set(Encoded, { file: ref }); writer.set(Stripped, { file: ref }); });
    f.object(id).commit(writer => { writer.set(Raw, { ...ref, extra: true }); });
    await f.replace(id, { file: null }); f.store.collect();
    expect(text(await f.object(id).content.read(ref))).toBe("stripped");
    f.object(id).commit(writer => { writer.set(Encoded, { file: null }); });
    f.store.collect();
    expect(f.object(id).get(Stripped)).toEqual({ file: ref });
    expect(() => f.object(id).content.read(ref)).toThrow();
  });
  it("read holds protect replaced content until reads finish", async () => {
    const f = fixture(), draft = f.input();
    const payload = new Uint8Array(contentLimits.chunk + 3).fill(7);
    const ref = await f.store.writer({ scope: draft }).stage(payload);
    const id = await f.create(ref, draft.id); await draft.close();
    const stream = f.object(id).content.open(ref)[Symbol.asyncIterator]();
    const first = (await stream.next()).value!;
    await f.replace(id, { file: null }); f.store.collect();
    const chunks = [first];
    for (let next = await stream.next(); !next.done; next = await stream.next()) chunks.push(next.value);
    expect(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))).toEqual(Buffer.from(payload));
    f.store.collect();
    expect(() => f.object(id).content.read(ref)).toThrow();
  });
  it("closing original drafts does not revoke captured creation attempts", async () => {
    let started!: () => void, finish!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const wait = new Promise<void>(resolve => { finish = resolve; });
    const f = fixture({ prepare: async content => { started(); await wait; } }), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("captured"));
    const creating = f.create(ref, draft.id);
    await ready; await draft.close(); f.store.collect(); finish();
    const id = await creating;
    expect(text(await f.object(id).content.read(ref))).toBe("captured");
  });
  it("explicit cancellation waits for preparation to finish, keeps original drafts readable, and rejects new attempts after close", async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const f = fixture({ prepare: async (_content, signal) => {
      started(); await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    } }), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("cancel"));
    const requestId = randomUUID();
    const creating = f.service.sessions.execute({ type: "resource.create", sessionId: f.sessionId, kind: Document.kind, creation: { id: Create.id }, input: { file: ref }, contentScopeId: draft.id, requestId, position: { x: 0, y: 0 } });
    const rejected = expect(creating).rejects.toThrow();
    await ready; await f.service.sessions.execute({ type: "resource.create.cancel", sessionId: f.sessionId, requestId }); await rejected;
    expect(text(await f.store.reader({ scope: draft }).read(ref))).toBe("cancel");
    await draft.close(); await expect(f.create(ref, draft.id)).rejects.toThrow();
  });
  it("old data and references remain consistent after nested commit rollback", async () => {
    const f = fixture(), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("keep"));
    const id = await f.create(ref, draft.id); await draft.close();
    const object = f.object(id);
    object.commit(() => {
      expect(() => object.commit(writer => { writer.set(Current, { file: null }); throw new Error("rollback"); })).toThrow("rollback");
    });
    f.store.collect(); expect(text(await object.content.read(ref))).toBe("keep");
    await expect(f.replace(id, { file: null, fail: true })).rejects.toThrow();
    f.store.collect(); expect(object.get(Current)!.file).toEqual(ref);
  });
  it("object content includes only current values and visible history; forks retain shared originals without acquiring references exclusive to side branches", async () => {
    const f = fixture(), draft = f.input();
    const original = await f.store.writer({ scope: draft }).stage(bytes("ancestor"));
    const id = await f.create(original, draft.id, { history: true }); await draft.close();
    const ancestor = f.service.sessions.tree.cursor(f.sessionId);
    await f.service.sessions.execute({ type: "resource.command", sessionId: f.sessionId, objectId: id, command: resourceCall(Generate, "branch-only") });
    const branch = f.object(id).get(Current)!.file!;
    f.object(id).commit(writer => { writer.append(Saved, { file: branch }); });
    await f.replace(id, { file: original });
    await f.service.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: ancestor });
    await f.replace(id, { file: original });
    expect(text(await f.object(id).content.read(original))).toBe("ancestor");
    expect(() => f.object(id).content.read(branch)).toThrow();
    await expect(f.replace(id, { file: branch })).rejects.toThrow();
    expect(f.object(id).get(Current)!.file).toEqual(original);
  });
  it("external preparers can only read and replacement references cannot expand attempt eligibility", async () => {
    let replacement: ContentRef | null = null;
    const extra = definePlugin({ namespace: pluginNamespace("test.preparer"), modules: [defineModule(() => ({ preparers: [implementPreparer(Replace, {
      id: "replace", prepare(_input, { object, content }) {
        expect(content).not.toHaveProperty("stage");
        expect(object.content).not.toHaveProperty("stage");
        return { action: "replace", input: { file: replacement } };
      },
    })] }))] });
    const f = fixture({ extra: [extra] }), draft = f.input(), other = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("own"));
    replacement = await f.store.writer({ scope: other }).stage(bytes("outside"));
    const id = await f.create(ref, draft.id);
    await expect(f.replace(id, { file: ref })).rejects.toThrow();
    expect(f.object(id).get(Current)!.file).toEqual(ref);
  });
  it("content services reject oversized chunks, cannot seal out-of-order input, and import empty files normally", async () => {
    const f = fixture();
    const opened = await f.service.content.execute({ type: "input.open", target: { kind: "resource", sessionId: f.sessionId, resourceKind: Document.kind, contractId: Create.id } });
    if (opened.kind !== "input") throw new Error("Expected input.");
    const oversized = { type: "upload.write", scopeId: opened.scopeId, uploadId: randomUUID(), offset: 0, data: new Uint8Array(contentLimits.chunk + 1) };
    expect(await serveContent(f.service, oversized)).toMatchObject({ ok: false, error: { code: "invalid_argument" } });
    const begun = await f.service.content.execute({ type: "upload.begin", scopeId: opened.scopeId });
    if (begun.kind !== "upload") throw new Error("Expected upload.");
    await expect(f.service.content.execute({ type: "upload.write", scopeId: opened.scopeId, uploadId: begun.uploadId, offset: 1, data: bytes("bad") })).rejects.toThrow();
    await expect(f.service.content.execute({ type: "upload.seal", scopeId: opened.scopeId, uploadId: begun.uploadId })).rejects.toThrow();
    await f.service.content.execute({ type: "upload.abort", scopeId: opened.scopeId, uploadId: begun.uploadId });
    const valid = await f.service.content.execute({ type: "upload.begin", scopeId: opened.scopeId });
    if (valid.kind !== "upload") throw new Error("Expected upload.");
    await f.service.content.execute({ type: "upload.write", scopeId: opened.scopeId, uploadId: valid.uploadId, offset: 0, data: new Uint8Array([9, 0, 255, 8]).subarray(1, 3) });
    await f.service.content.execute({ type: "upload.write", scopeId: opened.scopeId, uploadId: valid.uploadId, offset: 2, data: new Uint8Array([128]) });
    const complete = await f.service.content.execute({ type: "upload.seal", scopeId: opened.scopeId, uploadId: valid.uploadId });
    if (complete.kind !== "content") throw new Error("Expected content.");
    const binaryId = await f.create(complete.ref, opened.scopeId);
    expect(await f.object(binaryId).content.read(complete.ref)).toEqual(new Uint8Array([0, 255, 128]));
    const empty = await f.service.content.execute({ type: "upload.begin", scopeId: opened.scopeId });
    if (empty.kind !== "upload") throw new Error("Expected upload.");
    const sealed = await f.service.content.execute({ type: "upload.seal", scopeId: opened.scopeId, uploadId: empty.uploadId });
    if (sealed.kind !== "content") throw new Error("Expected content.");
    const id = await f.create(sealed.ref, opened.scopeId);
    await f.service.content.execute({ type: "input.close", scopeId: opened.scopeId });
    expect(await f.object(id).content.read(sealed.ref)).toEqual(new Uint8Array());
  });
});

/** Expectations follow content authorization and request boundaries: files must be readable, and temporary input and requests retain separate holds. */
describe("Models consuming immutable content", () => {
  it("retains a top-level result from the caller's existing content roots", async () => {
    let file!: ContentRef;
    const f = fixture({ topLevelTools: [defineTopLevelTool({
      id: ns.name("existing"), name: "existing", description: "Return the existing file.", guidelines: [],
      argsSchema: z.object({}).describe("No parameters."), resultSchema: contentRefSchema.describe("Existing file."),
      effect: "read", execution: "parallel",
      async execute(_args, { object }) { await object.content.read(file); return { kind: "succeeded", data: file }; },
    })], adapter: { version: "existing", validate() {}, prepare() { return { async *stream() {
      yield { type: "part.start", part: { id: "call", kind: "toolcall", callId: "call", name: "existing" } };
      yield { type: "part.end", partId: "call", arguments: {} };
      yield { type: "finish", reason: "tool-calls", usage: null };
    } }; } } });
    await configure(f, true);
    const input = f.input();
    file = await f.store.writer({ scope: input }).stage(bytes("existing result"));
    const id = await f.create(file, input.id);
    await f.context.content.withScope(async output => {
      const result = await f.context.execution.run({ access: f.object(id).ref, interactive: false,
        target: { provider: "media", model: "model" }, requestParentId: null, system: { blocks: [] }, messages: [],
        signal: new AbortController().signal, observer: { event() {} } }, { output });
      expect(result.reason).toBe("completed");
      expect(result.tools[0]).toMatchObject({ kind: "succeeded", data: file });
      await f.replace(id, { file: null });
      expect(text(await output.read(file))).toBe("existing result");
    });
  });

  const request = (file: ContentRef, mediaType = "image/png") => ({
    target: { provider: "media", model: "model" }, system: { blocks: [] },
    messages: [{ kind: "input", parts: [{ kind: "file", file, mediaType, filename: "input.png" }] }],
    signal: new AbortController().signal,
  } satisfies StreamRequest);
  async function configure(f: ReturnType<typeof fixture>, tools = false) {
    await f.service.configuration.execute({ type: "modelProvider.save", id: null,
      value: { id: "media", name: "Media", protocol: "openai-responses", baseUrl: "https://example.invalid", enabled: true, auth: "none", compatibility: [] }, credential: { action: "keep" } });
    await f.service.configuration.execute({ type: "model.save", id: null, value: { providerId: "media", name: "Model", modelId: "model", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: false, tools, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null } } });
  }
  const adapter = (seen: ModelInput[]): ModelAdapter => ({ version: "media-test", validate() {}, prepare(input) {
    seen.push(input); return { async *stream() {
      yield { type: "part.start" as const, part: { id: "t", kind: "text" as const } };
      yield { type: "part.delta" as const, partId: "t", delta: "Done" };
      yield { type: "part.end" as const, partId: "t" };
      yield { type: "finish" as const, reason: "stop", usage: null };
    } };
  } });

  it("prepare before creation can validate and send temporary content; closing model streams early does not consume caller input", async () => {
    const seen: ModelInput[] = [];
    let ref!: ContentRef;
    const f = fixture({ adapter: adapter(seen), async prepare(content) {
      await f.context.models.validate(request(ref), { content });
      expect(seen).toHaveLength(0);
      for await (const event of f.context.models.stream(request(ref), { content })) { expect(event.type).toBe("part.start"); break; }
      expect(text(await content.read(ref))).toBe("temporary");
    } });
    await configure(f);
    const draft = f.input(); ref = await f.store.writer({ scope: draft }).stage(bytes("temporary"));
    await f.create(ref, draft.id);
    expect(seen[0]!.messages).toEqual([{ kind: "input", parts: [{ kind: "file", data: bytes("temporary"), mediaType: "image/png", filename: "input.png" }] }]);
    expect(text(await f.store.reader({ scope: draft }).read(ref))).toBe("temporary");
  });

  it("rejects missing facades, forged facades, and other-object references before sending; run consumes only its own content", async () => {
    const seen: ModelInput[] = [], f = fixture({ adapter: adapter(seen) }); await configure(f);
    const draft = f.input(), file = await f.store.writer({ scope: draft }).stage(bytes("first"));
    const a = await f.create(file, draft.id);
    const second = f.input(), other = await f.store.writer({ scope: second }).stage(bytes("second"));
    const b = await f.create(other, second.id);
    const models = f.context.models;
    await expect(models.validate(request(file))).rejects.toMatchObject({ reason: "content_scope" });
    await expect(models.validate(request(file), { content: { read: async () => bytes("fake"), async *open() {} } })).rejects.toMatchObject({ reason: "content_scope" });
    await expect(models.validate(request(file), { content: f.object(b).content })).rejects.toMatchObject({ reason: "content_scope" });
    const denied = await f.context.execution.run({ ...request(file), access: f.object(b).ref, interactive: false, requestParentId: f.service.sessions.tree.cursor(f.sessionId), observer: { event() {} } });
    expect(denied).toMatchObject({ reason: "failed", code: "content_scope" });
    expect(seen).toHaveLength(0);
    const accepted = await f.context.execution.run({ ...request(file), access: f.object(a).ref, interactive: false, requestParentId: f.service.sessions.tree.cursor(f.sessionId), observer: { event() {} } });
    expect(accepted.reason).toBe("completed");
    expect(seen).toHaveLength(1);
  });

  it("replacing the last current root after request start preserves reads until request close releases the hold", async () => {
    const seen: ModelInput[] = [], f = fixture({ adapter: adapter(seen) }); await configure(f);
    const draft = f.input(), file = await f.store.writer({ scope: draft }).stage(bytes("captured"));
    const id = await f.create(file, draft.id); await draft.close();
    const execute = f.service.configuration.execute.bind(f.service.configuration);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(f.service.configuration, "execute").mockImplementationOnce(async command => { await gate; return execute(command); });
    const iterator = f.context.models.stream(request(file), { content: f.object(id).content })[Symbol.asyncIterator]();
    const first = iterator.next();
    try {
      await f.replace(id, { file: null }); f.store.collect();
      release(); await first;
      expect(seen[0]!.messages).toMatchObject([{ parts: [{ data: bytes("captured") }] }]);
      await iterator.return?.(); f.store.collect();
      expect(() => f.store.reader({ sessionId: f.sessionId, objectId: id }).read(file)).toThrow();
    } finally { release(); await iterator.return?.(); spy.mockRestore(); }
  });

  it("validate reads only metadata; corrupt files fail during request reads and size is checked independently", async () => {
    const seen: ModelInput[] = [], f = fixture({ adapter: adapter(seen) }); await configure(f);
    const draft = f.input(), file = await f.store.writer({ scope: draft }).stage(bytes("intact"));
    const id = await f.create(file, draft.id), content = f.object(id).content;
    writeFileSync(join(f.root, applicationStorage.contentDirectory, "sealed", file["$asterism.content"]), bytes("broken"));
    await f.context.models.validate(request(file), { content });
    await expect((async () => { for await (const _ of f.context.models.stream(request(file), { content })) {} })()).rejects.toMatchObject({ code: "content_unavailable" });
    // Establish valid ownership using the same object's action draft so authorization failure is not mistaken for size validation.
    const actionDraft = f.service.sessions.openContentInput({ kind: "resource", sessionId: f.sessionId, objectId: id, resourceKind: Document.kind, contractId: Replace.id });
    const large = await f.store.writer({ scope: actionDraft }).stage(new Uint8Array(modelInputLimits.file + 1));
    await f.replace(id, { file: large }, actionDraft.id);
    await expect(f.context.models.validate(request(large), { content: f.object(id).content })).rejects.toMatchObject({ reason: "content_limit" });
    expect(seen).toHaveLength(0);
  });
});
