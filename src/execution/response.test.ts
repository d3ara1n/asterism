import { describe, expect, it, vi } from "vitest";
import type { ModelBlock } from "@atelier/sdk/contracts";
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

describe("响应块状态机", () => {
  it("部分 JSON 仅成为预览，未完成转义暂缓显示，取消不保存修复后的参数", async () => {
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

  it("交错调用各自保留预览，完整参数取终结事件，不取修复结果", async () => {
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
  it("即时思考携带运行时块起点，读取和增量不会重新计时；结束后保留全文", () => {
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
      expect(nodes[0]).toMatchObject({ kind: "thinking", text: "First second", complete: true });
    } finally { clock.mockRestore(); }
  });

  it("终态归属最高序号块，和并行工具完成顺序无关；关闭只计量一次", () => {
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

  it("异常流的已报告用量仍保存；未报告终态不虚构计量", () => {
    const { response, nodes } = setup();
    response.accept(start);
    response.accept({ type: "part.delta", partId: "t", delta: "partial" });
    expect(() => response.accept(finish)).toThrow("incomplete blocks");
    response.close();
    expect(nodes[0]).toMatchObject({ complete: false, completion: {
      usage: null, finishReason: "stop", rawFinishReason: null, providerResponseId: null,
    } });
    const interrupted = setup();
    interrupted.response.accept(start);
    interrupted.response.close();
    expect(interrupted.nodes[0]!.completion).toBeNull();
    expect(() => interrupted.response.accept(start)).toThrow("already closed");
  });

  it("finish 不能把缺少 part.end 的工具参数变成可执行调用", () => {
    const { response, nodes } = setup();
    response.accept(call);
    response.accept({ type: "part.delta", partId: "c", delta: "{\"path\":" });
    expect(() => response.accept(finish)).toThrow("incomplete blocks");
    response.close();
    expect(nodes).toEqual([expect.objectContaining({ kind: "toolcall", argumentsText: "{\"path\":", complete: false, outcome: null })]);
  });

  it("正文等待终态一起保存，工具取得结局才保存；中断不重复追加", () => {
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

  it("未知块、重复块、结束后增量与重复结束都明确拒绝", () => {
    const { response } = setup();
    expect(() => response.accept({ type: "part.delta", partId: "missing", delta: "lost" })).toThrow("inactive");
    response.accept(start);
    expect(() => response.accept(start)).toThrow("duplicate");
    response.accept({ type: "part.end", partId: "t" });
    expect(() => response.accept({ type: "part.delta", partId: "t", delta: "late" })).toThrow("inactive");
    expect(() => response.accept({ type: "part.end", partId: "t" })).toThrow("inactive");
    response.accept(finish);
    expect(() => response.accept(finish)).toThrow("after the response ended");
  });

  it("不同块不能复用调用 ID，避免将工具结果记在错误的节点上", () => {
    const { response } = setup();
    response.accept(call);
    expect(() => response.accept({ type: "part.start", part: { id: "other", kind: "toolcall", callId: "c1", name: "read" } })).toThrow("duplicate");
  });
});
