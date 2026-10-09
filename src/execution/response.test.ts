import { describe, expect, it } from "vitest";
import type { BlockCompletion, NewNode } from "../shared/session.ts";
import type { ModelEvent } from "../model/contract.ts";
import { ResponseBuffer } from "./response.ts";

function setup() {
  const nodes: NewNode[] = [];
  const completions: { id: string | null; data: BlockCompletion }[] = [];
  return { nodes, completions, response: new ResponseBuffer(
    { agentId: "a", responseId: "r", requestParentId: null, model: "p/m", adapter: "test", scope: "s" },
    node => { nodes.push(node); return `block-${nodes.length}`; },
    (id, data) => completions.push({ id, data }),
  ) };
}
const start: ModelEvent = { type: "part.start", part: { id: "t", kind: "text" } };
const call: ModelEvent = { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c1", name: "read" } };
const finish: ModelEvent = { type: "finish", reason: "stop", usage: null };

describe("响应块状态机", () => {
  it("终态归属最高序号块，和并行工具完成顺序无关；关闭只计量一次", () => {
    const { response, nodes, completions } = setup();
    response.accept(call);
    response.accept({ type: "part.end", partId: "c", arguments: {} });
    response.accept({ type: "part.start", part: { id: "c2", kind: "toolcall", callId: "c2", name: "read" } });
    response.accept({ type: "part.end", partId: "c2", arguments: {} });
    const usage = { input: 5, output: 2, total: 7, reasoning: null, cacheRead: null, cacheWrite: null };
    response.accept({ type: "finish", reason: "tool-calls", usage, responseId: "remote", rawFinishReason: "tool_use" });
    const [first, last] = response.calls();
    response.settle(last!, { kind: "succeeded", model: null, data: null });
    response.settle(first!, { kind: "cancelled", message: "Cancelled." });
    response.close();
    response.close();
    expect(nodes.map(node => "ordinal" in node && node.ordinal)).toEqual([1, 0]);
    expect(completions).toEqual([{ id: "block-1", data: {
      usage, finishReason: "tool-calls", rawFinishReason: "tool_use", providerResponseId: "remote",
    } }]);
  });

  it("异常流的已报告用量仍保存；未报告终态不虚构计量", () => {
    const { response, completions } = setup();
    response.accept(start);
    response.accept({ type: "part.delta", partId: "t", delta: "partial" });
    expect(() => response.accept(finish)).toThrow("incomplete blocks");
    response.close();
    expect(completions).toEqual([{ id: "block-1", data: {
      usage: null, finishReason: "stop", rawFinishReason: null, providerResponseId: null,
    } }]);
    const interrupted = setup();
    interrupted.response.accept(start);
    interrupted.response.close();
    expect(interrupted.completions).toEqual([]);
    expect(() => interrupted.response.accept(start)).toThrow("already closed");
  });

  it("finish 不能把缺少 part.end 的工具参数变成可执行调用", () => {
    const { response, nodes } = setup();
    response.accept(call);
    response.accept({ type: "part.delta", partId: "c", delta: "{\"path\":" });
    expect(() => response.accept(finish)).toThrow("incomplete blocks");
    expect(response.finish).toEqual(finish);
    response.interrupt();
    expect(nodes).toEqual([expect.objectContaining({ kind: "toolcall", argumentsText: "{\"path\":", complete: false, outcome: null })]);
  });

  it("文本块结束即保存，工具取得结局才保存；中断不重复追加", () => {
    const { response, nodes } = setup();
    response.accept(start);
    response.accept({ type: "part.delta", partId: "t", delta: "hello" });
    response.accept({ type: "part.end", partId: "t" });
    expect(nodes).toEqual([expect.objectContaining({ kind: "text", text: "hello", complete: true })]);
    response.accept(call);
    response.accept({ type: "part.end", partId: "c", arguments: {} });
    response.accept(finish);
    expect(nodes).toHaveLength(1);
    expect(response.live()).toEqual([expect.objectContaining({ kind: "toolcall", state: "ready" })]);
    response.start(response.calls()[0]!);
    expect(response.live()[0]).toMatchObject({ state: "executing" });
    response.settle(response.calls()[0]!, { kind: "cancelled", message: "Stopped." });
    response.interrupt();
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
