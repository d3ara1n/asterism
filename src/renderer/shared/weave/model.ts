/**
 * In-screen layout model for island weaving (weave); pure functions independent of React and DOM.
 *
 * Hierarchy: Screen switches as a whole on the page strip; Islands within a Screen run left to right, with deeper levels farther right.
 * When the sum of all island min widths fits, distribute width by grow without translation; otherwise each falls back to min,
 * forming an overflowing strip within the screen, with the viewport smoothly following the focused island.
 */

/** Width declaration: min is the lower limit for shrinking, grow is the share of remaining space, and max is the upper limit. */
export interface IslandWidth { min: number; grow?: number; max?: number }

export interface IslandSlot { id: string; width: IslandWidth }

export interface StripState {
  /** Left to right: farther right means deeper. */
  islands: IslandSlot[];
  focus: string;
}

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

/** Open an island to the right of parent: replace existing deeper islands to its right and focus the new island. */
export function openIsland(state: StripState, parent: string, slot: IslandSlot): StripState {
  const index = state.islands.findIndex(island => island.id === parent);
  if (index < 0) return state;
  return { islands: [...state.islands.slice(0, index + 1), slot], focus: slot.id };
}

/** Close the island and all deeper islands to its right, returning focus to the left neighbor; the root island cannot close. */
export function closeIsland(state: StripState, id: string): StripState {
  const index = state.islands.findIndex(island => island.id === id);
  if (index <= 0) return state;
  return { islands: state.islands.slice(0, index), focus: state.islands[index - 1]!.id };
}

/** Move focus to an existing island without changing the strip's composition. */
export function focusIsland(state: StripState, id: string): StripState {
  return state.islands.some(island => island.id === id) && state.focus !== id ? { ...state, focus: id } : state;
}
