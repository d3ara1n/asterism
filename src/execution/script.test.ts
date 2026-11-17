import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, defineImplementation, defineResource, defineTool, type Json, type ToolModelOutput, type ToolOutcome } from "@asterism-app/sdk/contracts";
import type { CallResult } from "@asterism-app/sdk/runtime";
import { implement, toolCaller } from "../tools/testing.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import { ResourceScriptResult } from "../tools/core.ts";
import { executeResourceScript } from "./script.ts";
import { AgentCapabilities } from "./capabilities.ts";
import { executeCoreBatch, type PendingCall, type ToolObserver } from "./core.ts";

const resource = { id: "r", kind: "test", title: "Captured", data: {} };
const input = (value: number) => ({ resource_id: "r", tool: "step", args: { value } });
const contract = defineImplementation({
  ...defineData("test.step", z.strictObject({ value: z.number() }).describe("Step output.")),
  resource: defineResource("test", z.strictObject({})),
  tool: defineTool({ id: "test.tools/step", name: "step", description: "Run a step.", guidelines: [],
    argsSchema: z.strictObject({ value: z.number() }).describe("The step input.") }),
  targetSchema: z.null().describe("The resource."), effect: "write", execution: "sequential",
});
function capabilities(handler: (value: number, signal: AbortSignal) => Promise<CallResult<{ value: number }>>,
  toModel: (data: { value: number }) => ToolModelOutput = data => `visible ${data.value}`) {
  const step = implement(contract, {
    call: (_state, _target, args, context) => handler(args.value, context.signal),
    toModel,
  });
  return new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([step]), [resource], () => true, toolCaller);
}
async function script(code: string, cap = capabilities(async value => ({ kind: "succeeded", data: { value } })), observer: ToolObserver = {}) {
  let outcome: ToolOutcome | undefined;
  await executeCoreBatch([{ callId: "script", name: "resource_script", arguments: { code } }], cap,
    new AbortController().signal, (_call, result) => { outcome = result; }, observer);
  return outcome!;
}
const modelText = (result: ToolOutcome) => result.model.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");

describe("Resource script execution", () => {
  it("returns selected JSON once, with native data and the ordinary model text available independently", async () => {
    const progress: Json[] = [];
    const result = await script(`
      const resource = resources.get("r");
      const results = await Promise.all([1, 2].map(value => resource.step({
        args: { value }
      })));
      return results.map(result => ({ value: result.data.value, text: text(result), kind: result.kind }));
    `, undefined, { published(_call, data) { progress.push(data); } });
    const expected = [
      { value: 1, text: "visible 1", kind: "succeeded" },
      { value: 2, text: "visible 2", kind: "succeeded" },
    ];
    expect(result.kind).toBe("succeeded");
    expect(modelText(result)).toBe(JSON.stringify(expected));
    const saved = ResourceScriptResult.schema.parse(result.data);
    expect(saved.value).toEqual(expected);
    expect(saved.calls.map(call => [call.tool, call.kind, call.resource?.title])).toEqual([
      ["step", "succeeded", "Captured"], ["step", "succeeded", "Captured"],
    ]);
    expect(saved.calls[0]).not.toHaveProperty("arguments");
    expect(saved.calls[0]).not.toHaveProperty("data");
    expect(saved.calls[0]).not.toHaveProperty("model");
    expect(saved.calls[0]?.startedAt).toBeDefined();
    expect(saved.calls[0]?.finishedAt).toBeDefined();
    expect(progress.some(value => ResourceScriptResult.schema.parse(value).calls.some(call => call.kind === "running"))).toBe(true);
  });

  // The worker bridge selects public fields, rather than passing through current or future execution metadata.
  it.each(['resources.get("r").step({ args: { value: 3 } })', 'tools.step({ value: 3 })'])(
    "keeps private outcome fields out of returned and logged results from %s", async call => {
      const outcome = {
        kind: "succeeded" as const, data: { value: 3, model: "Domain data" },
        model: [{ kind: "text" as const, text: "Selected view" }],
        resource: { id: "r", kind: "test", title: "Captured" }, startedAt: 1, finishedAt: 2,
        futureMetadata: "Private execution detail",
      };
      const result = await executeResourceScript({
        id: "script", tools: ["step"], signal: new AbortController().signal, publish() {},
        execute: async () => outcome,
        code: `
          const result = await ${call};
          log(result);
          log([typeof result.model, typeof result.resource, typeof result.futureMetadata]);
          return result;
        `,
      });
      const saved = ResourceScriptResult.schema.parse(result.data);
      const expected = { kind: "succeeded", data: { value: 3, model: "Domain data" } };
      expect(saved.value).toEqual(expected);
      expect(saved.logs).toEqual([expected, ["undefined", "undefined", "undefined"]]);
      expect(saved.calls[0]).toMatchObject({ resource: outcome.resource, startedAt: 1, finishedAt: 2 });
    },
  );

  // Data mutations and fabricated model fields must not substitute for the projection fixed at completion.
  it("reuses the completed projection synchronously without reexecuting or reprojecting", async () => {
    const execute = vi.fn(async (value: number) => ({ kind: "succeeded" as const, data: { value } }));
    const project = vi.fn((data: { value: number }) => `Captured ${data.value}`);
    const result = await script(`
      const result = await resources.get("r").step({ args: { value: 8 } });
      const first = text(result);
      result.data.value = 99;
      result.model = [{ kind: "text", text: "Replacement" }];
      const retained = [result];
      return { first, second: text(retained[0]), value: result.data.value };
    `, capabilities(execute, project));
    expect(modelText(result)).toBe('{"first":"Captured 8","second":"Captured 8","value":99}');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(project).toHaveBeenCalledExactlyOnceWith({ value: 8 });
  });

  // Structural similarity cannot recover an invocation's private projection, even if a copy has a model field.
  it("rejects copies and ordinary values while retaining the original result association", async () => {
    const result = await script(`
      const original = await resources.get("r").step({ args: { value: 5 } });
      const values = [{ ...original }, JSON.parse(JSON.stringify(original)), original.data,
        { kind: "succeeded", data: {}, model: [{ kind: "text", text: "Invented" }] }, null, "plain"];
      const rejected = values.map(value => {
        try { text(value); return false; } catch (error) { return error instanceof TypeError; }
      });
      return { rejected, original: text(original) };
    `);
    expect(modelText(result)).toBe('{"rejected":[true,true,true,true,true,true],"original":"visible 5"}');
  });

  // Empty projections remain valid associated values; they are not mistaken for a missing result.
  it("accepts an empty saved text projection", async () => {
    const result = await script(`
      const result = await resources.get("r").step({ args: { value: 1 } });
      return text(result);
    `, capabilities(async value => ({ kind: "succeeded", data: { value } }), () => ""));
    expect(result.kind).toBe("succeeded");
    expect(ResourceScriptResult.schema.parse(result.data).value).toBe("");
  });

  it("publishes logs before completion and captures values before later mutations", async () => {
    const started = deferred<void>(), release = deferred<void>();
    const progress: Json[] = [];
    const running = script(`
      log("Reading");
      const entry = { path: "README.md" };
      log(entry);
      entry.path = "changed";
      const result = await resources.get("r").step({ args: { value: 3 } });
      log(text(result));
      return { count: result.data.value };
    `, capabilities(async value => {
      started.resolve();
      await release.promise;
      return { kind: "succeeded", data: { value } };
    }), { published(_call, data) { progress.push(data); } });
    try {
      await started.promise;
      const snapshots = progress.map(data => ResourceScriptResult.schema.parse(data));
      expect(snapshots.find(data => data.logs.length === 1)?.logs).toEqual(["Reading"]);
      expect(snapshots.at(-1)?.logs).toEqual(["Reading", { path: "README.md" }]);
      expect(snapshots.at(-1)).not.toHaveProperty("value");
    } finally { release.resolve(); }
    const result = await running;
    expect(result.kind).toBe("succeeded");
    expect(ResourceScriptResult.schema.parse(result.data).logs).toEqual(["Reading", { path: "README.md" }, "visible 3"]);
    expect(modelText(result)).toBe('Logs:\nReading\n{"path":"README.md"}\nvisible 3\n\nReturn value:\n{"count":3}');
  });

  it.each([
    ["JavaScript exceptions", 'throw new Error("Stopped");'],
    ["return serialization failures", "return 1n;"],
  ])("retains earlier logs after %s", async (_name, ending) => {
    const result = await script(`log("Recorded"); ${ending}`);
    expect(result).toMatchObject({ kind: "failed", error: { code: "script_failed" } });
    const saved = ResourceScriptResult.schema.parse(result.data);
    expect(saved.logs).toEqual(["Recorded"]);
    expect(saved).not.toHaveProperty("value");
    expect(modelText(result)).toMatch(/^failed \(script_failed\): .+\nLogs:\nRecorded$/);
  });

  // Missing fields must remain observable, including inside objects where JSON would otherwise omit them.
  it("logs missing fields and nested undefined values without losing null or stopping result consumption", async () => {
    const result = await script(`
      const result = await resources.get("r").step({ args: { value: 2 } });
      log(result.data.missing);
      log({ missing: result.data?.missing?.name, nested: { value: undefined }, values: [undefined, null, 0] });
      return text(result);
    `);
    expect(result.kind).toBe("succeeded");
    expect(ResourceScriptResult.schema.parse(result.data)).toMatchObject({
      logs: ["[undefined]", { missing: "[undefined]", nested: { value: "[undefined]" }, values: ["[undefined]", null, 0] }],
      value: "visible 2",
    });
    expect(modelText(result)).toBe([
      "Logs:", "[undefined]",
      '{"missing":"[undefined]","nested":{"value":"[undefined]"},"values":["[undefined]",null,0]}',
      "", "Return value:", "visible 2",
    ].join("\n"));
  });

  it.each([
    ["BigInt", "1n"],
    ["cyclic objects", "(() => { const value = {}; value.self = value; return value; })()"],
    ["unsupported root values", "() => {}"],
    ["throwing serialization hooks", '({ toJSON() { throw new Error("Unavailable"); } })'],
  ])("records a diagnostic and continues after logging %s", async (_name, expression) => {
    const result = await script(`
      log("Before");
      log(${expression});
      log("After");
      return 7;
    `);
    expect(result.kind).toBe("succeeded");
    const saved = ResourceScriptResult.schema.parse(result.data);
    expect(saved.logs).toEqual(["Before", "[Log serialization failed: value is not JSON-serializable.]", "After"]);
    expect(saved.value).toBe(7);
  });

  // Parameter evaluation happens outside the logger; a broken property access must still expose a script defect.
  it("preserves argument evaluation errors before log is entered", async () => {
    const result = await script(`
      log("Before");
      const data = {};
      log(data.missing.name);
      return "Not reached";
    `);
    expect(result).toMatchObject({ kind: "failed", error: { code: "script_failed" } });
    const saved = ResourceScriptResult.schema.parse(result.data);
    expect(saved.logs).toEqual(["Before"]);
    expect(saved).not.toHaveProperty("value");
  });

  it("retains logs alongside the existing null result for an omitted return", async () => {
    const result = await script('log("Completed");');
    expect(ResourceScriptResult.schema.parse(result.data)).toMatchObject({ logs: ["Completed"], value: null });
    expect(modelText(result)).toBe("Logs:\nCompleted\n\nReturn value:\nnull");
  });

  it("keeps structured rejection and failure results available for script branching", async () => {
    const cap = capabilities(async () => ({ kind: "failed", error: { code: "unavailable", message: "Unavailable." } }));
    const result = await script(`
      const denied = await resources.get("unlinked").step({ args: { value: 1 } });
      const invalid = await resources.get("r").step({ args: { value: "bad" } });
      const failed = await resources.get("r").step({ args: { value: 1 } });
      return { branches: [denied.kind, denied.error.code, invalid.kind], failed, text: text(failed) };
    `, cap);
    expect(ResourceScriptResult.schema.parse(result.data).value).toEqual({
      branches: ["rejected", "access_denied", "rejected"],
      failed: { kind: "failed", data: null, error: { code: "unavailable", message: "Unavailable." } },
      text: "failed (unavailable): Unavailable.",
    });
    expect(ResourceScriptResult.schema.parse(result.data).calls.map(call => call.kind)).toEqual(["rejected", "rejected", "failed"]);
  });

  it("preserves a partial result's message and data alongside its saved text", async () => {
    const result = await script(`
      const result = await resources.get("r").step({ args: { value: 6 } });
      return { result, text: text(result) };
    `, capabilities(async value => ({ kind: "partial", data: { value }, message: "Incomplete work." })));
    expect(ResourceScriptResult.schema.parse(result.data).value).toEqual({
      result: { kind: "partial", data: { value: 6 }, message: "Incomplete work." },
      text: "partial: Incomplete work.\nvisible 6",
    });
  });

  it("preserves completed effects and their summaries when later script code throws", async () => {
    const effects: number[] = [];
    const result = await script(`
      await resources.get("r").step({ args: { value: 7 } });
      throw new Error("Stopped after the write");
    `, capabilities(async value => { effects.push(value); return { kind: "succeeded", data: { value } }; }));
    expect(effects).toEqual([7]);
    expect(result).toMatchObject({ kind: "failed", error: { code: "script_failed", message: "Stopped after the write" } });
    expect(ResourceScriptResult.schema.parse(result.data).calls.map(call => call.kind)).toEqual(["succeeded"]);
    expect(modelText(result)).not.toContain("visible 7");
    expect(ResourceScriptResult.schema.parse(result.data)).not.toHaveProperty("value");
  });

  it("cancels unawaited calls and records their actual completion before returning", async () => {
    let cleaned = false;
    const result = await script(`
      resources.get("r").step({ args: { value: 4 } });
      return "selected";
    `, capabilities((_value, signal) => new Promise(resolve => {
      signal.addEventListener("abort", () => {
        cleaned = true;
        resolve({ kind: "cancelled", message: "Stopped." });
      }, { once: true });
    })));
    expect(cleaned).toBe(true);
    expect(modelText(result)).toBe("selected");
    expect(ResourceScriptResult.schema.parse(result.data).calls[0]).toMatchObject({ kind: "cancelled", message: "Stopped." });
  });

  it("exposes only JavaScript and declared helpers, and does not retain globals between scripts", async () => {
    const first = await script(`
      globalThis.privateValue = 42;
      return [typeof process, typeof require, typeof fetch, typeof setTimeout, typeof session,
        typeof tools.resource_script, typeof tools.resource_call, typeof globalThis.__invoke, typeof globalThis.__log];
    `);
    expect(modelText(first)).toBe(JSON.stringify(Array(9).fill("undefined")));
    expect(modelText(await script("return typeof privateValue;"))).toBe("undefined");
  });

  it("keeps resource handles inert during promise assimilation and JSON serialization", async () => {
    const result = await script(`
      const resource = await resources.get("r");
      const called = await resource.step({ args: { value: 5 } });
      return { handle: resource, value: called.data.value };
    `);
    expect(modelText(result)).toBe('{"handle":{},"value":5}');
    expect(ResourceScriptResult.schema.parse(result.data).calls.map(call => call.tool)).toEqual(["step"]);
  });

  it("cancels running and queued calls without inventing a start time for queued work", async () => {
    const queued = deferred<void>();
    const controller = new AbortController();
    const started: number[] = [];
    const cap = capabilities((value, signal) => new Promise(resolve => {
      started.push(value);
      signal.addEventListener("abort", () => resolve({ kind: "cancelled", message: "Stopped." }), { once: true });
    }));
    let outcome: ToolOutcome | undefined;
    const running = executeCoreBatch([{ callId: "script", name: "resource_script", arguments: { code: `
      log("Waiting for steps");
      return await Promise.all([1, 2].map(value => resources.get("r").step({
        args: { value }
      })));
    ` } }], cap, controller.signal, (_call, result) => { outcome = result; }, {
      published(_call, data) {
        if (ResourceScriptResult.schema.parse(data).calls.length === 2) queued.resolve();
      },
    });
    await queued.promise;
    controller.abort();
    await running;
    expect(started).toEqual([1]);
    expect(outcome?.kind).toBe("cancelled");
    const saved = ResourceScriptResult.schema.parse(outcome!.data);
    expect(saved.calls.map(call => call.kind)).toEqual(["cancelled", "cancelled"]);
    expect(saved.calls[0]?.startedAt).toBeDefined();
    expect(saved.calls[1]).not.toHaveProperty("startedAt");
    expect(saved).not.toHaveProperty("value");
    expect(saved.logs).toEqual(["Waiting for steps"]);
    expect(modelText(outcome!)).toBe("cancelled: Script execution was cancelled.\nLogs:\nWaiting for steps");
  });

  it("fails a promise with no tool capable of settling it and rejects non-JSON return values", async () => {
    expect(await script("await new Promise(() => {});")).toMatchObject({
      kind: "failed", error: { code: "script_failed", message: "The script is waiting on a promise with no pending tool call." },
    });
    expect(await script("return 1n;")).toMatchObject({ kind: "failed", error: { code: "script_failed" } });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
describe("Shared tool scheduling", () => {
  it("finishes a script that cancels queued work without waiting for an unrelated running tool", async () => {
    const release = deferred<void>(), scriptDone = deferred<ToolOutcome>();
    const started: number[] = [];
    const cap = capabilities(async value => {
      started.push(value);
      if (value === 1) await release.promise;
      return { kind: "succeeded", data: { value } };
    });
    const running = executeCoreBatch([
      { callId: "direct", name: "resource_call", arguments: input(1) },
      { callId: "script", name: "resource_script", arguments: { code: `
        resources.get("r").step({ args: { value: 2 } });
        return "selected";
      ` } },
      { callId: "later", name: "resource_call", arguments: input(3) },
    ], cap, new AbortController().signal, (call, result) => {
      if (call.callId === "script") scriptDone.resolve(result);
    });
    try {
      const result = await scriptDone.promise;
      expect(started).toEqual([1]);
      expect(modelText(result)).toBe("selected");
      const [child] = ResourceScriptResult.schema.parse(result.data).calls;
      expect(child?.kind).toBe("cancelled");
      expect(child).not.toHaveProperty("startedAt");
    } finally { release.resolve(); }
    await running;
    expect(started).toEqual([1, 3]);
  });

  it("lets direct and scripted parallel calls proceed while sequential calls share submission order", async () => {
    const release = deferred<void>(), parallelStarted = deferred<void>(), childQueued = deferred<void>();
    const starts: string[] = [];
    const step = implement(contract, { call: async (_state, _target, args) => {
      starts.push(`step:${args.value}`);
      if (args.value === 1) await release.promise;
      return { kind: "succeeded", data: { value: args.value } };
    } });
    const parallel = implement({ ...contract, id: "test.parallel", execution: "parallel",
      tool: { ...contract.tool, id: "test.tools/parallel", name: "parallel" } }, {
      call: async (_state, _target, args) => {
        starts.push(`parallel:${args.value}`); parallelStarted.resolve();
        return { kind: "succeeded", data: { value: args.value } };
      },
    });
    const cap = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([step, parallel]), [resource], () => true, toolCaller);
    const calls: PendingCall[] = [
      { callId: "first", name: "resource_call", arguments: input(1) },
      { callId: "script", name: "resource_script", arguments: { code: `
        return (await Promise.all([
          resources.get("r").step({ args: { value: 2 } }),
          resources.get("r").parallel({ args: { value: 3 } }),
        ])).map(result => result.kind);
      ` } },
      { callId: "last", name: "resource_call", arguments: input(4) },
    ];
    const results: ToolOutcome[] = [];
    const running = executeCoreBatch(calls, cap, new AbortController().signal, (_call, result) => results.push(result), {
      published(call, data) {
        if (call.name === "resource_script" && ResourceScriptResult.schema.parse(data).calls.some(child => child.tool === "step" && child.kind === "queued"))
          childQueued.resolve();
      },
    });
    try {
      await Promise.all([parallelStarted.promise, childQueued.promise]);
      expect(starts).toEqual(["step:1", "parallel:3"]);
    } finally { release.resolve(); }
    await running;
    expect(starts).toEqual(["step:1", "parallel:3", "step:4", "step:2"]);
    expect(results.map(result => result.kind)).toEqual(["succeeded", "succeeded", "succeeded"]);
  });
});
