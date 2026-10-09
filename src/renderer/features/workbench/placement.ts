import type { Point, WorkbenchSnapshot } from "../../../shared/workbench";

export type ResourcePlacement = { sessionId: string; position: Point };

/** 仅为新卡片寻找附近空位，不重排用户已有的位置。 */
export function placeObject(session: WorkbenchSnapshot, width: number, height: number): Point {
  const origin = {
    x: (width / 2 - session.viewport.x) / session.viewport.zoom - 170,
    y: (height / 2 - session.viewport.y) / session.viewport.zoom - 100,
  };
  const occupied = session.views.filter(view => !view.hidden);
  for (let column = 0; column <= occupied.length; column++) {
    const point = { x: origin.x + column * 400, y: origin.y };
    if (occupied.every(view => Math.abs(view.position.x - point.x) >= 380 || Math.abs(view.position.y - point.y) >= 480)) return point;
  }
  return { x: origin.x + (occupied.length + 1) * 400, y: origin.y };
}
