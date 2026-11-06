import { describe, expect, it, vi } from "vitest";
import type { ModelEvent, StreamRequest } from "@asterism-app/sdk/contracts";
import type { ModelServices } from "@asterism-app/sdk/runtime";
import { sessionSnapshot } from "../../../../../src/plugins/records.ts";
import { nodeView } from "../../../../../src/session/view.ts";
import { message, node } from "../../../../../src/session/test-nodes.ts";
import { investigateAgent } from "./runtime.ts";
import { collectPeekResponse } from "./stream.ts";
import { createPeekClient } from "./service.ts";
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
  it("Cancels the model investigation when a public stream consumer exits early", async () => {
    const { object } = target();
    let requestSignal: AbortSignal | undefined;
    let finishRequest!: () => void;
    const finished = new Promise<void>(resolve => { finishRequest = resolve; });
    const stream: ModelServices["stream"] = async function* (input) {
      requestSignal = input.signal;
      try {
        await new Promise<void>(resolve => { input.signal.addEventListener("abort", () => resolve(), { once: true }); });
        input.signal.throwIfAborted();
      } finally { finishRequest(); }
    };
    const lifetime = new AbortController();
    const peek = createPeekClient(deps(stream), () => object, lifetime.signal);
    try {
      for await (const event of peek.stream({ question: "Explain" }, { signal: lifetime.signal })) {
        expect(event.type).toBe("progress");
        break;
      }
      await finished;
      expect(requestSignal?.aborted).toBe(true);
    } finally { lifetime.abort(); }
  });

  it("Keeps prior Peek exchanges separate from evidence, refreshes evidence for follow-ups, and leaves independent calls without history", async () => {
    const { object, nodes } = target(), requests: StreamRequest[] = [];
    const stream: ModelServices["stream"] = async function* (input) {
      requests.push(input);
      yield* text("The change is still pending."); yield finish();
    };
    const signal = new AbortController().signal;
    await investigateAgent(deps(stream), object, { question: "Explain the change" }, signal, () => {});
    nodes.push(node("decision", "saved", message("a", "The change was approved.")));
    await investigateAgent(deps(stream), object, { question: "Is that still true?", history: [{
      question: "Explain the change", report: "The change is still pending.", outcome: "succeeded",
    }] }, signal, () => {});
    await investigateAgent(deps(stream), object, { question: "An independent investigation" }, signal, () => {});

    const evidence = requests[1].system.blocks.find(block => block.id.endsWith(".records"))!.text;
    const history = requests[1].system.blocks.find(block => block.id.endsWith(".history"))!.text;
    expect(evidence).toContain("The change was approved.");
    expect(evidence).not.toContain("The change is still pending.");
    expect(history).toContain("Explain the change");
    expect(history).toContain("The change is still pending.");
    expect(requests[0].system.blocks.some(block => block.id.endsWith(".history"))).toBe(false);
    expect(requests[2].system.blocks.some(block => block.id.endsWith(".history"))).toBe(false);
    expect(object.session.snapshot).toHaveBeenCalledTimes(3);
  });

  it("Uses the last text block as the report while streaming its deltas", async () => {
    const updates: string[] = [];
    const stream = async function* (): AsyncGenerator<ModelEvent> {
      yield* text("Earlier explanation", "explanation");
      yield { type: "part.start", part: { id: "report", kind: "text" } };
      yield { type: "part.delta", partId: "report", delta: "Final " };
      expect(updates.at(-1)).toBe("Final ");
      yield { type: "part.delta", partId: "report", delta: "summary" };
      yield { type: "part.end", partId: "report" };
      yield finish();
    };
    const signal = new AbortController().signal;
    const result = await collectPeekResponse(stream(), signal, {
      progress: (_phase, report) => updates.push(report), finish() {},
    });
    expect(result.report).toBe("Final summary");
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
        const transcript = JSON.stringify(input.system);
        expect(transcript).toContain("Original evidence");
        expect(transcript).not.toContain("New activity");
        expect(input.messages.find(item => item.kind === "output")).toMatchObject({
          scope: "test", adapter: "test/1", parts: [expect.objectContaining({ continuation: { openai: { phase: "final_answer" } } }), expect.objectContaining({ callId: "c1" })],
        });
        yield* text("Final answer");
        expect(updates.at(-1)?.report).toBe("Final answer");
        yield finish();
      }
    };
    const result = await investigateAgent(deps(stream), object, { question: "What happened?" }, new AbortController().signal, data => updates.push(data));
    expect(result).toMatchObject({ kind: "succeeded", data: { phase: "done", report: "Final answer", snapshot: { nodeId: "saved" } } });
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

  it("Rejects an oversized inline transcript before starting a model request", async () => {
    const { object, nodes } = target();
    nodes.push(node("long-dialogue", "saved", message("a", "Long conversation ".repeat(1000))));
    const stream = vi.fn<ModelServices["stream"]>();
    const limited = deps(stream);
    limited.models.list = () => [{ ...model, contextWindow: 4096 }];

    const result = await investigateAgent(limited, object, { question: "Summarize" }, new AbortController().signal, () => {});

    expect(result).toMatchObject({ kind: "failed", error: { code: "peek_context_overflow" },
      data: { round: 0, requests: [], queries: [] } });
    expect(stream).not.toHaveBeenCalled();
  });

  it("Asks for a final summary on round 24 while preserving tools and retrieval history", async () => {
    const { object } = target();
    let rounds = 0;
    const stream: ModelServices["stream"] = async function* (input) {
      rounds++;
      const lastInput = JSON.stringify(input.messages.at(-1));
      if (rounds < 24) {
        expect(lastInput).not.toContain("final investigation round");
        yield* query(); yield finish("tool-calls");
      } else {
        expect(lastInput).toContain("final investigation round");
        expect(input.messages.filter(item => item.kind === "result")).toHaveLength(23);
        expect(input.tools?.map(tool => tool.name)).toContain("read_records");
        yield* text("Conversation summary"); yield finish();
      }
    };
    const result = await investigateAgent(deps(stream), object, { question: "Summarize" }, new AbortController().signal, () => {});
    expect(result).toMatchObject({ kind: "succeeded", data: { round: 24, report: "Conversation summary" } });
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
    expect(stream).toHaveBeenCalledTimes(24);
  });
});
