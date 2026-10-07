import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { windowGeometry } from "../../../shared/desktop";
import { cn } from "../utils";
import { AnimatePresence, motion } from "motion/react";
import { fadeTransition, islandTransition } from "./motion";
import { closeIsland, focusIsland, follow, layout, openIsland, type IslandWidth } from "./model";

/** 浮岛声明：宽度、无障碍名称与内容。origin 为打开它的元素，用于展开动画与焦点归还。 */
export interface IslandSpec {
  id: string;
  width: IslandWidth;
  label: string;
  render: () => ReactNode;
  /** false 时浮岛无底板，内容直接位于窗口材质上。 */
  surface?: boolean;
  origin?: HTMLElement | null;
}

export interface IslandApi {
  id: string;
  /** 本浮岛右侧（更深一层）的浮岛 id。 */
  child?: string;
  /** 在本浮岛右侧打开更深的浮岛，替换原有的更深浮岛。 */
  open: (spec: IslandSpec) => void;
  /** 关闭本浮岛（根浮岛无效）。 */
  close: () => void;
  /** 关闭本浮岛右侧的更深浮岛。 */
  closeChild: () => void;
}
const IslandContext = createContext<IslandApi | null>(null);
/** 在浮岛内容中使用。 */
export function useIsland(): IslandApi {
  const api = useContext(IslandContext);
  if (!api) throw new Error("useIsland must be used inside a Screen island.");
  return api;
}


/**
 * 一屏：可声明位于根浮岛左侧的受控浮岛；根右侧更深的浮岛由 open/close 管理。
 * 所有 min 放得下时按 grow 分配并居中、不平移；放不下时退到 min，视口跟随焦点。
 */
export function Screen({ label, root, leading, className, resetKey }: {
  label: string; root: IslandSpec; leading?: IslandSpec[]; className?: string;
  /** 变化时关闭全部更深浮岛。 */ resetKey?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [deeper, setDeeper] = useState<IslandSpec[]>([]);
  const [focus, setFocus] = useState(root.id);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const islands = useMemo(() => [...(leading ?? []), root, ...deeper], [leading, root, deeper]);
  const gap = windowGeometry.gap;
  useEffect(() => { setDeeper([]); setFocus(root.id); }, [resetKey, root.id]);
  useEffect(() => {
    if (!islands.some(island => island.id === focus)) setFocus(root.id);
  }, [islands, focus, root.id]);

  useLayoutEffect(() => {
    // 排布宽度取扣掉 --space-inset 后的条带宽度；视口本身铺满容器。
    const element = strip.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { spans, total, overflow } = useMemo(() => layout(islands, width, gap), [islands, width, gap]);
  const focusIndex = Math.max(0, islands.findIndex(island => island.id === focus));
  // 仅溢出时跟随焦点：已可见不动，越界贴边；放得下时不平移。
  useLayoutEffect(() => { setOffset(current => overflow ? follow(spans, focusIndex, width, current) : 0); }, [spans, focusIndex, width, overflow]);

  // 受控前置浮岛只参与布局与焦点，不参与父子浮岛的打开/关闭。
  const state = { islands: [root, ...deeper], focus };
  const apply = (next: { islands: { id: string }[]; focus: string }, added?: IslandSpec) => {
    setDeeper(current => next.islands.slice(1).map(slot => added?.id === slot.id ? added : current.find(spec => spec.id === slot.id)!).filter(Boolean));
    setFocus(next.focus);
  };
  const open = (parent: string, spec: IslandSpec) => {
    if (state.islands.some(island => island.id === parent)) apply(openIsland(state, parent, spec), spec);
  };
  // 退场动画由 AnimatePresence 在卸载前完成。
  const close = (id: string) => {
    const spec = deeper.find(item => item.id === id);
    if (!spec || id === root.id) return;
    apply(closeIsland(state, id));
    const target = spec.origin?.isConnected ? spec.origin : null;
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  };

  const shift = overflow ? -offset : (width - total) / 2;
  const onWheel = (event: React.WheelEvent) => {
    if (!overflow || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if ((event.target as Element).closest(".island-body")) return; // 浮岛内部（含画布）不接管
    setOffset(current => Math.min(Math.max(current + event.deltaX, 0), total - width));
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    // 最深的屏先处理 Esc：关闭焦点浮岛；只剩根浮岛时交给外层。
    if (event.key !== "Escape" || event.defaultPrevented || !deeper.some(island => island.id === focus)) return;
    event.preventDefault(); event.stopPropagation();
    close(focus);
  };

  return <div className={cn("weave-viewport", className)} aria-label={label} role="group" ref={viewport} onWheel={onWheel} onKeyDown={onKeyDown}>
    {/* 视口宽度测得之前不排布浮岛，避免以 0 宽度按溢出布局渲染一帧。 */}
    <div className="weave-strip" ref={strip} style={{ visibility: width ? undefined : "hidden" }}>
      {/* 每个浮岛绝对定位，自身插值到目标 x 与宽度：增删浮岛时其余浮岛从当前位置平滑让位，不叠加整条平移与 layout 动画。 */}
      <AnimatePresence initial={false}>{islands.map((island, index) => {
        const span = spans[index] ?? { left: 0, width: 0 };
        const visibleLeft = span.left - (overflow ? offset : 0), visibleRight = visibleLeft + span.width;
        const hidden = overflow && (visibleRight <= 0 || visibleLeft >= width);
        const peek = overflow && !hidden && (visibleLeft < -1 || visibleRight > width + 1);
        return <Island key={island.id} spec={island} width={span.width} x={span.left + shift} hidden={hidden} peek={peek}
          focused={islands.length > 1 && island.id === focus}
          api={{
            id: island.id, child: islands[index + 1]?.id,
            open: spec => open(island.id, spec),
            close: () => { close(island.id); },
            closeChild: () => { const child = islands[index + 1]; if (child) close(child.id); },
          }}
          onFocus={() => setFocus(current => focusIsland({ islands, focus: current }, island.id).focus)} />;
      })}</AnimatePresence>
    </div>
    {overflow && <div className="weave-indicator" aria-hidden="true">
      <span style={{ left: `${(offset / total) * 100}%`, width: `${(width / total) * 100}%` }} />
    </div>}
  </div>;
}

function Island({ ref, spec, width, x, hidden, peek, focused, api, onFocus }: {
  ref?: React.Ref<HTMLElement>; spec: IslandSpec; width: number; x: number; hidden: boolean; peek: boolean; focused: boolean; api: IslandApi; onFocus: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  // 由内容打开的浮岛挂载后接收焦点。
  useEffect(() => { if (spec.origin) element.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef(api);
  latest.current = api;
  const stable = useMemo<IslandApi>(() => ({
    get id() { return latest.current.id; }, get child() { return latest.current.child; },
    open: spec => latest.current.open(spec), close: () => latest.current.close(), closeChild: () => latest.current.closeChild(),
  }), []);
  const focusSelf = useCallback(() => onFocus(), [onFocus]);
  // 部分越出视口的浮岛：点击露出的部分即移入。
  // 原地展开：在目标位置左侧轻微位移淡入；位置与宽度变化由 Motion 从当前值过渡。
  return <motion.section ref={node => { element.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }}
    initial={{ opacity: 0, x: x - 16, scale: 0.98, width }} animate={{ opacity: 1, x, scale: 1, width }} exit={{ opacity: 0, scale: 0.98, transition: fadeTransition }}
    transition={islandTransition} data-island={spec.id} tabIndex={-1} aria-label={spec.label}
    inert={hidden} aria-hidden={hidden || undefined} data-peek={peek || undefined} data-focused={focused || undefined}
    data-surface={spec.surface !== false || undefined}
    className="island"
    onFocusCapture={focusSelf} onPointerDownCapture={focusSelf}>
    {spec.surface !== false && <div className="island-backdrop" aria-hidden="true" />}
    <div className="island-body"><IslandContext.Provider value={stable}>{spec.render()}</IslandContext.Provider></div>
  </motion.section>;
}
