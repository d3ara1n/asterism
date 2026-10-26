import { describe, expect, it } from "vitest";
import type { RequestTiming, Usage } from "@asterism/sdk/contracts";
import { outputDuration, performanceOverview, rateSamples, tokensPerSecond } from "./performance";
import type { DiagnosticRequest } from "./history";

const timing: RequestTiming = {
  startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:10.000Z",
  durationMs: 10000, firstOutputMs: 2000, firstTextMs: 2000, firstReasoningMs: null,
  lastOutputMs: 7000, outputChunks: 2, outcome: "completed",
};
const usage: Usage = { input: 1000, output: 100, total: 1100, reasoning: 0, cacheRead: 800, cacheWrite: null };
const rates = (clock = timing, counts: Usage | null = usage) =>
  Object.fromEntries(Object.entries(rateSamples(clock, counts)).map(([key, sample]) => [key, tokensPerSecond(sample)]));
const request = (clock: RequestTiming | undefined, counts: Usage | null): DiagnosticRequest => ({
  id: "r", kind: "response", responseId: "r", model: "p/m", modelScope: null, createdAt: timing.endedAt,
  sequence: 1, requestParentId: null, completion: counts ? { usage: counts, finishReason: "stop", rawFinishReason: null, providerResponseId: null,
    ...(clock ? { timing: clock } : {}) } : null,
  blocks: [], summary: null, onTimeline: true, relatedInput: null, inputHasFiles: false,
  tokensBefore: null, sent: null,
});

describe("诊断速率", () => {
  // 分清请求总耗时和输出持续时间，缓存输入不重复加进总量。
  it("E2E、思考细分和流式速率使用各自的计量范围", () => {
    expect(outputDuration(timing)).toBe(5000);
    expect(rates()).toEqual({ output: 10, nonReasoning: 10, reasoning: 0, total: 110, streaming: 20 });
    expect(rates(timing, { ...usage, reasoning: 40 })).toEqual({ output: 10, nonReasoning: 6, reasoning: 4, total: 110, streaming: null });
  });

  // 未报告思考、思考摘要与单个大包都无法给出可信的流式速率；缺用量不能当作零。
  it("缺失或矛盾的计量及不可观测的输出范围不计算对应速率", () => {
    expect(rates(timing, { ...usage, reasoning: null })).toMatchObject({ nonReasoning: null, reasoning: null, streaming: null });
    expect(rates(timing, { ...usage, reasoning: 101 })).toMatchObject({ nonReasoning: null, reasoning: null, streaming: null });
    expect(rates({ ...timing, firstReasoningMs: 2000 }).streaming).toBeNull();
    expect(rates({ ...timing, outputChunks: 1, lastOutputMs: 2000 }).streaming).toBeNull();
    expect(rates(timing, { ...usage, input: null }).total).toBeNull();
    expect(Object.values(rates(timing, null))).toEqual([null, null, null, null, null]);
    expect(Object.values(rates({ ...timing, durationMs: 0 }))).toEqual([null, null, null, null, null]);
    expect(Object.values(rates({ ...timing, outcome: "cancelled" }))).toEqual([null, null, null, null, null]);
  });

  // 直接平均 10 TPS 和 100 TPS 会得到错误的 55；分子和分母必须来自同一批可计量请求。
  it("按总 token 与对应总耗时汇总，没有终态计时的记录不补耗时", () => {
    const overview = performanceOverview([
      request(timing, usage),
      request({ ...timing, durationMs: 1000, firstOutputMs: 100, firstTextMs: 100, lastOutputMs: 900 }, { ...usage, input: null }),
      request({ ...timing, durationMs: 5000, outcome: "failed" }, null),
      request(undefined, usage),
    ]);
    expect(overview).toMatchObject({ durationMs: 11000, timed: 2, rates: {
      output: { count: 2, tokens: 200, durationMs: 11000 },
      total: { count: 1, tokens: 1100, durationMs: 10000 },
    } });
    expect(tokensPerSecond(overview.rates.output)).toBeCloseTo(200 / 11);
    expect(tokensPerSecond(overview.rates.total)).toBe(110);
  });
});
