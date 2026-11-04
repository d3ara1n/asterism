import { describe, expect, it, vi } from "vitest";
import type { ModelEvent, StreamRequest } from "@asterism-app/sdk/contracts";
import type { ModelServices } from "@asterism-app/sdk/runtime";
import { sessionSnapshot } from "../../../../../src/plugins/records.ts";
import { nodeView } from "../../../../../src/session/view.ts";
import { message, node } from "../../../../../src/session/test-nodes.ts";
import { investigateAgent } from "./runtime.ts";
import { collectPeekResponse } from "./stream.ts";
import type { PeekResult } from "./contract.ts";

const source = { model: "p/m", adapter: "test/1", scope: "test" };
const finish = (reason = "stop"): ModelEvent => ({ type: "finish", reason, source,
  usage: { input: 10, output: 5, total: 15, reasoning: null, cacheRead: null, cacheWrite: null } });
function* text(value: string, id = "text"): Generator<ModelEvent> {
  yield { type: "part.start", part: { id, kind: "text" } };
  yield { type: "part.delta", partId: id, delta: value };
  yield { type: "part.end", partId: id, continuation: { openai: { phase: "final_answer" } } };
}
function* query(): Generator<ModelEvent> {
  yield { type: "part.start", part: { id: "call", kind: "toolcall", callId: "c1", name: "read_records" } };
  yield { type: "part.delta", partId: "call", delta: '{"id":' };
  yield { type: "part.end", partId: "call", arguments: { id: "saved" } };
}
const model = { model: "p/m", provider: "p", name: "Model", contextWindow: 65536,
  capabilities: { reasoning: false, tools: true, thinkingLevels: [] } };
const deps = (stream: ModelServices["stream"]) => ({
  models: { stream, list: () => [model] }, utility: () => ({ provider: "p", model: "m" }), userAgent: "Asterism/test",
});
function target() {
  const nodes = [node("saved", null, message("a", "Original evidence"))];
  const snapshot = vi.fn(() => sessionSnapshot(nodeView("s", "", [...nodes], nodes.at(-1)!.id)));
  return { nodes, object: { ref: { sessionId: "s", id: "a", kind: "asterism.builtin/agent" }, session: { snapshot } } };
}

// Agent investigation contract: deltas enter tool progress, retrieval executes only after a complete terminal state, and cancellation and failure retain their actual outcomes.
describe("peek investigation stream", () => {
  it("Uses the last text block as the report while streaming its deltas", async () => {
    const updates: string[] = [];
    const stream = async function* (): AsyncGenerator<ModelEvent> {
      yield* text("Earlier explanation", "explanation");
      yield { type: "part.start", part: { id: "report", kind: "text" } };
      yield { type: "part.delta", partId: "report", delta: "Final " };
      expect(updates.at(-1)).toBe("Final ");
      yield { type: "part.delta", partId: "report", delta: "evidence [saved]" };
      yield { type: "part.end", partId: "report" };
      yield finish();
    };
    const signal = new AbortController().signal;
    const result = await collectPeekResponse(stream(), signal, {
      progress: (_phase, report) => updates.push(report), finish() {},
    });
    expect(result.report).toBe("Final evidence [saved]");
  });

  it("Publishes the report before model finalization; subsequent retrieval rounds replace the draft while preserving protocol pairing and measurements", async () => {
    const { object, nodes } = target(), updates: PeekResult[] = [], targets: StreamRequest["target"][] = [];
    let request = 0;
    const stream: ModelServices["stream"] = async function* (input) {
      targets.push({ ...input.target });
      request++;
      if (request === 1) {
        yield* text("Provisional report");
        expect(updates.at(-1)?.report).toBe("Provisional report");
        nodes.push(node("later", "saved", message("a", "New activity")));
        yield* query();
        yield finish("tool-calls");
      } else {
        const result = input.messages.find(item => item.kind === "result");
        expect(result).toMatchObject({ kind: "result", callId: "c1", outcome: { data: { text: "Original evidence" } } });
        expect(JSON.stringify(input.messages)).not.toContain("New activity");
        expect(input.messages.find(item => item.kind === "output")).toMatchObject({
          scope: "test", adapter: "test/1", parts: [expect.objectContaining({ continuation: { openai: { phase: "final_answer" } } }), expect.objectContaining({ callId: "c1" })],
        });
        yield* text("Final answer [saved]");
        expect(updates.at(-1)?.report).toBe("Final answer [saved]");
        yield finish();
      }
    };
    const result = await investigateAgent(deps(stream), object, { question: "What happened?" }, new AbortController().signal, data => updates.push(data));
    expect(result).toMatchObject({ kind: "succeeded", data: { phase: "done", report: "Final answer [saved]", snapshot: { nodeId: "saved" } } });
    expect(result.data?.requests).toHaveLength(2);
    expect(result.data?.queries).toEqual([{ tool: "read_records", arguments: { id: "saved" }, records: ["saved"] }]);
    expect(updates.some(data => data.report === "" && data.phase === "reading")).toBe(true);
    expect(object.session.snapshot).toHaveBeenCalledTimes(1);
    expect(targets[0]).toEqual({ provider: "p", model: "m" });
  });

  it("Does not execute tool calls truncated by the output limit, and saves truncated reports as partial results", async () => {
    const { object } = target();
    const stream: ModelServices["stream"] = async function* () {
      yield* text("Partial evidence");
      yield* query(); yield finish("length");
    };
    const result = await investigateAgent(deps(stream), object, { question: "Investigate" }, new AbortController().signal, () => {});
    expect(result).toMatchObject({ kind: "partial", data: { report: "Partial evidence", queries: [], requests: [expect.anything()] } });
  });

  it("Propagates cancellation to in-flight requests and preserves streamed body text; missing terminal state also prevents queries from starting", async () => {
    const { object } = target(), controller = new AbortController();
    const cancelled: ModelServices["stream"] = async function* (request) {
      expect(request.signal).toBe(controller.signal);
      yield* text("Visible partial");
      controller.abort(); request.signal.throwIfAborted();
    };
    expect(await investigateAgent(deps(cancelled), object, { question: "Investigate" }, controller.signal, () => {}))
      .toMatchObject({ kind: "cancelled", data: { report: "Visible partial", requests: [] } });
    const updates: PeekResult[] = [];
    const missing: ModelServices["stream"] = async function* () {
      yield* query();
      expect(updates.at(-1)).toMatchObject({ phase: "reading", report: "", queries: [] });
    };
    expect(await investigateAgent(deps(missing), object, { question: "Investigate" }, new AbortController().signal, data => updates.push(data)))
      .toMatchObject({ kind: "failed", data: { queries: [] } });
  });

  it("Returns received text with the transport error when the stream fails during a text block", async () => {
    const { object } = target();
    const stream: ModelServices["stream"] = async function* () {
      yield { type: "part.start", part: { id: "text", kind: "text" } };
      yield { type: "part.delta", partId: "text", delta: "Evidence received before disconnect" };
      throw new Error("Connection reset");
    };
    expect(await investigateAgent(deps(stream), object, { question: "Investigate" }, new AbortController().signal, () => {}))
      .toMatchObject({ kind: "failed", data: { report: "Evidence received before disconnect", requests: [] },
        error: { code: "peek_failed", message: "Connection reset" } });
  });

  it("Fails explicitly when utility lacks tool capability, and ends the retrieval loop at the request limit", async () => {
    const { object } = target();
    const stream = vi.fn<ModelServices["stream"]>(async function* () { yield* query(); yield finish("tool-calls"); });
    const unavailable = deps(stream);
    unavailable.models.list = () => [{ ...model, capabilities: { ...model.capabilities, tools: false } }];
    expect(await investigateAgent(unavailable, object, { question: "Investigate" }, new AbortController().signal, () => {}))
      .toMatchObject({ kind: "failed", error: { code: "peek_model_unavailable" } });
    expect(stream).not.toHaveBeenCalled();
    const result = await investigateAgent(deps(stream), object, { question: "Investigate" }, new AbortController().signal, () => {});
    expect(result).toMatchObject({ kind: "failed", error: { code: "peek_request_limit" } });
    expect(stream).toHaveBeenCalledTimes(6);
  });
});
