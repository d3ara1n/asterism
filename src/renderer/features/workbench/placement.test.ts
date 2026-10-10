import { describe, expect, it } from "vitest";
import { placeObject } from "./placement";

const size = { width: 100, height: 100 };

describe("固定旧卡片，寻找离中心最近的空位", () => {
  it("空画布按新卡片自己的尺寸居中", () => {
    expect(placeObject({ x: 600, y: 500 }, { width: 560, height: 640 }, [])).toEqual({ x: 320, y: 180 });
  });

  it("左边更近时向左放，而非持续向右推", () => {
    expect(placeObject({ x: 0, y: 0 }, size, [
      { id: "a", position: { x: -20, y: -100 }, width: 200, height: 200 },
    ])).toEqual({ x: -180, y: -50 });
  });

  it("上下空位比左右更近时选择纵向空位，使用真实测量尺寸", () => {
    expect(placeObject({ x: 0, y: 0 }, size, [
      { id: "a", position: { x: -1000, y: -20 }, width: 340, height: 200, measured: { width: 2000, height: 40 } },
    ])).toEqual({ x: -50, y: -400 });
  });

  it("最近边界被其他卡片占据时选另一空位，不修改旧位置", () => {
    const nodes = [
      { id: "a", position: { x: -100, y: -100 }, width: 200, height: 200 },
      { id: "b", position: { x: -600, y: -200 }, width: 300, height: 400 },
    ];
    const original = structuredClone(nodes);
    expect(placeObject({ x: 0, y: 0 }, size, nodes)).toEqual({ x: 160, y: -50 });
    expect(nodes).toEqual(original);
  });

  it("组合多个卡片边界，找到比单独向某一侧移动更近的角落", () => {
    // 两个禁入区域呈十字交叠；左上角 (-100, -100) 离目标 (0, 0) 最近。
    expect(placeObject({ x: 50, y: 50 }, size, [
      { id: "horizontal", position: { x: 60, y: -620 }, width: 880, height: 440 },
      { id: "vertical", position: { x: -840, y: 280 }, width: 880, height: 440 },
    ])).toEqual({ x: -100, y: -100 });
  });

  it("新卡片较大时，碰撞计算包括它的完整宽高", () => {
    expect(placeObject({ x: 600, y: 500 }, { width: 560, height: 640 }, [
      { id: "a", position: { x: 800, y: 180 }, width: 100, height: 640 },
    ])).toEqual({ x: 180, y: 180 });
  });
});
