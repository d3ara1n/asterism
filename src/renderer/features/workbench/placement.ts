import type { Point, WorkbenchSnapshot } from "../../../shared/workbench";
import { fallbackCardWidth, placementCardHeight, placementGap } from "./layout";

export type ResourcePlacement = { sessionId: string; position: Point };

/**
 * 仅为新卡片寻找附近空位，不重排用户已有的位置。
 * 以视口中心为起点按列向右寻找；列距由卡片宽度加间隙决定。
 */
export function placeObject(session: WorkbenchSnapshot, width: number, height: number, cardWidth = fallbackCardWidth): Point {
  const origin = {
    x: (width / 2 - session.viewport.x) / session.viewport.zoom - cardWidth / 2,
    y: (height / 2 - session.viewport.y) / session.viewport.zoom - placementCardHeight / 2,
  };
  const step = cardWidth + placementGap.x;
  const clearX = cardWidth + placementGap.x / 2;
  const clearY = placementCardHeight + placementGap.y;
  const occupied = session.views.filter(view => !view.hidden);
  for (let column = 0; column <= occupied.length; column++) {
    const point = { x: origin.x + column * step, y: origin.y };
    const free = occupied.every(view =>
      Math.abs(view.position.x - point.x) >= clearX || Math.abs(view.position.y - point.y) >= clearY);
    if (free) return point;
  }
  return { x: origin.x + (occupied.length + 1) * step, y: origin.y };
}
