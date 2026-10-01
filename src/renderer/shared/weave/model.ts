/**
 * 浮岛编织（weave）的屏内布局模型，纯函数，不依赖 React 与 DOM。
 *
 * 层级：页面带上的 Screen 整屏切换；Screen 内若干 Island 自左向右排列，越往右越深入。
 * 所有浮岛的 min 之和放得下时按 grow 分配宽度、不平移；放不下时各退到 min，
 * 屏内变成可溢出的带，视口跟随焦点浮岛平滑移动。
 */

/** 宽度声明：min 为不再压缩的下限；grow 为分配剩余空间的比例；max 为上限。 */
export interface IslandWidth { min: number; grow?: number; max?: number }

export interface IslandSlot { id: string; width: IslandWidth }

export interface StripState {
  /** 自左向右：越往右越深入。 */
  islands: IslandSlot[];
  focus: string;
}

export interface Span { left: number; width: number }
export interface ScreenLayout { spans: Span[]; total: number; overflow: boolean }

/** 屏内布局：放得下时按 grow 分配（受 max 限制），放不下时退到 min 并溢出。 */
export function layout(islands: IslandSlot[], viewport: number, gap: number): ScreenLayout {
  const gaps = Math.max(0, islands.length - 1) * gap;
  const mins = islands.map(island => island.width.min);
  const overflow = mins.reduce((sum, min) => sum + min, 0) + gaps > viewport;
  const widths = [...mins];
  if (!overflow) {
    // 迭代分配剩余空间；到达 max 的浮岛退出分配，余量交给其余浮岛。
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

/** 带的总宽度。 */
export function totalWidth(spans: Span[]): number {
  const last = spans.at(-1);
  return last ? last.left + last.width : 0;
}

/**
 * 视口跟随焦点（仅溢出时使用）：焦点浮岛已完整可见则不动；否则贴近它越界的一侧对齐。
 * 结果限制在带的有效范围内，带比视口窄时偏移为 0。
 */
export function follow(spans: Span[], focusIndex: number, viewport: number, offset: number): number {
  const target = spans[focusIndex];
  const max = Math.max(0, totalWidth(spans) - viewport);
  let next = offset;
  if (target) {
    if (target.left < next) next = target.left;
    else if (target.left + target.width > next + viewport) next = target.left + target.width - viewport;
  }
  return Math.min(Math.max(next, 0), max);
}

/** 在 parent 右侧打开浮岛：parent 右侧原有的更深浮岛被替换，焦点移到新浮岛。 */
export function openIsland(state: StripState, parent: string, slot: IslandSlot): StripState {
  const index = state.islands.findIndex(island => island.id === parent);
  if (index < 0) return state;
  return { islands: [...state.islands.slice(0, index + 1), slot], focus: slot.id };
}

/** 关闭浮岛及其右侧更深的浮岛，焦点回到左邻；根浮岛不可关闭。 */
export function closeIsland(state: StripState, id: string): StripState {
  const index = state.islands.findIndex(island => island.id === id);
  if (index <= 0) return state;
  return { islands: state.islands.slice(0, index), focus: state.islands[index - 1]!.id };
}

/** 移动焦点到已存在的浮岛；不改变带的组成。 */
export function focusIsland(state: StripState, id: string): StripState {
  return state.islands.some(island => island.id === id) && state.focus !== id ? { ...state, focus: id } : state;
}
