import { describe, expect, it } from "vitest";
import { RequestTimer } from "./request-timing.ts";

describe("请求计时", () => {

  // 失败前没有输出时，延迟未知，不能用零假冒立即响应。
  it("无输出的失败请求仍有起止时间，但不产生首次输出", () => {
    expect(new RequestTimer().end("failed")).toMatchObject({
      startedAt: expect.any(String), endedAt: expect.any(String), durationMs: expect.any(Number),
      firstOutputMs: null, firstTextMs: null, firstReasoningMs: null, lastOutputMs: null, outputChunks: 0, outcome: "failed",
    });
  });
});
