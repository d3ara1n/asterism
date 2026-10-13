import { describe, expect, it } from "vitest";
import { placeObject } from "./placement";
import { placementGap } from "./layout";
import type { CardSize, Point } from "../../../shared/workbench";

const size = { width: 100, height: 100 };
const distance = (point: Point, center: Point, size: CardSize) =>
  (point.x + size.width / 2 - center.x) ** 2 + (point.y + size.height / 2 - center.y) ** 2;
function separated(point: Point, size: CardSize, box: { position: Point; width: number; height: number }) {
  return point.x + size.width + placementGap.x <= box.position.x || point.x >= box.position.x + box.width + placementGap.x
    || point.y + size.height + placementGap.y <= box.position.y || point.y >= box.position.y + box.height + placementGap.y;
}

// 预期来自工作台放置契约：保持间距、使用实际尺寸、就近放置且不重排已有卡片；间距值由视觉配置提供。
describe("固定旧卡片，寻找离中心最近的空位", () => {
  it("空画布按新卡片自己的尺寸居中", () => {
    expect(placeObject({ x: 600, y: 500 }, { width: 560, height: 640 }, [])).toEqual({ x: 320, y: 180 });
  });

  it("左边空位更近时向左放，贴近允许边界", () => {
    const box = { id: "a", position: { x: -20, y: -100 }, width: 200, height: 200 };
    const placed = placeObject({ x: 0, y: 0 }, size, [box]);
    expect(placed).toEqual({ x: box.position.x - size.width - placementGap.x, y: -size.height / 2 });
  });

  it("纵向空位更近时使用真实测量边界", () => {
    const box = { id: "a", position: { x: -1000, y: -20 }, width: 340, height: 200, measured: { width: 2000, height: 40 } };
    const placed = placeObject({ x: 0, y: 0 }, size, [box]);
    expect(placed).toEqual({ x: -size.width / 2, y: box.position.y - size.height - placementGap.y });
  });

  it("最近边界被占据时选择可行空位，距离不超过已知可行边界且旧位置不变", () => {
    const boxes = [
      { id: "a", position: { x: -100, y: -100 }, width: 200, height: 200 },
      { id: "b", position: { x: -600, y: -200 }, width: 300, height: 400 },
    ];
    const original = structuredClone(boxes), center = { x: 0, y: 0 };
    const placed = placeObject(center, size, boxes);
    for (const box of boxes) expect(separated(placed, size, box)).toBe(true);
    const feasible = { x: boxes[0].position.x + boxes[0].width + placementGap.x, y: -size.height / 2 };
    expect(distance(placed, center, size)).toBeLessThanOrEqual(distance(feasible, center, size));
    expect(boxes).toEqual(original);
  });

  it("组合两个卡片边界，可以找到比只向单一方向移动更近的角落", () => {
    const boxes = [
      { id: "horizontal", position: { x: 60, y: -620 }, width: 880, height: 440 },
      { id: "vertical", position: { x: -840, y: 280 }, width: 880, height: 440 },
    ];
    const center = { x: 50, y: 50 }, placed = placeObject(center, size, boxes);
    const corner = { x: boxes[0].position.x - size.width - placementGap.x, y: boxes[1].position.y - size.height - placementGap.y };
    for (const box of boxes) expect(separated(placed, size, box)).toBe(true);
    expect(distance(placed, center, size)).toBeLessThanOrEqual(distance(corner, center, size));
  });

  it("碰撞计算包括新卡片的完整宽高", () => {
    const center = { x: 600, y: 500 }, large = { width: 560, height: 640 };
    const box = { id: "a", position: { x: 800, y: 180 }, width: 100, height: 640 };
    const placed = placeObject(center, large, [box]);
    expect(separated(placed, large, box)).toBe(true);
    const feasible = { x: box.position.x - large.width - placementGap.x, y: center.y - large.height / 2 };
    expect(distance(placed, center, large)).toBeLessThanOrEqual(distance(feasible, center, large));
  });
});
