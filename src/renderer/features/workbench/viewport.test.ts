import { describe, expect, it } from "vitest";
import { locateViewport, overviewMinZoom } from "./viewport";

describe("Canvas overview fitting", () => {
  it("uses a 5% minimum for ordinary and empty canvases", () => {
    expect(overviewMinZoom({ x: 0, y: 0, width: 1200, height: 800 }, 1000, 700)).toBe(0.05);
    expect(overviewMinZoom({ x: 0, y: 0, width: 0, height: 0 }, 1000, 700)).toBe(0.05);
  });

  it("frames distant scattered objects together, supports overview in a narrow viewport, and retains margin in the dynamic minimum", () => {
    const bounds = { x: -100_000, y: -50_000, width: 200_560, height: 100_640 };
    const width = 1000, height = 700;
    const minZoom = overviewMinZoom(bounds, width, height);
    const viewport = locateViewport(bounds, width, height);
    expect(minZoom).toBeLessThan(0.05);
    expect(minZoom).toBeLessThan(viewport.zoom);
    expect(bounds.x * viewport.zoom + viewport.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y * viewport.zoom + viewport.y).toBeGreaterThanOrEqual(0);
    expect((bounds.x + bounds.width) * viewport.zoom + viewport.x).toBeLessThanOrEqual(width);
    expect((bounds.y + bounds.height) * viewport.zoom + viewport.y).toBeLessThanOrEqual(height);
    expect(overviewMinZoom(bounds, 440, height)).toBeLessThan(minZoom);
    const narrow = locateViewport(bounds, 440, height);
    expect((bounds.x + bounds.width) * narrow.zoom + narrow.x).toBeLessThanOrEqual(440);
  });
});
