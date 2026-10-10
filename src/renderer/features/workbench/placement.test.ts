import { describe, expect, it } from "vitest";
import { workbenchSnapshotSchema } from "../../../shared/workbench";
import { placeObject } from "./placement";

const session = workbenchSnapshotSchema.parse({
  id: "00000000-0000-4000-8000-000000000001", title: "Test", objects: [], views: [], links: [],
  viewport: { x: 100, y: 50, zoom: 0.5 },
});

describe("按实际卡片边界寻找空位", () => {
  it("考虑视口变换，从放大的卡片和右侧邻居之外放置，不重排旧卡片", () => {
    const nodes = [
      { id: "a", position: { x: 430, y: 400 }, width: 340, height: 200, measured: { width: 1600, height: 1200 } },
      { id: "b", position: { x: 2000, y: 400 }, measured: { width: 800, height: 600 } },
    ];
    expect(placeObject(session, 800, 600, nodes)).toEqual({ x: 2860, y: 400 });
    expect(nodes[0].position).toEqual({ x: 430, y: 400 });
    expect(nodes[1].position).toEqual({ x: 2000, y: 400 });
  });
});
