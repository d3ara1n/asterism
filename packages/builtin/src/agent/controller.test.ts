import { describe, expect, it, vi } from "vitest";
import type { DataContract, Json, ModelCompletion, ModelEvent, ModelRunResult } from "@asterism-app/sdk/contracts";
import { ResourceStatusChanged } from "@asterism-app/sdk/contracts";
import type { ExecutionServices, ModelServices, ObjectExecutor, ObjectWriter, PluginTasks } from "@asterism-app/sdk/runtime";
import { AgentTurnEnded, ContextSummary } from "@asterism-app/builtin-api/contracts";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { agentSource, event, message, node, text } from "../../../../src/session/test-nodes.ts";
import type { NewNode, SessionNode } from "../../../../src/shared/session.ts";
import { createAgentController } from "./controller.ts";
import { AgentDrafts, AgentSelection } from "./data.ts";
import { createAgentFeedback } from "./feedback-state.ts";
import { projectForAgent } from "./projection.ts";
import { createSelection } from "./selection.ts";
import { projectAgentTurnState } from "./state-projection.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const gate = () => ({ entered: deferred(), release: deferred() });

// Registration and task entry are separate so cancellation can exercise both lifecycle paths.
function manualTasks() {
  const pending = new Map<string, { run: (signal: AbortSignal) => Promise<void>; abort: AbortController; entered: boolean }>();
  const tasks: PluginTasks = {
    start(key, run) {
      if (pending.has(key)) return false;
      pending.set(key, { run, abort: new AbortController(), entered: false });
      return true;
    },
    has: key => pending.has(key),
    cancel(key) {
      const task = pending.get(key);
      if (!task) return;
      task.abort.abort();
      if (!task.entered) pending.delete(key);
    },
  };
  return { tasks, async enter() {
    const [key, task] = [...pending.entries()][0]!;
    task.entered = true;
    try { await task.run(task.abort.signal); }
    finally { pending.delete(key); }
  } };
}

const completion: ModelCompletion = { usage: null, finishReason: "stop", rawFinishReason: null, providerResponseId: null };
const completedRun: ModelRunResult = { reason: "completed", responseId: null, source: null, completion,
  tools: [], response: null, timing: null };
function history(completed = true): NewNode[] {
  return [message("a", "Earlier goal"), text("a", "old", 0, "Earlier answer", { requestParentId: "0", completion }),
    // This retained turn fills the recent-content budget but remains well below the automatic threshold of a 200k model.
    message("a", "Recent request " + "r".repeat(80_000)),
    text("a", "recent", 0, "Recent answer", { requestParentId: "2", complete: completed, ...(completed ? { completion } : {}) })];
}

function fixture(options: { completed?: boolean; window?: number | null; values?: NewNode[]; summaryGate?: ReturnType<typeof gate> } = {}) {
  const path: SessionNode[] = [];
  const append = (value: NewNode) => {
    const id = String(path.length);
    path.push(node(id, path.at(-1)?.id ?? null, value));
    return id;
  };
  for (const value of options.values ?? history(options.completed)) append(value);
  const snapshot = () => sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null));
  const data = new Map<string, Json>([
    [AgentSelection.id, { selection: { agent: "worker", model: null, thinking: null } }],
    [AgentDrafts.id, [
      { id: "steer", mode: "steer", parts: [{ kind: "text", text: "Steer next request" }], sender: { kind: "user" } },
      { id: "follow", mode: "follow", parts: [{ kind: "text", text: "Follow up next turn" }], sender: { kind: "user" } },
    ]],
  ]);
  const writer: Pick<ObjectWriter, "append" | "set"> = {
    append: (contract, value) => append(event(contract.id, value, { source: agentSource("a") })),
    set: (contract, value) => { data.set(contract.id, value); },
  };
  const publish = vi.fn();
  // Only the storage/event boundary is substituted; record decoding and all Agent projections are real.
  const object = {
    ref: agentSource("a").resource,
    session: { snapshot }, snapshot: () => ({ title: "Agent" }),
    get: <T extends Json>(contract: DataContract<T>) => (data.get(contract.id) ?? null) as T | null,
    commit: (work: (writer: ObjectWriter) => undefined) => work(writer as ObjectWriter),
    invalidate: vi.fn(), events: { publish },
  } as unknown as ObjectExecutor;
  const driver = manualTasks();
  const feedback = createAgentFeedback();
  const stream = vi.fn<ModelServices["stream"]>(async function* () {
    yield { type: "part.start", part: { id: "summary", kind: "text" } } satisfies ModelEvent;
    yield { type: "part.delta", partId: "summary", delta: "Earlier goal and answer" } satisfies ModelEvent;
    yield { type: "part.end", partId: "summary" } satisfies ModelEvent;
    yield { type: "finish", reason: "stop", usage: null } satisfies ModelEvent;
    // Hold even a fully generated summary before stream exhaustion to test cancellation before commit.
    if (options.summaryGate) {
      options.summaryGate.entered.resolve();
      await options.summaryGate.release.promise;
    }
  });
  const models: ModelServices = { stream, validate: vi.fn(), run: vi.fn(), list: () => options.window === undefined ? [] : [{
    model: "p/m", provider: "p", name: "Model", contextWindow: options.window, cost: null, generation: { maxOutputTokens: null },
    capabilities: { reasoning: false, tools: true, thinkingLevels: [] },
  }] };
  const execution: ExecutionServices = {
    run: vi.fn<ExecutionServices["run"]>(async () => completedRun),
    withProgress: (_ref, work) => work({ event() {} }),
  };
  const selection = createSelection({
    agents: () => [{ id: "worker", builtin: false, enabled: true, description: "", systemPrompt: "", modelRole: "default", examples: [],
      subagent: { instructions: "", budget: { maxRequests: 1, maxDurationSeconds: 1 } }, resources: null, excludeResources: null, delegates: null }],
    roles: () => [{ id: "default", builtin: true, enabled: true, model: "p/m", thinking: null, description: "", hidden: false }],
  });
  const controller = createAgentController({ selection, tasks: driver.tasks, models, execution, feedback, userAgent: "test",
    prepareRequest: () => () => ({ blocks: [], skills: [], system: { blocks: [] } }),
  });
  return { controller, object, path, snapshot, driver, feedback, stream, execution, publish,
    turn: () => projectAgentTurnState(snapshot(), "a", feedback.get(object).interruptions),
    statuses: () => publish.mock.calls.filter(([contract]) => contract === ResourceStatusChanged).map(([, value]) => value.status),
    turnEnds: () => publish.mock.calls.filter(([contract]) => contract === AgentTurnEnded),
  };
}

describe("Agent controller manual compaction", () => {
  it.each([
    { window: 200_000, completed: true }, { window: null, completed: true },
    { window: undefined, completed: true }, { window: 200_000, completed: false },
  ])("compacts with window=$window and completed=$completed without entering the conversation loop", async ({ window, completed }) => {
    const f = fixture({ window, completed });
    const before = projectForAgent(f.snapshot(), "a"), drafts = structuredClone(f.object.get(AgentDrafts));
    expect(f.controller.compact(f.object)).toBe(true);
    await f.driver.enter();

    const projected = projectForAgent(f.snapshot(), "a");
    expect(projected[0]).toMatchObject({ kind: "context", parts: [{ kind: "text", text: expect.stringContaining("Earlier goal and answer") }] });
    expect(projected.slice(1)).toEqual(before.slice(2));
    expect(f.object.get(AgentDrafts)).toEqual(drafts);
    expect(f.execution.run).not.toHaveBeenCalled();
    expect(f.turnEnds()).toEqual([]);
    expect(f.turn()).toBe(completed ? "completed" : "incomplete");
    expect(f.statuses()).toEqual(["running", completed ? "completed" : "awaiting"]);
    expect(f.feedback.get(f.object).compressions).toEqual([]);
    expect(f.controller.running(f.object)).toBe(false);
  });

  it("does not schedule work when the only turn must be retained", () => {
    const f = fixture({ values: [message("a", "Only request"), text("a", "only", 0, "Only answer", { completion })] });
    const before = structuredClone(f.path);
    expect(f.controller.compact(f.object)).toBe(false);
    expect(f.controller.running(f.object)).toBe(false);
    expect(f.path).toEqual(before);
    expect(f.feedback.get(f.object).compressions).toEqual([]);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.publish).not.toHaveBeenCalled();
  });

  it.each(["conversation", "compression"] as const)("rejects compaction while a %s is queued or executing", async kind => {
    const hold = gate(), f = fixture({ summaryGate: hold });
    if (kind === "conversation") {
      vi.mocked(f.execution.run).mockImplementation(async () => {
        hold.entered.resolve();
        await hold.release.promise;
        return completedRun;
      });
      f.controller.start(f.object);
    } else f.controller.compact(f.object);
    expect(() => f.controller.compact(f.object)).toThrow(expect.objectContaining({ code: "conflict" }));
    const task = f.driver.enter();
    await hold.entered.promise;
    expect(() => f.controller.compact(f.object)).toThrow(expect.objectContaining({ code: "conflict" }));
    expect(() => f.controller.start(f.object)).toThrow(expect.objectContaining({ code: "conflict" }));
    f.controller.cancel(f.object);
    hold.release.resolve();
    await task;
  });

  it.each([true, false])("preserves the original turn when an incomplete summary stream returns failure (completed=%s)", async completed => {
    const f = fixture({ completed });
    const before = projectForAgent(f.snapshot(), "a");
    f.stream.mockImplementation(async function* () {
      yield { type: "part.start", part: { id: "summary", kind: "text" } };
      yield { type: "part.delta", partId: "summary", delta: "Unfinished summary" };
    });
    f.controller.compact(f.object);
    await f.driver.enter();

    expect(f.feedback.get(f.object).compressions).toEqual([expect.objectContaining({ status: "failed", afterNodeId: "3" })]);
    expect(projectForAgent(f.snapshot(), "a")).toEqual(before);
    expect(f.turn()).toBe(completed ? "completed" : "incomplete");
    expect(f.statuses().at(-1)).toBe(completed ? "completed" : "awaiting");
    expect(f.controller.running(f.object)).toBe(false);
  });

  it.each([true, false])("cancels a generated summary without changing the original turn (completed=%s)", async completed => {
    const hold = gate(), f = fixture({ completed, summaryGate: hold });
    const before = structuredClone(f.path), projected = projectForAgent(f.snapshot(), "a");
    f.controller.compact(f.object);
    const task = f.driver.enter();
    await hold.entered.promise;
    expect(f.feedback.get(f.object).compressions).toEqual([expect.objectContaining({ status: "running", afterNodeId: "3" })]);
    const settled = f.controller.settled(f.object, new AbortController().signal);
    f.controller.cancel(f.object);
    hold.release.resolve();
    await task;
    await settled;

    expect(f.path).toEqual(before);
    expect(projectForAgent(f.snapshot(), "a")).toEqual(projected);
    expect(f.turn()).toBe(completed ? "completed" : "incomplete");
    expect(f.feedback.get(f.object).interruptions).toEqual([]);
    expect(f.feedback.get(f.object).compressions).toEqual([expect.objectContaining({ status: "cancelled", afterNodeId: "3" })]);
    expect(f.statuses()).toEqual(["running", completed ? "completed" : "awaiting"]);
    expect(f.controller.running(f.object)).toBe(false);
    expect(f.execution.run).not.toHaveBeenCalled();
    expect(f.turnEnds()).toEqual([]);
  });

  it.each([true, false])("cleans up cancellation before task entry without interrupting the original turn (completed=%s)", async completed => {
    const f = fixture({ completed });
    const before = structuredClone(f.path);
    f.controller.compact(f.object);
    const settled = f.controller.settled(f.object, new AbortController().signal);
    f.controller.cancel(f.object);
    await settled;

    expect(f.controller.running(f.object)).toBe(false);
    expect(f.path).toEqual(before);
    expect(f.turn()).toBe(completed ? "completed" : "incomplete");
    expect(f.feedback.get(f.object).interruptions).toEqual([]);
    expect(f.feedback.get(f.object).compressions).toEqual([expect.objectContaining({ status: "cancelled", afterNodeId: "3" })]);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.turnEnds()).toEqual([]);
    expect(f.statuses()).toEqual([completed ? "completed" : "awaiting"]);
    expect(f.controller.compact(f.object)).toBe(true);
    await f.driver.enter();
    expect(f.path.at(-1)?.contract).toBe(ContextSummary.id);
  });
});

it("automatic compaction resumes the original conversation with the summary and retained input", async () => {
  const hold = gate(), f = fixture({ window: 32_000, summaryGate: hold });
  // No queued input: the execution below belongs to the original turn, not a draft-triggered second turn.
  f.object.commit(writer => { writer.set(AgentDrafts, []); });
  const retained = projectForAgent(f.snapshot(), "a").slice(2);
  f.controller.start(f.object);
  const task = f.driver.enter();
  await hold.entered.promise;
  expect(f.execution.run).not.toHaveBeenCalled();
  hold.release.resolve();
  await task;

  expect(f.execution.run).toHaveBeenCalledTimes(1);
  const messages = vi.mocked(f.execution.run).mock.calls[0]![0].messages;
  expect(messages[0]).toMatchObject({ kind: "context", parts: [{ kind: "text", text: expect.stringContaining("Earlier goal and answer") }] });
  expect(messages.slice(1)).toEqual(retained);
  expect(f.stream).toHaveBeenCalledTimes(1);
  expect(f.turnEnds().map(([, value]) => value)).toEqual([expect.objectContaining({ reason: "completed", settled: true, inputId: "2" })]);
  expect(f.controller.running(f.object)).toBe(false);
});
