import { thinkingLevels, present, completionData, modelCompletionSchema, modelRunRecordSchema, type RequestTiming } from "@asterism/sdk/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, defineResource, defineTool, defineImplementation, type ModelRunEvent, type ModelRunRequest } from "@asterism/sdk/contracts";
import { implement, toolCaller } from "../tools/testing.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { AgentCapabilities } from "./capabilities.ts";
import { resolveInput } from "../model/input.ts";
import { runModelRequest } from "./request.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent } from "../model/contract.ts";
import type { ModelSettings } from "../shared/model.ts";

const settings: ModelSettings = {
  provider: { id: "p", name: "Provider", enabled: true, baseUrl: "https://example.invalid", protocol: "openai-responses", auth: "none", compatibility: [] },
  model: { name: "Model", modelId: "test", providerId: "p", enabled: true, contextWindow: 4000, cost: null, compatibility: [],
    capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null } }, thinking: "off",
};
const empty = () => new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([]), [], () => true);
const text: ModelEvent[] = [
  { type: "part.start", part: { id: "t", kind: "text" } }, { type: "part.delta", partId: "t", delta: "Hello" },
  { type: "part.end", partId: "t" }, { type: "finish", reason: "stop", usage: null },
];
const calls = (ids: string[], name = "resource_list", args = {}) => [
  ...ids.flatMap(id => [
    { type: "part.start" as const, part: { id, kind: "toolcall" as const, callId: id, name } },
    { type: "part.end" as const, partId: id, arguments: args },
  ]), { type: "finish" as const, reason: "tool-calls", usage: null },
];
function input(events: ModelRunEvent[], extra: Partial<ModelRunRequest> = {}): ModelRunRequest {
  return { object: { id: "a", sessionId: "s", kind: "example.agent/worker" }, requestParentId: "origin",
    target: { role: "default" }, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "Input" }] }],
    signal: new AbortController().signal, observer: { event(event) { events.push(event); } }, ...extra };
}
function model(events: ModelEvent[], prepare = () => {}): ModelAdapter {
  return { validate() {}, version: "test-adapter", prepare() { prepare(); return { async *stream() { yield* events; } }; } };
}
async function execute(request: ModelRunRequest, adapter: ModelAdapter, capabilities = empty()) {
  return runModelRequest(request, Promise.resolve({ adapter, settings, capabilities, system: request.system, messages: await resolveInput(request.messages, undefined, request.signal) }));
}
const resource = { id: "r", kind: "example.resource/item", title: "Item", data: {} };
const write = defineImplementation({ ...defineData("example.resource/write", z.number().describe("Current value.")),
  resource: defineResource(resource.kind, z.object({})),
  tool: defineTool({ id: "test.tools/write", name: "write", description: "Write a value.", guidelines: [], argsSchema: z.object({}).describe("No arguments.") }),
  targetSchema: z.null().describe("The whole item."), effect: "write", execution: "sequential" });

describe("Stateless single model execution", () => {
  // Deliver existing blocks even if the stream breaks; original errors remain readable by the UI after event and record validation.
  it("partial response failure details remain in both the return value and persistable diagnostics", async () => {
    const details = { message: "Upstream overloaded", statusCode: 503, responseBody: '{"error":"busy"}' };
    const failure = new ModelFailure("provider_error", details.message, details, "model");
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), { validate() {}, version: "test", prepare() { return {
      async *stream() { yield* text.slice(0, -1); throw failure; },
    }; } });
    expect(result).toMatchObject({ reason: "failed", code: "provider_error", details });
    const records = events.filter(event => event.type !== "progress").map(event => modelRunRecordSchema.parse(event));
    expect(records).toContainEqual({ type: "diagnostic", origin: "model", code: "provider_error", message: details.message, level: "error", details });
    expect(records[0]).toMatchObject({ type: "block", block: { kind: "text", text: "Hello", complete: true } });
  });
  // Response metadata goes only to the initiator through the result, never to persistable blocks, diagnostics, or progress events.
  it.each(["completed", "failed"] as const)("%s results preserve HTTP metadata while observation events exclude headers", async outcome => {
    const response = { connection: { id: "p" }, endpoint: settings.provider.baseUrl, model: "test",
      status: outcome === "completed" ? 200 : 429, receivedAt: 1, headers: { "x-test-metadata": "private-response" } };
    const failure = new ModelFailure("provider_error", "Failed.");
    failure.response = response;
    const adapter = outcome === "completed"
      ? model([...text.slice(0, -1), { type: "finish", reason: "stop", usage: null, response }])
      : { validate() {}, version: "test", prepare() { return { async *stream(): AsyncIterable<ModelEvent> { throw failure; } }; } };
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), adapter);
    expect(result).toMatchObject({ reason: outcome, response });
    expect(JSON.stringify(events)).not.toContain("private-response");
  });
  // Terminal timing accompanies usage; executing tools does not reset it, and failure retains timing too.
  it("preserves timing from model termination and failure without replacing it with tool batch completion time", async () => {
    const timing: RequestTiming = { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000, firstOutputMs: 100, firstTextMs: null, firstReasoningMs: null, lastOutputMs: 900, outputChunks: 2, outcome: "completed" };
    const events = calls(["list"]);
    const result = await execute(input([]), model([...events.slice(0, -1),
      { type: "finish", reason: "tool-calls", usage: null, timing }]));
    expect(result).toMatchObject({ reason: "completed", completion: { timing }, timing,
      tools: [{ kind: "succeeded" }] });
    const controller = new AbortController();
    const cancelled = await execute(input([], { signal: controller.signal }), { validate() {}, version: "test", prepare() { return {
      async *stream() {
        yield* events.slice(0, -1);
        controller.abort();
        yield { type: "finish", reason: "tool-calls", usage: null, timing };
      },
    }; } });
    expect(cancelled).toMatchObject({ reason: "cancelled", completion: { timing }, tools: [] });
    const failure = new ModelFailure("provider_error", "Failed.");
    failure.timing = { ...timing, outcome: "failed" };
    const failed = await execute(input([]), { validate() {}, version: "test", prepare() { return {
      async *stream() { throw failure; },
    }; } });
    expect(failed).toMatchObject({ reason: "failed", completion: null, timing: { outcome: "failed", durationMs: 1000 } });
  });

  it("returns when the tool batch finishes without implicitly starting another request; separate calls use only explicit input", async () => {
    let requests = 0;
    const seen: unknown[] = [];
    const adapter: ModelAdapter = { validate() {}, version: "test", prepare(request) {
      requests++; seen.push(structuredClone(request.messages));
      return { async *stream() { yield* calls(["list"]); } };
    } };
    const events: ModelRunEvent[] = [];
    const first = await execute(input(events), adapter);
    expect(requests).toBe(1);
    expect(first).toMatchObject({ reason: "completed", tools: [{ kind: "succeeded", data: { resources: [] } }] });
    expect(events.filter(event => event.type === "block")).toHaveLength(1);
    expect(events.find(event => event.type === "block")).toMatchObject({ block: { ordinal: 0, requestParentId: "origin", completion: { finishReason: "tool-calls" } } });
    await execute(input([], { messages: [{ kind: "input", parts: [{ kind: "text", text: "New projection" }] }] }), adapter);
    expect(seen).toEqual([[{ kind: "input", parts: [{ kind: "text", text: "Input" }] }], [{ kind: "input", parts: [{ kind: "text", text: "New projection" }] }]]);
  });

  it("truncated responses deliver only incomplete audit blocks, retain reported terminal state, and execute no tools", async () => {
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), model([
      { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c", name: "resource_list" } },
      { type: "part.delta", partId: "c", delta: "{" }, { type: "finish", reason: "tool-calls", usage: null },
    ]));
    expect(result).toMatchObject({ reason: "failed", code: "incomplete", tools: [], completion: { finishReason: "tool-calls" } });
    expect(events.filter(event => event.type === "block")).toEqual([expect.objectContaining({ block: expect.objectContaining({ complete: false, outcome: null }) })]);
    expect(events.at(-1)).toEqual({ type: "progress", blocks: [] });
  });

  it("event consumer failure cancels execution and finalizes the batch, retaining unknown writes and outcomes of unstarted calls", async () => {
    let started = 0;
    const tool = implement(write, { async call(_state, _target, _args, { publish, signal }) {
      started++; publish(1); signal.throwIfAborted(); return { kind: "succeeded", data: 2 };
    } });
    const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true, toolCaller);
    let failed = false;
    let later = 0;
    const request = input([], { observer: { event(event) {
      if (failed) later++;
      if (event.type === "progress" && event.blocks.some(block => block.kind === "toolcall" && block.result?.data === 1)) {
        failed = true; throw new Error("The event consumer failed.");
      }
    } } });
    const result = await execute(request, model(calls(["first", "second"], "resource_call", { resource_id: "r", tool: "write", args: {} })), capabilities);
    expect(result).toMatchObject({ reason: "failed", code: "event_delivery", tools: [{ kind: "unknown", data: 1 }, { kind: "cancelled" }] });
    expect(result).toMatchObject({ details: { message: "The event consumer failed." } });
    expect(started).toBe(1);
    expect(later).toBe(0);
  });

  // Tool outcomes are model feedback; explicit unknown outcomes and write-tool exceptions do not change model request outcomes.
  it("delivers unknown tool outcomes and write-tool exceptions normally and completes the batch for the agent to continue", async () => {
    let executions = 0;
    const tool = implement(write, { async call() {
      if (++executions === 2) throw new Error("The command stopped before reporting its result.");
      return { kind: "unknown", message: "Effects require inspection." };
    } });
    const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true, toolCaller);
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), model(calls(["first", "second"], "resource_call", { resource_id: "r", tool: "write", args: {} })), capabilities);
    expect(result).toMatchObject({ reason: "completed", tools: [{ kind: "unknown" }, { kind: "unknown" }] });
    expect(result.tools[0]!.model).toEqual([{ kind: "text", text: "unknown: Effects require inspection." }]);
    expect(result.tools[1]!.model).toEqual([{ kind: "text", text: "unknown: The tool stopped with an unknown outcome." }]);
    expect(events.filter(event => event.type === "block")).toHaveLength(2);
    expect(events.filter(event => event.type === "diagnostic")).toEqual([]);
  });

  it("cache hits reflect each explicit input rather than inference from the previous call", async () => {
    const finish = { type: "finish" as const, reason: "stop", usage: { input: 3000, output: 10, total: 3010, reasoning: null, cacheRead: 0, cacheWrite: null } };
    const adapter = model([...text.slice(0, -1), finish]);
    const first: ModelRunEvent[] = []; const second: ModelRunEvent[] = []; const third: ModelRunEvent[] = [];
    await execute(input(first), adapter);
    await execute(input(second, { cache: { expectHit: true } }), adapter);
    await execute(input(third), adapter);
    expect(first.filter(event => event.type === "diagnostic")).toEqual([]);
    expect(second.filter(event => event.type === "diagnostic")).toMatchObject([{ code: "cache_miss", level: "warning" }]);
    expect(third.filter(event => event.type === "diagnostic")).toEqual([]);
  });
  // Domain extensions consume an independent copy of the final state and accompany usage on the highest-index block; the public layer retains only the envelope.
  it("generates domain extensions after preparation and delivers them once with the terminal block; unknown or incompatible extensions preserve public metering", async () => {
    const contract = defineData("example.agent/request", z.codec(z.array(z.string()), z.object({ tools: z.array(z.string()) }), {
      decode: tools => ({ tools }), encode: value => value.tools,
    }));
    const unknown = { contract: { id: "other.plugin/opaque" }, data: { version: 42 } };
    const system = { blocks: [{ id: "s", kind: "system" as const, from: "core", text: "Environment" }] };
    let prepared = false;
    const extensions = vi.fn(context => {
      expect(prepared).toBe(true);
      context.system.blocks[0].text = "Changed copy";
      return [present(contract, { tools: context.tools.map((tool: { name: string }) => tool.name) }), unknown];
    });
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events, { system, completionExtensions: extensions }), model([
      { type: "part.start", part: { id: "thought", kind: "thinking" } },
      { type: "part.end", partId: "thought" }, ...text,
    ], () => { prepared = true; }));
    const blocks = events.filter(event => event.type === "block").map(event => event.block);
    expect(blocks[0]?.completion).toBeNull();
    expect(blocks[1]?.completion).toEqual(result.completion);
    expect(extensions).toHaveBeenCalledTimes(1);
    expect(system.blocks[0]?.text).toBe("Environment");
    const saved = modelCompletionSchema.parse(result.completion);
    expect(saved.extensions).toContainEqual({ contract: { id: contract.id }, data: ["resource_list", "resource_inspect", "resource_call"] });
    expect(saved.extensions).toContainEqual(unknown);
    expect(completionData(saved, contract)).toEqual({ tools: ["resource_list", "resource_inspect", "resource_call"] });
    expect(completionData(saved, defineData("missing/plugin", z.string()))).toBeNull();
    expect(completionData(saved, defineData(contract.id, z.number()))).toBeNull();
    extensions.mockClear();
    const rejected = await execute(input([], { completionExtensions: extensions }), model(text, () => { throw new ModelFailure("invalid_argument", "Invalid request."); }));
    expect(rejected).toMatchObject({ reason: "failed", completion: null });
    expect(extensions).not.toHaveBeenCalled();
  });
});
