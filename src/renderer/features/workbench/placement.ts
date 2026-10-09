import type { Point, WorkbenchSnapshot } from "../../../shared/contracts";

/** 仅为新卡片寻找附近空位，不重排用户已有的位置。 */
export function placeObject(task: WorkbenchSnapshot, width: number, height: number): Point {
  const origin = {
    x: (width / 2 - task.viewport.x) / task.viewport.zoom - 170,
    y: (height / 2 - task.viewport.y) / task.viewport.zoom - 100,
  };
  const occupied = task.views.filter(view => !view.hidden);
  for (let column = 0; column <= occupied.length; column++) {
    const point = { x: origin.x + column * 400, y: origin.y };
    if (occupied.every(view => Math.abs(view.position.x - point.x) >= 380 || Math.abs(view.position.y - point.y) >= 480)) return point;
  }
  return { x: origin.x + (occupied.length + 1) * 400, y: origin.y };
}
