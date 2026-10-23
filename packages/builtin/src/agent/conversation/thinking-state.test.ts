import { describe, expect, it } from "vitest";
import { thinkingDuration } from "./thinking-state";

describe("思考计时", () => {
  it("计时取真实起止时间，历史没有起点时不虚构耗时", () => {
    expect(thinkingDuration(1000, 66000)).toBe("1:05");
    expect(thinkingDuration(1000, 1999)).toBe("0:00");
    expect(thinkingDuration(1000, 500)).toBe("0:00");
    expect(thinkingDuration(null, 66000)).toBeNull();
    expect(thinkingDuration(1000, NaN)).toBeNull();
  });
});
