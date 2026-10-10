import { describe, expect, it } from "vitest";
import { minimumViewportZoom, viewportSchema } from "../../../shared/workbench";
import { focusViewport, overviewMinZoom } from "./viewport";

describe("画布概览与缩放契约", () => {
  it("普通画布与空画布使用 5% 下限", () => {
    expect(overviewMinZoom({ x: 0, y: 0, width: 1200, height: 800 }, 1000, 700)).toBe(0.05);
    expect(overviewMinZoom({ x: 0, y: 0, width: 0, height: 0 }, 1000, 700)).toBe(0.05);
  });

  it("远处分散的对象共同入镜，动态下限保留全图之外的余量，视口可以保存", () => {
    const bounds = { x: -100_000, y: -50_000, width: 200_560, height: 100_640 };
    const width = 1000, height = 700;
    const minZoom = overviewMinZoom(bounds, width, height);
    const viewport = focusViewport(bounds, width, height);
    expect(minZoom).toBeLessThan(0.05);
    expect(minZoom).toBeLessThan(viewport.zoom);
    expect(bounds.x * viewport.zoom + viewport.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y * viewport.zoom + viewport.y).toBeGreaterThanOrEqual(0);
    expect((bounds.x + bounds.width) * viewport.zoom + viewport.x).toBeLessThanOrEqual(width);
    expect((bounds.y + bounds.height) * viewport.zoom + viewport.y).toBeLessThanOrEqual(height);
    expect(viewportSchema.safeParse(viewport).success).toBe(true);
  });

  it("窗口变窄时仍能缩到全图，尺寸未就绪时使用常规下限", () => {
    const bounds = { x: 0, y: 0, width: 50_000, height: 1000 };
    expect(overviewMinZoom(bounds, 440, 700)).toBeLessThan(overviewMinZoom(bounds, 1000, 700));
    expect(overviewMinZoom(bounds, 0, 700)).toBe(0.05);
  });

  it("缩放契约拒绝零、负数及非有限数值", () => {
    for (const zoom of [0, -1, Infinity, NaN]) {
      expect(viewportSchema.safeParse({ x: 0, y: 0, zoom }).success).toBe(false);
    }
    expect(overviewMinZoom({ x: 0, y: 0, width: 2_100_000, height: 2_100_000 }, 440, 400)).toBeGreaterThanOrEqual(minimumViewportZoom);
  });
});
