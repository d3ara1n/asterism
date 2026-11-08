/**
 * In-screen layout model for island weaving (weave); pure functions independent of React and DOM.
 *
 * Within a Screen, the root and ordinary islands run left to right; page-level sidebars are outside this layout.
 * Ordinary islands are independent windows: they open at the right end, keep their positions until the user swaps them, and close together with the islands they opened.
 * When the sum of all island min widths fits, distribute width by grow without translation; otherwise each falls back to min,
 * forming an overflowing strip within the screen, with the viewport smoothly following the focused island.
 */

/** Width declaration: min is the lower limit for shrinking, grow is the share of remaining space, and max is the upper limit. */
export interface IslandWidth { min: number; grow?: number; max?: number }

export interface IslandSlot { id: string; width: IslandWidth }

/** Ordinary island ownership: owner is the island that opened it, or null; ownership, not position, determines cascading closure. */
export interface OwnedIsland { id: string; owner: string | null }

/** A lookup key locates content independently of the stable island instance and ownership. */
export interface KeyedIsland extends OwnedIsland { key: string }

export interface Span { left: number; width: number }
export interface ScreenLayout { spans: Span[]; total: number; overflow: boolean }

/** In-screen layout: distribute by grow when it fits (subject to max), otherwise fall back to min and overflow. */
export function layout(islands: IslandSlot[], viewport: number, gap: number): ScreenLayout {
  const gaps = Math.max(0, islands.length - 1) * gap;
  const mins = islands.map(island => island.width.min);
  const overflow = mins.reduce((sum, min) => sum + min, 0) + gaps > viewport;
  const widths = [...mins];
  if (!overflow) {
    // Distribute remaining space iteratively; islands reaching max leave the distribution, and the remainder goes to the others.
    let open = islands.map((island, index) => (island.width.grow ?? 0) > 0 && widths[index]! < (island.width.max ?? Infinity));
    for (let round = 0; round < islands.length; round++) {
      const rest = viewport - gaps - widths.reduce((sum, width) => sum + width, 0);
      const grow = islands.reduce((sum, island, index) => sum + (open[index] ? island.width.grow ?? 0 : 0), 0);
      if (rest <= 0.5 || grow === 0) break;
      islands.forEach((island, index) => {
        if (!open[index]) return;
        const max = island.width.max ?? Infinity;
        widths[index] = Math.min(max, widths[index]! + rest * (island.width.grow ?? 0) / grow);
      });
      open = open.map((value, index) => value && widths[index]! < (islands[index]!.width.max ?? Infinity));
    }
  }
  let left = 0;
  const spans = widths.map(width => { const span = { left, width }; left += width + gap; return span; });
  return { spans, total: totalWidth(spans), overflow };
}

/** Total strip width. */
export function totalWidth(spans: Span[]): number {
  const last = spans.at(-1);
  return last ? last.left + last.width : 0;
}

/**
 * Viewport follows focus (used only during overflow): remain still if the focused island is fully visible; otherwise align to the side extending out of bounds.
 * An island wider than the viewport aligns its leading edge, keeping its header visible.
 * Clamp the result to the strip's valid range; offset is 0 when the strip is narrower than the viewport.
 */
export function follow(spans: Span[], focusIndex: number, viewport: number, offset: number): number {
  const target = spans[focusIndex];
  const max = Math.max(0, totalWidth(spans) - viewport);
  let next = offset;
  if (target) {
    if (target.left < next || target.width > viewport) next = target.left;
    else if (target.left + target.width > next + viewport) next = target.left + target.width - viewport;
  }
  return Math.min(Math.max(next, 0), max);
}

/** Open or locate by content key; locating keeps the existing instance, owner, and content. */
export function openIsland<T extends KeyedIsland>(islands: readonly T[], island: T): { islands: readonly T[]; island: T; opened: boolean } {
  const existing = islands.find(item => item.key === island.key);
  return existing ? { islands, island: existing, opened: false } : { islands: [...islands, island], island, opened: true };
}

/** Rebind an instance without changing its position, content, or ownership. An occupied key leaves both instances untouched. */
export function bindIsland<T extends KeyedIsland>(islands: readonly T[], id: string, key: string):
  { ok: true; islands: readonly T[] } | { ok: false; reason: "missing" | "occupied" } {
  const island = islands.find(item => item.id === id);
  if (!island) return { ok: false, reason: "missing" };
  if (islands.some(item => item.id !== id && item.key === key)) return { ok: false, reason: "occupied" };
  return { ok: true, islands: island.key === key ? islands : islands.map(item => item.id === id ? { ...item, key } : item) };
}

/**
 * Islands removed by closing id: the ordinary islands it opened, transitively, deepest first, followed by id itself when it is ordinary.
 * id may also name the root, which closes only what it opened. Ownership cycles terminate.
 */
export function closure(islands: readonly OwnedIsland[], id: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (owner: string) => {
    if (visited.has(owner)) return;
    visited.add(owner);
    for (const island of islands) if (island.owner === owner) visit(island.id);
    if (islands.some(island => island.id === owner)) result.push(owner);
  };
  visit(id);
  return result;
}

export function removeIslands<T extends OwnedIsland>(islands: readonly T[], ids: readonly string[]): readonly T[] {
  const removed = new Set(ids);
  return islands.some(island => removed.has(island.id)) ? islands.filter(island => !removed.has(island.id)) : islands;
}

/** Swap an ordinary island with its left (-1) or right (1) ordinary neighbor; unchanged at either end. */
export function moveIsland<T extends OwnedIsland>(islands: readonly T[], id: string, direction: -1 | 1): readonly T[] {
  const index = islands.findIndex(island => island.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= islands.length) return islands;
  const next = [...islands];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * Focus after removal, decided on the composed order before removal: a surviving focus stays;
 * otherwise the nearest survivor left of the removed focus, then the nearest to its right, then fallback.
 */
export function focusAfterClose(order: readonly string[], removed: readonly string[], focus: string, fallback: string): string {
  const gone = new Set(removed);
  if (!gone.has(focus)) return focus;
  const index = order.indexOf(focus);
  for (let i = index - 1; i >= 0; i--) if (!gone.has(order[i]!)) return order[i]!;
  for (let i = index + 1; i < order.length; i++) if (!gone.has(order[i]!)) return order[i]!;
  return fallback;
}

/**
 * Restore before currently open islands. Current instances win key collisions; owners of coalesced entries follow the surviving instance.
 * Missing owners detach, except persistent identities such as the root supplied by keep.
 */
export function restoreIslands<T extends KeyedIsland>(islands: readonly T[], keep: ReadonlySet<string> = new Set(), current: readonly T[] = []): T[] {
  const keys = new Map(current.map(island => [island.key, island.id]));
  const ids = new Set(current.map(island => island.id));
  const renamed = new Map<string, string>();
  const restored: T[] = [];
  for (const island of islands) {
    const existing = keys.get(island.key);
    if (existing !== undefined || ids.has(island.id)) {
      renamed.set(island.id, existing ?? island.id);
      continue;
    }
    keys.set(island.key, island.id); ids.add(island.id);
    restored.push(island);
  }
  return [...restored.map(island => {
    const owner = island.owner === null ? null : renamed.get(island.owner) ?? island.owner;
    return { ...island, owner: owner !== null && (ids.has(owner) || keep.has(owner)) ? owner : null };
  }), ...current];
}
