import { describe, expect, it } from "vitest";
import { resetCountdown } from "./countdown";

const minute = 60_000;
describe("resetCountdown", () => {
  // Rounding up keeps a window that resets in 30 seconds from reading as zero; unit boundaries carry into the larger unit.
  it.each([
    [-5 * minute, "1m"], [0.5 * minute, "1m"], [59 * minute, "59m"], [60 * minute, "1h 0m"],
    [134 * minute, "2h 14m"], [24 * 60 * minute, "1d 0h"], [(3 * 24 + 6) * 60 * minute, "3d 6h"],
  ])("states %d ms as %s", (delta, expected) => {
    expect(resetCountdown(1_000_000, 1_000_000 + delta)).toBe(expected);
  });
});
