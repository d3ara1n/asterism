import { describe, expect, it } from "vitest";
import { arrangeObjects } from "./arrange";
import { orbitOrbit, orbitBox, boxBox, orbitGrid, columnColumn } from "./layout";
import type { LayoutStrategy } from "./layout";
import { placementGap } from "./layout";
import type { LayoutObject } from "./arrange";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bounds(objects: readonly LayoutObject[]) {
  return {
    left:   Math.min(...objects.map(o => o.position.x - o.width / 2)),
    right:  Math.max(...objects.map(o => o.position.x + o.width / 2)),
    top:    Math.min(...objects.map(o => o.position.y - o.height / 2)),
    bottom: Math.max(...objects.map(o => o.position.y + o.height / 2)),
  };
}

function expectSeparated(objects: readonly LayoutObject[]) {
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i]!, b = objects[j]!;
    expect(
      a.position.x + a.width / 2 + placementGap.x <= b.position.x - b.width / 2
      || b.position.x + b.width / 2 + placementGap.x <= a.position.x - a.width / 2
      || a.position.y + a.height / 2 + placementGap.y <= b.position.y - b.height / 2
      || b.position.y + b.height / 2 + placementGap.y <= a.position.y - a.height / 2,
    ).toBe(true);
  }
}

async function arrange(objects: LayoutObject[], links: Parameters<typeof arrangeObjects>[1], strategy: LayoutStrategy) {
  const positions = await arrangeObjects(objects, links, undefined, strategy);
  const byId = new Map(positions.map(p => [p.objectId, p.position]));
  return objects.map(o => ({ ...o, position: byId.get(o.id)! }));
}

const allStrategies: [string, LayoutStrategy][] = [
  ["orbitOrbit",    orbitOrbit],
  ["orbitBox",      orbitBox],
  ["boxBox",        boxBox],
  ["orbitGrid",     orbitGrid],
  ["columnColumn",  columnColumn],
];

// ---------------------------------------------------------------------------
// Base objects and links shared across tests
// ---------------------------------------------------------------------------

const starObjects: LayoutObject[] = [
  { id: "agent", position: { x: 0, y: 0 }, width: 560, height: 640 },
  { id: "term",  position: { x: 0, y: 0 }, width: 720, height: 440 },
  { id: "note",  position: { x: 0, y: 0 }, width: 340, height: 320 },
  { id: "files", position: { x: 0, y: 0 }, width: 340, height: 200 },
  { id: "web",   position: { x: 0, y: 0 }, width: 340, height: 200 },
  { id: "lone",  position: { x: 0, y: 0 }, width: 420, height: 260 },
];
// star: every card -> agent; "lone" has no links
const starLinks = [
  { resourceId: "term",  receiverId: "agent" },
  { resourceId: "note",  receiverId: "agent" },
  { resourceId: "files", receiverId: "agent" },
  { resourceId: "web",   receiverId: "agent" },
];

// ---------------------------------------------------------------------------
// Contract tests — run all strategies through these
// ---------------------------------------------------------------------------

describe.each(allStrategies)("arrangeObjects strategy=%s", (_, strategy) => {
  it("returns a position for every object", async () => {
    const arranged = await arrange(starObjects, starLinks, strategy);
    expect(arranged.map(o => o.id).sort()).toEqual(starObjects.map(o => o.id).sort());
  });

  it("fully separates all cards (no AABB overlaps)", async () => {
    const arranged = await arrange(starObjects, starLinks, strategy);
    expectSeparated(arranged);
  });

  it("preserves the graph center", async () => {
    const before = bounds(starObjects);
    const arranged = await arrange(starObjects, starLinks, strategy);
    const after = bounds(arranged);
    expect(after.left + after.right).toBeCloseTo(before.left + before.right, 0);
    expect(after.top + after.bottom).toBeCloseTo(before.top + before.bottom, 0);
  });

  it("is idempotent", async () => {
    const first = await arrange(starObjects, starLinks, strategy);
    const second = await arrange(first, starLinks, strategy);
    for (const o of second) {
      const prev = first.find(f => f.id === o.id)!;
      expect(o.position.x).toBeCloseTo(prev.position.x, 0);
      expect(o.position.y).toBeCloseTo(prev.position.y, 0);
    }
  });

  it("returns an empty list for empty input", async () => {
    expect(await arrangeObjects([], [], undefined, strategy)).toEqual([]);
  });

  it("handles a single card", async () => {
    const one: LayoutObject[] = [{ id: "solo", position: { x: 100, y: 200 }, width: 340, height: 200 }];
    const result = await arrangeObjects(one, [], undefined, strategy);
    expect(result).toHaveLength(1);
    expect(result[0]!.objectId).toBe("solo");
  });

  it("separates cards even when all are disconnected", async () => {
    const isolated: LayoutObject[] = [
      { id: "a", position: { x: 0, y: 0 }, width: 900, height: 300 },
      { id: "b", position: { x: 0, y: 0 }, width: 300, height: 900 },
      { id: "c", position: { x: 0, y: 0 }, width: 560, height: 640 },
    ];
    const arranged = await arrange(isolated, [], strategy);
    expectSeparated(arranged);
  });
});

// ---------------------------------------------------------------------------
// Orbit-specific: star graph must NOT collapse into a single vertical column
// ---------------------------------------------------------------------------

describe("orbitOrbit — star graph spreads into multiple x-positions", () => {
  it("connected cards are not all at the same x-coordinate", async () => {
    const connectedOnly = starObjects.filter(o => o.id !== "lone");
    const arranged = await arrange(connectedOnly, starLinks, orbitOrbit);
    const xs = new Set(arranged.map(o => Math.round(o.position.x)));
    // A single column would produce ≤ 2 distinct x values (could share agent's x).
    expect(xs.size).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// Component isolation: two independent groups stay separated
// ---------------------------------------------------------------------------

describe("two disconnected groups", () => {
  const twoGroups: LayoutObject[] = [
    { id: "a1", position: { x: 0, y: 0 }, width: 560, height: 640 },
    { id: "a2", position: { x: 0, y: 0 }, width: 340, height: 200 },
    { id: "b1", position: { x: 0, y: 0 }, width: 420, height: 300 },
    { id: "b2", position: { x: 0, y: 0 }, width: 340, height: 200 },
  ];
  const twoGroupLinks = [
    { resourceId: "a2", receiverId: "a1" },
    { resourceId: "b2", receiverId: "b1" },
  ];

  it.each(allStrategies)("strategy=%s separates both groups", async (_, strategy) => {
    const arranged = await arrange(twoGroups, twoGroupLinks, strategy);
    expectSeparated(arranged);
  });
});
