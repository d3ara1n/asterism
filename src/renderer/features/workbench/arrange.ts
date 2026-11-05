import type { ElkNode } from "elkjs/lib/elk-api";
import type { CardSize, Point, WorkbenchSnapshot } from "../../../shared/workbench";
import { placementGap } from "./layout";

export type LayoutObject = CardSize & { id: string; position: Point };

// ---------------------------------------------------------------------------
// Connected components (union-find)
// ---------------------------------------------------------------------------

function connectedComponents(ids: readonly string[], links: WorkbenchSnapshot["links"]): string[][] {
  const parent = new Map<string, string>(ids.map(id => [id, id]));
  const rank   = new Map<string, number>(ids.map(id => [id, 0]));
  const set    = new Set(ids);

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (cur !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
    return root;
  }

  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const da = rank.get(ra)!, db = rank.get(rb)!;
    if (da < db) parent.set(ra, rb);
    else if (da > db) parent.set(rb, ra);
    else { parent.set(rb, ra); rank.set(ra, da + 1); }
  }

  for (const link of links)
    if (set.has(link.resourceId) && set.has(link.receiverId))
      union(link.resourceId, link.receiverId);

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const g = groups.get(root);
    if (g) g.push(id); else groups.set(root, [id]);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Bottom-left fill packing — all coordinates are top-left, exact AABB checked
// ---------------------------------------------------------------------------

interface Rect { id: string; width: number; height: number }

function shelfPack(rects: readonly Rect[], gap: number): Map<string, Point> {
  if (!rects.length) return new Map();
  // Sort area-descending so large rectangles anchor the layout.
  const sorted = [...rects].sort((a, b) =>
    (b.width * b.height) - (a.width * a.height) || a.id.localeCompare(b.id));
  const totalArea = sorted.reduce((s, r) => s + (r.width + gap) * (r.height + gap), 0);
  const canvasW   = Math.max(...sorted.map(r => r.width), Math.sqrt(totalArea) * 1.2);

  type PlacedRect = { x: number; y: number; w: number; h: number };
  const placedRects: PlacedRect[] = [];
  const placed = new Map<string, Point>();

  for (const rect of sorted) {
    let best: { x: number; y: number } | null = null;

    // Candidate y values: 0, and the bottom edge (+gap) of every placed rectangle.
    const candidateYs = [0, ...placedRects.map(r => r.y + r.h + gap)]
      .sort((a, b) => a - b);

    for (const cy of candidateYs) {
      if (best !== null && cy > best.y) break; // already found a lower-y slot
      // Candidate x values: 0, and the right edge (+gap) of every placed rectangle.
      const candidateXs = [0, ...placedRects.map(r => r.x + r.w + gap)]
        .sort((a, b) => a - b);
      for (const cx of candidateXs) {
        if (cx + rect.width > canvasW + 0.01) continue;
        if (best !== null && cy === best.y && cx >= best.x) break;
        // Exact AABB overlap test against every already-placed rectangle.
        let clear = true;
        for (const o of placedRects) {
          if (cx < o.x + o.w + gap && cx + rect.width + gap > o.x &&
              cy < o.y + o.h + gap && cy + rect.height + gap > o.y) {
            clear = false; break;
          }
        }
        if (clear) { best = { x: cx, y: cy }; break; }
      }
      if (best !== null && best.y === cy) break; // found a slot on this row
    }

    if (!best) {
      // Fallback: below all existing content.
      const y = placedRects.reduce((m, r) => Math.max(m, r.y + r.h), 0) + gap;
      best = { x: 0, y };
    }

    placed.set(rect.id, best);
    placedRects.push({ x: best.x, y: best.y, w: rect.width, h: rect.height });
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function boundsCenter(objects: readonly LayoutObject[]): Point {
  const left   = Math.min(...objects.map(o => o.position.x));
  const top    = Math.min(...objects.map(o => o.position.y));
  const right  = Math.max(...objects.map(o => o.position.x + o.width));
  const bottom = Math.max(...objects.map(o => o.position.y + o.height));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Arrange visible objects:
 *   1. Partition into connected components via union-find.
 *   2. Layout each component independently with ELK layered (direction RIGHT).
 *      Edges are reversed so the highest-degree node (hub) becomes a source and
 *      lands on the left, with leaf cards spreading rightward.
 *   3. Treat each component's bounding box as a rectangle and bottom-left-fill
 *      pack the groups without overlap.
 *   4. Translate the whole result to preserve the original graph center.
 */
export async function arrangeObjects(
  objects: readonly LayoutObject[], links: WorkbenchSnapshot["links"], signal?: AbortSignal,
): Promise<{ objectId: string; position: Point }[]> {
  if (!objects.length) return [];
  signal?.throwIfAborted();

  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  signal?.throwIfAborted();
  const elk = new ELK();

  const byId       = new Map(objects.map(o => [o.id, o]));
  const components = connectedComponents(objects.map(o => o.id), links);

  // 1. Layout each component with ELK; keep local positions (top-left origin).
  const groupLocal = new Map<string, Map<string, Point>>(); // compKey → (id → local TL)
  const groupRects: Rect[] = [];

  for (const comp of components) {
    const members      = comp.map(id => byId.get(id)!);
    const memberSet    = new Set(comp);
    const internalLinks = links.filter(l => memberSet.has(l.resourceId) && memberSet.has(l.receiverId));

    let localPositions: Map<string, Point>;

    if (members.length === 1) {
      localPositions = new Map([[members[0]!.id, { x: 0, y: 0 }]]);
    } else {
      const graph: ElkNode = {
        id: `comp-${comp[0]}`,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.spacing.nodeNode": String(placementGap.y),
          "elk.layered.spacing.nodeNodeBetweenLayers": String(placementGap.x),
          "elk.randomSeed": "1",
        },
        children: members.map(({ id, width, height }) => ({ id, width, height })),
        // Reverse edges: hub nodes (many incoming) become sources → placed on the left.
        edges: internalLinks.map((link, i) => ({
          id: `e-${i}`,
          sources: [link.receiverId],
          targets: [link.resourceId],
        })),
      };

      const result = await elk.layout(graph);
      signal?.throwIfAborted();

      const children = result.children ?? [];
      if (children.length !== members.length || children.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y)))
        throw new Error("ELK did not return valid positions for all group members.");

      localPositions = new Map(children.map(n => [n.id, { x: n.x!, y: n.y! }]));
    }

    // Bounding box of this component in local space.
    let maxX = 0, maxY = 0;
    for (const m of members) {
      const p = localPositions.get(m.id)!;
      maxX = Math.max(maxX, p.x + m.width);
      maxY = Math.max(maxY, p.y + m.height);
    }

    const key = comp[0]!;
    groupLocal.set(key, localPositions);
    groupRects.push({ id: key, width: maxX, height: maxY });
  }

  // 2. Pack all group rectangles without overlap.
  const interGroupGap = Math.max(placementGap.x, placementGap.y) * 2;
  const groupTL       = shelfPack(groupRects, interGroupGap);

  // 3. Compose final positions.
  const result = new Map<string, Point>();
  for (const comp of components) {
    const key = comp[0]!;
    const tl  = groupTL.get(key)!;
    const local = groupLocal.get(key)!;
    for (const id of comp) {
      const lp = local.get(id)!;
      result.set(id, { x: tl.x + lp.x, y: tl.y + lp.y });
    }
  }

  // 4. Preserve original graph center.
  const before = boundsCenter(objects);
  const arranged = objects.map(o => ({ ...o, position: result.get(o.id)! }));
  const after  = boundsCenter(arranged);
  const dx = before.x - after.x, dy = before.y - after.y;

  return objects.map(o => ({
    objectId: o.id,
    position: { x: result.get(o.id)!.x + dx, y: result.get(o.id)!.y + dy },
  }));
}
