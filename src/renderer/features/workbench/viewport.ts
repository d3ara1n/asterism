import { getViewportForBounds, type Rect } from "@xyflow/react";
import { minimumViewportZoom } from "../../../shared/workbench";

export const locatePadding = 0.12;
export const defaultOverviewMinZoom = 0.05;

/** Frame the complete target bounds, at no more than original size. */
export function locateViewport(bounds: Rect, width: number, height: number) {
  return getViewportForBounds(bounds, width, height, minimumViewportZoom, 1, locatePadding);
}

/** Ordinary overview stops at 5%; distant objects allow further zooming out with roughly 20% margin beyond the full graph. */
export function overviewMinZoom(bounds: Rect, width: number, height: number): number {
  if (!width || !height || !bounds.width || !bounds.height) return defaultOverviewMinZoom;
  const fitted = locateViewport(bounds, width, height);
  return Math.max(minimumViewportZoom, Math.min(defaultOverviewMinZoom, fitted.zoom * 0.8));
}
