import { describe, expect, it } from "vitest";
import { fitSummaryItems } from "./icon-summary-layout";

describe("Icon summary fitting", () => {
  it("keeps an exact full fit without reserving an unnecessary ellipsis", () => {
    expect(fitSummaryItems([14, 30, 14], 74, 8, 12)).toBe(3);
  });
  it("backs up a whole item to leave room for the ellipsis", () => {
    expect(fitSummaryItems([14, 30, 14], 60, 8, 12)).toBe(1);
  });
  it("fits variable-width counts and gaps at the ellipsis boundary", () => {
    expect(fitSummaryItems([14, 30, 14, 14], 72, 8, 12)).toBe(2);
    expect(fitSummaryItems([14, 30, 14, 14], 71, 8, 12)).toBe(1);
  });
  it("shows only an ellipsis when the first complete item cannot fit", () => {
    expect(fitSummaryItems([30, 14], 25, 8, 12)).toBe(0);
  });
});
