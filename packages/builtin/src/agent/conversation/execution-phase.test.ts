import { describe, expect, it } from "vitest";
import { executionPhase } from "./execution-phase";

describe("Execution phase", () => {
  it("Shows compaction even while a retry is recorded", () => {
    expect(executionPhase({ attempt: 2, max: 5, resumeAt: 9000 }, true, 2000)).toEqual({ kind: "compressing" });
  });

  it("Distinguishes a running retry from a retry wait", () => {
    expect(executionPhase(null, false, 0)).toEqual({ kind: "working" });
    expect(executionPhase({ attempt: 2, max: 5, resumeAt: null }, false, 0)).toEqual({ kind: "retrying", attempt: 2, max: 5 });
  });

  it("Rounds the countdown up and stops at zero once the retry is due", () => {
    expect(executionPhase({ attempt: 1, max: 3, resumeAt: 5000 }, false, 2001)).toEqual({ kind: "waiting", attempt: 1, max: 3, seconds: 3 });
    expect(executionPhase({ attempt: 1, max: 3, resumeAt: 5000 }, false, 6000)).toMatchObject({ seconds: 0 });
  });
});
