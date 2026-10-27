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

// Expectations come from the workbench placement contract: maintain gaps, use actual dimensions, place nearby, and do not rearrange existing cards; spacing values come from visual configuration.
describe("keeps existing cards fixed and finds the free position nearest the center", () => {
  it("centers a new card on an empty canvas using its own dimensions", () => {
    expect(placeObject({ x: 600, y: 500 }, { width: 560, height: 640 }, [])).toEqual({ x: 320, y: 180 });
  });

  it("places to the left when the left-side opening is closer, against the allowed boundary", () => {
    const box = { id: "a", position: { x: -20, y: -100 }, width: 200, height: 200 };
    const placed = placeObject({ x: 0, y: 0 }, size, [box]);
    expect(placed).toEqual({ x: box.position.x - size.width - placementGap.x, y: -size.height / 2 });
  });

  it("uses actual measured bounds when a vertical opening is closer", () => {
    const box = { id: "a", position: { x: -1000, y: -20 }, width: 340, height: 200, measured: { width: 2000, height: 40 } };
    const placed = placeObject({ x: 0, y: 0 }, size, [box]);
    expect(placed).toEqual({ x: -size.width / 2, y: box.position.y - size.height - placementGap.y });
  });

  it("chooses a feasible opening when the nearest boundary is occupied, no farther than a known feasible boundary, while preserving existing positions", () => {
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

  it("combines two card boundaries to find a closer corner than movement along a single direction", () => {
    const boxes = [
      { id: "horizontal", position: { x: 60, y: -620 }, width: 880, height: 440 },
      { id: "vertical", position: { x: -840, y: 280 }, width: 880, height: 440 },
    ];
    const center = { x: 50, y: 50 }, placed = placeObject(center, size, boxes);
    const corner = { x: boxes[0].position.x - size.width - placementGap.x, y: boxes[1].position.y - size.height - placementGap.y };
    for (const box of boxes) expect(separated(placed, size, box)).toBe(true);
    expect(distance(placed, center, size)).toBeLessThanOrEqual(distance(corner, center, size));
  });

  it("includes the new card's full width and height in collision calculations", () => {
    const center = { x: 600, y: 500 }, large = { width: 560, height: 640 };
    const box = { id: "a", position: { x: 800, y: 180 }, width: 100, height: 640 };
    const placed = placeObject(center, large, [box]);
    expect(separated(placed, large, box)).toBe(true);
    const feasible = { x: box.position.x - large.width - placementGap.x, y: center.y - large.height / 2 };
    expect(distance(placed, center, large)).toBeLessThanOrEqual(distance(feasible, center, large));
  });
});
