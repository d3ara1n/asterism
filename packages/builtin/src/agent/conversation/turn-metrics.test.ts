import { describe, expect, it } from "vitest";
import type { ModelCompletion } from "@asterism/sdk/contracts";
import { ContextSummary } from "@asterism/builtin-api/contracts";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { agentSource, call, event, message, node, text, thinking } from "../../../../../src/session/test-nodes";
import { tokensPerSecond } from "../diagnostics/performance";
import { turnMetrics } from "./turn-metrics";

const completion = (input: number, output: number, cacheRead: number, durationMs: number) => ({
  finishReason: "stop", rawFinishReason: null, providerResponseId: null,
  usage: { input, output, cacheRead, cacheWrite: 0, reasoning: 0, total: input + output },
  timing: { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:02.000Z",
    durationMs, firstOutputMs: 100, firstTextMs: 100, firstReasoningMs: null, lastOutputMs: durationMs - 100, outputChunks: 2, outcome: "completed" },
} satisfies ModelCompletion);
const snapshot = (path: ReturnType<typeof node>[]) => sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null));

describe("对话中的逐轮计量", () => {
  // docs/runtime.md：同批独立消息和请求之间的 steer 都归入一个回合，follow 才开始下一回合。
  it("连续输入与插话不产生空回合或拆分请求计量", () => {
    const path = [
      node("u1", null, message("a", "First")),
      node("u2", "u1", message("a", "Second", false)),
      node("r1", "u2", call("a", "r1", 0, "c", { completion: { ...completion(100, 20, 50, 2000), finishReason: "tool-calls" } })),
      node("steer", "r1", message("a", "Correction", false)),
      node("r2", "steer", text("a", "r2", 0, "Done", { completion: completion(200, 30, 100, 1000) })),
      node("follow1", "r2", message("a", "Next")),
      node("follow2", "follow1", message("a", "More", false)),
      node("r3", "follow2", text("a", "r3", 0, "Next answer", { completion: completion(300, 40, 200, 1000) })),
    ];
    expect(turnMetrics(snapshot(path), "a", false)).toMatchObject([
      { inputId: "u1", nextInputId: "follow1", incomplete: false, metrics: { count: 2, usage: { input: { value: 300 } } } },
      { inputId: "follow1", nextInputId: null, incomplete: false, metrics: { count: 1 } },
    ]);
    expect(turnMetrics(snapshot(path), "a", true)).toHaveLength(1);
  });

  // docs/workbench.md：只隐藏当前运行轮，历史轮次的计量保留在对话中。
  it("当前轮运行期间隐藏计量，开启下一轮时保留上一轮概要", () => {
    const path = [
      node("u1", null, message("a", "First")),
      node("r1", "u1", text("a", "r1", 0, "Done", { completion: completion(100, 20, 50, 2000) })),
    ];
    expect(turnMetrics(snapshot(path), "a", true)).toEqual([]);
    expect(turnMetrics(snapshot(path), "a", false)[0]?.metrics.count).toBe(1);
    path.push(node("u2", "r1", message("a", "Next")));
    expect(turnMetrics(snapshot(path), "a", true)).toMatchObject([{ inputId: "u1", nextInputId: "u2", incomplete: false, metrics: { count: 1 } }]);
    expect(turnMetrics(snapshot(path), "a", false)).toHaveLength(1);
  });

  // 本轮从本代理最新用户输入开始；旧轮、其他代理消息和辅助压缩不能改变范围或混入权重。
  it("同一轮的多个请求按总量计算命中率与吞吐，继续后的请求仍合并", () => {
    const path = [
      node("old-user", null, message("a", "Old")),
      node("old-response", "old-user", text("a", "old", 0, "Old answer", { completion: completion(9000, 9000, 9000, 1000) })),
      node("u", "old-response", message("a", "Current")),
      node("r1", "u", text("a", "r1", 0, "First response", { completion: completion(100, 20, 50, 2000) })),
      node("other-input", "r1", message("b", "Another agent")),
      node("compression", "other-input", event(ContextSummary.id, { summary: "S", keptFrom: "u", model: "p/m", tokensBefore: 1000,
        completion: completion(999, 999, 0, 1000) }, { source: agentSource("a") })),
      node("r2", "compression", text("a", "r2", 0, "Continued", { completion: completion(300, 80, 270, 1000) })),
    ];
    const turns = turnMetrics(snapshot(path), "a", false);
    expect(turns.map(turn => turn.inputId)).toEqual(["old-user", "u"]);
    const metrics = turns[1]!.metrics;
    expect(metrics.count).toBe(2);
    expect(metrics.cache).toEqual({ read: 320, input: 400, count: 2 });
    expect(metrics.usage.input).toEqual({ value: 400, count: 2 });
    expect(metrics.usage.output).toEqual({ value: 100, count: 2 });
    expect(tokensPerSecond(metrics.performance.rates.output)).toBeCloseTo(100 / 3);
  });

  // 不完整请求可能没有 usage；已知部分必须标出覆盖数，不能把缺失值当作零。
  it("未取得用量的中断请求不产生零速率，继续后仅累计实际报告的数据", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("partial", "u", text("a", "interrupted", 0, "Partial", { complete: false })),
    ];
    const interruptedTurn = turnMetrics(snapshot(path), "a", false)[0]!;
    expect(interruptedTurn.incomplete).toBe(true);
    expect(interruptedTurn.replyMarkdown).toBeNull();
    const interrupted = interruptedTurn.metrics;
    expect(interrupted.cache).toBeNull();
    expect(interrupted.usage.output).toEqual({ value: null, count: 0 });
    expect(tokensPerSecond(interrupted.performance.rates.output)).toBeNull();
    path.push(node("resumed", "partial", text("a", "resumed", 0, "Done", { completion: completion(100, 20, 50, 2000) })));
    expect(turnMetrics(snapshot(path), "a", true)).toEqual([]);
    const resumedTurn = turnMetrics(snapshot(path), "a", false)[0]!;
    expect(resumedTurn.incomplete).toBe(false);
    expect(resumedTurn.replyMarkdown).toBe("Done");
    const resumed = resumedTurn.metrics;
    expect(resumed.count).toBe(2);
    expect(resumed.usage.output).toEqual({ value: 20, count: 1 });
    expect(resumed.cache?.count).toBe(1);
    expect(tokensPerSecond(resumed.performance.rates.output)).toBe(10);
  });

  // docs/workbench.md#对话计量：复制最终响应的所有正文，避免漏块或混入思考、过程、工具与其他轮次。
  it("最终回复按块序号保留 Markdown，历史轮次分别保留自己的回复", () => {
    const first = "# 结果\n\n- **已修复**";
    const second = "```ts\nconst ready = true;\n```\n";
    const path = [
      node("u1", null, message("a", "User question")),
      node("progress", "u1", text("a", "work", 0, "Let me inspect the file.")),
      node("tool", "progress", call("a", "work", 1, "Tool output")),
      node("reasoning", "tool", thinking("a", "final", 0, "Private reasoning")),
      node("second", "reasoning", text("a", "final", 2, second, { completion: completion(100, 20, 50, 2000) })),
      node("first", "second", text("a", "final", 1, first)),
      node("other", "first", text("b", "other", 0, "Other agent")),
      node("u2", "other", message("a", "Next question")),
      node("next", "u2", text("a", "next", 0, "Next answer", { completion: completion(100, 20, 50, 2000) })),
    ];
    expect(turnMetrics(snapshot(path), "a", false).map(turn => turn.replyMarkdown))
      .toEqual([`${first}\n\n${second}`, "Next answer"]);
  });

  // 没有最终正文时不能回退复制较早的过程文字，工具结果与思考也不能充作回复。
  it.each([
    ["工具响应", call("a", "last", 0, "Tool output", { completion: { ...completion(100, 20, 50, 2000), finishReason: "tool-calls" } })],
    ["纯思考响应", thinking("a", "last", 0, "Reasoning", { completion: completion(100, 20, 50, 2000) })],
    ["空白正文", text("a", "last", 0, " \n", { completion: completion(100, 20, 50, 2000) })],
  ])("%s 不提供复制内容", (_label, last) => {
    const path = [
      node("u", null, message("a", "Question")),
      node("earlier", "u", text("a", "earlier", 0, "Earlier response", { completion: completion(100, 20, 50, 2000) })),
      node("last", "earlier", last),
    ];
    expect(turnMetrics(snapshot(path), "a", false)[0]?.replyMarkdown).toBeNull();
  });
});
