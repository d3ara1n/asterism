import type { Point } from "../../../../shared/workbench";
import type { WorkbenchSnapshot } from "../../../../shared/workbench";
import { placementGap } from "../../../../shared/workbench-layout";
import type { SizedItem } from "./model";
import { centerPositions, boundingBox } from "./model";
import { connectedComponents } from "./graph";
import { orbitPack, boxPack, columnPack, gridPack } from "./pack";

/** A packer function takes items and a gap and returns center-relative positions. */
export type PackFn = (items: readonly SizedItem[], gap: { x: number; y: number }) => Map<string, Point>;

/**
 * A layout strategy: two independent packer choices, one for the group level
 * (how members of a connected component are arranged around each other) and
 * one for the top level (how groups are arranged relative to each other).
 * Either slot can be any registered packer — they compose freely.
 */
export type LayoutStrategy = {
  id: string;
  groupPack: PackFn;
  topPack: PackFn;
};

// --------------------------------------------------------------------------
// Built-in strategies
// --------------------------------------------------------------------------

/** Orbit both levels: groups orbit their heaviest member; groups orbit the heaviest group. */
export const orbitOrbit: LayoutStrategy = { id: "orbit-orbit", groupPack: orbitPack, topPack: orbitPack };

/** Groups arranged by orbit internally; groups packed into a compact box externally. */
export const orbitBox: LayoutStrategy = { id: "orbit-box", groupPack: orbitPack, topPack: boxPack };

/** Everything packed into compact shelved boxes at both levels. */
export const boxBox: LayoutStrategy = { id: "box-box", groupPack: boxPack, topPack: boxPack };

/** Groups orbit internally; groups laid out in a grid externally. */
export const orbitGrid: LayoutStrategy = { id: "orbit-grid", groupPack: orbitPack, topPack: gridPack };

/** Single column at both levels — closest to the old ELK layered result for isolated cards. */
export const columnColumn: LayoutStrategy = { id: "column-column", groupPack: columnPack, topPack: columnPack };

// --------------------------------------------------------------------------
// Driver
// --------------------------------------------------------------------------

export type LayoutObject = { id: string; width: number; height: number; position: Point };

function center(objects: readonly LayoutObject[]): Point {
  const left = Math.min(...objects.map(o => o.position.x - o.width / 2));
  const top  = Math.min(...objects.map(o => o.position.y - o.height / 2));
  const right  = Math.max(...objects.map(o => o.position.x + o.width / 2));
  const bottom = Math.max(...objects.map(o => o.position.y + o.height / 2));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/**
 * Main entry point.  Partition objects into connected components, apply
 * groupPack within each component, compute each component's bounding box
 * as a SizedItem, then apply topPack to those superitems.
 * The original graph center is preserved.
 */
export function runLayout(
  objects: readonly LayoutObject[],
  links: WorkbenchSnapshot["links"],
  strategy: LayoutStrategy,
): Map<string, Point> {
  if (!objects.length) return new Map();

  const gap = placementGap;
  const byId = new Map(objects.map(o => [o.id, o]));
  const components = connectedComponents(objects.map(o => o.id), links);

  // 1. Layout each component internally and compute its superitem.
  const groupPositions = new Map<string, Map<string, Point>>(); // compRoot → {id → pos}
  const superItems: SizedItem[] = [];

  for (const comp of components) {
    const members = comp.map(id => byId.get(id)!);
    const items: SizedItem[] = members.map(o => ({
      id: o.id, width: o.width, height: o.height, area: o.width * o.height,
    }));

    const raw = strategy.groupPack(items, gap);
    const centered = centerPositions(raw, items);
    groupPositions.set(comp[0]!, centered);

    const box = boundingBox(centered, items);
    const totalArea = items.reduce((s, i) => s + i.area, 0);
    superItems.push({ id: comp[0]!, width: box.halfW * 2, height: box.halfH * 2, area: totalArea });
  }

  // 2. Pack supernodes at the top level.
  const rawTop = strategy.topPack(superItems, { x: gap.x * 2, y: gap.y * 2 });
  const centeredTop = centerPositions(rawTop, superItems);

  // 3. Compose: each card's final position = group-local position + group's top-level center.
  const result = new Map<string, Point>();
  for (const comp of components) {
    const root = comp[0]!;
    const groupCenter = centeredTop.get(root)!;
    const localPositions = groupPositions.get(root)!;
    for (const id of comp) {
      const local = localPositions.get(id)!;
      result.set(id, { x: groupCenter.x + local.x, y: groupCenter.y + local.y });
    }
  }

  // 4. Preserve original graph center.
  const before = center(objects);
  const after = center(objects.map(o => ({ ...o, position: result.get(o.id)! })));
  const dx = before.x - after.x, dy = before.y - after.y;
  if (dx !== 0 || dy !== 0) {
    for (const [id, p] of result) result.set(id, { x: p.x + dx, y: p.y + dy });
  }

  return result;
}
