import { describe, expect, it } from "vitest";
import { RequestTimer } from "./request-timing.ts";

describe("Request timing", () => {

  // Without output before failure, latency is unknown; zero must not falsely imply an immediate response.
  it("failed requests without output still have start/end times but no first output", () => {
    expect(new RequestTimer().end("failed")).toMatchObject({
      startedAt: expect.any(String), endedAt: expect.any(String), durationMs: expect.any(Number),
      firstOutputMs: null, firstTextMs: null, firstReasoningMs: null, lastOutputMs: null, outputChunks: 0, outcome: "failed",
    });
  });
});
