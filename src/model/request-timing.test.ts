import { describe, expect, it, vi } from "vitest";
import { RequestTimer } from "./request-timing.ts";
import { requestTimingSchema } from "@atelier/sdk/contracts";

describe("请求计时", () => {
  // docs/runtime.md#请求诊断：校时不影响耗时，空增量不是首次输出，模型终态之后的工具时间不得混入。
  it("用单调时钟测量非空增量，并在终态冻结计时", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let now = 10;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const timer = new RequestTimer();
      now = 110; timer.output("text", "");
      now = 210; timer.output("thinking", "Thought");
      vi.setSystemTime(new Date("2025-12-31T23:59:00Z"));
      now = 510; timer.output("text", "Answer");
      now = 810; timer.output("toolcall", "{}");
      now = 1010;
      const timing = timer.end("completed");
      expect(requestTimingSchema.parse(timing)).toEqual({
        startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2025-12-31T23:59:00.000Z",
        durationMs: 1000, firstOutputMs: 200, firstReasoningMs: 200, firstTextMs: 500,
        lastOutputMs: 800, outputChunks: 3, outcome: "completed",
      });
      now = 90010; timer.output("text", "Late");
      expect(timer.end("cancelled")).toEqual(timing);
    } finally { clock.mockRestore(); vi.useRealTimers(); }
  });

  // 失败前没有输出时，延迟未知，不能用零假冒立即响应。
  it("无输出的失败请求仍有起止时间，但不产生首次输出", () => {
    expect(new RequestTimer().end("failed")).toMatchObject({
      startedAt: expect.any(String), endedAt: expect.any(String), durationMs: expect.any(Number),
      firstOutputMs: null, firstTextMs: null, firstReasoningMs: null, lastOutputMs: null, outputChunks: 0, outcome: "failed",
    });
  });
});
