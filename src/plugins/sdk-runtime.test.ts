import { nanoid } from "nanoid";
import { thinkingLevels } from "@asterism/sdk/contracts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCall, defineCreation, defineAction, resourceCall, defineRecord, defineImplementation, defineTool, pluginNamespace, modelRunRecordSchema, type SessionRecord, type ModelRunEvent } from "@asterism/sdk/contracts";
import { defineTopLevelTool, implementCall, defineModule, definePlugin, implementCreation, implementAction, implementPreparer, implementResource, implementTool, type ObjectReader, type ObjectExecutor, type ObjectWriter, type PluginContext, type PluginDefinition } from "@asterism/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { DatabaseVersionError } from "../runtime/storage.ts";
import * as runtimeModules from "../runtime/builtin.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { foldWorkbench } from "../session/fold.ts";
import type { ModelAdapter, ModelInput } from "../model/contract.ts";
import { SubmitAgentInput } from "@asterism/builtin-api/contracts";
import { applicationStorage } from "../shared/application.ts";
import { flat } from "../session/test-nodes.ts";

const ns = pluginNamespace("test.counter");
const Counter = ns.resource("counter", z.strictObject({}));
const State = ns.data("state", z.number().int());
const View = ns.data("view", z.object({ value: z.number() }));
const Changed = defineRecord(ns.name("changed"), { schema: z.object({ value: z.number() }) });
const Command = z.strictObject({ amount: z.number().int() });
const CreateCounter = defineCreation(Counter, { id: ns.name("create"), schema: z.number().int() });
const ChangeCount = defineAction(Counter, { id: ns.name("change"), schema: Command });
const roots: string[] = [];
const services: ApplicationService[] = [];
const actionGates = new Set<() => void>();
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
function actionGate() {
  const gate = deferred<void>();
  actionGates.add(gate.resolve);
  return gate;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const release of actionGates) release();
  actionGates.clear();
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(plugins: PluginDefinition[], adapterFactory?: () => ModelAdapter, onSessionChanged?: NonNullable<ConstructorParameters<typeof ApplicationService>[1]>["onSessionChanged"]) {
  const root = mkdtempSync(join(tmpdir(), "sdk-runtime-")); roots.push(root);
  const service = new ApplicationService(root, { plugins, adapterFactory, onSessionChanged }); services.push(service);
  const sessionId = service.sessions.tree.create("Counter");
  return { root, service, sessionId };
}
async function configureModel(service: ApplicationService) {
  await service.configuration.execute({ type: "modelProvider.save", id: null, credential: { action: "keep" },
    value: { id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true, compatibility: [] } });
  const result = await service.configuration.execute({ type: "model.save", id: null, value: {
    providerId: "test", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
    capabilities: { tools: true, reasoning: false, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { role: "default", model: result.savedId! };
}
function counter(options: { onRead?: (object: ObjectReader) => void; failCreate?: boolean; onCreate?: (object: ObjectExecutor) => void; afterCreate?: (object: ObjectExecutor) => void; afterAction?: (object: ObjectExecutor) => void; observe?: (record: SessionRecord, context: PluginContext) => void;
  prepare?: (signal: AbortSignal) => Promise<void>; execute?: (object: ObjectExecutor, signal: AbortSignal, amount: number) => Promise<void>;
} = {}) {
  let context!: PluginContext;
  const plugin = definePlugin({ namespace: ns, version: "1.0.0", modules: [defineModule(plugin => {
    context = plugin;
    return {
      resources: [implementResource(Counter, View, {
        records: [Changed],
        creation: implementCreation(CreateCounter, {
          create(value, object) {
            options.onCreate?.(object);
            object.commit(writer => { writer.set(State, value); writer.append(Changed, { value }); });
            options.afterCreate?.(object);
            if (options.failCreate) throw new Error("Creation failed.");
            return { title: "Counter", data: {} };
          },
        }),
        actions: [implementAction(ChangeCount, {
          async prepare(input, { signal }) { await options.prepare?.(signal); return { action: "replace", input: { amount: input.amount + 1 } }; },
          async execute(input, object, signal) {
            await options.execute?.(object, signal, input.amount);
            object.commit(writer => {
              const value = object.get(State)! + input.amount;
              writer.set(State, value); writer.append(Changed, { value });
            });
            options.afterAction?.(object);
          },
        })],
        project: (_data, object) => { options.onRead?.(object); return { value: object.get(State)! }; },
        inspect: async (_data, object) => ({ value: object.get(State)! }),
      })],
      observers: [{ id: "observe", committed(event) { for (const record of event.records) options.observe?.(record, plugin); } }],
    };
  })] });
  return { plugin, context: () => context };
}
async function create(service: ApplicationService, sessionId: string, input = 1) {
  await service.sessions.execute({ type: "resource.create", sessionId, kind: Counter.kind, creation: { id: "test.counter/create" }, input, position: { x: 0, y: 0 } });
  return service.sessions.current(sessionId).workbench.objects.find(object => object.kind === Counter.kind)!.id;
}

describe("Host implementation of the workbench SDK", () => {
  // Notifications within commits take effect with the transaction; rolled-back data must not reach the UI.
  it("transactional resource projection notifications arrive after commit and failed rollbacks push nothing", async () => {
    const c = counter(), changed = vi.fn();
    const { service, sessionId } = open([c.plugin], undefined, changed);
    const id = await create(service, sessionId);
    await service.sessions.execute({ type: "watch", sessionId });
    const object = c.context().object(sessionId, Counter, id);
    changed.mockClear();
    expect(() => object.commit(writer => {
      writer.set(State, 99); object.invalidate();
      throw new Error("Rollback");
    })).toThrow("Rollback");
    expect(object.get(State)).toBe(1);
    expect(changed).not.toHaveBeenCalled();
    object.commit(writer => { writer.set(State, 2); object.invalidate(); });
    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ kind: "session.changed",
      objects: [expect.objectContaining({ presentation: expect.objectContaining({ data: { value: 2 } }) })] }));
  });

  // busy protects only the current path; overlapping holds release independently and cancellation waits for cleanup.
  it("withBusy overlapping holds protect backtracking and in-memory projection notifications do not write history", async () => {
    const c = counter();
    const changed = vi.fn();
    const { service, sessionId } = open([c.plugin], undefined, changed);
    const id = await create(service, sessionId);
    const object = c.context().object(sessionId, Counter, id);
    await service.sessions.execute({ type: "watch", sessionId });
    const before = service.sessions.current(sessionId);
    object.invalidate();
    const refreshed = service.sessions.current(sessionId);
    expect(refreshed.nodes).toEqual(before.nodes);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ kind: "session.changed", nodes: [],
      objects: [expect.objectContaining({ id })] }));
    const first = actionGate(), second = actionGate(), cancel = new AbortController();
    const a = object.withBusy(async () => { await first.promise; });
    const b = object.withBusy(async signal => { await second.promise; signal.throwIfAborted(); }, { signal: cancel.signal });
    const rejected = expect(b).rejects.toThrow();
    try {
      expect(service.sessions.current(sessionId).progress.busyObjectIds).toEqual([id]);
      first.resolve(); await a;
      cancel.abort();
      await expect(service.sessions.execute({ type: "select", sessionId, nodeId: before.cursor })).rejects.toMatchObject({ code: "conflict" });
      expect(service.sessions.current(sessionId).progress.busyObjectIds).toEqual([id]);
    } finally { first.resolve(); second.resolve(); }
    await rejected;
    expect(service.sessions.current(sessionId).progress.busyObjectIds).toEqual([]);
    await service.sessions.execute({ type: "select", sessionId, nodeId: before.cursor });
  });

  // Backend actions consume real contracts and reuse the complete preparation pipeline without acquiring target-private facades.
  it("session.invoke reuses preparation and record origins across plugins and rejects declaration copies and invalid targets", async () => {
    const c = counter(), caller = pluginNamespace("test.action-caller");
    let consumer!: PluginContext, prepared = 0, reject = false;
    const { service, sessionId } = open([c.plugin, definePlugin({ namespace: caller, version: "1", setup(plugin) {
      consumer = plugin;
      return { preparers: [implementPreparer(ChangeCount, { id: "adjust", prepare(input) {
        prepared++;
        if (reject) return { action: "reject", code: "counter_blocked", message: "Counter changes are blocked.", display: "Changes are paused." };
        return { action: "replace", input: { amount: input.amount + 10 } };
      } })] };
    } })]);
    const objectId = await create(service, sessionId), target = { sessionId, id: objectId, kind: Counter.kind };
    await expect(consumer.session(sessionId).invoke(ChangeCount, target, { amount: 3 })).resolves.toBeUndefined();
    expect(c.context().object(sessionId, Counter, objectId).get(State)).toBe(15);
    expect(prepared).toBe(1);
    const last = consumer.session(sessionId).snapshot().records.last(Changed, { scope: "timeline" });
    expect(last?.record.source).toEqual({ plugin: ns.id, resource: target });
    expect(() => consumer.object(sessionId, Counter, objectId)).toThrow("another plugin");
    reject = true;
    await expect(consumer.session(sessionId).invoke(ChangeCount, target, { amount: 1 }))
      .rejects.toMatchObject({ reason: "counter_blocked", display: "Changes are paused." });
    await expect(consumer.session(sessionId).invoke({ ...ChangeCount }, target, { amount: 1 })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(consumer.session(sessionId).invoke(SubmitAgentInput, target, {
      submissionId: nanoid(16), mode: "follow", parts: [{ kind: "text", text: "Wrong type" }],
    })).rejects.toMatchObject({ code: "invalid_argument" });
    const other = service.sessions.tree.create("Other");
    await expect(consumer.session(other).invoke(ChangeCount, target, { amount: 1 })).rejects.toMatchObject({ code: "invalid_argument" });
    consumer.session(sessionId).remove(target);
    await expect(consumer.session(sessionId).invoke(ChangeCount, target, { amount: 1 })).rejects.toMatchObject({ code: "not_found" });
    expect(prepared).toBe(2);
  });

  // Resource actions serialize per object; cancelled queued calls never execute and later actions still wait for actual prior completion.
  it("backend and desktop actions share a queue and queued cancellation does not change order", async () => {
    const entered = deferred<void>(), end = actionGate(), order: number[] = [];
    const c = counter({ async execute(_object, signal, amount) {
      order.push(amount);
      if (amount === 2) { entered.resolve(); await end.promise; }
      signal.throwIfAborted();
    } });
    const { service, sessionId } = open([c.plugin]), id = await create(service, sessionId);
    const target = { sessionId, id, kind: Counter.kind }, session = c.context().session(sessionId);
    const first = session.invoke(ChangeCount, target, { amount: 1 });
    await entered.promise;
    const controller = new AbortController();
    const cancelled = session.invoke(ChangeCount, target, { amount: 2 }, { signal: controller.signal });
    const rejected = expect(cancelled).rejects.toThrow();
    const last = service.sessions.execute({ type: "resource.command", sessionId, objectId: id, command: resourceCall(ChangeCount, { amount: 3 }) });
    controller.abort();
    expect(order).toEqual([2]);
    end.resolve(); await Promise.all([first, rejected, last]);
    expect(order).toEqual([2, 4]);
    expect(c.context().object(sessionId, Counter, id).get(State)).toBe(7);
  });

  // Preparation and execution both belong to in-flight calls; cancellation signals cannot release lifetimes early and late preparation cannot enter actions.
  it.each(["prepare", "execute"] as const)("cancelling backend actions during %s waits for actual completion and blocks backtracking", async phase => {
    const entered = deferred<AbortSignal>(), end = actionGate();
    const wait = async (signal: AbortSignal) => { entered.resolve(signal); await end.promise; signal.throwIfAborted(); };
    const c = counter(phase === "prepare" ? { prepare: wait } : { execute: (_object, signal) => wait(signal) });
    const { service, sessionId } = open([c.plugin]), id = await create(service, sessionId);
    const controller = new AbortController();
    const call = c.context().session(sessionId).invoke(ChangeCount, { sessionId, id, kind: Counter.kind }, { amount: 1 }, { signal: controller.signal });
    const rejected = expect(call).rejects.toThrow();
    const signal = await entered.promise;
    controller.abort();
    expect(signal.aborted).toBe(true);
    await expect(service.sessions.execute({ type: "select", sessionId, nodeId: null })).rejects.toThrow("settle");
    expect(() => c.context().session(sessionId).remove({ sessionId, id, kind: Counter.kind })).toThrow("settle");
    end.resolve(); await rejected;
    expect(c.context().object(sessionId, Counter, id).get(State)).toBe(1);
  });

  // Close contract: entered actions can commit final facts; the new-call gate must not block the first finalization commit.
  it("backend actions already entered can save final records during close", async () => {
    const entered = deferred<AbortSignal>(), end = actionGate();
    let saved: number | null = null;
    const c = counter({ async execute(_object, signal) { entered.resolve(signal); await end.promise; expect(signal.aborted).toBe(true); },
      afterAction(object) { saved = object.get(State); } });
    const { service, sessionId } = open([c.plugin]), id = await create(service, sessionId);
    const call = c.context().session(sessionId).invoke(ChangeCount, { sessionId, id, kind: Counter.kind }, { amount: 1 });
    await entered.promise;
    const closing = service.close();
    end.resolve();
    await call; await closing;
    services.splice(services.indexOf(service), 1);
    expect(saved).toBe(3);
  });

  // Reentry on the same object conflicts explicitly; asynchronous work after action completion can submit again without turning historical call chains into permanent locks.
  it("rejects same-object reentry and releases completed action call chains", async () => {
    let deferred: Promise<void> | undefined;
    const resume = actionGate();
    const c = counter({ async execute(object, _signal, amount) {
      if (amount !== 2) return;
      await expect(object.session.invoke(ChangeCount, object.ref, { amount: 2 })).rejects.toMatchObject({ code: "conflict" });
      await expect(c.context().session(object.ref.sessionId).invoke(ChangeCount, object.ref, { amount: 2 })).rejects.toMatchObject({ code: "conflict" });
      deferred = resume.promise.then(() => object.session.invoke(ChangeCount, object.ref, { amount: 2 }));
    } });
    const { service, sessionId } = open([c.plugin]), id = await create(service, sessionId);
    await c.context().session(sessionId).invoke(ChangeCount, { sessionId, id, kind: Counter.kind }, { amount: 1 });
    resume.resolve(); await deferred;
    expect(c.context().object(sessionId, Counter, id).get(State)).toBe(6);
  });

  // External providers use the same model tool catalog and read-only association facades; tool policy is captured at request start.
  it("external top-level tools are declared from the first request, bind calling objects, and follow tool filtering", async () => {
    const c = counter(), other = pluginNamespace("test.questions");
    let invoked = 0;
    const declaration = defineTopLevelTool({
      id: other.name("prompt"), name: "prompt", description: "Return an answer.", guidelines: [],
      argsSchema: z.strictObject({ text: z.string() }).describe("Question text."),
      resultSchema: z.string().describe("Answer text."), effect: "read", execution: "parallel",
      async execute(args, context) {
        invoked++;
        expect(context.object.ref.kind).toBe(Counter.kind);
        expect(context.callId).toBe("question");
        expect(context.object).not.toHaveProperty("commit");
        expect(() => context.object.get(State)).toThrow("another plugin");
        context.publish("Waiting");
        return { kind: "succeeded", data: `Answer: ${args.text}` };
      },
    });
    const plugin = definePlugin({ namespace: other, version: "1.0.0", modules: [defineModule(() => ({ topLevelTools: [declaration] }))] });
    const requests: ModelInput[] = [];
    const { service, sessionId } = open([c.plugin, plugin], () => ({ version: "test/1", validate() {}, prepare(input) {
      requests.push(input);
      return { async *stream() {
        yield { type: "part.start", part: { id: "q", kind: "toolcall", name: "prompt", callId: "question" } };
        yield { type: "part.end", partId: "q", arguments: { text: "Hello" } };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } };
    } }));
    const target = await configureModel(service);
    const object = { id: await create(service, sessionId), sessionId, kind: Counter.kind };
    const run = (allow?: string[]) => c.context().models.run({
      object, target, requestParentId: c.context().session(sessionId).snapshot().position.nodeId,
      system: { blocks: [] }, messages: [], tools: { allow }, signal: new AbortController().signal, observer: { event() {} },
    });
    const allowed = await run(["prompt"]);
    expect(requests[0]!.tools.map(tool => tool.name)).toEqual(["resource_list", "resource_inspect", "resource_call", "prompt"]);
    expect(allowed.tools[0]).toMatchObject({ kind: "succeeded", implementation: { id: declaration.id }, data: "Answer: Hello" });
    expect(allowed.tools[0]).not.toHaveProperty("resource");
    const denied = await run([]);
    expect(requests[1]!.tools.map(tool => tool.name)).toEqual(["resource_list", "resource_inspect", "resource_call"]);
    expect(denied.tools[0]?.kind).toBe("rejected");
    expect(invoked).toBe(1);
  });

  // Top-level tools override complete declarations in user-list order; failed contributions reserve no names, and model declarations and execution identities share the same winner.
  it.each(["loaded", "setup-failed", "validation-failed"] as const)("same-name top-level tools replace built-in ask_user when the latter's state is %s", async state => {
    const c = counter(), first = pluginNamespace("test.first"), last = pluginNamespace("test.last");
    const invoked: string[] = [];
    const previous = defineTopLevelTool({
      id: first.name("ask"), name: "ask_user", description: "First question UI.", guidelines: [],
      argsSchema: z.number().describe("Question number."), resultSchema: z.number().describe("Answer number."),
      effect: "read", execution: "parallel",
      async execute(value) { invoked.push(first.id); return { kind: "succeeded", data: value }; },
    });
    const replacement = defineTopLevelTool({
      id: last.name("ask"), name: "ask_user", description: "Replacement question UI.", guidelines: [],
      argsSchema: z.strictObject({ prompt: z.string() }).describe("Question prompt."),
      resultSchema: z.string().describe("Answer text."), effect: "read", execution: "parallel",
      async execute(value) { invoked.push(last.id); return { kind: "succeeded", data: value.prompt }; },
    });
    const missingAction = defineAction(last.resource("missing", z.object({})), { id: last.name("missing"), schema: z.null() });
    const later = definePlugin({ namespace: last, version: "1", modules: [
      defineModule(() => ({ topLevelTools: [replacement],
        ...(state === "validation-failed" ? { preparers: [{ id: "invalid", contract: missingAction, prepare: () => ({ action: "accept" as const }) }] } : {}) })),
      defineModule(() => { if (state === "setup-failed") throw new Error("Setup failed."); return {}; }),
    ] });
    // The normal case deliberately initializes the later entry first to verify user-list precedence; failure cases keep the first entry independently available.
    const earlier = definePlugin({ namespace: first, version: "1", dependencies: state === "loaded" ? [last.id] : [],
      modules: [defineModule(() => ({ topLevelTools: [previous] }))] });
    const requests: ModelInput[] = [];
    const { service, sessionId } = open([c.plugin, earlier, later], () => ({
      version: "test/1", validate() {}, prepare(input) {
        requests.push(input);
        return { async *stream() {
          yield { type: "part.start", part: { id: "q", kind: "toolcall", name: "ask_user", callId: "question" } };
          yield { type: "part.end", partId: "q", arguments: state === "loaded" ? { prompt: "Hello" } : 42 };
          yield { type: "finish", reason: "tool-calls", usage: null };
        } };
      },
    }));
    const target = await configureModel(service);
    const object = { id: await create(service, sessionId), sessionId, kind: Counter.kind };
    const result = await c.context().models.run({
      object, target, requestParentId: c.context().session(sessionId).snapshot().position.nodeId,
      system: { blocks: [] }, messages: [], tools: { allow: ["ask_user"] }, signal: new AbortController().signal, observer: { event() {} },
    });
    const selected = state === "loaded" ? replacement : previous;
    expect(service.sessions.plugins.find(plugin => plugin.id === last.id)?.status).toBe(state === "loaded" ? "loaded" : "failed");
    expect(requests[0]!.tools.filter(tool => tool.name === "ask_user")).toMatchObject([{
      description: selected.description, parameters: { type: state === "loaded" ? "object" : "number" },
    }]);
    expect(result.tools[0]).toMatchObject({
      kind: "succeeded", implementation: { id: selected.id }, data: state === "loaded" ? "Hello" : 42,
    });
    expect(invoked).toEqual([state === "loaded" ? last.id : first.id]);
  });

  // External contributions may associate other plugins' objects, while the host still protects declaration instances, origins, and private-data boundaries.
  it("typed calls bind real associated objects and backend origins and reject forged contracts, cross-session references, and invalid output", async () => {
    const c = counter(), other = pluginNamespace("test.questions");
    const query = defineCall(other.name("query"), { scope: "object", input: z.string().trim(), output: z.string() });
    const invalid = defineCall(other.name("invalid"), { scope: "object", input: z.null(), output: z.number() });
    const plugin = definePlugin({ namespace: other, version: "1.0.0", modules: [defineModule(() => ({
      calls: [
        implementCall(query, async (input, context) => {
          expect(context.source).toEqual({ plugin: ns.id, resource: null });
          expect(context.object.ref.kind).toBe(Counter.kind);
          expect(context.object.snapshot()?.title).toBe("Counter");
          expect(() => context.object.get(State)).toThrow("another plugin");
          expect(context.object).not.toHaveProperty("commit");
          return input;
        }),
        implementCall(invalid, async () => "not a number" as never),
      ],
    }))] });
    const { service, sessionId } = open([c.plugin, plugin]);
    const id = await create(service, sessionId);
    const object = { id, sessionId, kind: Counter.kind };
    expect(await c.context().ipc.calls.invoke(query, " value ", { object })).toBe("value");
    await expect(c.context().ipc.calls.invoke({ ...query }, "value", { object })).rejects.toMatchObject({ code: "invalid_argument" });
    const otherSession = service.sessions.tree.create("Other");
    await expect(service.sessions.calls.invoke(query.id, "value", { object: { ...object, sessionId: otherSession } }, null)).rejects.toMatchObject({ code: "unavailable" });
    await expect(service.sessions.calls.invoke(invalid.id, null, { object }, null)).rejects.toThrow();
  });

  // Read-only calls do not occupy timelines; cancellation and host close still wait for actual handler completion.
  it.each(["renderer", "plugin"] as const)("%s read-only calls do not mark resources busy and still wait for actual cleanup after cancellation", async source => {
    const c = counter(), other = pluginNamespace("test.questions");
    const wait = defineCall(other.name("wait"), { scope: "object", input: z.null(), output: z.null() });
    let signal!: AbortSignal, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const plugin = definePlugin({ namespace: other, version: "1.0.0", modules: [defineModule(() => ({
      calls: [implementCall(wait, async (_input, context) => { signal = context.signal; await gate; return null; })],
    }))] });
    const { service, sessionId } = open([c.plugin, plugin]);
    const object = { id: await create(service, sessionId), sessionId, kind: Counter.kind };
    const controller = new AbortController();
    const waiting = source === "renderer"
      ? service.sessions.calls.invoke(wait.id, null, { object, signal: controller.signal }, null)
      : c.context().ipc.calls.invoke(wait, null, { object, signal: controller.signal });
    const rejected = expect(waiting).rejects.toThrow();
    try {
      expect(service.sessions.running).toBe(false);
      expect(service.sessions.current(sessionId).progress).toMatchObject({ busyObjectIds: [] });
      controller.abort();
      expect(signal.aborted).toBe(true);
      expect(service.sessions.running).toBe(false);
      expect(service.sessions.current(sessionId).progress.busyObjectIds).toEqual([]);
    } finally { release(); }
    await rejected;
    expect(service.sessions.running).toBe(false);
  });

  it("read facades expose no mutation of objects or nested sessions", async () => {
    let reader!: ObjectReader;
    const c = counter({ onRead: value => { reader = value; } });
    const { service, sessionId } = open([c.plugin]);
    await create(service, sessionId);
    service.sessions.current(sessionId);
    expect(reader.get(State)).toBe(1);
    expect(reader).not.toHaveProperty("commit");
    expect(reader.session).not.toHaveProperty("commit");
    expect(reader.session).not.toHaveProperty("resume");
    expect(reader.session.title).not.toHaveProperty("set");
  });
  it("actions validate identity, resource ownership, and input against host contracts and rejected calls leave no writes", async () => {
    const c = counter();
    const { service, sessionId } = open([c.plugin]);
    const objectId = await create(service, sessionId);
    const before = service.sessions.tree.nodes(sessionId).map(flat).length;
    for (const command of [
      { ...resourceCall(ChangeCount, { amount: 1 }), id: "test.counter/missing" },
      { id: SubmitAgentInput.id, input: { amount: 1 } },
      { id: ChangeCount.id, input: { amount: "wrong" } },
    ]) {
      await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId, command })).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(before);
    expect(c.context().object(sessionId, Counter, objectId).get(State)).toBe(1);
  });
  it("creation inputs parse once and create uses transformed results after preparation acceptance", async () => {
    const transform = vi.fn((value: number) => value + 1);
    const contract = defineCreation(Counter, { id: ns.name("transform"), schema: z.number().transform(transform) });
    const created = vi.fn((_value: number) => ({ title: "Counter", data: {} }));
    const prepare = vi.fn((_value: number) => ({ action: "accept" as const }));
    const plugin = definePlugin({ namespace: ns, version: "1", modules: [defineModule(() => ({
      resources: [implementResource(Counter, View, {
        creation: implementCreation(contract, { prepare, create: created }), project: () => ({ value: 0 }), inspect: async () => null,
      })],
    }))] });
    const { service, sessionId } = open([plugin]);
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Counter.kind,
      creation: { id: contract.id }, input: 0, position: { x: 0, y: 0 } });
    expect(transform).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0]?.[0]).toBe(1);
    expect(created.mock.calls[0]?.[0]).toBe(1);
  });
  it("action preparation reuses parsed results and replacements parse once as new input through the resource owner's schema", async () => {
    const transform = vi.fn((value: string) => Number(value) + 1);
    const action = defineAction(Counter, { id: ns.name("transform"), schema: z.string().regex(/^\d+$/u).transform(transform) });
    const seen: number[] = [], executed = vi.fn();
    const c = counter();
    const plugin = definePlugin({ ...c.plugin, modules: [defineModule(context => {
      const contribution = c.plugin.modules[0]!.setup(context);
      return { ...contribution, resources: contribution.resources!.map(resource => ({
        ...resource, actions: [implementAction(action, {
          prepare(value) { seen.push(value); return { action: "accept" }; },
          async execute(value) { executed(value); },
        })],
      })) };
    })] });
    let replacement = "10", rejected = false;
    const preparers = definePlugin({ namespace: pluginNamespace("test.prepare"), version: "1", modules: [defineModule(() => ({
      preparers: [
        implementPreparer(action, { id: "accept", prepare(value) { seen.push(value); return { action: "accept" }; } }),
        implementPreparer(action, { id: "replace", prepare() { return { action: "replace" as const, input: replacement }; } }),
        implementPreparer(action, { id: "after", prepare(value) { seen.push(value); return rejected ? { action: "reject", code: "blocked", message: "Blocked by preparer." } : { action: "accept" }; } }),
      ],
    }))] });
    const { service, sessionId } = open([plugin, preparers]);
    const objectId = await create(service, sessionId);
    const invoke = () => service.sessions.execute({ type: "resource.command", sessionId, objectId, command: resourceCall(action, "0") });
    await invoke();
    expect(seen).toEqual([1, 11, 11]);
    expect(transform.mock.calls.map(([value]) => value)).toEqual(["0", "10"]);
    expect(executed).toHaveBeenCalledExactlyOnceWith(11);
    replacement = "invalid";
    await expect(invoke()).rejects.toMatchObject({ code: "invalid_request" });
    expect(executed).toHaveBeenCalledTimes(1);
    replacement = "10"; rejected = true;
    await expect(invoke()).rejects.toThrow("Blocked by preparer.");
    expect(executed).toHaveBeenCalledTimes(1);
  });
  it("close cancels and awaits in-flight preparation without releasing host facilities before preparation ends", async () => {
    const c = counter();
    let preparationSignal!: AbortSignal;
    let begin!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { begin = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const observer = definePlugin({ namespace: pluginNamespace("test.prepare-close"), version: "1", modules: [defineModule(() => ({
      preparers: [{ id: "hold", contract: ChangeCount, async prepare(_input, { signal }) {
        preparationSignal = signal; begin(); await held; return { action: "accept" };
      } }],
    }))] });
    const { service, sessionId } = open([c.plugin, observer]);
    const objectId = await create(service, sessionId);
    const invocation = service.sessions.execute({ type: "resource.command", sessionId, objectId, command: resourceCall(ChangeCount, { amount: 1 }) });
    const rejected = expect(invocation).rejects.toThrow();
    await started;
    let closed = false;
    const closing = service.close().then(() => { closed = true; });
    services.splice(services.indexOf(service), 1);
    expect(preparationSignal.aborted).toBe(true);
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await Promise.all([closing, rejected]);
    expect(closed).toBe(true);
  });
  it("home input preparation replacements must satisfy submission contracts and failures create no sessions", async () => {
    const namespace = pluginNamespace("test.first-input");
    const plugin = definePlugin({ namespace, version: "1", modules: [defineModule(() => ({
      preparers: [{ id: "empty-input", contract: SubmitAgentInput,
        prepare: () => ({ action: "replace", input: {} }) }],
    }))] });
    const { service } = open([plugin]);
    const target = await configureModel(service);
    const before = service.sessions.tree.list();
    await expect(service.sessions.execute({ type: "start", submissionId: nanoid(16),
      agent: "worker", model: target.model, thinking: null, parts: [{ kind: "text", text: "First" }] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.sessions.tree.list()).toEqual(before);
    expect(service.sessions.running).toBe(false);
  });
  it("current data is isolated by session and object and other plugin contracts cannot write into this scope", async () => {
    const c = counter(), { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId, 3), session = c.context().session(sessionId);
    session.commit(writer => { writer.set(State, 8); });
    expect(session.get(State)).toBe(8);
    expect(c.context().object(sessionId, Counter, id).get(State)).toBe(3);
    expect(c.context().session(service.sessions.tree.create("Other")).get(State)).toBeNull();
    const foreign = pluginNamespace("other.plugin").data("state", z.number());
    expect(() => session.commit(writer => { writer.set(foreign, 1); })).toThrow();
    expect(session.get(State)).toBe(8);
  });

  it("data-only commits notify views without appending records or calling record observers", async () => {
    const observed: SessionRecord[] = [], notifications: string[] = [];
    const c = counter({ observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin], undefined, event => notifications.push(event.kind));
    await create(service, sessionId);
    await service.sessions.execute({ type: "watch", sessionId });
    const session = c.context().session(sessionId), before = session.snapshot().records.all({ scope: "session" });
    observed.length = notifications.length = 0;
    session.commit(writer => { writer.set(State, 8); });
    expect(session.get(State)).toBe(8);
    expect(session.snapshot().records.all({ scope: "session" })).toEqual(before);
    expect(observed).toEqual([]);
    expect(notifications).toContain("session.changed");
  });

  it("nested commit failures roll back data and records together without delivering uncommitted state to views or observers", async () => {
    const observed: SessionRecord[] = [], notifications: string[] = [];
    const c = counter({ observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin], undefined, event => notifications.push(event.kind));
    const id = await create(service, sessionId, 3), session = c.context().session(sessionId), object = c.context().object(sessionId, Counter, id);
    const before = session.snapshot().records.all({ scope: "session" });
    session.commit(writer => { writer.set(State, 8); }); observed.length = notifications.length = 0;
    expect(() => session.commit(writer => {
      writer.set(State, 9);
      object.commit(inner => { inner.set(State, 10); inner.append(Changed, { value: 10 }); });
      throw new Error("Rollback.");
    })).toThrow("Rollback.");
    expect(session.get(State)).toBe(8); expect(object.get(State)).toBe(3);
    expect(session.snapshot().records.all({ scope: "session" })).toEqual(before);
    expect(observed).toEqual([]); expect(notifications).toEqual([]);
  });

  it("data reads follow actual shapes; compatible declarations keep reading while incompatible declarations reject without rewriting original values", async () => {
    const c = counter();
    const nextState = ns.data("state", z.number().int());
    const { service, sessionId } = open([c.plugin]);
    const session = c.context().session(sessionId);
    session.commit(writer => { writer.set(nextState, 12); });
    expect(session.get(nextState)).toBe(12);
    expect(session.get(State)).toBe(12);
    expect(() => session.get(ns.data("state", z.string()))).toThrow();
    expect(session.get(State)).toBe(12);
  });

  it("unsupported database versions reject opening without changing existing plugin data or records", async () => {
    const c = counter(), { root, service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId, 42);
    await service.close(); services.splice(services.indexOf(service), 1);
    const file = join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile);
    const db = new DatabaseSync(file);
    const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
    try { db.exec("PRAGMA user_version = 999"); } finally { db.close(); }
    expect(() => new ApplicationService(root)).toThrow(DatabaseVersionError);
    const unchanged = new DatabaseSync(file);
    try {
      expect(unchanged.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 999 });
      unchanged.exec("PRAGMA user_version = " + version);
    } finally { unchanged.close(); }
    const reopened = new ApplicationService(root, { plugins: [c.plugin] }); services.push(reopened);
    expect(c.context().object(sessionId, Counter, id).get(State)).toBe(42);
    expect(c.context().session(sessionId).snapshot().records.first(Changed, { scope: "timeline" })).toMatchObject({ data: { value: 42 } });
  });

  it("resources independent of Agent create with events and state in one transaction and envelopes associate real resource kinds", async () => {
    const observed: SessionRecord[] = [];
    let createdValue: number | null = null;
    const c = counter({ observe: record => observed.push(record), afterCreate: object => { createdValue = object.get(State); } });
    const { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId, 3);
    expect(createdValue).toBe(3);
    const snapshot = c.context().session(sessionId).snapshot();
    expect(snapshot.resources.get(Counter, id)?.status).toBe("known");
    expect(snapshot.records.first(Changed, { scope: "timeline" })).toMatchObject({ status: "known", data: { value: 3 }, record: { source: { plugin: "test.counter", resource: { id, kind: Counter.kind } } } });
    expect(observed.map(record => record.contract.id)).toEqual([Changed.id, "resource_created"]);
    expect(service.sessions.current(sessionId).workbench.objects.find(object => object.id === id)?.presentation.data).toEqual({ value: 3 });
    const session = c.context().session(sessionId);
    session.commit(writer => { writer.append(Changed, { value: 4 }); });
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toMatchObject({
      record: { source: { plugin: ns.id, resource: null } }, data: { value: 4 },
    });
  });

  it("SDK tools use the same host catalog and validate typed arguments and output at the adapter boundary", async () => {
    const c = counter();
    const tool = defineTool({ id: "test.tools/counter_read", name: "counter_read", description: "Read the counter.", guidelines: [],
      argsSchema: z.strictObject({}).describe("No arguments.") });
    const implementation = defineImplementation({
      ...ns.data("read-result", z.number().describe("The current counter value.")),
      resource: Counter, tool, targetSchema: z.null().describe("The whole counter."), effect: "read", execution: "parallel",
    });
    let toolObject!: ObjectExecutor;
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({
      tools: [implementTool(implementation, { async call(_data, _target, _args, context) {
        toolObject = context.object;
        // SDK caller is a host-provided read-only identity snapshot separate from writable target-object facades.
        expect(context.caller).toEqual({ ref: { sessionId: context.object.ref.sessionId, id: "caller", kind: "test/agent" }, title: "Caller" });
        expect(Object.isFrozen(context.caller.ref)).toBe(true);
        context.publish(context.object.get(State)!);
        return { kind: "succeeded", data: context.object.get(State)! };
      } })],
    }))] });
    let tools!: ToolRegistry;
    const original = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
      const modules = original(...args); tools = modules.tools; return modules;
    });
    const { service, sessionId } = open([plugin]);
    await create(service, sessionId, 4);
    const resource = foldWorkbench(service.sessions.tree.timeline(sessionId).map(flat)).objects[0]!;
    const adapted = tools.match(resource)[0]!;
    const invocation = adapted.prepare(resource, null, {}, { ref: { sessionId, id: "caller", kind: "test/agent" }, title: "Caller" });
    if (!("execute" in invocation)) throw new Error("Expected a tool invocation.");
    const progress: unknown[] = [];
    expect(await invocation.execute(new AbortController().signal, data => progress.push(data))).toEqual({ kind: "succeeded", data: 4 });
    expect(progress).toEqual([4]);
    expect(() => toolObject.commit(writer => { writer.set(State, 5); })).toThrow();
    expect(() => toolObject.session.commit(writer => { writer.set(State, 5); })).toThrow();
    expect(() => toolObject.session.title.set("Late")).toThrow();
  });

  it("creation failures roll back object state and records and temporary object facades cannot outlive failed creation", async () => {
    let provisional!: ObjectExecutor;
    const observed: SessionRecord[] = [];
    const c = counter({ failCreate: true, onCreate: object => { provisional = object; }, observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin]);
    await expect(create(service, sessionId)).rejects.toThrow("Creation failed.");
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toEqual([]);
    expect(observed).toEqual([]);
    expect(() => provisional.get(State)).toThrow();
    expect(() => provisional.commit(writer => { writer.set(State, 9); })).toThrow();
  });

  it("asynchronous commits roll back and escaped writers expire after commit ends", async () => {
    const c = counter(), { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId), object = c.context().object(sessionId, Counter, id);
    const before = object.session.snapshot().records.all({ scope: "session" });
    let escaped!: ObjectWriter;
    expect(() => object.commit(((writer: ObjectWriter) => {
      escaped = writer; writer.set(State, 99); writer.append(Changed, { value: 99 }); return Promise.resolve();
    }) as unknown as Parameters<ObjectExecutor["commit"]>[0])).toThrow();
    expect(() => escaped.set(State, 123)).toThrow();
    expect(object.get(State)).toBe(1);
    expect(object.session.snapshot().records.all({ scope: "session" })).toEqual(before);
  });

  it("record writes accept declared instances only and reject same-ID forged schemas and undeclared records", async () => {
    const c = counter(), { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId), object = c.context().object(sessionId, Counter, id);
    const before = object.session.snapshot().records.all({ scope: "session" });
    const forged = defineRecord(Changed.id, { schema: z.object({ value: z.string() }) });
    expect(() => object.commit(writer => { writer.append(forged, { value: "invalid" }); })).toThrow();
    const undeclared = defineRecord(ns.name("undeclared"), { schema: z.number() });
    expect(() => object.commit(writer => { writer.append(undeclared, 1); })).toThrow();
    expect(object.session.snapshot().records.all({ scope: "session" })).toEqual(before);
  });

  it("the host validates session, resource ownership, and current path for object handles", async () => {
    const c = counter(); const { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId);
    const object = c.context().object(sessionId, Counter, id);
    expect(() => c.context().object("wrong", Counter, id)).toThrow();
    expect(() => c.context().object(sessionId, Counter, "missing")).toThrow();
    expect(() => c.context().object(sessionId, { ...Counter, kind: "foreign.plugin/thing" }, id)).toThrow();
    await service.sessions.execute({ type: "object.remove", sessionId, objectId: id });
    expect(() => object.commit(writer => { writer.set(State, 5); })).toThrow();
  });

  it("event-only session plugins declare only their domains; observer appends queue and retain original batch snapshots", () => {
    const eventNs = pluginNamespace("test.events");
    const Input = defineRecord(eventNs.name("input"), { schema: z.string() });
    const Follow = defineRecord(eventNs.name("follow"), { schema: z.string() });
    let context!: PluginContext;
    const seen: [string, number][] = [];
    const positions: number[] = [];
    const plugin = definePlugin({ namespace: eventNs, version: "1", modules: [defineModule(plugin => {
      context = plugin;
      return { records: [Input, Follow], observers: [
        { id: "append", committed(event) {
          if (event.records.some(record => Input.decode(record))) event.session.commit(writer => { writer.append(Follow, "second"); });
        } },
        { id: "read", committed(event) {
          seen.push([event.records[0]!.contract.id, event.snapshot.records.all({ scope: "session" }).length]);
        }, cursorChanged(event) {
          positions.push(event.snapshot.records.all({ scope: "timeline" }).length);
        } },
      ] };
    })] });
    const { service, sessionId } = open([plugin]);
    context.session(sessionId).commit(writer => { writer.append(Input, "first"); });
    expect(seen).toEqual([[Input.id, 1], [Follow.id, 2]]);
    expect(positions).toEqual([1, 2]);
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(2);
  });

  // Cursor observation contract: appends and explicit cursor selection notify the final timeline uniformly; data/title-only writes and read-only queries do not notify.
  it("cursor observation is independent of record commits; batch and nested commits notify only final positions and rollbacks never notify", async () => {
    const eventNs = pluginNamespace("test.cursor");
    const Entry = defineRecord(eventNs.name("entry"), { schema: z.string() });
    const Current = eventNs.data("current", z.number());
    let context!: PluginContext;
    const commits: string[][] = [], paths: string[][] = [], published: string[] = [];
    const plugin = definePlugin({ namespace: eventNs, version: "1", modules: [defineModule(plugin => {
      context = plugin;
      return { records: [Entry], observers: [{
        id: "cursor",
        committed(event) { commits.push(event.records.map(record => record.id)); },
        cursorChanged(event) {
          expect(event).not.toHaveProperty("records");
          const path = event.snapshot.records.all({ scope: "timeline" }).map(record => record.id);
          paths.push(path);
          event.session.title.set(`Position ${path.length}`);
        },
      }] };
    })] });
    let current!: ApplicationService;
    const { service, sessionId } = open([plugin], undefined, event => {
      if (event.kind === "session.changed") published.push(current.sessions.tree.title(event.sessionId));
    });
    current = service;
    await service.sessions.execute({ type: "watch", sessionId });
    const session = context.session(sessionId);
    const ids: string[] = [];
    session.commit(writer => {
      ids.push(writer.append(Entry, "first"));
      session.commit(nested => { ids.push(nested.append(Entry, "second")); });
      ids.push(writer.append(Entry, "third"));
    });
    expect(commits).toEqual([ids]);
    expect(paths).toEqual([ids]);
    expect(published).toEqual(["Position 3"]);
    const first = ids[0]!;
    service.sessions.current(sessionId);
    session.commit(writer => { writer.set(Current, 1); });
    session.title.set("Current title");
    expect(paths).toHaveLength(1);
    expect(commits).toHaveLength(1);
    expect(() => session.commit(writer => {
      writer.append(Entry, "rolled back");
      throw new Error("Rollback");
    })).toThrow("Rollback");
    expect(paths).toHaveLength(1);
    expect(commits).toHaveLength(1);
    await service.sessions.execute({ type: "select", sessionId, nodeId: first });
    expect(paths).toEqual([ids, [first]]);
    expect(commits).toHaveLength(1);
    expect(published.at(-1)).toBe("Position 1");
    await service.sessions.execute({ type: "select", sessionId, nodeId: first });
    expect(paths).toHaveLength(2);
    let branch!: string;
    session.commit(writer => { branch = writer.append(Entry, "branch"); });
    expect(paths.at(-1)).toEqual([first, branch]);
    await service.sessions.execute({ type: "select", sessionId, nodeId: null });
    expect(paths.at(-1)).toEqual([]);
    expect(commits).toEqual([ids, [branch]]);
  });

  it("titles and events written within commits take effect in one transaction; later exceptions roll back and observers see only consistent state", () => {
    const seen: [string, number][] = [];
    const c = counter({ observe: (record, plugin) => {
      const changed = Changed.decode(record);
      if (changed?.status === "known") seen.push([plugin.session(record.sessionId).title.get(), changed.data.value]);
    } });
    const { service, sessionId } = open([c.plugin]);
    const session = c.context().session(sessionId);
    expect(() => session.commit(writer => {
      session.title.set("Rolled back");
      writer.append(Changed, { value: 1 });
      throw new Error("Reject this commit.");
    })).toThrow("Reject this commit.");
    expect(session.title.get()).toBe("Counter");
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toBeNull();
    expect(seen).toEqual([]);
    session.commit(writer => {
      session.title.set("Applied");
      writer.append(Changed, { value: 2 });
    });
    expect(session.title.get()).toBe("Applied");
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toMatchObject({ data: { value: 2 } });
    expect(seen).toEqual([["Applied", 2]]);
    const other = service.sessions.tree.create("Other");
    expect(() => session.commit(() => {
      c.context().session(other).title.set("Foreign");
    })).toThrow();
    expect(c.context().session(other).title.get()).toBe("Other");
  });

  it("public run delivers events and callers decide whether to save history under their own record contracts", async () => {
    const c = counter();
    const Execution = defineRecord(ns.name("execution"), { schema: modelRunRecordSchema });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [Execution] }))] });
    const inputs: ModelInput[] = [];
    const { service, sessionId } = open([plugin], () => ({ validate() {}, version: "test-adapter", prepare(input) {
      inputs.push(structuredClone(input));
      return { async *stream() {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c", name: "resource_list" } };
        yield { type: "part.end", partId: "c", arguments: {} };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } };
    } }));
    const target = await configureModel(service);
    const id = await create(service, sessionId);
    const object = c.context().object(sessionId, Counter, id);
    const before = object.session.snapshot();
    const result = await c.context().models.run({ object: object.ref, requestParentId: before.position.nodeId,
      userAgent: "PluginAgent/1.0",
      target, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "First projection" }] }], signal: new AbortController().signal,
      observer: { event(event) { if (event.type !== "progress") object.commit(writer => { writer.append(Execution, modelRunRecordSchema.parse(event)); }); } },
    });
    expect(result).toMatchObject({ reason: "completed", tools: [{ kind: "succeeded" }], source: { adapter: "test-adapter" } });
    expect(object.session.snapshot().records.query(Execution, { scope: "timeline" }).map(record => record.status)).toEqual(["known"]);
    const count = service.sessions.tree.nodes(sessionId).map(flat).length;
    await c.context().models.run({ object: object.ref, requestParentId: object.session.snapshot().position.nodeId,
      userAgent: "PluginAgent/1.0",
      target, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "Second projection" }] }], signal: new AbortController().signal,
      observer: { event() {} },
    });
    expect(inputs.map(input => input.messages)).toEqual([[{ kind: "input", parts: [{ kind: "text", text: "First projection" }] }], [{ kind: "input", parts: [{ kind: "text", text: "Second projection" }] }]]);
    // run obtains session identity from validated objects; the host must preserve plugin UA and session IDs across subsequent rounds.
    expect(inputs.map(({ userAgent, sessionId }) => ({ userAgent, sessionId }))).toEqual([
      { userAgent: "PluginAgent/1.0", sessionId }, { userAgent: "PluginAgent/1.0", sessionId },
    ]);
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(count);
  });

  it("public stream fixes explicit input without saving history or implicitly adding host tools", async () => {
    const c = counter(), inputs: ModelInput[] = [];
    const { service, sessionId } = open([c.plugin], () => ({ validate() {}, version: "test-adapter", prepare(input) {
      inputs.push(input);
      return { async *stream() { yield { type: "finish" as const, reason: "stop", usage: null }; } };
    } }));
    const target = await configureModel(service), count = service.sessions.tree.nodes(sessionId).length;
    const streamRequest = {
      userAgent: "PluginStream/1.0", sessionId,
      target, system: { blocks: [] }, messages: [{ kind: "input" as const, parts: [{ kind: "text" as const, text: "Generate a title" }] }], signal: new AbortController().signal,
    };
    const stream = [];
    const iterable = c.context().models.stream(streamRequest);
    const first = iterable[Symbol.asyncIterator]().next();
    streamRequest.messages[0]!.parts[0]!.text = "Changed after the request began";
    streamRequest.userAgent = "Changed/2.0";
    streamRequest.sessionId = "changed-session";
    const head = await first;
    if (!head.done) stream.push(head.value);
    for await (const event of iterable) stream.push(event);
    expect(inputs[0]!.tools).toEqual([]);
    expect(inputs[0]).toMatchObject({ userAgent: "PluginStream/1.0", sessionId });
    expect(inputs[0]!.messages).toEqual([{ kind: "input", parts: [{ kind: "text" as const, text: "Generate a title" }] }]);
    expect(stream.at(-1)).toMatchObject({ type: "finish", source: { adapter: "test-adapter" } });
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(count);
    expect(service.sessions.running).toBe(false);
  });

  it.each(["cancel", "close"] as const)("active SDK requests follow finalization rules and partial content can commit to timelines after %s", async mode => {
    const c = counter();
    const Execution = defineRecord(ns.name("execution"), { schema: modelRunRecordSchema });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [Execution] }))] });
    const { service, sessionId } = open([plugin], () => ({ validate() {}, version: "test", prepare() {
      return { async *stream(signal) {
        yield { type: "part.start", part: { id: "t", kind: "text" } };
        yield { type: "part.delta", partId: "t", delta: "Partial" };
        await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
        signal.throwIfAborted();
      } };
    } }));
    const target = await configureModel(service);
    const id = await create(service, sessionId);
    const ref = { sessionId, id, kind: Counter.kind };
    const object = c.context().object(sessionId, Counter, id);
    const controller = new AbortController();
    const events: ModelRunEvent[] = [];
    let ready!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    const request = { object: ref, requestParentId: c.context().session(sessionId).snapshot().position.nodeId,
      target, system: { blocks: [] }, messages: [], signal: controller.signal,
      observer: { event(event: ModelRunEvent): undefined {
        events.push(event);
        if (event.type === "progress" && event.blocks.some(block => block.kind === "text" && block.text === "Partial")) ready();
        if (event.type !== "progress") object.commit(writer => { writer.append(Execution, modelRunRecordSchema.parse(event)); });
      } },
    };
    const done = c.context().models.run(request);
    try {
      await started;
      expect(service.sessions.running).toBe(true);
      expect(() => c.context().models.run(request)).toThrow();
      expect(service.sessions.current(sessionId).progress.busyObjectIds).toContain(id);
    } finally {
      if (mode === "cancel") controller.abort();
      else {
        await service.close();
        services.splice(services.indexOf(service), 1);
      }
    }
    expect(await done).toMatchObject({ reason: "cancelled" });
    const saved = events.filter(event => event.type !== "progress");
    expect(saved.some(event => event.type === "block")).toBe(true);
    if (mode === "cancel") expect(service.sessions.running).toBe(false);
    else expect(() => object.session.snapshot()).toThrow();
  });
});
