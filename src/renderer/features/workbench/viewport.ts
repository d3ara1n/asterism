import { getViewportForBounds, type Rect } from "@xyflow/react";
import { minimumViewportZoom } from "../../../shared/workbench";

export const focusPadding = 0.12;
export const defaultOverviewMinZoom = 0.05;

/** 目标边界完整入镜，最高以原始尺寸显示。 */
export function focusViewport(bounds: Rect, width: number, height: number) {
  return getViewportForBounds(bounds, width, height, minimumViewportZoom, 1, focusPadding);
}

/** 常规概览止于 5%；远距离对象允许继续缩小到全图之外约 20% 的余量。 */
export function overviewMinZoom(bounds: Rect, width: number, height: number): number {
  if (!width || !height || !bounds.width || !bounds.height) return defaultOverviewMinZoom;
  const fitted = focusViewport(bounds, width, height);
  return Math.max(minimumViewportZoom, Math.min(defaultOverviewMinZoom, fitted.zoom * 0.8));
}
