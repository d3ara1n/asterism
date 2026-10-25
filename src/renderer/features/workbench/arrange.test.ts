import { describe, expect, it } from "vitest";
import { arrangeObjects, type LayoutObject } from "./arrange";
import { placementGap } from "./layout";

function bounds(objects: readonly LayoutObject[]) {
  return {
    left: Math.min(...objects.map(object => object.position.x)),
    right: Math.max(...objects.map(object => object.position.x + object.width)),
    top: Math.min(...objects.map(object => object.position.y)),
    bottom: Math.max(...objects.map(object => object.position.y + object.height)),
  };
}
function expectSeparated(objects: readonly LayoutObject[]) {
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i]!, b = objects[j]!;
    expect(a.position.x + a.width + placementGap.x <= b.position.x
      || b.position.x + b.width + placementGap.x <= a.position.x
      || a.position.y + a.height + placementGap.y <= b.position.y
      || b.position.y + b.height + placementGap.y <= a.position.y).toBe(true);
  }
}

describe("工作台显式整理", () => {
  // 大小卡片、反向链接与孤立对象同图时，传错尺寸或漏掉连通分量会导致遮挡。
  // 预期来自整理契约：保留尺寸、完整矩形有间距、全图中心不变。
  it("不同尺寸、双向链接和独立对象完整避让，并保持原图中心", async () => {
    const objects: LayoutObject[] = [
      { id: "agent", position: { x: -1500, y: 700 }, width: 560, height: 640 },
      { id: "terminal", position: { x: -1500, y: 700 }, width: 720, height: 440 },
      { id: "note", position: { x: -1500, y: 700 }, width: 340, height: 320 },
      { id: "collapsed", position: { x: -1500, y: 700 }, width: 560, height: 40 },
      { id: "isolated", position: { x: -1500, y: 700 }, width: 420, height: 900 },
    ];
    const links = [
      { resourceId: "note", receiverId: "agent" },
      { resourceId: "terminal", receiverId: "agent" },
      { resourceId: "agent", receiverId: "terminal" },
      { resourceId: "collapsed", receiverId: "agent" },
      { resourceId: "hidden", receiverId: "agent" },
    ];
    const original = structuredClone(objects);
    const positions = await arrangeObjects(objects, links);
    const byId = new Map(positions.map(item => [item.objectId, item.position]));
    expect([...byId.keys()].sort()).toEqual(objects.map(object => object.id).sort());
    const arranged = objects.map(object => ({ ...object, position: byId.get(object.id)! }));
    expectSeparated(arranged);
    const before = bounds(objects), after = bounds(arranged);
    expect(after.left + after.right).toBeCloseTo(before.left + before.right);
    expect(after.top + after.bottom).toBeCloseTo(before.top + before.bottom);
    expect(objects).toEqual(original);
    expect(await arrangeObjects(arranged, links)).toEqual(positions);
  });

  // 没有链接的资源集合仍是合法工作台，不能依赖图边来发现节点或分配空间。
  it("完全无连接的卡片也保持间距", async () => {
    const objects: LayoutObject[] = [
      { id: "a", position: { x: 0, y: 0 }, width: 900, height: 300 },
      { id: "b", position: { x: 0, y: 0 }, width: 300, height: 900 },
      { id: "c", position: { x: 0, y: 0 }, width: 560, height: 640 },
    ];
    const positions = new Map((await arrangeObjects(objects, [])).map(item => [item.objectId, item.position]));
    expectSeparated(objects.map(object => ({ ...object, position: positions.get(object.id)! })));
  });

  // 三角关系的 ELK 根容器包含额外路由空间，按根容器居中会使每次整理向上漂移。
  // 工作台只消费节点位置，预期中心来自完整卡片边界。
  it("连线路由超出卡片边界时，反复整理保持卡片中心", async () => {
    const objects: LayoutObject[] = [
      { id: "a", position: { x: 200, y: 300 }, width: 340, height: 320 },
      { id: "b", position: { x: 200, y: 300 }, width: 560, height: 640 },
      { id: "c", position: { x: 200, y: 300 }, width: 720, height: 480 },
    ];
    const links = [{ resourceId: "a", receiverId: "b" }, { resourceId: "a", receiverId: "c" }, { resourceId: "b", receiverId: "c" }];
    const positions = await arrangeObjects(objects, links);
    const byId = new Map(positions.map(item => [item.objectId, item.position]));
    const arranged = objects.map(object => ({ ...object, position: byId.get(object.id)! }));
    const before = bounds(objects), after = bounds(arranged);
    expect(after.left + after.right).toBeCloseTo(before.left + before.right);
    expect(after.top + after.bottom).toBeCloseTo(before.top + before.bottom);
    expect(await arrangeObjects(arranged, links)).toEqual(positions);
  });
});
