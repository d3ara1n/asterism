import { thinkingLevels } from "@atelier/sdk/contracts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { contentRefSchema, defineCall, defineAction, defineCreation, defineRecord, pluginNamespace, resourceCall, type ContentRef } from "@atelier/sdk/contracts";
import { implementCall, defineModule, definePlugin, implementAction, implementCreation, implementPreparer, implementResource, type ObjectExecutor, type ContentScope, type PluginContext } from "@atelier/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { contentReferences, contentLimits } from "../runtime/content-store.ts";
import { dispatchContent } from "../runtime/dispatch.ts";
import { contentResponseSchema, contentVersion } from "../shared/content.ts";
import { randomUUID } from "node:crypto";
import type { ModelAdapter, ModelInput } from "../model/contract.ts";
import type { StreamRequest } from "@atelier/sdk/contracts";
import { modelInputLimits } from "@atelier/sdk/contracts";
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
function fixture(options: { prepare?: (content: ContentScope, signal: AbortSignal) => Promise<void>; onCreate?: (object: ObjectExecutor) => void; extra?: ReturnType<typeof definePlugin>[]; adapter?: ModelAdapter } = {}) {
  const root = mkdtempSync(join(tmpdir(), "atelier-content-")); roots.push(root);
  let context!: PluginContext;
  const plugin = definePlugin({ namespace: ns, version: "1", modules: [defineModule(value => {
    context = value;
    return { resources: [implementResource(Document, View, {
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
  const input = () => service.sessions.openContentInput({ contractId: Create.id, resourceKind: Document.kind, sessionId });
  const create = async (file: ContentRef, scopeId?: string, rest: { history?: boolean; fail?: boolean } = {}) => {
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Document.kind, creation: { id: Create.id }, input: { file, ...rest }, contentScopeId: scopeId, position: { x: 0, y: 0 } });
    return service.sessions.snapshot(sessionId).workbench.objects.at(-1)!.id;
  };
  const object = (id: string) => context.object(sessionId, Document, id);
  const replace = (id: string, value: z.input<typeof Replace.schema>, scopeId?: string) => service.sessions.execute({ type: "resource.command", sessionId, objectId: id,
    command: resourceCall(Replace, value), contentScopeId: scopeId });
  return { root, service, sessionId, store, input, create, object, replace, context };
}
const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

// 预期来自内容归属、同步提交和历史契约；验证公开 SDK 完整调用路径。
describe("宿主不可变内容", () => {
  // 关联只读对象不能以已知 ContentRef 绕过私有 get；对象、会话和在途交接根需分别守住。
  it("外部调用只能读取关联对象的公开历史内容，不能读取私有当前数据或交接占用", async () => {
    const foreign = pluginNamespace("test.foreign");
    const Read = defineCall(foreign.name("read"), { scope: "object",
      input: z.strictObject({ ref: contentRefSchema, session: z.boolean() }), output: z.string(),
    });
    const plugin = definePlugin({ namespace: foreign, version: "1", modules: [defineModule(() => ({
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
      handover.add(temporary["$atelier.content"]);
      await expect(read(temporary)).rejects.toMatchObject({ code: "foreign_resource" });
      await f.replace(id, { file, history: true });
      expect(await read(file)).toBe("private");
      expect(text(await f.object(id).content.read(file))).toBe("private");
    } finally { await Promise.all([draft.close(), handover.close(), lease.close()]); }
  });

  it("保留值只识别严格 SDK 对象，普通文本没有引用语义", () => {
    const ref = { "$atelier.content": randomUUID() };
    expect(contentReferences({ nested: [ref, ref], text: JSON.stringify(ref) })).toEqual([ref]);
    expect(() => contentReferences({ ...ref, extra: true })).toThrow();
    expect(() => contentReferences({ "$atelier.content": "../file" })).toThrow();
  });
  it("二进制导入经准备、同步创建、当前数据读取持久化，并支持缺席插件重开", async () => {
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
  it("失败回滚所有引用，保留草稿可重试，取消草稿后孤儿被回收", async () => {
    const f = fixture(), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("retry"));
    await expect(f.create(ref, draft.id, { fail: true })).rejects.toThrow();
    expect(f.service.sessions.snapshot(f.sessionId).workbench.objects).toHaveLength(0);
    expect(text(await f.store.reader({ scope: draft }).read(ref))).toBe("retry");
    const id = await f.create(ref, draft.id); await draft.close();
    expect(text(await f.object(id).content.read(ref))).toBe("retry");
    const abandoned = f.input(), orphan = await f.store.writer({ scope: abandoned }).stage(bytes("orphan"));
    await abandoned.close(); f.store.collect();
    expect(() => f.store.reader({ sessionId: f.sessionId, objectId: id }).read(orphan)).toThrow();
  });
  // 桌面内容契约：读取只按执行游标授权；旧分支记录仍保留字节，但已知引用不授予访问。
  it("桌面读取随游标重建资格，拒绝旁支记录和已移除对象", async () => {
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
  it("替换当前值后历史事件和创建原件的独立根仍保留", async () => {
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
  it("同会话不同对象不能凭已知引用读取或认领", async () => {
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
  it("动作输入绑定真实对象，使用后可关闭草稿且新内容仍持久保存", async () => {
    const f = fixture(), draft = f.input();
    const old = await f.store.writer({ scope: draft }).stage(bytes("old"));
    const id = await f.create(old, draft.id); await draft.close();
    const action = f.service.sessions.openContentInput({ sessionId: f.sessionId, objectId: id, resourceKind: Document.kind, contractId: Replace.id });
    const file = await f.store.writer({ scope: action }).stage(bytes("new"));
    await expect(f.create(file, action.id)).rejects.toThrow();
    await f.replace(id, { file }, action.id); await action.close(); f.store.collect();
    expect(text(await f.object(id).content.read(file))).toBe("new");
    expect(() => f.object(id).content.read(old)).toThrow();
  });
  it("依赖来自实际保存的 schema 输出，转换移除引用后不保留字节", async () => {
    const f = fixture(), draft = f.input();
    const ref = await f.store.writer({ scope: draft }).stage(bytes("stripped"));
    const id = await f.create(ref, draft.id); await draft.close();
    const Stripped = ns.data("stripped", z.object({ file: contentRefSchema.optional() }).transform(() => ({})));
    const Raw = ns.data("raw", z.json());
    f.object(id).commit(writer => { writer.set(Stripped, { file: ref }); });
    expect(f.object(id).get(Stripped)).toEqual({});
    expect(() => f.object(id).commit(writer => { writer.set(Raw, { ...ref, extra: true }); })).toThrow();
    await f.replace(id, { file: null }); f.store.collect();
    expect(() => f.object(id).content.read(ref)).toThrow();
  });
  it("读取占用保护已被替换的内容，结束读取才可回收", async () => {
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
  it("关闭原始草稿不撤回已捕获的创建尝试", async () => {
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
  it("显式取消等待准备结束，原草稿仍可读，关闭后不能再次受理", async () => {
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
  it("嵌套提交回滚后旧数据与引用保持一致", async () => {
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
  it("对象内容只取当前值与可见历史，分叉保留共同原件而不取得旁支专有引用", async () => {
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
  it("外部准备者只能读取，replace 引用不能扩大尝试资格", async () => {
    let replacement: ContentRef | null = null;
    const extra = definePlugin({ namespace: pluginNamespace("test.preparer"), version: "1", modules: [defineModule(() => ({ preparers: [implementPreparer(Replace, {
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
  it("传输信封拒绝超大块，顺序错误不能封存，空文件可正常导入", async () => {
    const f = fixture();
    const opened = await f.service.content.execute({ type: "input.open", target: { sessionId: f.sessionId, resourceKind: Document.kind, contractId: Create.id } });
    if (opened.kind !== "input") throw new Error("Expected input.");
    const request = { kind: "content.request", version: contentVersion, id: randomUUID(), command: { type: "upload.write", scopeId: opened.scopeId, uploadId: randomUUID(), offset: 0, data: new Uint8Array(contentLimits.chunk + 1) } };
    expect(await dispatchContent(f.service, request)).toBeNull();
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
    expect(contentResponseSchema.safeParse({ kind: "content.response", version: contentVersion, id: randomUUID(), result: { ok: true, reply: sealed } }).success).toBe(true);
  });
});

/** 预期来自内容授权和请求边界：文件须可读，临时输入与请求分别保留。 */
describe("模型消费不可变内容", () => {
  const request = (file: ContentRef, mediaType = "image/png") => ({
    target: { role: "default", model: "media/model" }, system: { blocks: [] },
    messages: [{ kind: "input", parts: [{ kind: "file", file, mediaType, filename: "input.png" }] }],
    signal: new AbortController().signal,
  } satisfies StreamRequest);
  async function configure(f: ReturnType<typeof fixture>) {
    await f.service.configuration.execute({ type: "provider.save", id: null,
      value: { id: "media", name: "Media", protocol: "openai-responses", baseUrl: "https://example.invalid", enabled: true, auth: "none", compatibility: [] }, credential: { action: "keep" } });
    await f.service.configuration.execute({ type: "model.save", id: null, value: { providerId: "media", name: "Model", modelId: "model", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: false, tools: false, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null } } });
  }
  const adapter = (seen: ModelInput[]): ModelAdapter => ({ version: "media-test", validate() {}, prepare(input) {
    seen.push(input); return { async *stream() {
      yield { type: "part.start" as const, part: { id: "t", kind: "text" as const } };
      yield { type: "part.delta" as const, partId: "t", delta: "Done" };
      yield { type: "part.end" as const, partId: "t" };
      yield { type: "finish" as const, reason: "stop", usage: null };
    } };
  } });

  it("创建前 prepare 可校验和发送临时内容；提前关闭模型流不消耗调用方输入", async () => {
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

  it("无门面、伪造门面及其他对象引用在发送前拒绝；run 只取自身内容", async () => {
    const seen: ModelInput[] = [], f = fixture({ adapter: adapter(seen) }); await configure(f);
    const draft = f.input(), file = await f.store.writer({ scope: draft }).stage(bytes("first"));
    const a = await f.create(file, draft.id);
    const second = f.input(), other = await f.store.writer({ scope: second }).stage(bytes("second"));
    const b = await f.create(other, second.id);
    const models = f.context.models;
    await expect(models.validate(request(file))).rejects.toMatchObject({ reason: "content_scope" });
    await expect(models.validate(request(file), { content: { read: async () => bytes("fake"), async *open() {} } })).rejects.toMatchObject({ reason: "content_scope" });
    await expect(models.validate(request(file), { content: f.object(b).content })).rejects.toMatchObject({ reason: "content_scope" });
    const denied = await models.run({ ...request(file), object: f.object(b).ref, requestParentId: f.service.sessions.tree.cursor(f.sessionId), observer: { event() {} } });
    expect(denied).toMatchObject({ reason: "failed", code: "content_scope" });
    expect(seen).toHaveLength(0);
    const accepted = await models.run({ ...request(file), object: f.object(a).ref, requestParentId: f.service.sessions.tree.cursor(f.sessionId), observer: { event() {} } });
    expect(accepted.reason).toBe("completed");
    expect(seen).toHaveLength(1);
  });

  it("请求开始后替换最后一个当前根仍能读取；请求关闭后释放占用", async () => {
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

  it("validate 只读元数据；文件损坏在请求读取时失败，大小独立检查", async () => {
    const seen: ModelInput[] = [], f = fixture({ adapter: adapter(seen) }); await configure(f);
    const draft = f.input(), file = await f.store.writer({ scope: draft }).stage(bytes("intact"));
    const id = await f.create(file, draft.id), content = f.object(id).content;
    writeFileSync(join(f.root, applicationStorage.contentDirectory, "sealed", file["$atelier.content"]), bytes("broken"));
    await f.context.models.validate(request(file), { content });
    await expect((async () => { for await (const _ of f.context.models.stream(request(file), { content })) {} })()).rejects.toMatchObject({ code: "content_unavailable" });
    // 使用同一对象的动作草稿建立合法归属，避免把越权误当成大小校验。
    const actionDraft = f.service.sessions.openContentInput({ sessionId: f.sessionId, objectId: id, resourceKind: Document.kind, contractId: Replace.id });
    const large = await f.store.writer({ scope: actionDraft }).stage(new Uint8Array(modelInputLimits.file + 1));
    await f.replace(id, { file: large }, actionDraft.id);
    await expect(f.context.models.validate(request(large), { content: f.object(id).content })).rejects.toMatchObject({ reason: "content_limit" });
    expect(seen).toHaveLength(0);
  });
});
