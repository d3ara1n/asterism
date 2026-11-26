import { describe, expect, it } from "vitest";
import { fitHeader } from "./header-fit";

const widths = { title: 100, prefix: 40, summary: 60, statusIcon: 12, statusLabel: 50 };
// Full row: 40 + 100 + (12 + 4 + 50) + 60 + 3 gaps of 8 = 290.

describe("Card title row fitting", () => {
  it("keeps every part when the row fits exactly", () => {
    expect(fitHeader(290, widths, 8, 4)).toEqual({ prefix: true, summary: true, statusLabel: true });
  });

  it("hides the prefix first, then the summary, then the status label", () => {
    // Without the prefix: 290 - 40 - 8 = 242.
    expect(fitHeader(289, widths, 8, 4)).toEqual({ prefix: false, summary: true, statusLabel: true });
    expect(fitHeader(242, widths, 8, 4)).toEqual({ prefix: false, summary: true, statusLabel: true });
    // Without the summary: 242 - 60 - 8 = 174.
    expect(fitHeader(241, widths, 8, 4)).toEqual({ prefix: false, summary: false, statusLabel: true });
    expect(fitHeader(174, widths, 8, 4)).toEqual({ prefix: false, summary: false, statusLabel: true });
    // Without the label, the title truncates beside the status icon.
    expect(fitHeader(173, widths, 8, 4)).toEqual({ prefix: false, summary: false, statusLabel: false });
    expect(fitHeader(20, widths, 8, 4)).toEqual({ prefix: false, summary: false, statusLabel: false });
  });

  it("counts gaps only between present parts", () => {
    // Title and summary alone: 100 + 8 + 60 = 168.
    const sparse = { title: 100, prefix: 0, summary: 60, statusIcon: 0, statusLabel: 0 };
    expect(fitHeader(168, sparse, 8, 4)).toEqual({ prefix: false, summary: true, statusLabel: false });
    expect(fitHeader(167, sparse, 8, 4).summary).toBe(false);
  });
});
