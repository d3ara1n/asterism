import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCreation, pluginNamespace, thinkingLevels, type Json, type ResourceRef } from "@asterism-app/sdk/contracts";
import { definePlugin, implementCreation, implementResource, type PluginContext } from "@asterism-app/sdk/runtime";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { BuiltinApplicationService, configureBuiltin } from "../../packages/builtin/src/testing.ts";
import { CreateSubagentPool, Delegation, snapshotSchema, type TaskSnapshot } from "../../packages/builtin/src/subagents/contract.ts";
import { CreateNote } from "../../packages/builtin/src/notes/contract.ts";
import type { ModelEvent, ModelInput } from "../model/contract.ts";

const namespace = pluginNamespace("test.pool-caller");
const Actor = namespace.resource("actor", z.object({}));
const ActorView = namespace.data("view", z.object({}));
const CreateActor = defineCreation(Actor, { id: namespace.name("create"), schema: z.object({}) });
const roots: string[] = [], apps: BuiltinApplicationService[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(accept => { resolve = accept; });
  return { promise, resolve };
}
async function until(latch: ReturnType<typeof gate>, signal: AbortSignal) {
  let abort!: () => void;
  const aborted = new Promise<void>(resolve => {
    abort = resolve;
    if (signal.aborted) resolve(); else signal.addEventListener("abort", abort, { once: true });
  });
  try { await Promise.race([latch.promise, aborted]); signal.throwIfAborted(); }
  finally { signal.removeEventListener("abort", abort); }
}
function* report(text: string): Generator<ModelEvent> {
  yield { type: "part.start", part: { id: "text", kind: "text" } };
  yield { type: "part.delta", partId: "text", delta: text };
  yield { type: "part.end", partId: "text" };
  yield { type: "finish", reason: "stop", usage: { input: 5, output: 2, total: 7, reasoning: null, cacheRead: 0, cacheWrite: null } };
}
function* call(resource: string, tool: string, target: Json = null, args: Json = {}): Generator<ModelEvent> {
  yield { type: "part.start", part: { id: "call", kind: "toolcall", callId: "call", name: "resource_call" } };
  yield { type: "part.end", partId: "call", arguments: { resource_id: resource, tool, target, args } };
  yield { type: "finish", reason: "tool-calls", usage: null };
}
function inputText(input: ModelInput) {
  return input.messages.flatMap(message => message.kind === "input" || message.kind === "context"
    ? message.parts.flatMap(part => part.kind === "text" ? [part.text] : []) : []);
}
async function fixture(child: (input: ModelInput, signal: AbortSignal) => AsyncIterable<ModelEvent>) {
  const root = mkdtempSync(join(tmpdir(), "asterism-pool-")); roots.push(root);
  let context!: PluginContext;
  const caller = definePlugin({ namespace, setup(plugin) {
    context = plugin;
    return { resources: [implementResource(Actor, ActorView, {
      links: { receive: true }, creation: implementCreation(CreateActor, { create: () => ({ title: "Caller", data: {} }) }),
      project: () => ({}), inspect: async () => ({}),
    })] };
  } });
  const options = { plugins: [caller], adapterFactory: () => ({
    version: "pool-test", validate() {},
    prepare(input: ModelInput) {
      if (input.system.blocks.some(block => block.id === "test.parent")) {
        const command = JSON.parse(inputText(input)[0]!) as { resource_id: string; tool: string; target: Json; args: Json };
        return { async *stream() { yield* call(command.resource_id, command.tool, command.target, command.args); } };
      }
      return { stream: (signal: AbortSignal) => child(input, signal) };
    },
  }) };
  let app = new BuiltinApplicationService(root, options); apps.push(app);
  await app.configuration.execute({ type: "modelProvider.save", id: null, credential: { action: "keep" }, value: {
    id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true, compatibility: [],
  } });
  await app.configuration.execute({ type: "model.save", id: null, value: {
    providerId: "test", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
    capabilities: { tools: true, reasoning: false, thinkingLevels: [...thinkingLevels] },
    generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  await configureBuiltin(app, { type: "role.save", id: "default", value: { id: "default", model: "test/test" } });
  const sessionId = app.sessions.tree.create("Pool");
  const actor = await context.session(sessionId).create(CreateActor, {});
  const createPool = async () => {
    const pool = await context.session(sessionId).create(CreateSubagentPool, {});
    context.session(sessionId).link(actor, pool);
    return pool;
  };
  const invoke = async (pool: ResourceRef, tool: string, target: Json = null, args: Json = {}, signal = new AbortController().signal, caller: ResourceRef = actor) => {
    const result = await context.execution.run({
      access: caller, interactive: true, target: { provider: "test", model: "test" }, signal, requestParentId: null,
      system: { blocks: [{ id: "test.parent", text: "Private parent context" }] },
      messages: [{ kind: "input", parts: [{ kind: "text", text: JSON.stringify({ resource_id: pool.id, tool: `subagent_${tool}`, target, args }) }] }],
      observer: { event() {} },
    });
    return result.tools[0]!;
  };
  const delegate = async (pool: ResourceRef, task: string, extra: Record<string, Json> = {}) => {
    const result = await invoke(pool, "delegate", null, { role: "explorer", task, ...extra });
    expect(result.kind).toBe("succeeded");
    return snapshotSchema.parse(result.data);
  };
  return { root, get app() { return app; }, get context() { return context; }, sessionId, actor, createPool, invoke, delegate,
    async check(pool: ResourceRef, id: string): Promise<TaskSnapshot> { return snapshotSchema.parse((await invoke(pool, "check", id)).data); },
    async restart() {
      await app.close(); apps.splice(apps.indexOf(app), 1);
      app = new BuiltinApplicationService(root, options); apps.push(app);
    },
  };
}

describe("Shared Subagent Pool", () => {
  it.each([null, 1])("delivers steering after the current request or reports exhausted capacity with limit=%s", async limit => {
    const entered = gate(), release = gate(), observed: string[][] = [];
    const f = await fixture(async function* (input, signal) {
      observed.push(inputText(input));
      if (observed.length === 1) { entered.resolve(); await until(release, signal); yield* report("Initial report"); }
      else yield* report("Updated report");
    });
    const pool = await f.createPool();
    await configureBuiltin(f.app, { type: "agent.save", id: "explorer", value: { id: "explorer", maxTurns: limit } });
    const task = await f.delegate(pool, "Initial task");
    await entered.promise;
    expect((await f.invoke(pool, "steer", task.input.id, { message: "Additional requirement" })).kind).toBe("succeeded");
    release.resolve();
    await f.invoke(pool, "wait", [task.input.id]);
    const completed = await f.check(pool, task.input.id);
    if (limit === null) {
      expect(observed).toEqual([["Initial task"], ["Initial task", "Additional requirement"]]);
      expect(completed).toMatchObject({ status: { outcome: "succeeded" }, output: { result: "Updated report" } });
    } else {
      expect(observed).toEqual([["Initial task"]]);
      expect(completed).toMatchObject({ status: { outcome: "partial", code: "request_budget" }, output: { result: "Initial report" } });
    }
  });

  it("limits active work to four, delivers queued steering, and keeps tasks running when a wait is cancelled", async () => {
    const released = gate(), fourth = gate(), fifth = gate();
    const inputs: string[][] = [];
    const f = await fixture(async function* (input, signal) {
      inputs.push(inputText(input));
      if (inputs.length === 4) fourth.resolve();
      if (inputs.length === 5) fifth.resolve();
      await until(released, signal);
      yield* report("Task report");
    });
    const pool = await f.createPool(), tasks: TaskSnapshot[] = [];
    for (let index = 0; index < 5; index++) tasks.push(await f.delegate(pool, `Task ${index + 1}`, { context: "Explicit background" }));
    await fourth.promise;
    expect(inputs).toHaveLength(4);
    expect((await f.check(pool, tasks[4]!.input.id)).status.phase).toBe("queued");
    expect(f.app.sessions.current(f.sessionId).progress.busyObjectIds).not.toContain(pool.id);
    expect((await f.invoke(pool, "steer", tasks[4]!.input.id, { message: "Queued instruction" })).kind).toBe("succeeded");
    const cancelledWait = new AbortController();
    const waiting = f.invoke(pool, "wait", tasks.map(task => task.input.id), {}, cancelledWait.signal);
    cancelledWait.abort(); await waiting;
    expect((await f.check(pool, tasks[0]!.input.id)).status.phase).toBe("running");
    const other = await f.context.session(f.sessionId).create(CreateActor, {});
    f.context.session(f.sessionId).link(other, pool);
    const cancelled = await f.invoke(pool, "cancel", tasks[0]!.input.id, { reason: "Work no longer needed" }, new AbortController().signal, other);
    expect(cancelled).toMatchObject({ kind: "succeeded", data: { status: { outcome: "cancelled", message: "Work no longer needed" } } });
    await fifth.promise;
    expect(inputs[4]).toEqual(["Explicit background", "Task 5", "Queued instruction"]);
    released.resolve();
    expect(inputs.flat().join(" ")).not.toContain("Private parent context");
    expect((await f.invoke(pool, "wait", tasks.map(task => task.input.id))).kind).toBe("succeeded");
    const completed = await f.check(pool, tasks[4]!.input.id);
    expect(completed).toMatchObject({ status: { outcome: "succeeded" }, output: { result: "Task report", usage: { model: "test/test", requests: 1 } } });
  });

  it("persists reports through rewind and restart, and resolves abandoned pending records without replay", async () => {
    let requests = 0;
    const f = await fixture(async function* () { requests++; yield* report("Persistent report"); });
    const pool = await f.createPool();
    const before = f.context.session(f.sessionId).snapshot().position.nodeId;
    const task = await f.delegate(pool, "Inspect");
    await f.invoke(pool, "wait", [task.input.id]);
    const delegated = f.context.session(f.sessionId).snapshot().records.first(Delegation, { scope: "timeline" })!;
    expect(delegated.record.pending).toBe(false);
    const audit = readFileSync(join(f.root, "extensions", builtin.id, "subagent-audits", `${task.input.runId}.jsonl`), "utf8");
    expect(audit).toContain("Persistent report");
    expect(audit.trim().split("\n").map(line => JSON.parse(line)).find(entry => entry.type === "input").messages)
      .toEqual([{ kind: "input", parts: [{ kind: "text", text: "Inspect" }] }]);
    await f.app.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: before });
    expect((await f.invoke(pool, "check", task.input.id)).kind).toBe("rejected");
    await f.app.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: delegated.record.id });
    expect((await f.check(pool, task.input.id)).output.result).toBe("Persistent report");
    f.app.sessions.tree.appendToTimeline(f.sessionId, {
      contract: Delegation.id, source: { plugin: builtin.id, resource: { id: pool.id, sessionId: pool.sessionId, kind: pool.kind } }, model: null, recipient: null, pending: true,
      data: { input: { ...task.input, id: "sub-9", runId: "interrupted-run" }, output: null },
    });
    await f.restart();
    expect((await f.check(pool, task.input.id)).output.result).toBe("Persistent report");
    expect((await f.check(pool, "sub-9")).status).toMatchObject({ outcome: "failed", code: "interrupted" });
    expect(requests).toBe(1);
    expect((await f.delegate(pool, "Next task")).input.id).toBe("sub-10");
  });

  it("uses pool links rather than caller links and preserves failed-task results as successful reads and waits", async () => {
    let noteId = "", rejected = false;
    const f = await fixture(async function* (input) {
      const result = input.messages.find(message => message.kind === "result");
      if (!result) yield* call(noteId, "read", null, { invalid: { "$asterism.content": "00000000-0000-4000-8000-000000000000" } });
      else { rejected = result.kind === "result" && result.error; yield* report("Access report"); }
    });
    const pool = await f.createPool();
    const note = await f.context.session(f.sessionId).create(CreateNote, { title: "Private", content: "Parent-only material" });
    noteId = note.id;
    f.context.session(f.sessionId).link(f.actor, note);
    const task = await f.delegate(pool, "Inspect the note");
    await f.invoke(pool, "wait", [task.input.id]);
    expect(rejected).toBe(true);
    expect((await f.check(pool, task.input.id)).status).toMatchObject({ outcome: "succeeded" });
    await configureBuiltin(f.app, { type: "role.save", id: "default", value: { id: "default", model: null } });
    const failed = await f.delegate(pool, "No model");
    expect((await f.invoke(pool, "wait", [failed.input.id])).kind).toBe("succeeded");
    expect((await f.check(pool, failed.input.id)).status).toMatchObject({ outcome: "failed", code: "model_unavailable" });
  });

  it("delegates across linked pools with independent task IDs and linked-resource access", async () => {
    let innerPool = "", noteId = "";
    let innerRead = "";
    const f = await fixture(async function* (input) {
      const results = input.messages.filter(message => message.kind === "result");
      if (inputText(input).includes("Outer")) {
        if (results.length === 0) yield* call(innerPool, "subagent_delegate", null, { role: "explorer", task: "Inner" });
        else if (results.length === 1) yield* call(innerPool, "subagent_wait", ["sub-1"]);
        else yield* report("Outer report");
      } else {
        if (!results.length) yield* call(noteId, "read");
        else {
          innerRead = results.flatMap(result => result.parts.flatMap(part => part.kind === "text" ? [part.text] : [])).join("");
          yield* report("Inner report");
        }
      }
    });
    const outer = await f.createPool(), inner = await f.createPool(); innerPool = inner.id;
    const note = await f.context.session(f.sessionId).create(CreateNote, { title: "Shared material", content: "Pool-authorized material" });
    noteId = note.id;
    f.context.session(f.sessionId).link(outer, inner);
    f.context.session(f.sessionId).link(inner, outer);
    f.context.session(f.sessionId).link(inner, note);
    const task = await f.delegate(outer, "Outer");
    await f.invoke(outer, "wait", [task.input.id]);
    expect((await f.check(outer, "sub-1")).output.result).toBe("Outer report");
    expect((await f.check(inner, "sub-1")).output.result).toBe("Inner report");
    expect(innerRead).toContain("Pool-authorized material");
  });

  it("returns partial output on request-budget exhaustion and ends running tasks on pool removal", async () => {
    const entered = gate(), release = gate();
    let poolId = "";
    const f = await fixture(async function* (input, signal) {
      if (inputText(input).includes("Budget")) {
        yield { type: "part.start", part: { id: "text", kind: "text" } };
        yield { type: "part.delta", partId: "text", delta: "Available findings" };
        yield { type: "part.end", partId: "text" };
        yield* call(poolId, "subagent_check", "sub-999");
      }
      else { entered.resolve(); await until(release, signal); yield* report("Finished"); }
    });
    const pool = await f.createPool(); poolId = pool.id;
    await configureBuiltin(f.app, { type: "agent.save", id: "explorer", value: { id: "explorer", maxTurns: 1 } });
    const budget = await f.delegate(pool, "Budget");
    await f.invoke(pool, "wait", [budget.input.id]);
    expect(await f.check(pool, budget.input.id)).toMatchObject({ status: { outcome: "partial", code: "request_budget" }, output: { result: "Available findings" } });
    const running = await f.delegate(pool, "Long task");
    await entered.promise;
    f.context.session(f.sessionId).remove(pool);
    await f.app.close(); apps.splice(apps.indexOf(f.app), 1);
    const audit = readFileSync(join(f.root, "extensions", builtin.id, "subagent-audits", `${running.input.runId}.jsonl`), "utf8");
    expect(audit).toContain('"outcome":"cancelled"');
  });
});
