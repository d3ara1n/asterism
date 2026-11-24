import { describe, expect, it, vi } from "vitest";
import { modelBlockSchema, type ModelBlock } from "@asterism-app/sdk/contracts";
import type { ModelEvent } from "../model/contract.ts";
import { ResponseBuffer } from "./response.ts";

function setup() {
  const nodes: ModelBlock[] = [];
  const events: string[] = [];
  return { nodes, events, response: new ResponseBuffer(
    { responseId: "r", requestParentId: null, source: { model: "p/m", adapter: "test", scope: "s" } },
    (node, type) => { nodes.push(node); events.push(type); },
  ) };
}
const start: ModelEvent = { type: "part.start", part: { id: "t", kind: "text" } };
const call: ModelEvent = { type: "part.start", part: { id: "c", kind: "toolcall", inputKind: "structured", callId: "c1", name: "read" } };
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
    response.seal(response.terminate({ reason: "completed" }));
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
    const preview = vi.fn(() => ({}));
    await response.preview(preview);
    expect(preview).toHaveBeenLastCalledWith("read", { kind: "structured", value: { target: { path: "src/comp" } } });
    expect(response.live()[0]).toMatchObject({ state: "input", input: null });
    response.accept({ type: "part.delta", partId: "c", delta: 'onent.ts"},"args":{"content":"hello\\nworld\\u4' });
    await response.preview(preview);
    expect(preview).toHaveBeenLastCalledWith("read", { kind: "structured", value: { args: { content: "hello\nworld" }, target: { path: "src/component.ts" } } });
    response.close();
    expect(nodes[0]).toMatchObject({ complete: false, input: null, outcome: null });
  });

  it("interleaved calls retain separate previews and obtain complete arguments from terminal events rather than repaired results", async () => {
    const { response } = setup();
    response.accept(call);
    response.accept({ type: "part.start", part: { id: "other", kind: "toolcall", inputKind: "structured", callId: "other", name: "write" } });
    response.accept({ type: "part.delta", partId: "c", delta: '{"path":"first' });
    response.accept({ type: "part.delta", partId: "other", delta: '{"content":"second' });
    const preview = vi.fn(() => ({}));
    await response.preview(preview);
    expect(preview.mock.calls).toEqual([
      ["read", { kind: "structured", value: { path: "first" } }],
      ["write", { kind: "structured", value: { content: "second" } }],
    ]);
    response.accept({ type: "part.end", partId: "c", input: { kind: "structured", value: { path: "first.txt" } } });
    expect(response.live()[0]).toMatchObject({ state: "ready", input: { kind: "structured", value: { path: "first.txt" } }, draft: null });
  });

  it("keeps JSON-looking freeform deltas as text and never promotes a cancelled draft", async () => {
    const { response, nodes } = setup();
    response.accept({ type: "part.start", part: { id: "c", kind: "toolcall", callId: "c", name: "plain", inputKind: "freeform" } });
    const text = ' {"path":"README.md"}\r\n ';
    response.accept({ type: "part.delta", partId: "c", delta: text });
    const preview = vi.fn(() => ({}));
    await response.preview(preview);
    expect(preview).toHaveBeenCalledWith("plain", { kind: "freeform", text });
    expect(() => response.accept({ type: "part.end", partId: "c", input: { kind: "structured", value: {} } })).toThrow("matching tool input");
    response.close();
    expect(nodes[0]).toMatchObject({ draft: { kind: "freeform", text }, input: null });
  });

  it("tool inputs publish in model order before results arrive and terminal measurements remain on the last input", () => {
    const { response, nodes, events } = setup();
    response.accept(call);
    response.accept({ type: "part.end", partId: "c", input: { kind: "structured", value: {} } });
    response.accept({ type: "part.start", part: { id: "c2", kind: "toolcall", inputKind: "structured", callId: "c2", name: "read" } });
    response.accept({ type: "part.end", partId: "c2", input: { kind: "structured", value: {} } });
    const usage = { input: 5, output: 2, total: 7, reasoning: null, cacheRead: null, cacheWrite: null };
    response.accept({ type: "finish", reason: "tool-calls", usage, responseId: "remote", rawFinishReason: "tool_use" });
    response.seal(response.terminate({ reason: "completed" }));
    expect(nodes.map(node => node.ordinal)).toEqual([0, 1]);
    expect(nodes.every(node => node.kind === "toolcall" && node.outcome === null)).toBe(true);
    const [first, last] = response.calls();
    response.settle(last!, { kind: "succeeded", model: [{ kind: "text", text: "null" }], data: null });
    response.settle(first!, { kind: "cancelled", message: "Cancelled.", data: null, model: [{ kind: "text", text: "cancelled: Cancelled." }] });
    response.close();
    response.close();
    expect(nodes.map(node => node.ordinal)).toEqual([0, 1, 1, 0]);
    expect(events).toEqual(["tool.begin", "tool.begin", "tool.complete", "tool.complete"]);
    expect(nodes[1]!.completion).toEqual({
      usage, finishReason: "tool-calls", rawFinishReason: "tool_use", providerResponseId: "remote", termination: { reason: "completed" },
    });
    expect(nodes[0]!.completion).toBeNull();
    expect(nodes.slice(0, 2).reduce((sum, block) => sum + (block.completion?.usage?.total ?? 0), 0)).toBe(7);
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
    expect(nodes).toEqual([expect.objectContaining({ kind: "toolcall", draft: { kind: "structured", text: "{\"path\":" }, complete: false, outcome: null })]);
  });

  it("text and pending tool inputs publish together, and later outcomes preserve the original tool input", () => {
    const { response, nodes } = setup();
    response.accept(start);
    response.accept({ type: "part.delta", partId: "t", delta: "hello" });
    response.accept({ type: "part.end", partId: "t" });
    expect(nodes).toEqual([]);
    expect(response.live()).toEqual([expect.objectContaining({ kind: "text", text: "hello" })]);
    response.accept(call);
    response.accept({ type: "part.end", partId: "c", input: { kind: "structured", value: {} } });
    response.accept(finish);
    response.seal(response.terminate({ reason: "completed" }));
    expect(nodes).toEqual([
      expect.objectContaining({ kind: "text", text: "hello", complete: true, completion: null }),
      expect.objectContaining({ kind: "toolcall", input: { kind: "structured", value: {} }, outcome: null }),
    ]);
    expect(response.live()).toEqual([expect.objectContaining({ kind: "toolcall", state: "ready" })]);
    response.start(response.calls()[0]!);
    expect(response.live()[0]).toMatchObject({ state: "executing" });
    response.settle(response.calls()[0]!, { kind: "cancelled", message: "Stopped.", data: null, model: [{ kind: "text", text: "cancelled: Stopped." }] });
    response.close();
    expect(response.live()).toEqual([]);
    expect(nodes).toHaveLength(3);
    expect(nodes[1]).toMatchObject({ kind: "toolcall", complete: false, outcome: null });
    expect(nodes[2]).toMatchObject({ kind: "toolcall", complete: true, outcome: { kind: "cancelled" } });
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
    expect(() => response.accept({ type: "part.start", part: { id: "other", kind: "toolcall", inputKind: "structured", callId: "c1", name: "read" } })).toThrow();
  });
});
