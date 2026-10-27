import { describe, expect, it, vi } from "vitest";
import { modelBlockSchema, type ModelBlock } from "@asterism/sdk/contracts";
import type { ModelEvent } from "../model/contract.ts";
import { ResponseBuffer } from "./response.ts";

function setup() {
  const nodes: ModelBlock[] = [];
  return { nodes, response: new ResponseBuffer(
    { responseId: "r", requestParentId: null, source: { model: "p/m", adapter: "test", scope: "s" } },
    node => { nodes.push(node); },
  ) };
}
const start: ModelEvent = { type: "part.start", part: { id: "t", kind: "text" } };
const call: ModelEvent = { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c1", name: "read" } };
const finish: ModelEvent = { type: "finish", reason: "stop", usage: null };

describe("Response block state machine", () => {
  // Public record contract: display may select summaries, but persistence must not save summaries as full text or discard the other channel.
  it("full reasoning text and summaries accumulate independently and pass the record schema; summary events cannot contaminate tool arguments", () => {
    const { response, nodes } = setup();
    response.accept({ type: "part.start", part: { id: "thought", kind: "thinking" } });
    response.accept({ type: "part.delta", partId: "thought", delta: "Summary", channel: "summary" });
    expect(response.live()[0]).toMatchObject({ text: "Summary" });
    response.accept({ type: "part.delta", partId: "thought", delta: "Full thought" });
    expect(response.live()[0]).toMatchObject({ text: "Full thought" });
    response.accept({ type: "part.end", partId: "thought", continuation: { openai: { reasoningEncryptedContent: "cipher" } } });
    response.accept(finish);
    expect(modelBlockSchema.parse(nodes[0])).toMatchObject({
      kind: "thinking", text: "Full thought", summary: "Summary", continuation: { openai: { reasoningEncryptedContent: "cipher" } },
    });
    const tool = setup().response;
    tool.accept(call);
    expect(() => tool.accept({ type: "part.delta", partId: "c", delta: "Summary", channel: "summary" })).toThrow("Only thinking blocks");
    expect(tool.calls()[0]!.text).toBe("");
  });
  it("partial JSON is preview-only; incomplete escapes defer display and cancellation does not save repaired arguments", async () => {
    const { response, nodes } = setup();
    response.accept(call);
    response.accept({ type: "part.delta", partId: "c", delta: '{"target":{"path":"src/comp' });
    await response.preview(() => ({}));
    expect(response.live()[0]).toMatchObject({ state: "input", arguments: { target: { path: "src/comp" } } });
    expect(response.calls()[0]!.arguments).toBeNull();
    response.accept({ type: "part.delta", partId: "c", delta: 'onent.ts"},"args":{"content":"hello\\nworld\\u4' });
    await response.preview(() => ({}));
    expect(response.live()[0]).toMatchObject({ arguments: { args: { content: "hello\nworld" } } });
    response.close();
    expect(nodes[0]).toMatchObject({ complete: false, arguments: null, outcome: null });
  });

  it("interleaved calls retain separate previews and obtain complete arguments from terminal events rather than repaired results", async () => {
    const { response } = setup();
    response.accept(call);
    response.accept({ type: "part.start", part: { id: "other", kind: "toolcall", callId: "other", name: "write" } });
    response.accept({ type: "part.delta", partId: "c", delta: '{"path":"first' });
    response.accept({ type: "part.delta", partId: "other", delta: '{"content":"second' });
    await response.preview(() => ({}));
    expect(response.live().map(block => block.kind === "toolcall" && block.arguments)).toEqual([{ path: "first" }, { content: "second" }]);
    response.accept({ type: "part.end", partId: "c", arguments: { path: "first.txt" } });
    expect(response.live()[0]).toMatchObject({ state: "ready", arguments: { path: "first.txt" } });
    expect(response.calls()[0]!.arguments).toEqual({ path: "first.txt" });
  });
  it("live reasoning carries the runtime block start without resetting on reads or deltas; finalized blocks retain the same start and end for display and audit after restart", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const { response, nodes } = setup();
      response.accept({ type: "part.start", part: { id: "thought", kind: "thinking" } });
      clock.mockReturnValue(4000);
      response.accept({ type: "part.delta", partId: "thought", delta: "First" });
      expect(response.live()[0]).toMatchObject({ kind: "thinking", text: "First", startedAt: 1000 });
      clock.mockReturnValue(9000);
      response.accept({ type: "part.delta", partId: "thought", delta: " second" });
      expect(response.live()[0]).toMatchObject({ text: "First second", startedAt: 1000 });
      response.accept({ type: "part.end", partId: "thought" });
      expect(response.live()[0]).toMatchObject({ startedAt: 1000, endedAt: 9000 });
      expect(nodes).toEqual([]);
      response.accept(finish);
      expect(response.live()).toEqual([]);
      expect(modelBlockSchema.parse(nodes[0])).toMatchObject({ kind: "thinking", text: "First second", complete: true, startedAt: 1000, endedAt: 9000 });
    } finally { clock.mockRestore(); }
  });

  it("terminal state belongs to the highest-index block regardless of parallel tool completion order; close meters once", () => {
    const { response, nodes } = setup();
    response.accept(call);
    response.accept({ type: "part.end", partId: "c", arguments: {} });
    response.accept({ type: "part.start", part: { id: "c2", kind: "toolcall", callId: "c2", name: "read" } });
    response.accept({ type: "part.end", partId: "c2", arguments: {} });
    const usage = { input: 5, output: 2, total: 7, reasoning: null, cacheRead: null, cacheWrite: null };
    response.accept({ type: "finish", reason: "tool-calls", usage, responseId: "remote", rawFinishReason: "tool_use" });
    const [first, last] = response.calls();
    response.settle(last!, { kind: "succeeded", model: [{ kind: "text", text: "null" }], data: null });
    response.settle(first!, { kind: "cancelled", message: "Cancelled.", data: null, model: [{ kind: "text", text: "cancelled: Cancelled." }] });
    response.close();
    response.close();
    expect(nodes.map(node => "ordinal" in node && node.ordinal)).toEqual([1, 0]);
    expect(nodes[0]!.completion).toEqual({
      usage, finishReason: "tool-calls", rawFinishReason: "tool_use", providerResponseId: "remote",
    });
    expect(nodes[1]!.completion).toBeNull();
    expect(nodes.reduce((sum, block) => sum + (block.completion?.usage?.total ?? 0), 0)).toBe(7);
  });

  it("reported usage survives abnormal streams and missing terminal state does not fabricate metering", () => {
    const { response, nodes } = setup();
    response.accept(start);
    response.accept({ type: "part.delta", partId: "t", delta: "partial" });
    expect(() => response.accept(finish)).toThrow();
    response.close();
    expect(nodes[0]).toMatchObject({ complete: false, completion: {
      usage: null, finishReason: "stop", rawFinishReason: null, providerResponseId: null,
    } });
    const interrupted = setup();
    interrupted.response.accept(start);
    interrupted.response.close();
    expect(interrupted.nodes[0]!.completion).toBeNull();
    expect(() => interrupted.response.accept(start)).toThrow();
  });

  it("finish cannot make tool arguments without part.end executable", () => {
    const { response, nodes } = setup();
    response.accept(call);
    response.accept({ type: "part.delta", partId: "c", delta: "{\"path\":" });
    expect(() => response.accept(finish)).toThrow();
    response.close();
    expect(nodes).toEqual([expect.objectContaining({ kind: "toolcall", argumentsText: "{\"path\":", complete: false, outcome: null })]);
  });

  it("text waits for terminal state to persist together, tools persist after outcomes, and interruption does not append twice", () => {
    const { response, nodes } = setup();
    response.accept(start);
    response.accept({ type: "part.delta", partId: "t", delta: "hello" });
    response.accept({ type: "part.end", partId: "t" });
    expect(nodes).toEqual([]);
    expect(response.live()).toEqual([expect.objectContaining({ kind: "text", text: "hello" })]);
    response.accept(call);
    response.accept({ type: "part.end", partId: "c", arguments: {} });
    response.accept(finish);
    expect(nodes).toEqual([expect.objectContaining({ kind: "text", text: "hello", complete: true, completion: null })]);
    expect(response.live()).toEqual([expect.objectContaining({ kind: "toolcall", state: "ready" })]);
    response.start(response.calls()[0]!);
    expect(response.live()[0]).toMatchObject({ state: "executing" });
    response.settle(response.calls()[0]!, { kind: "cancelled", message: "Stopped.", data: null, model: [{ kind: "text", text: "cancelled: Stopped." }] });
    response.close();
    expect(response.live()).toEqual([]);
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toMatchObject({ kind: "toolcall", complete: true, outcome: { kind: "cancelled" } });
  });

  it("rejects unknown blocks, duplicate blocks, deltas after completion, and repeated completion explicitly", () => {
    const { response } = setup();
    expect(() => response.accept({ type: "part.delta", partId: "missing", delta: "lost" })).toThrow();
    response.accept(start);
    expect(() => response.accept(start)).toThrow();
    response.accept({ type: "part.end", partId: "t" });
    expect(() => response.accept({ type: "part.delta", partId: "t", delta: "late" })).toThrow();
    expect(() => response.accept({ type: "part.end", partId: "t" })).toThrow();
    response.accept(finish);
    expect(() => response.accept(finish)).toThrow();
  });

  it("blocks cannot reuse call IDs and misattribute tool results to the wrong nodes", () => {
    const { response } = setup();
    response.accept(call);
    expect(() => response.accept({ type: "part.start", part: { id: "other", kind: "toolcall", callId: "c1", name: "read" } })).toThrow();
  });
});
