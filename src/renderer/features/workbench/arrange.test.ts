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

describe("Explicit workbench arrangement", () => {
  // When cards of different sizes, reverse links, and isolated objects share a graph, incorrect dimensions or omitted connected components cause overlap.
  // Expectations come from the arrangement contract: preserve dimensions, leave gaps between complete rectangles, and retain the graph's center.
  it("fully separates different-sized cards, bidirectional links, and isolated objects while preserving the original graph center", async () => {
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

  // A resource set without links is still a valid workbench; node discovery and space allocation cannot depend on graph edges.
  it("maintains spacing even when all cards are disconnected", async () => {
    const objects: LayoutObject[] = [
      { id: "a", position: { x: 0, y: 0 }, width: 900, height: 300 },
      { id: "b", position: { x: 0, y: 0 }, width: 300, height: 900 },
      { id: "c", position: { x: 0, y: 0 }, width: 560, height: 640 },
    ];
    const positions = new Map((await arrangeObjects(objects, [])).map(item => [item.objectId, item.position]));
    expectSeparated(objects.map(object => ({ ...object, position: positions.get(object.id)! })));
  });

  // The ELK root container for a triangular relationship includes extra routing space; centering on that container makes each arrangement drift upward.
  // The workbench consumes only node positions; the expected center comes from complete card bounds.
  it("repeated arrangement preserves the card center when connection routing extends beyond card bounds", async () => {
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
