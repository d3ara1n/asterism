import { describe, expect, it } from "vitest";
import { messageTimeOptions } from "./message-time";

const format = (date: Date, now: Date) => new Intl.DateTimeFormat("en-GB", {
  ...messageTimeOptions(date, now), hourCycle: "h23",
}).format(date);

describe("Message timestamp calendar context", () => {
  it("omits the date for earlier times on the same local day", () => {
    expect(format(new Date(2026, 6, 21, 0, 5), new Date(2026, 6, 21, 23, 50))).toBe("00:05");
  });

  it("includes the date across local midnight even when only minutes have elapsed", () => {
    expect(format(new Date(2026, 6, 20, 23, 59), new Date(2026, 6, 21, 0, 1))).toBe("20 Jul, 23:59");
  });

  it("distinguishes equal day numbers in different months", () => {
    expect(format(new Date(2026, 5, 21, 14, 32), new Date(2026, 6, 21, 14, 32))).toBe("21 Jun, 14:32");
  });

  it("includes the year rather than treating a matching month and day as today", () => {
    expect(format(new Date(2025, 6, 21, 14, 32), new Date(2026, 6, 21, 14, 32))).toBe("21 Jul 2025, 14:32");
  });
});
