import { describe, expect, it } from "vitest";
import { formatElapsedTime } from "./elapsed-time";

describe("Elapsed time formatting", () => {
  it("Uses actual start and end times without inventing duration when historical start time is absent", () => {
    expect(formatElapsedTime(1000, 66000)).toBe("1:05");
    expect(formatElapsedTime(1000, 3662000)).toBe("61:01");
    expect(formatElapsedTime(1000, 1999)).toBe("0:00");
    expect(formatElapsedTime(1000, 500)).toBe("0:00");
    expect(formatElapsedTime(null, 66000)).toBeNull();
    expect(formatElapsedTime(1000, NaN)).toBeNull();
  });
});
