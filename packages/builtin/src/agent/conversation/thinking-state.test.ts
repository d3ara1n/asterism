import { describe, expect, it } from "vitest";
import { thinkingDuration } from "./thinking-state";

describe("Thinking timing", () => {
  it("Uses actual start and end times without inventing duration when historical start time is absent", () => {
    expect(thinkingDuration(1000, 66000)).toBe("1:05");
    expect(thinkingDuration(1000, 1999)).toBe("0:00");
    expect(thinkingDuration(1000, 500)).toBe("0:00");
    expect(thinkingDuration(null, 66000)).toBeNull();
    expect(thinkingDuration(1000, NaN)).toBeNull();
  });
});
